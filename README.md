# Will Be Done

**An offline-first, self-hosted task planner built around a visual weekly timeline.**

Will Be Done is built around a simple workflow: collect tasks, place them on a weekly timeline, and keep the few you care about right now in Stash.

It is also local-first: your tasks stay available offline, changes feel instant, and sync catches up across devices when your server is available.

I want it to feel fast in the same way Linear feels fast. The app should open straight into your tasks, without a big loading spinner first. It reads from local persistent storage on demand, so startup should stay quick even after years of saved tasks.

Under the hood, Will Be Done runs on [HyperDB](https://github.com/will-be-done/hyperdb), my own local-first database layer. I built it after more than two years of researching what kind of database would actually fit the apps I want to make: offline-first, reactive, fast at startup, and able to share the same typed data logic between the browser and the server.

[Try the live demo](https://demo.will-be-done.app) | [Use the cloud app](https://app.will-be-done.app/signup) | [Download desktop app](https://github.com/will-be-done/will-be-done/releases)

<img width="3002" height="1908" alt="Will Be Done weekly planning view" src="https://github.com/user-attachments/assets/b36b1797-83f5-4eca-92c3-75dd7b42a2ac" />

## Why Will Be Done?

Will Be Done is for people who want a fast, private task manager that is built for planning, not just capture.

- **Plan the week visually.** Each day is a column, so you can see what is realistic and rebalance by dragging tasks around.
- **Keep the UX instant.** The app should open directly into your tasks, without a blocking spinner or a full database load first.
- **Stay useful offline.** The app keeps a full local database in the browser, so you can read and write tasks without waiting on the network.
- **Start fast, even with years of tasks.** Will Be Done reads data on demand from local storage, so it can stay useful as a lifelong task archive.
- **Own the data.** Self-host the sync server with Docker, store data in SQLite, and avoid handing your task history to a third-party task app.
- **Move fast from the keyboard.** Vim-style navigation, quick task creation, project movement, stashing, scheduling, and task actions are all keyboard-friendly.
- **Keep focus visible.** Stash is a persistent focus list available from any page for the tasks you want close at hand this week or month.

## Try It

- **Live demo:** [demo.will-be-done.app](https://demo.will-be-done.app) - no sign-up required.
- **Cloud app:** [app.will-be-done.app](https://app.will-be-done.app/signup) - try it before self-hosting.
- **Desktop app:** [download the latest release](https://github.com/will-be-done/will-be-done/releases) for Windows, macOS, or Linux.
- **Mobile:** install the web app as a PWA. App store builds that package the same web app for iOS and Android are planned.

## HTTP API

Will Be Done provides a HTTP API for integrating with your tasks,
projects, schedules, and other data.

- **Will Be Done Cloud:** [read the API documentation](https://app.will-be-done.app/api/docs).
- **Self-hosted with Docker:** open `/api/docs` on your server, for example
  [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

### Create an API token

1. Sign in and open a space.
2. Open **Space Settings**, select **Tokens**, and click **Create token**.
3. Copy the new token and store it securely. Tokens remain active until you
   delete them from the same settings page.

Send the token as a Bearer credential:

```bash
curl \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://app.will-be-done.app/api/v1/spaces
```

When you open the Scalar documentation in the same browser and on the same
server where you are signed in, it automatically uses the current session
token stored by the web app. If no current token is available, you can enter
one through Scalar's **Authentication** controls.

## Self-Host With Docker

Run the server:

```bash
docker run -d \
  -p 3000:3000 \
  -v will_be_done_storage:/var/lib/will-be-done \
  --restart unless-stopped \
  ghcr.io/will-be-done/will-be-done:latest
```

Then open http://localhost:3000 in your browser.

The Docker server hosts the web app, stores server-side data under `/var/lib/will-be-done`, and provides sync for browser, PWA, and desktop clients. SQLite is the default; the API can optionally use Turso Cloud or the local Rust tursod service. See [the API database configuration](apps/api/README.md#database-engines) for setup instructions.

## Screenshots

<table>
  <tr>
    <th>Project</th>
    <th>Timeline</th>
  </tr>
  <tr>
    <td width="50%">
      <img
        src="https://github.com/user-attachments/assets/4f9f5973-e1ba-4d03-af28-5f04f5891ed8"
        alt="Project board"
        width="100%"
      />
    </td>
    <td width="50%">
      <img
        src="https://github.com/user-attachments/assets/7d9f606e-1203-4dce-a82b-9b39ce631a99"
        alt="Weekly timeline"
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
        alt="Today view"
        width="100%"
      />
    </td>
    <td width="50%">
      <img
        src="https://github.com/user-attachments/assets/36d60659-8725-49cc-807b-79cfa21b88ce"
        alt="Mobile view"
        width="100%"
      />
    </td>
  </tr>
</table>

## Available Today

**Task management**

- Create, edit, complete, move, reorder, and delete tasks.
- Add task descriptions and checklist items.
- Check off and reorder checklist items inside tasks.
- Schedule tasks to specific dates, schedule them for today, or clear their schedule.
- View tasks in daily, weekly timeline, project, and stash contexts.

**Projects and planning**

- Organize tasks into projects.
- Split projects into ordered sections or columns.
- Drag tasks between projects, sections, daily lists, and stash.
- Use multiple spaces to separate work, personal tasks, and side projects.
- Keep an inbox project for quick capture.
- Use Stash as a persistent focus list available from every page.

**Recurring tasks**

- Convert a task into a recurring template.
- Create recurring templates with daily, weekly, monthly, and yearly rules.
- Set custom intervals such as every 2 weeks or every 3 months.
- Choose weekdays for weekly repeats.
- Choose month day for monthly repeats.
- End a recurring series never, after a number of occurrences, or on a date.

**Local-first speed**

- Full browser-side database for instant interactions.
- Read and write support while offline.
- On-demand reads from persistent storage, so the app can start quickly without a blocking loading spinner.
- Designed to stay fast with a large task history, not only a fresh database.
- Real-time sync across tabs and devices when connected.

**Keyboard and workflow**

- Vim keybindings for navigation and task actions.
- Drag and drop for tasks, days, projects, and sections.
- Desktop app with global quick add.
- Mobile-ready PWA for planning away from the desktop.

**Import, backup, and ownership**

- Self-hosted server in one Docker command.
- SQLite storage by default, with optional Turso Cloud or tursod storage.
- No external services required for a self-hosted setup.
- Todoist import by API token.
- TickTick import from CSV export.

## Keyboard Shortcuts

### Global quick add on Wayland

Electron's global shortcut portal may report a successful registration on some Wayland
compositors without delivering shortcut events. In that case, let the compositor handle
`Ctrl+Shift+A` and invoke the installed Will Be Done application with
`--show-quick-add`.

Use the command that matches the installed package:

- deb, rpm, or snap: `will-be-done --show-quick-add`
- Flatpak (optimized): `flatpak run --command=will-be-done-quick-add app.willbedone.WillBeDone`
- AppImage: `/absolute/path/to/will-be-done.AppImage --show-quick-add`

To quickly open or focus the main window from a Flatpak installation:

```bash
flatpak run --command=will-be-done-show app.willbedone.WillBeDone
```

For example, with a deb, rpm, or snap installation, add this entry to the `binds`
section of the niri configuration:

```kdl
Ctrl+Shift+A {
    spawn "will-be-done" "--show-quick-add";
}
```

Validate the niri configuration after editing it:

```bash
niri validate
```

Niri reloads valid configuration changes automatically.

For Hyprland using Lua configuration:

```lua
hl.bind(
    "CTRL + SHIFT + A",
    hl.dsp.exec_cmd("will-be-done --show-quick-add")
)
```

Replace the command portion of either compositor example when using Flatpak or AppImage.
The command starts Will Be Done when necessary. If it is already running, the request is
forwarded to the existing process. Starting with `--show-quick-add` keeps the main window
hidden. Closing the main window also keeps Will Be Done running in the system tray, where
you can reopen the app, show Quick Add, or quit it completely.

### In app shortcuts

Global:

1. `\` - toggle stash
1. `v` - toggle task details panel
1. `p` - toggle project view
1. `z` - zen mode: close stash, task details, and project view

When a task is focused:

1. `i`, `enter` - enter insert mode to edit the task; `esc` exits insert mode
1. `j`, `k` - move between tasks
1. `h`, `l` - move between columns
1. `ctrl-j`, `ctrl-k`, `ctrl-down`, `ctrl-up` - move task up or down
1. `ctrl-h`, `ctrl-l`, `ctrl-left`, `ctrl-right` - move task left or right
1. `o` - create a task below the focused task
1. `O` - create a task above the focused task
1. `space` - toggle task state
1. `m` - move task to another project
1. `S` - stash task
1. `s` - schedule date
1. `t` - schedule task for today
1. `r` - reset schedule
1. `d`, `x`, `backspace` - delete task
1. `e` - edit task description
1. `c` - add checklist item
1. `a` - open action menu

When a project is focused:

1. `i` - edit project
1. `j`, `k` - move between projects
1. `d`, `x`, `backspace` - delete project

Reserved / WIP:

1. `u`, `cmd-z`, `ctrl-z` - undo action
1. `ctrl-r`, `cmd-shift-z`, `ctrl-shift-z` - redo action

## Roadmap

Planned for v1.0:

- [x] Repeating tasks
- [x] Task details
- [x] Checklists inside tasks
- [x] Todoist / TickTick migration
- [x] Desktop app with global quick add
- [x] OpenAPI integration
- [ ] CLI app
- [ ] Undo / redo

Possible next features:

- [ ] Task comments
- [ ] Task attachments
- [ ] CalDAV integration
- [ ] MCP integration
- [ ] Project themes with custom backgrounds and task colors
- [ ] Global command palette
- [ ] Multi-select tasks
- [ ] Global themes
- [ ] Drag and drop for project columns
- [ ] Internationalization
- [ ] More Vim keybindings
- [ ] End-to-end encryption
- [ ] Global search
- [ ] Mobile widgets
- [ ] Notifications on web, mobile, and desktop
- [ ] Mobile app store builds (the web app packaged for iOS and Android)

Not planned for now:

1. Multi-user spaces or projects
1. Shared tasks, projects, or spaces
1. Time-of-day scheduling for tasks

## Development

Install dependencies:

```bash
pnpm install
```

Run the API and web app in separate terminals:

```bash
pnpm dev:server
pnpm dev:client
```

Or run the combined terminal UI. When `WBD_DB_ENGINE=tursod`, it also starts
the Rust database service and configures the API to use it:

```bash
pnpm all
WBD_DB_ENGINE=tursod pnpm all
```

Useful checks:

```bash
pnpm ts
pnpm lint
pnpm test
pnpm test:e2e
```

## Why Another Task Manager?

I am building Will Be Done as the task manager I want to use for the rest of my life.

That means it needs to stay fast with years of task history, start quickly without waiting on a full database load, work even when the internet disappears, and keep sensitive task data under my control. It also needs to fit the way I work: weekly planning, keyboard-first navigation, a persistent focus stash, desktop quick add, and an API that can connect to tools like Telegram or an MCP server.

Super Productivity came closest to what I wanted from the self-hosted ecosystem, but I wanted a more opinionated workflow around weekly planning, local-first sync, visual customization, and Vim-style ergonomics.

## Comparison

This table captures the feature set I was optimizing for while building Will Be Done. Other projects may have changed since this comparison was written.

| Feature                                 | Will Be Done | Super Productivity | Donetick | Tududi | Vikunja | TaskTrove |
| --------------------------------------- | ------------ | ------------------ | -------- | ------ | ------- | --------- |
| Open source and self-hosted             | ✅           | ✅                 | ✅       | ✅     | ✅      | ✅        |
| Fully usable offline                    | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |
| Drag and drop for tasks and projects    | ✅           | ✅                 | 🟥       | 🟥     | ✅      | ✅        |
| Real-time refresh without manual reload | ✅           | ✅ with SuperSync  | ✅       | 🟥     | 🟥      | 🟥        |
| Multi-tab support                       | ✅           | 🟥                 | ✅       | 🟨     | 🟨      | 🟨        |
| API                                     | ✅           | ✅ with SuperSync  | ✅       | ✅     | ✅      | ✅        |
| Mobile version                          | ✅           | ✅                 | ✅       | ✅     | ✅      | ✅        |
| Keyboard shortcuts / Vim bindings       | ✅           | ✅                 | ✅       | ✅     | ✅      | 🟨        |
| Weekly planner                          | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |
| Sections or columns inside projects     | ✅           | ✅                 | 🟥       | 🟥     | ✅      | ✅        |
| Desktop app with global quick add       | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |
| Local-first architecture                | ✅           | ✅                 | 🟥       | 🟥     | 🟥      | 🟥        |

## Note on AI Usage

I have been developing this project for more than a year, and this is my third attempt in three years. The first two attempts failed because the technology for fast offline-first apps was not ready for the experience I wanted.

This version uses my own local-first development approach and a database that works across the frontend and backend, so the same domain logic can run in both places. I have more than 10 years of development experience, including 4 years specializing in offline-first apps. I use Claude Code to help with development, but I review the code manually.
