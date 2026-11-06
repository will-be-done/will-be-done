---
title: Keyboard shortcuts
description: Keys for navigation, task actions, project actions, text formatting, and quick add.
sidebar:
  order: 2
---

## Focus and editing

Click a task to focus it. Navigation and action shortcuts apply while you are
outside a text field. Press `i` or `Enter` to edit a focused task's title.
Press `Enter` or `Esc` to finish editing a title. In a description, `Enter`
starts a new line and `Shift+Enter` or `Esc` finishes editing.

In this reference, `Shift+O` means hold Shift and press O. Control-based movement
uses `Ctrl` on macOS too.

## Quick add

Press `Ctrl+A` outside a text field to add a task from anywhere in a space.
Type the title, pick a project, section, and date, then press `Enter`. The
project and date start from the page you are on.

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
| `o`                               | Create a task below a todo task, or a note below a note     |
| `Shift+O`                         | Create a task above a todo task, or a note above a note     |
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

## Copy, cut, and paste

`Mod` is `Cmd` on macOS and `Ctrl` elsewhere. These act on the focused item or
on every selected item.

| Keys    | Action                       |
| ------- | ---------------------------- |
| `Mod+C` | Copy                         |
| `Mod+X` | Cut                          |
| `Mod+V` | Paste below the focused item |

Pasting a copy creates new items with the same title, description, and
checklist. Copies of done tasks start as to-dos. Copies pasted into a daily
list or Stash are also added to the original's project, next to the original.
Pasting a cut moves the items instead, as dragging them would. With a project
focused in the sidebar, pasting adds the items to the end of that project. Cut
items stay dimmed until you paste them or press `Esc`. Copying also puts the
titles on your system clipboard as plain text.

## Selecting several items

Select tasks, notes, and templates in projects, daily lists, and Stash to act
on them together. `Mod` is `Cmd` on macOS and `Ctrl` elsewhere.

| Keys                               | Action                                   |
| ---------------------------------- | ---------------------------------------- |
| `Shift+Click`                      | Select everything up to the clicked item |
| `Mod+Click`                        | Add or remove an item from the selection |
| `Shift+j`, `Shift+k`               | Extend the selection down or up          |
| `Shift+ArrowDown`, `Shift+ArrowUp` | Extend the selection down or up          |
| `Esc`                              | Clear the selection                      |

With a selection, drag any selected item to move them all in their current
order, or copy, cut, and paste them. `Space`, `1`–`3`, `m`, `s`, `t`, `r`,
`Shift+S`, the `Ctrl` movement keys, `d`, `x`, `Backspace`, and
`Ctrl+Backspace` act on every selected item, and so does the action menu of a
selected item. Clicking an item without a
modifier or moving with `j` and `k` clears the selection.

## Focused project

| Keys                  | Action                    |
| --------------------- | ------------------------- |
| `i`                   | Edit project              |
| `j`, `k`              | Navigate between projects |
| `d`, `x`, `Backspace` | Delete project            |

## Calendar

Click a task in the calendar to focus it.

| Keys                              | Action                                                  |
| --------------------------------- | ------------------------------------------------------- |
| `h`, `j`, `k`, `l`                | Move to the task to the left, below, above, or right    |
| `Ctrl+h`, `Ctrl+l`                | Move the task to the previous or next day               |
| `Ctrl+j`, `Ctrl+k`                | Move a timed task 15 minutes later or earlier           |
| `Enter`                           | Open task details                                       |
| `e`                               | Edit description in task details                        |
| `Space`                           | Toggle todo or done                                     |
| `1`–`3`                           | Set the nature                                          |
| `t`                               | Schedule for today                                      |
| `Shift+S`                         | Move to Stash                                           |
| `o`                               | Add a task starting when the task ends                  |
| `Shift+O`                         | Add a task in the half hour before the task             |
| `d`, `x`, `r`, `Backspace`        | Remove the task from its day and keep it in its project |
| `Ctrl+Backspace`, `Cmd+Backspace` | Delete the task                                         |

Arrow keys work like `h`, `j`, `k`, and `l`, with or without `Ctrl`. In the
month and plan views, `j` and `k` continue into the week below or above, and
`Ctrl+j` and `Ctrl+k` move the task a week later or earlier. Tasks only move
within the dates on screen. Upcoming occurrences of a recurring task take
`1`–`3`, and in the day and week views `Ctrl+j` and `Ctrl+k` change the
template's time. On an untimed task, `o` and `Shift+O` add an untimed task on
the same day.

## Mindmap

| Keys                  | Action                                              |
| --------------------- | --------------------------------------------------- |
| `Tab`                 | Add a subtopic                                      |
| `Enter`, `o`          | Add a topic below                                   |
| `Shift+O`             | Add a topic above                                   |
| `i`                   | Edit the title                                      |
| `h`, `j`, `k`, `l`    | Move to the parent, a neighbor, or a child          |
| `Ctrl+J`, `Ctrl+K`    | Move the topic down or up among its siblings        |
| `Ctrl+H`, `Ctrl+L`    | Move the topic toward or away from the center       |
| `Space`               | Toggle a task todo or done                          |
| `m`                   | Move a task or note to another project              |
| `s`                   | Schedule a task for a date                          |
| `t`                   | Schedule a task for today                           |
| `r`                   | Reset a task's schedule                             |
| `Shift+S`             | Stash a task                                        |
| `e`                   | Edit a task's or note's description                 |
| `c`                   | Add a checklist item to a task                      |
| `a`                   | Open the action menu                                |
| `.`                   | Collapse or expand the topic                        |
| `d`, `x`, `Backspace` | Remove the topic and its subtopics from the mindmap |
| `Shift+H/J/K/L`       | Add the next topic that way to the selection        |
| `Mod+C`, `Mod+X`      | Copy or cut the selected topics                     |
| `Mod+V`               | Paste under the topic                               |
| `Escape`              | Clear the selection                                 |

Arrow keys work like `h`, `j`, `k`, and `l`, with or without `Ctrl`. Moving a
topic away from the center nests it under the topic above it; moving it toward
the center places it after its parent, or moves a main branch to the other
side.

On a task or note, `Tab`, `Enter`, and `o` add another task or note instead of
a topic; it goes to the project shown below the map. With several topics
selected, `d`, `x`, and `Backspace` remove all of them, and `Space`, `m`, `s`,
`t`, `r`, and `Shift+S` apply to every task or note among them. Removing a task
or note from a mindmap keeps it in its project.

Copied topics paste with their subtopics, still showing the same tasks and
notes; a cut moves them, even to another mindmap. Tasks and notes copied from a
list paste onto the mindmap as themselves, as many times as you like, and
topics copied from a mindmap paste into a list as copies of their tasks and
notes.

## Text formatting

These work while editing a title, a description, or a checklist item. `Mod` is
`Cmd` on macOS and `Ctrl` elsewhere. Typing the Markdown applies the same
formatting.

| Keys          | Markdown     | Action                                    |
| ------------- | ------------ | ----------------------------------------- |
| `Mod+B`       | `**text**`   | Bold                                      |
| `Mod+I`       | `*text*`     | Italic                                    |
| `Mod+Shift+S` | `~~text~~`   | Strikethrough                             |
| `Mod+E`       | `` `text` `` | Inline code                               |
| `Mod+V`       |              | Paste a URL over selected text to link it |

Descriptions also have block formatting. Start a line with the Markdown and a
space, use the keys, or use the toolbar above the description.

| Keys            | Markdown     | Action        |
| --------------- | ------------ | ------------- |
| `Mod+Alt+1`–`6` | `#`–`######` | Heading       |
| `Mod+Shift+8`   | `-`          | Bulleted list |
| `Mod+Shift+7`   | `1.`         | Numbered list |
| `Mod+Shift+B`   | `>`          | Quote         |
| `Mod+Alt+C`     | ` ``` `      | Code block    |
|                 | `---`        | Divider       |

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
