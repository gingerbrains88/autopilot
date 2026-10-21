import fs from 'node:fs';
import path from 'node:path';

export const HOME = process.env.AUTOPILOT_HOME || path.resolve(import.meta.dirname, '../home');
export function configuration() {
  return JSON.parse(fs.readFileSync(path.join(HOME, 'work-asana.json'), 'utf8'));
}
export function accessToken() {
  if (process.env.ASANA_ACCESS_TOKEN) return process.env.ASANA_ACCESS_TOKEN;
  const content = fs.readFileSync(path.join(HOME, '.env'), 'utf8');
  const value = content.split(/\r?\n/).find(line => line.startsWith('ASANA_ACCESS_TOKEN='))?.slice(19).trim();
  if (!value) throw new Error('ASANA_ACCESS_TOKEN is not configured');
  return value;
}

export class Asana {
  constructor(token, fetcher = fetch) { this.token = token; this.fetcher = fetcher; }
  async request(endpoint, { method = 'GET', data } = {}) {
    // Only documented relative endpoints; never forward the token to a supplied URL.
    if (!/^[a-z][a-z0-9_/?=&,.%:+-]*$/i.test(endpoint) || endpoint.includes('://')) throw new Error('Invalid Asana endpoint');
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await this.fetcher(`https://app.asana.com/api/1.0/${endpoint}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify({ data }) }),
      });
      // Reads are safe to retry; ambiguous writes must be reconciled before retrying.
      if (method === 'GET' && (response.status === 429 || response.status >= 500) && attempt < 3) {
        const retry = Number(response.headers.get('retry-after'));
        if (retry > 30) throw new Error(`Asana rate limited; retry on a later tick (${retry}s)`);
        await new Promise(resolve => setTimeout(resolve, (retry > 0 ? retry : 2 ** attempt) * 1000));
        continue;
      }
      if (!response.ok) throw new Error(`Asana ${method} failed (HTTP ${response.status})`);
      return response.json();
    }
  }
  async list(endpoint) {
    let offset, result = [];
    do {
      const page = await this.request(`${endpoint}${endpoint.includes('?') ? '&' : '?'}limit=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`);
      result.push(...page.data);
      offset = page.next_page?.offset;
    } while (offset);
    return result;
  }
  tasks(project) {
    return this.list(`projects/${project}/tasks?opt_fields=gid,name,notes,completed,modified_at,permalink_url,memberships.project.gid,memberships.section.gid`);
  }
  comments(task, since) {
    return this.list(`tasks/${task}/stories?resource_subtype=comment_added&opt_fields=gid,text,created_at,created_by.gid,resource_subtype${since ? `&created_after=${encodeURIComponent(since)}` : ''}`);
  }
}

export function atomicJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}
