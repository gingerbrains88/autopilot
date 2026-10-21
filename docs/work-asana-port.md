# ChatGPT Work + Asana port

This is a migration in progress. The original Claude/Linear entry point is retained
for upstream compatibility. `bin/autopilot-work` is the separate Work-port entry point.

## Current capabilities

- One private Asana board, with Triage, Start, Working, Review, Waiting, Done, Canceled.
- Direct Asana REST polling: board section changes, new owner-authored comments,
  completed tasks, and tasks removed from the board.
- Durable local events, duplicate suppression, canceled pending events, process locking,
  bounded read retries, pagination, HTTP timeouts, and atomic checkpoints.
- No model or connected-app call during a tick. No Claude or Linear dependency in this path.
- API credentials and board IDs remain in ignored `home/.env` and
  `home/work-asana.json`; event content and state stay in ignored `home/.state/`.

`Working` must mean a Work chat has actually accepted the task. The poller does not
claim work or change Asana statuses. Pending events are not completed work.

## Still required before autonomous operation

1. Resolve project orchestration availability before deploying an event bridge.
   The tested ChatGPT Work Cloud chat has no tools to list ChatGPT projects, create
   chats in another project, or send cross-chat follow-ups. Those operations were
   verified from the authoring desktop chat only. Do not replace this requirement
   with Codex execution, an API agent, or a fixed project mapping.
   The supported event mechanism is
   [MCP Events](https://developers.openai.com/plugins/build/mcp-events): an authenticated,
   reachable MCP 2.0 server, a Work Cloud chat subscription, callback verification,
   persistent subscriptions, and signed webhook delivery. A shell process cannot call
   the desktop's conversation tools directly. The Workspace Agents trigger API is
   a different product and does not document selecting an existing ChatGPT project.
2. On actionable events, discover the current ChatGPT projects through Work's native
   project tools. Select a clear matching project; do not persist a fixed routing map.
   Ambiguous items stay in Triage. Explicit owner selection wins. Store the selected
   project ID and chat ID locally and show destination and reason in Asana.
3. Create a Work chat in that project, persist its ID before moving to Working, relay
   new owner comments into that exact chat, and record briefing/results in Asana.
   Recheck closure and project membership before claiming or relaying.
4. Record bot-created story IDs: the API token acts as the owner, so author identity
   alone does not distinguish automation from the owner's own comments. Never trust
   a display-name or text-prefix check as identity.
5. Test new-project discovery, ambiguous matches, manual overrides, stopped work,
   duplicate event delivery, restart recovery, and project source access end to end.
6. Port source scans, watchers, and nightly routing review after this loop is verified.

Creating a Work chat inside an existing project and continuing that same chat were verified during setup. Availability
of all project sources must be checked by the worker; do not assume the complete project
history or every attachment is automatically available. Automatic event-triggered dispatch
from the local poller remains unverified. The hosted bridge source was scaffolded
and built successfully, but deployment is paused: receiving an event cannot give
the Cloud Work chat project-orchestration tools it does not have.

## Local configuration

Set `ASANA_ACCESS_TOKEN` in the environment or an ignored `home/.env` (mode 0600).
`home/work-asana.json` contains the workspace, authenticated owner, board and section IDs.
No real IDs or tokens should be added to tracked examples.

Run `node runtime/work-tick.mjs` for one API-only poll. State lives in
`home/.state/work-state.json`. A failed read leaves the previous checkpoint untouched.
On macOS a LaunchAgent can run this command every 60 seconds with an absolute Node path,
working directory, and stdout/stderr log paths. The machine must be awake.

Validate with `node --test tests/work-tick.test.mjs`.

## Remaining migration plan

The single Asana board is the control surface. ChatGPT projects are dynamic execution
destinations, not extra Asana projects. Fresh project discovery happens only when routing
is needed. Ordinary polling never invokes a model. Started items keep the same chat until
the owner explicitly reroutes them. Prepare drafts and deliverables for review; sending,
publishing, and deletion follow the owner's explicit authorization.
