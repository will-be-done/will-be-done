This is my third attempt in 3 years to build the task manager I actually want to use.
I already use it daily. Three things pushed me to build it rather than buy:
own my data (self-hosted), a weekly planning view, and vim keybinds.

But the thing I'm most proud of is the architecture: Will Be Done is local-first.
Your full database lives in the browser. Every action is instant. It works when
your server is down. Changes sync in real-time across all tabs and devices.

Try the **live demo** (no sign-up) at [demo.will-be-done.app](https://demo.will-be-done.app)
or the cloud version at [will-be-done.app](https://will-be-done.app/) before installing.

<img width="1200"  alt="project" src="https://github.com/user-attachments/assets/4f9f5973-e1ba-4d03-af28-5f04f5891ed8" />

<hr>

<img width="1200" height="1992" alt="timeline" src="https://github.com/user-attachments/assets/7d9f606e-1203-4dce-a82b-9b39ce631a99" />


## Installation

Run with Docker:

```bash
docker run -d \
  -p 3000:3000 \
  -v will_be_done_storage:/var/lib/will-be-done \
  --restart unless-stopped \
  ghcr.io/will-be-done/will-be-done:latest
```

Then open http://localhost:3000 in your browser.

## Features

1. Local-first architecture — full database in the browser, every action is instant, zero network round trips
1. True offline mode — works with no server, no internet; full read/write, not a cached skeleton
1. Real-time sync — changes propagate instantly across all tabs and devices, no polling
1. Weekly timeline view — see multiple days as columns, plan your week visually
1. Kanban boards per project — each project has categories (Week/Month/Ideas/Someday/etc)
1. Everything drag & drop — move tasks between days, projects, categories
1. Multiple spaces — separate workspaces for work/personal/side projects
1. Vim keybindings — j/k navigation and keyboard shortcuts
1. Mobile ready — first-class mobile UI
1. Self-hosted — one Docker command, SQLite, no external dependencies
1. Open source — AGPL license

## Vim keybinds

When you focused on task
1. `i`, `enter` - insert mode. You can edit the task. `esc` - exit insert mode.
1. `j`, `k` - move between tasks up and down
1. `h`, `l` - move between columns left and right
1. `ctrl-j`, `ctrl-k` - move task up and down
1. `ctrl-h`, `ctrl-j` - move task left and right
1. `o` - create new task down to focused
1. `O` - create new task up to focused
1. `space` - toggle task state
1. `m` - move task to other project
1. `d` - delete task

Planned:
1. `u`/`r` - undo/redo action
1. `?` - change date

## Coming soon

From tasks perspective:
1. Repeating tasks
1. Task details
1. Task comments and attachments
1. Global search
1. Checklist inside task

From projects perspective:
1. Themes per project(custom background of project and custom color of project tasks)

From daily columns perspective:
1. Calendar integration

From api perspective:
1. API & MCP integration

UI/UX:
1. Multi selection of tasks
1. Global command palette
1. More vim keybindings
1. Global themes.
1. Undo/redo action
1. DnD for project columns
1. I18n

Others:
1. Desktop app with global quick-add shortcut
1. Migrator from popular task managers

## Features that are not planning for now

1. Multi users per space/project
1. Sharing tasks/projects/spaces
1. No time schedules for tasks

