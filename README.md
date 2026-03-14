# Will Be Done

Most task managers are great at collecting tasks - and terrible at helping you plan your week. Will Be Done gives you a visual weekly timeline where each day is a column. Drag tasks between days. See what's realistic. Always know what to focus on.

This is my third attempt in 3 years to build the task manager I actually want to use. I already use it daily. Three things pushed me to build it rather than buy: own my data (self-hosted), a weekly planning view, and vim keybinds.

Try the **live demo** (no sign-up) at [demo.will-be-done.app](https://demo.will-be-done.app)
or the cloud version at [will-be-done.app](https://will-be-done.app/) before installing.



<img width="1200" height="1992" alt="timeline" src="https://github.com/user-attachments/assets/7d9f606e-1203-4dce-a82b-9b39ce631a99" />

<hr>

<img width="1200"  alt="project" src="https://github.com/user-attachments/assets/4f9f5973-e1ba-4d03-af28-5f04f5891ed8" />

<hr>

<img width="1920" height="1920" alt="459_1x_shots_so" src="https://github.com/user-attachments/assets/36d60659-8725-49cc-807b-79cfa21b88ce" />



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

**Plan your week, not just your tasks**
- Weekly timeline view - each day is a column, drag tasks between days to rebalance
- No angry "OVERDUE" badges - missed tasks get a gentle nudge, not a guilt trip
- One bad day doesn't snowball - weekly planning means skipping a day keeps your list clean
- Kanban boards per project with categories you define (Week/Month/Ideas/Someday)
- Multiple spaces - separate workspaces for work/personal/side projects

**Fast enough that you forget it's a web app**
- Local-first - full database in the browser, every action is instant, zero network round trips
- True offline mode - full read/write with no server, not a cached skeleton
- Real-time sync - changes propagate instantly across all tabs and devices

**Built for people who live in their keyboard**
- Vim keybindings - j/k navigation, drag with ctrl, quick-add with o/O
- Everything drag & drop - tasks, days, projects, categories
- Mobile ready - first-class mobile UI for when you're away from the keyboard

**Your data, your rules**
- Self-hosted - one Docker command, SQLite, no external dependencies
- Open source - AGPL license

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

## Current Roadmap

From tasks perspective:
- [x] Repeating tasks
- [ ] Task details. Tast body with markdown support
- [ ] Task comments and attachments
- [ ] Checklist inside task

From api perspective:
- [ ] API & MCP integration
- [ ] CalDAV integration

UI/UX:
- [ ] Themes per project(custom background of project and custom color of project tasks)
- [ ] Multi selection of tasks
- [ ] Global command palette
- [ ] More vim keybindings
- [ ] Global themes.
- [ ] Undo/redo action
- [ ] DnD for project columns
- [ ] I18n

Others:
- [ ] Migrator from popular task managers: Todoist / TickTick / Microsoft To Do
- [ ] e2e encryption
- [ ] Global search

Separate apps:
- [ ] Desktop app with global quick add, notifications support
- [ ] Mobile app with notifications and widgets support
- [ ] Chrome extension for quick add

## Features that are not planning for now

1. Multi users per space/project
1. Sharing tasks/projects/spaces
1. No time schedules for tasks

