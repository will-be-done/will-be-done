
**Note on AI:** I’ve been developing this project for a year. This is my third attempt; the first two failed because the technology for fast, offline-first apps wasn't ready. This time, I created my own method for local-first development and built a database that works for both the frontend and backend. I have over 10 years of experience as a developer and 4 years specializing in offline-first apps. Building these reliably requires specific expertise. I use Claude Code to help, but I review every line of code manually to ensure quality.

## Download & installation

* [Download for Windows](https://github.com/will-be-done/will-be-done/releases) <br>
* [Download for macOS](https://github.com/will-be-done/will-be-done/releases) <br>
* [Download for Linux](https://github.com/will-be-done/will-be-done/releases)
* For now, mobile users can install the PWA as a bookmark. Native mobile clients are coming soon.

You should also run the Docker server. Here is the easiest way:

```bash
docker run -d \
  -p 3000:3000 \
  -v will_be_done_storage:/var/lib/will-be-done \
  --restart unless-stopped \
  ghcr.io/will-be-done/will-be-done:latest
```

## Why build another task manager?

My core idea is to build a task manager that will stay with me for the rest of my life. Because of that, one of my main requirements is that it stays fast even with a massive database. If I have 10k+ tasks saved over the years, it should still load quickly and feel instant.

Another requirement is that it must be offline-first. I live in a country where the internet goes down pretty often, and I need my tasks to be available regardless of server status.

I also don't want to share sensitive data with companies that build task managers. A self-hosted, local-first app gives me much more control over where my data lives.

Also, I wanted a clean API so I could connect things like an MCP server or create tasks via Telegram.

Finally, I am building this to be a highly opinionated tool focused on ergonomics. I’ve found that mainstream solutions, including paid apps like TickTick and Todoist - don't quite fit my workflow. I wanted to experiment with features that are often missing elsewhere: native Vim keybindings, a week-view timeline that maximizes vertical space, and a "task suggestion" panel.

I am also implementing a "Stash" feature - a persistent, focused task list accessible from any page. Despite these power-user features, the goal is to keep the interface minimal and deeply visual customizable, allowing for project-specific backgrounds and color schemes(WIP).

After comparing several options from the Awesome Selfhosted list, I found that Super Productivity came the closest to meeting my needs. However, it still lacks the specific ergonomic features and visual flexibility I want for my "rest of my life" task manager.

|                                                                 | Will be done | Super Productivity | Donetick | Tududi | Vikunja | TaskTrove |
| --------------------------------------------------------------- | ------------ | ------------------ | -------- | ------ | ------- | --------- |
| Open-Source & Self Hosted                                       | ✅           | ✅                 | ✅       | ✅     | ✅      | ✅        |
| Able to open when fully offline, functional offline             | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |
| DnD tasks, projects. Tasks/projects reordering                  | ✅           | ✅                 | 🟥       | 🟥     | ✅      | ✅        |
| Real time refresh, no need to refresh page when new task appear | ✅           | ✅ (with SuperSync)                | ✅       | 🟥     | 🟥      | 🟥        |
| Multi tab support                                               | ✅           | 🟥                 | ✅       | 🟨     | 🟨      | 🟨        |
| API                                                             | 🟨 WIP       | ✅ (with SuperSync)                 | ✅       | ✅     | ✅      | ✅        |
| Mobile version                                                  | ✅           | ✅                 | ✅       | ✅     | ✅      | ✅        |
| Keybinds(vim preferred)                                         | ✅           | ✅ even vim!       | ✅ keybinds highlight are smart! | ✅ | ✅ even vim! | 🟨 |
| Weekly planner                                                  | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |
| Categories/columns inside projects                              | ✅           | ✅                 | 🟥       | 🟥     | ✅ kanban! | ✅ kanban! |
| Desktop version with quick add global shortcut                  | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |
| Local first                                                     | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |

## Will Be Done - modern offline-first self-hosted TickTick/Todoist alternative

Most task managers are great at collecting tasks - and terrible at helping you plan your week. Will Be Done gives you a visual weekly timeline where each day is a column. Drag tasks between days. See what's realistic. Always know what to focus on.

This is my third attempt in 3 years to build the task manager I actually want to use. I already use it daily. Things pushed me to build it: own my data (self-hosted), a weekly planning view, instant sync, offline support and vim keybinds.

Try the **live demo** (no sign-up) at [demo.will-be-done.app](https://demo.will-be-done.app)
or the cloud version at [will-be-done.app](https://will-be-done.app/) before installing.

<table>
  <tr>
    <th>Project</th>
    <th>Timeline</th>
  </tr>
  <tr>
    <td width="50%">
      <img
        src="https://github.com/user-attachments/assets/4f9f5973-e1ba-4d03-af28-5f04f5891ed8"
        alt="project"
        width="100%"
      />
    </td>
    <td width="50%">
      <img
        src="https://github.com/user-attachments/assets/7d9f606e-1203-4dce-a82b-9b39ce631a99"
        alt="timeline"
        width="100%"
      />
    </td>
  </tr>
  <tr>
    <th>Today</th>
    <th>Mobile</th>
  </tr>
  <tr>
    <td width="50%">
      <img
        src="https://github.com/user-attachments/assets/effaffd0-4d59-4631-a785-af0b459030c5"
        alt="459_1x_shots_so"
        width="100%"
      />
    </td>
    <td width="50%">
      <img
        src="https://github.com/user-attachments/assets/36d60659-8725-49cc-807b-79cfa21b88ce"
        alt="459_1x_shots_so"
        width="100%"
      />
    </td>
  </tr>
</table>

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

**It's your data**
- Self-hosted - one Docker command, SQLite, no external dependencies
- Open source - AGPL license

## Vim keybinds

Global:
1. `s` - toggle stash
1. `t` - toggle task details panel
1. `v` - toggle project view
1. `z` - zen mode: close stash, task details, and project view

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
1. `e` - edit task description

Planned:
1. `u`/`r` - undo/redo action
1. `?` - change date

## Current Roadmap, v1.0 release

From tasks perspective:
- [x] Repeating tasks
- [x] Task details. Tast body with markdown support
- [x] Checklist inside task

From api perspective:
- [ ] API & MCP integration

UI/UX:
- [ ] Undo/redo action

Others:
- [x] Migrator from popular task managers: Todoist / TickTick

Separate apps:
- [x] Desktop app with global quick add
- [ ] Mobile app(not PWA)

## Next possible features

From tasks perspective:
- [ ] Task comments
- [ ] Task attachments

From api perspective:
- [ ] CalDAV integration

UI/UX:
- [ ] Themes per project(custom background of project and custom color of project tasks)
- [ ] Global command palette
- [ ] Multi selection of tasks
- [ ] Global themes
- [ ] DnD for project columns
- [ ] I18n
- [ ] More vim keybindings
      
Others:
- [ ] e2e encryption
- [ ] Global search

Separate apps:
- [ ] Widgets support on mobile app
- [ ] Notifications on web, mobile, desktop apps

## Features that are not planning for now

1. Multi users per space/project
1. Sharing tasks/projects/spaces
1. No time schedules for tasks
