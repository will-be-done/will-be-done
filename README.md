This is my 5th attempt in 2 years to make task manager of my dream. And it looks like I very close to my dream!
I already use it daily, and I fairly enjoy it. Three reasons why I need it - self-hosted(I own my data),
daily planning and vim keybinds. Hope you find something that could be useful for you too!

You can try the cloud version for free at [will-be-done.app](https://will-be-done.app/) before installing through Docker.

<img width="3442" height="1960" alt="screen" src="https://github.com/user-attachments/assets/9e685994-50be-4064-a6f3-0de7e943b1a4" />


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

Top features:
1. Weekly timeline view - see multiple days as columns, plan your week visually
1. Local and offline first - works offline, syncs back when you're online
1. Top tier performance (it's based on own DB development - apps/hyperdb)
1. Everything drag & drop - move tasks between days, projects, categories
1. Kanban boards everywhere - each project has categories (Week/Month/Ideas/etc)
1. Multiple spaces - separate workspaces for work/personal/different projects
1. Keyboard navigation - vim-style keys (j/k) and arrows to move around fast
1. Self-hosted - one docker command, no external dependencies
1. Open source

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

## Missing features that will be added soon

From tasks perspective:
1. Repeating tasks
1. Task details
1. Comments to tasks
1. Attachments
1. Global search among tasks/details/comments
1. Checklist inside task

From projects perspective:
1. Themes per project(custom background of project and custom color of project tasks)

From daily columns perspective:
1. Calendar integration

From api perspective:
1. API for developer. It will open ability for developers to write own bots.
1. MCP integration

UI/UX:
1. Multi selection of tasks
1. Global command palette
1. Better vim keybinds. Right now some of them are missing and sometime they are buggy
1. Global themes.
1. Undo/redo action
1. DnD for project columns
1. I18n

Others:
1. Desktop version to be able to have global shortcut
1. Mobile version or just simple inbox app with ability to just dictate
1. Migrator from popular task managers

## Features that are not planning for now

1. Multi users per space/project
1. Sharing tasks/projects/spaces
1. No time schedules for tasks

