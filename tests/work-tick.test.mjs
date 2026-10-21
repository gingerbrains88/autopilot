import test from 'node:test';
import assert from 'node:assert/strict';
import { Asana } from '../runtime/asana.mjs';
import { reconcile } from '../runtime/work-tick.mjs';

const config = { project_id: '1', owner_id: 'owner', sections: { Triage: 'triage', Start: 'start', Done: 'done' } };
const task = section => ({ gid: '2', name: 'Test', completed: false, memberships: [{ project: { gid: '1' }, section: { gid: section } }] });
const now = '2026-10-21T20:00:00.000Z';
test('unchanged Start is not launched twice; re-entering Start is a new request', () => {
  const a = reconcile({}, [task('start')], {}, config, now);
  const b = reconcile(a, [task('start')], {}, config, '2026-10-21T20:01:00.000Z');
  assert.equal(Object.keys(b.events).length, 1);
  const c = reconcile(b, [task('triage')], {}, config, '2026-10-21T20:02:00.000Z');
  const d = reconcile(c, [task('start')], {}, config, '2026-10-21T20:03:00.000Z');
  assert.equal(Object.values(d.events).filter(e => e.kind === 'start').length, 2);
});
test('only owner comments after setup become instructions; repeated stories deduplicate', () => {
  const story = { gid: 's', text: 'Prepare this', created_at: now, created_by: { gid: 'owner' }, resource_subtype: 'comment_added' };
  const others = [{ ...story, gid: 'outsider', created_by: { gid: 'someone' } }, { ...story, gid: 'system', resource_subtype: 'section_changed' }];
  const a = reconcile({}, [task('triage')], { '2': [story, ...others] }, config, now);
  const b = reconcile(a, [task('triage')], { '2': [story, ...others] }, config, now);
  assert.equal(Object.values(b.events).filter(e => e.kind === 'owner_comment').length, 1);
});
test('closed tasks and tasks removed from the board cannot dispatch pending work', () => {
  const a = reconcile({}, [task('start')], {}, config, now);
  for (const tasks of [[task('done')], [{ ...task('start'), completed: true }], []]) {
    const b = reconcile(a, tasks, {}, config, now);
    assert.equal(Object.values(b.events).filter(e => e.status === 'pending').length, 0);
  }
});
test('pagination preserves every item and never uses returned absolute URLs', async () => {
  const calls = [];
  const api = new Asana('test', async url => {
    calls.push(url);
    return Response.json({ data: [{ gid: String(calls.length) }], next_page: calls.length === 1 ? { offset: 'next', uri: 'https://evil.invalid/' } : null });
  });
  assert.equal((await api.list('projects')).length, 2);
  assert.ok(calls.every(url => url.startsWith('https://app.asana.com/api/1.0/')));
  assert.ok(calls[1].endsWith('offset=next'));
  await assert.rejects(() => api.request('https://evil.invalid/'));
});
test('ambiguous writes are not automatically repeated', async () => {
  let count = 0;
  const api = new Asana('test', async () => { count++; return new Response('', { status: 503 }); });
  await assert.rejects(() => api.request('tasks', { method: 'POST', data: { name: 'Test' } }));
  assert.equal(count, 1);
});
