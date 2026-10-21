import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Asana, HOME, configuration, accessToken, atomicJSON } from './asana.mjs';

const terminal = new Set(['Done', 'Canceled']);
export function reconcile(previous, tasks, comments, config, now = new Date().toISOString()) {
  const state = structuredClone(previous);
  state.tasks ??= {};
  state.events ??= {};
  state.started_at ??= now;
  for (const task of tasks) {
    const member = task.memberships?.find(m => m.project?.gid === config.project_id);
    const section = Object.entries(config.sections).find(([, gid]) => gid === member?.section?.gid)?.[0];
    const old = state.tasks[task.gid];
    const closed = task.completed || terminal.has(section);
    if (closed) {
      // Retain records for audit, but never dispatch pending work after closure.
      for (const event of Object.values(state.events)) if (event.task_id === task.gid && event.status === 'pending') event.status = 'canceled';
    } else {
      const add = (key, kind, extra = {}) => {
        state.events[key] ??= { id: key, kind, task_id: task.gid, task_url: task.permalink_url, title: task.name, status: 'pending', created_at: now, ...extra };
      };
      // Re-entering Start is a new request, unchanged Start is not.
      if (section === 'Start' && old?.section !== 'Start') add(`start:${task.gid}:${now}`, 'start');
      for (const story of comments[task.gid] ?? []) {
        if (story.resource_subtype !== 'comment_added' || story.created_by?.gid !== config.owner_id) continue;
        if (story.created_at < state.started_at) continue; // no historical comment backfill
        if (state.bot_story_ids?.includes(story.gid)) continue;
        add(`comment:${story.gid}`, 'owner_comment', { story_id: story.gid, text: story.text });
      }
      if (!old && section === 'Triage') add(`route:${task.gid}`, 'route');
    }
    state.tasks[task.gid] = { section, completed: !!task.completed, modified_at: task.modified_at };
  }
  // A task removed from the board must also stop dispatching.
  const present = new Set(tasks.map(t => t.gid));
  for (const event of Object.values(state.events)) if (!present.has(event.task_id) && event.status === 'pending') event.status = 'canceled';
  state.last_checked = now;
  return state;
}

export async function tick() {
  const dir = path.join(HOME, '.state');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, 'work-tick.lock');
  let fd;
  try { fd = fs.openSync(lock, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const pid = Number(fs.readFileSync(lock, 'utf8'));
    try { process.kill(pid, 0); return { skipped: 'another tick is running' }; }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    fs.unlinkSync(lock);
    return { skipped: 'removed a stale lock; next tick will retry' };
  }
  fs.writeFileSync(fd, String(process.pid));
  try {
    const config = configuration(), api = new Asana(accessToken());
    const file = path.join(dir, 'work-state.json');
    const now = new Date().toISOString();
    const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { started_at: now };
    const tasks = await api.tasks(config.project_id), comments = {};
    // Fetch comments even when task.modified_at is unchanged; board moves are read every tick.
    for (const task of tasks) {
      if (task.completed) continue;
      comments[task.gid] = await api.comments(task.gid, previous.last_checked || previous.started_at);
    }
    const state = reconcile(previous, tasks, comments, config, now);
    atomicJSON(file, state);
    return { checked_at: now, tasks: tasks.length, pending: Object.values(state.events).filter(e => e.status === 'pending').length,
      dispatch: 'pending Work event bridge; no tasks claimed or moved to Working' };
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  tick().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
