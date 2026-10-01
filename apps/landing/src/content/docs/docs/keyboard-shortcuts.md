---
title: Keyboard shortcuts
description: Keys for navigation, task actions, project actions, and desktop quick add.
sidebar:
  order: 2
---

## Focus and editing

Click a task to focus it. Navigation and action shortcuts apply while you are
outside a text field. Press `i` or `Enter` to edit a focused task's title.
Press `Enter` or `Esc` to finish editing; `Shift+Enter` inserts a line break.

In this reference, `Shift+O` means hold Shift and press O. Control-based movement
uses `Ctrl` on macOS too.

## Panels

| Key | Action                                                                |
| --- | --------------------------------------------------------------------- |
| `\` | Toggle Stash                                                          |
| `v` | Toggle task details                                                   |
| `p` | Toggle the project panel in the planning view                         |
| `z` | Close Stash, task details, and the project panel in the planning view |

## Navigation

| Keys              | Action                                   |
| ----------------- | ---------------------------------------- |
| `j`, `ArrowDown`  | Focus the next item                      |
| `k`, `ArrowUp`    | Focus the previous item                  |
| `h`, `ArrowLeft`  | Focus an item in the column to the left  |
| `l`, `ArrowRight` | Focus an item in the column to the right |

## Focused task

| Keys                              | Action                                                      |
| --------------------------------- | ----------------------------------------------------------- |
| `i`, `Enter`                      | Edit title                                                  |
| `o`                               | Create a task below the focused todo task                   |
| `Shift+O`                         | Create a task above the focused todo task                   |
| `Space`                           | Toggle todo or done                                         |
| `Ctrl+j`, `Ctrl+ArrowDown`        | Move down in the list                                       |
| `Ctrl+k`, `Ctrl+ArrowUp`          | Move up in the list                                         |
| `Ctrl+h`, `Ctrl+ArrowLeft`        | Move to the column on the left                              |
| `Ctrl+l`, `Ctrl+ArrowRight`       | Move to the column on the right                             |
| `m`                               | Move to another project                                     |
| `s`                               | Choose a scheduled date                                     |
| `t`                               | Schedule for today                                          |
| `r`                               | Clear the schedule                                          |
| `Shift+S`                         | Move to Stash                                               |
| `Shift+T`                         | Convert a task without a template into a recurring template |
| `e`                               | Edit description in task details                            |
| `c`                               | Add a checklist item                                        |
| `a`                               | Open the action menu                                        |
| `d`, `x`, `Backspace`             | Remove the focused item from its current view               |
| `Ctrl+Backspace`, `Cmd+Backspace` | Delete the underlying task when focused in a daily list     |

In a project section, `d`, `x`, and `Backspace` delete the task. In a daily list
or Stash, they remove its appearance and keep the task in its project. See
[deletion behavior](/docs/features/#remove-an-appearance-or-delete-a-task).

## Focused project

| Keys                  | Action                    |
| --------------------- | ------------------------- |
| `i`                   | Edit project              |
| `j`, `k`              | Navigate between projects |
| `d`, `x`, `Backspace` | Delete project            |

## Desktop quick add

With the desktop app running, press `Cmd+Shift+A` on macOS or `Ctrl+Shift+A`
on Windows and Linux to open quick add from another app. Closing the main
window keeps Will Be Done running in the system tray. Use the tray's quit
action to exit completely.

### Wayland

Some Wayland compositors register the global shortcut without delivering its
events. Configure the compositor to invoke the app with `--show-quick-add`.
Choose the command for your installed package:

| Package        | Command                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| deb, rpm, snap | `will-be-done --show-quick-add`                                          |
| Flatpak        | `flatpak run --command=will-be-done-quick-add app.willbedone.WillBeDone` |
| AppImage       | `/absolute/path/to/will-be-done.AppImage --show-quick-add`               |

For niri, add this entry inside the `binds` section:

```kdl
Ctrl+Shift+A {
	spawn "will-be-done" "--show-quick-add";
}
```

Run `niri validate` after editing. Niri reloads valid configuration changes.

For Hyprland with Lua configuration:

```lua
hl.bind(
	"CTRL + SHIFT + A",
	hl.dsp.exec_cmd("will-be-done --show-quick-add")
)
```

Replace the command in either example if you use Flatpak or AppImage. The
command starts the app with the main window hidden, or forwards the request
to the running process.

To open or focus the main window with Flatpak, run:

```sh
flatpak run --command=will-be-done-show app.willbedone.WillBeDone
```

## Reserved keys

Undo and redo are not implemented. Outside text fields, `u`, `Cmd+Z`,
`Ctrl+Z`, `Ctrl+R`, `Cmd+Shift+Z`, and `Ctrl+Shift+Z` are reserved and do not
undo or redo task actions.
