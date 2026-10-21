# Autopilot

**ChatGPT Work + Asana migration:** this branch adds a direct-API Asana tick and a
single-board workflow. The Work event bridge and automatic project routing are still
in progress. See [the port status and setup](docs/work-asana-port.md). The original
Claude/Linear implementation is documented below and uses a separate entry point.

Autopilot reads your inbox, Slack, GitHub and Linear, files what needs you as Linear issues, and
when you say go, starts a Claude Code session that prepares the work: a reply drafted in the
thread, a document, a branch with a fix, a decision with the facts lined up. You decide; it never
sends, merges or deletes anything on its own.

The intention is to turn your job into a loop. A lot of time with AI goes into copy and paste: an
email into a chat, the answer back into a reply, a meeting note into a prompt. Autopilot captures
those signals where they arrive, collects them in one place, and acts on them asynchronously while
you do something else; you decide, and your corrections make it file and prepare better next time.

It is deliberately small. There is no server to deploy, no database and no service account per
integration. It runs on your own machine, on top of the Claude Code you already use and the
Claude connectors you have already set up. Anything you have connected to Claude can be a signal:
Gmail, Slack, Lleverage, Fathom, Linear, or a CLI such as `gh`. Linear is the control
plane: every item is an issue, you steer by moving issues and writing comments, and Autopilot
answers in the comments. The whole engine is a few hundred lines of TypeScript with no
dependencies, plus Markdown files that say what to look for and how to work.

**This is not a finished product.** It is a starting point meant to be tweaked: fork it into your own
private GitHub repo and change whatever does not fit how you work, from the examples and the shared
instructions to the scheduler itself. A workstream with `repo: autopilot` lets sessions make those
changes for you on a branch. Pull from the original repo when you want its updates.

**[docs/autopilot.html](docs/autopilot.html)** is a one-page visual overview to open in a browser
or share: how it works, how it maps onto Linear, signals, workstreams, autonomy and setup. This
README has the full detail.

## How it works

```
 Gmail · Slack · GitHub · Linear          your machine                      Linear (control plane)
 ───────────────────────────────    ────────────────────────────    ─────────────────────────────────
 new mail, mentions, DMs, PRs  ──▶  signal: claude -p, every 15m ──▶  issue in Triage, in a workstream
                                                                           │ you move it to Start
                                    launcher: claude session in   ◀────────┘ (or comment on it)
                                    tmux, with the workstream's
                                    rules and the source thread   ──▶  briefing comment, issue in Review
                                                                           │ you reply in a comment
                                    the reply goes into the       ◀────────┘
                                    same live session             ──▶  … until you move it to Done
```

## Concepts

| | |
| --- | --- |
| **Signal** | One source to watch (`signals/gmail.md`), read through a Claude connector you have (Gmail, Slack, Lleverage, Fathom, Linear) or a CLI such as `gh`: how often, which read-only tools, and in plain words what counts as needing you. A cheap model reads the new items and files, updates or drops each one. |
| **Workstream** | One area of your work (`workstreams/customers.md`) and its Linear project. `## Routing` says what lands there and what is urgent; `## Work` says how the work is done. |
| **Issue** | One thread or conversation that needs you. Its comments are the conversation between you and Autopilot. |
| **Session** | A Claude Code session the launcher starts for one issue, in the workstream's folder or, for a workstream with a repo, a git worktree on its own branch. You can watch it live through Remote Control, the Claude app or tmux. |
| **Briefing** | The comment a session leaves when it pauses: what it found, what it prepared, and the one decision it needs from you. |
| **Watcher** | A periodic check on what an issue waits on (a reply in a thread, a PR review). News wakes the session. |
| **Dream** | A nightly run that compares what Autopilot filed with what you did with it (re-filed, re-prioritised, canceled) and tightens the routing. |
| **Engine and home** | The engine is this repo, the same for everyone. Your home (`home/`) holds your config, workstreams, signals, state and `.env`; git ignores it, except the `_` examples. |

## How it maps onto Linear

Autopilot works in one Linear team of its own, set to private so only you see it.

| Autopilot | Linear |
| --- | --- |
| your Autopilot | a private team (`linear_team` in `autopilot.yaml`) |
| workstream | a project in that team, named like `workstreams/<name>.md`; moving an issue to another project re-files it |
| item from a source | an issue; one thread is one issue, new messages are appended to its description |
| signal | a label named after the signal (`gmail`, `slack`, `fathom`), next to the `autopilot` label |
| urgency | priority, from the workstream's `Urgent:` line; only priority 1 is assigned to you |
| whose turn it is | the status: Triage, Start, Working, Review, Waiting, Done, Canceled |
| source and session | attachments: the original thread and the session links |
| conversation | comments: Autopilot's start with `🤖 Autopilot`, every other comment is your instruction |

Keep the team private: issue descriptions quote your mail, DMs and meetings, and any comment Autopilot
did not write is treated as your instruction to the session, so someone else commenting would steer
your work. Your company's own teams are untouched; the Linear signal only reads them for what is
assigned to you or mentions you.

## Requirements

- macOS or Linux, Node 24 or newer, git and tmux.
- Claude Code, signed in with your claude.ai account (`claude auth login`).
- The **Linear** connector in Claude, plus one for each source you want watched (Gmail, Slack,
  Lleverage, Fathom, …). GitHub needs no connector: the `gh` CLI, signed in.
- A private Linear team for Autopilot alone (e.g. key `AP`) and a Linear personal API key.

## Getting started

1. **Fork, clone and set up.** Fork this repo into a private GitHub repo of your own, then:
   ```sh
   git clone <your fork> ~/autopilot && cd ~/autopilot
   git remote add upstream <this repo>     # to pull updates later: git pull upstream main
   bin/autopilot setup
   ```
   This creates your home in `home/` from the examples (`autopilot.yaml`, `.env`, the `autopilot`
   workstream and the nightly dream), links the engine into `~/.claude/skills/autopilot` so Claude
   Code loads it as the `autopilot` plugin, and copies any deny rules in the engine's
   `.claude/settings.json` (none by default) into `~/.claude/settings.json`. It never overwrites a file you already have. To keep your home
   elsewhere, set `AUTOPILOT_HOME` first. Git ignores your home by default; in a private fork you
   can choose to track it by editing `.gitignore`, but never `.env` or `.state/`.
2. **Add your Linear API key** to `home/.env` (Linear → Settings → Security & access → Personal API
   keys). Only the launcher's poll uses it; everything else goes through your connectors.
3. **Run `/autopilot:init`** in Claude Code. It asks your name and the Linear team, then creates the
   projects, the statuses (Triage, Start, Working, Review, Waiting, Done, Canceled) and the labels.
   If the connector cannot create statuses it lists them for you to add by hand.
4. **Allow unattended sessions once:** run `claude --permission-mode bypassPermissions`, accept the
   warning and quit. Otherwise the first session waits on that prompt.
5. **Add workstreams** with `/autopilot:add <name>`: a short interview that writes the file and
   creates the project. Start from the examples in `home/workstreams/_*.md`. Three or four
   workstreams is plenty.
6. **Start the scheduler**: `bin/autopilot tick` every minute.
   On macOS use a LaunchAgent, not cron: cron cannot read the keychain, so it would have no
   connectors and no GitHub login. Save as `~/Library/LaunchAgents/com.example.autopilot.plist`
   (any label):
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0"><dict>
     <key>Label</key><string>com.example.autopilot</string>
     <key>ProgramArguments</key><array><string>/Users/you/autopilot/bin/autopilot</string><string>tick</string></array>
     <key>StartInterval</key><integer>60</integer>
     <key>RunAtLoad</key><true/>
   </dict></plist>
   ```
   and load it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.example.autopilot.plist`.
   Do not set `CLAUDE_CODE_OAUTH_TOKEN`: a `setup-token` token has no connectors. On Linux, a cron
   line or a systemd timer works.
7. **Enable signals one at a time** with `/autopilot:add <source>`: Linear, GitHub, then Slack,
   then Gmail. Each starts from its example, previews the last hour without filing anything, and
   is switched on only when you say yes. It starts from now; there is no backfill.
8. Optional: in Linear's notification settings, turn on Slack delivery for issues assigned to you.
   Autopilot assigns only urgent (priority 1) issues to you.

Autopilot runs on your own machine, so it works best on a laptop that stays on: plugged in, and not
sleeping when the display is off (System Settings, Battery, Options). While it sleeps nothing runs;
on wake it reads what it missed, up to `window_cap` (72h), and runs a missed nightly review. Down the
line the tick will also run on an external machine, and sessions as Remote Control workers through
Claude, so the loop keeps going with the laptop closed.

Check it with `/autopilot:status`. The log is `home/.state/tick.log`.

## Day to day

| Status | Who | What it means |
| --- | --- | --- |
| **Triage** | Autopilot | A signal filed it. Look, re-file (change the project) or cancel. |
| **Start** | you | Move an issue here to start a session. Commenting on a Triage issue does the same. |
| **Working** | Autopilot | A session is on it. Its links (Claude app, Remote Control) are under Resources. |
| **Review** | you | A briefing is waiting for your decision. Reply in a comment to steer; the reply goes into the live session. |
| **Waiting** | someone else | Blocked on another person; a watcher wakes the session when they act. |
| **Done / Canceled** | you | Closes the session and cleans up its worktree (unless it holds unpushed work). |

Every issue with a session has two links under Resources: one opens the
running session in the Claude app on your Mac, the other is Remote Control, which opens the same
session on claude.ai or in the Claude app on your phone while it keeps running on your Mac with your
files and connectors. `tmux attach -t autopilot` shows it too. It is one session either way: what you
type there and what you comment on the issue both reach it.

Every comment Autopilot writes starts with `🤖 Autopilot`. Anything else is you, and the session
treats it as an instruction. When something was filed in the wrong place, run `/autopilot:why
<issue>`: it shows the decision behind it and proposes a one-line routing fix. The nightly dream
does the same in bulk for patterns it sees twice.

## Autonomy, one workstream at a time

Out of the box everything is manual: Autopilot files and prepares, you decide what to start, and
you send, merge or publish every result yourself. The intention is to customise it to how you work
and, one workstream at a time, hand over more of the steps as the results stop needing corrections.

| Level | Autopilot | You | Today |
| --- | --- | --- | --- |
| 1 · File | files and routes; no sessions | all of the work | leave issues in Triage |
| 2 · Prepare | prepares drafts, documents and branches when you start an issue | start, review, send | the default |
| 3 · Start itself | starts sessions for new issues in the workstream without waiting for Start | review and send | not built yet |
| 4 · Finish | completes the last step itself, within rules in the workstream's `## Work` | read the outcome, handle exceptions | through `## Work`: whatever you allow there |

To promote a workstream, run it at level 2 until its briefings stop needing changes, then write the
permission into its `## Work` in plain sentences: what the session may do, under which conditions,
and what still comes back to you. Removing the line demotes it on the next session. There are no hard
blocks by default: what a session does is set by the shared instructions, the workstream's Work and
your comments. For a hard limit, add deny rules to the engine's `.claude/settings.json`.

## Your home

```
home/
  autopilot.yaml          owner, Linear team, model, max parallel sessions, window cap, paths, filing tools
  instructions.md         your own rules (who you are, how you write, what never to touch); optional
  workstreams/<name>.md   ## Routing (with an Urgent: line) and ## Work; optional `repo:` frontmatter
  signals/<source>.md     every: (or cron:), tools:, optional paused:, delay:, window_cap:, model:; then what counts
  schedules/dream.md      the nightly routing review
  dreams/                 the dream's journal: every change with its old and new lines
  .env                    LINEAR_API_KEY, optional GH_TOKEN, optional SLACK_USER_TOKEN
  .state/                 state.json, decisions.jsonl (every item a signal looked at), tick.log, run transcripts
```

Files starting with `_` are examples: Autopilot skips them and git tracks them, so `git pull` brings
new examples without touching your own files. Examples to start from:

| Example | Shows |
| --- | --- |
| `signals/_gmail.md` | a sender gate (who matters), what counts, a Gmail search bounded by the window |
| `signals/_slack.md` | DMs, mentions, thread replies and optional shared customer channels; one thread = one issue |
| `signals/_linear.md` | issues in your other teams assigned to you or mentioning you |
| `signals/_github.md` | review requests, assignments and mentions through the `gh` CLI, no connector |
| `signals/_lleverage.md` | failed runs, negative feedback and waiting requests in your Lleverage projects |
| `signals/_fathom.md` | meetings you attended that left you an action |
| `signals/_weekly-digest.md` | a `cron:` digest: a week of changelog posts and merged PRs as one issue |
| `workstreams/_customers.md` | customer work: drafts in their language, a source of truth for answers |
| `workstreams/_company.md` | investors, hiring and admin, with a confidentiality rule |
| `workstreams/_product-marketing.md` | a shortlist first, writing only after you pick |
| `workstreams/_engineering.md` | a workstream with a repo: a branch and draft PR per issue |
| `workstreams/_autopilot.md` | Autopilot's own project: health issues and dream proposals |
| `_instructions.md` | personal rules added to every run |

Workstreams without a repo run in the Autopilot folder, so their sessions sit together in the
Claude app, and keep each issue's files in `worktrees_dir/<workstream>/<ID>/`. Give a workstream
`folder:` (a path) to run its sessions in that folder instead, files in `<folder>/<ID>/`. Give a workstream `repo:` (a directory in `repos_dir`, a path, or `autopilot` for
this engine) only when its work changes code; each issue then gets a worktree in `<repo>/.claude/worktrees/<ID>` and a `claude/<id>`
branch.

## Safety

- **Prepare by default, act when asked.** The engine's `instructions.md` tells sessions to prepare
  drafts, documents and branches, and to send, post, merge, push or delete outside Linear only when
  you ask on the issue or the workstream's Work allows it. This is an instruction, not a block: there
  are no deny rules by default.
- **Common sense about autonomy.** The more an action reaches other people or the harder it is to
  undo, the clearer the ask has to be; when in doubt, a session prepares it and asks in the briefing.
- **Source content is data.** Mail and messages are never treated as instructions, whatever they
  say. Only your own comments on the issue are.
- **Signals are read-only** on their sources and use `--permission-mode dontAsk`: any tool not
  listed in the signal file is refused.
- Sessions run with `bypassPermissions` so they do not stop for prompts. For a hard limit (never
  send mail, never push to main), add deny rules to the engine's `.claude/settings.json`; setup copies
  them into your user settings.

## Commands

| | |
| --- | --- |
| `/autopilot:init` | set up the Linear team: projects, statuses, labels |
| `/autopilot:add <name>` | add a workstream or a signal (with a dry-run preview) |
| `/autopilot:status` | signals, sessions, watchers and open health issues |
| `/autopilot:why <issue>` | why something was filed where it was, and a one-line fix |
| `/ticket [<status>]` | in an issue's session: show its title, status and description in a pane, or move it (`/ticket review`) |
| `bin/autopilot tick` | what the scheduler runs every minute |
| `bin/autopilot signal <name> [--dry=<minutes>]` | run one signal now; `--dry` previews without filing |
| `bin/autopilot schedule <name>` · `launch` | run a schedule or the launcher now |
| `bin/autopilot watch [<ID> "<what>" …]` · `unwatch <ID>` | list, add or remove watchers |
| `bin/autopilot link <ID> <url> "<title>" [--subtitle …]` | attach a link to an issue's Resources (a session does this for everything it creates outside Linear) |
| `bin/autopilot where` | print the engine and home paths |
| `bin/autopilot setup` · `install` | create the home from the examples; relink the plugin |

## How it runs

- **Signals.** A signal is due when `now − last_checked ≥ every` and its previous run is dead. The
  window is `max(last_checked − window_overlap, now − window_cap)` → start of run. One `claude -p
  --model haiku --json-schema …` call (the signal's `model:` overrides it) with the signal's read tools plus `filing_tools` files the items;
  every item goes to `.state/decisions.jsonl`. Each `created` item is looked up in Linear (by identifier,
  else by its source URL); one that is not there is logged as `failed` and fails the run. A failed or
  unparseable run leaves `last_checked`, so the next tick retries. The first run only sets `last_checked` (no backfill). A signal with `cron:` is a
  digest instead: it runs when the cron matches, over everything since its previous run (the first run
  covers its `window_cap:`, which overrides the global cap), and a failed run is retried every `every:`.
- **Launcher.** Every tick: issues in Done/Canceled with a session are cleaned up (tmux window killed,
  worktree removed unless it has uncommitted or unpushed work); issues in Triage or Backlog without a
  session whose latest comment is the owner's move to Start; then issues in Start, oldest first, are
  claimed (→ Working) while fewer than `max_parallel_sessions` are Working. Each runs in the Autopilot
  folder (files in `worktrees_dir/<workstream>/<ID>/`), in the workstream's `folder:` when it sets one,
  or, for a workstream with a repo, a worktree at
  `<repo>/.claude/worktrees/<ID>` on `claude/<id>` (where the Claude app keeps its own, so it lists the session under the repo); and gets a tmux window in session `autopilot` running
  `claude --remote-control <ID> --permission-mode bypassPermissions`: no permission prompts, with the engine's
  `.claude/settings.json` (no deny rules by default). The session gets an ID the launcher chooses, so the issue gets a
  `claude://resume?session=<id>` link that opens it in the Claude app on that Mac; that link and the Remote Control
  link scraped from the pane are commented on the issue and attached to it, so they show under its Resources. A failure before the session starts moves the issue back to Triage with the error.
- **Team tickets.** An issue the Linear signal filed from another team's ticket (its source attachment is that
  ticket's URL) mirrors it. In a workstream with a repo, its session works on the ticket's own branch (Linear's
  `branchName`, continuing it if it was already pushed), so the team's GitHub automation moves the ticket, and it
  names only the ticket in branches, commits and PRs: the Autopilot issue never shows. The session and its worktree
  (`<repo>/.claude/worktrees/LLE-n`) are named after the ticket too, so the Claude app lists it as `LLE-n …` under the repo. It writes nothing on the ticket
  unless you ask. When the ticket is Done (or Canceled, a Duplicate), the launcher moves the mirror to Done (Canceled)
  and the cleanup ends its session, so you only ever move one of the two.
- **Watchers.** A session leaves a watcher on what its issue waits on (`node runtime/tick.ts watch <ID> "<what>"
  [--every 30m] [--for 14d] [--signal …] [--tools …]`; `watch` lists them, `unwatch <ID>` removes one). It reads with
  the tools of the issue's source signal (its label) or the tools given, so any connector or read-only command works.
  The tick runs it every `every`: only while the issue is in Waiting or Review (Start and Working have a session on it).
  One haiku call compares the source with the previous fingerprint; a person's new activity becomes a
  `🤖 Autopilot · watcher update` comment, which the launcher relays into the session like the owner's comments (→ Working),
  or moves the issue to Start when it has no session. Done/Canceled removes the watcher (launcher cleanup or the
  next check); after `--for` without news it ends and a Waiting issue moves to Review.
- **Health.** A job failing for 60 minutes and at least 3 runs, or a window cut by `window_cap` (72h), makes a Claude call that
  creates or updates a p2 issue in the `autopilot_workstream` project; the failing issue is closed once runs succeed.
- **Dream.** `schedules/dream.md` runs at 03:30 (or on the first tick after, if the laptop slept through it) and edits Routing sections in place; its journal in `home/dreams/` lists each change with the old and new lines.
- **Laptop.** Autopilot is built to run on a laptop that sleeps and changes networks. The first tick after
  a gap of more than 5 minutes (sleep) does nothing but note the wake; a tick without network (Linear and
  Anthropic unreachable) does nothing either. Neither counts towards a job's failing time. A session start
  that hits a network error puts the issue back in Start for the next tick instead of Triage. `window_cap`
  is 72h, so a weekend with the lid closed is still read in full.

Run a single job by hand: `bin/autopilot signal gmail`, `… schedule dream`, `… launch`.
Preview a signal without filing anything: `bin/autopilot signal gmail --dry=15` (last 15 minutes).


## Troubleshooting

- **Nothing gets filed.** `/autopilot:status`, then `home/.state/tick.log`. A signal whose
  connector is not connected fails with "tools not available" and retries the same window.
  Preview it by hand: `bin/autopilot signal slack --dry=60`.
- **Connectors work in the terminal but not from the scheduler.** The tick runs without your
  keychain (cron), or with `CLAUDE_CODE_OAUTH_TOKEN` set. Use a LaunchAgent and unset the token.
- **A session never starts.** The issue goes back to Triage with the error as a comment. Common
  causes: the issue's project has no `workstreams/<name>.md`, a missing status (run
  `/autopilot:init`), or the bypass-permissions warning not yet accepted.
- **A session sits waiting.** It is on a permission prompt; the issue says so. Approve it in the
  session, or reply on the issue.
- **Wrong workstream or priority.** `/autopilot:why <issue>`; the dream also picks it up overnight.
