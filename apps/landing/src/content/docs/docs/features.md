---
title: Features
description: How tasks, notes, text formatting, projects, scheduling, Stash, and recurring templates work.
sidebar:
  order: 1
---

## Tasks and project sections

A task has a title, a todo or done state, and a project section. It can also
have a description and checklist items.

Project sections appear as columns on a project's board. Drag tasks between
sections to organize them, or move a task to another project through its action
menu. The inbox is a project for tasks you have not organized yet.

Spaces separate your projects and schedules. For example, work and personal
tasks can live in different spaces.

## Notes

A note is a section item with a title and a description but no done state. Use
it for reference text that sits between tasks, such as meeting notes or a
project brief. Notes live only in project sections: they cannot be scheduled,
stashed, or given a checklist.

Select **Convert to note** in a task's dropdown menu or task details to turn it
into a note in the same place. Converting removes the task's schedule, Stash
appearance, and checklist, and asks first when it has any. Select **Convert to
task** on a note to turn it back into a todo task. With a note focused, press
`o` or `Shift+O` to add another note below or above it.

## Text formatting

Every text field on a task or recurring template is a WYSIWYG editor that
understands Markdown. This covers the title, the description, and each
checklist item. Type Markdown and it turns into formatting as you write:
`**bold**`, `*italic*`, `~~strikethrough~~`, and `` `code` `` work in all of
them. Descriptions also support `#` headings, `-` and `1.` lists, `>` quotes,
code blocks, and `---` dividers.

The text stays Markdown underneath. When the cursor is inside formatted text,
its Markdown markers appear around it, such as the `**` around bold text.
A toolbar above the description applies the same formatting.
Pasted Markdown text keeps its formatting, and pasting a URL over selected
text turns it into a link. See
[text formatting shortcuts](/docs/keyboard-shortcuts/#text-formatting).

Each of these fields syncs as a shared document. If you edit the same title,
description, or checklist item on two devices, even offline, both sets of edits
are kept. See [conflicting changes](/docs/offline-and-sync/#conflicting-changes).

Project and section names are plain text.

## Weekly timeline and Today

The timeline shows days side by side. Each day contains an ordered task list.
Scheduling assigns a day. A start time and duration are optional; see
[Calendar](#calendar).

A scheduled task still belongs to its project section. Its appearance on the
timeline refers to the same task, so edits and completion apply in both views.

Drag a task onto a day to schedule it. Drag its scheduled appearance to another
day to reschedule it. Reorder tasks within a day to change their order there.
The Today view shows the current day's list.

An unfinished task keeps its scheduled day. It does not automatically move to
today. A yellow schedule indicator marks unfinished work scheduled in the past.

## Calendar

The calendar shows scheduled tasks in Day, Week, Month, or Plan view. Plan
shows two weeks at a time.

A task can have a start time and a duration. In Day and Week views, timed
tasks appear as blocks on an hourly grid and tasks without a time sit in the
all-day row. Drag a block to change its day or time, or drag its bottom edge to
change its duration. Drag a task from a project section onto the calendar to
schedule it. Set or clear the time and duration from the task details panel.

## Mindmaps

A mindmap lays out ideas around a central topic, and its branches can hold
tasks from any project. Open **maps** from the view switcher, then create a
mindmap and type its central topic.

Select a topic and press `Tab` to add a subtopic, `Enter` to add a task under
it, or `o` to add a topic below it. New tasks go to the inbox.
Drag a task from the project panel onto a topic to place it under that topic,
or onto empty space to start a new branch on that side. Drag topics to
rearrange them. While you drag, a faded copy shows where the topic will land:
drop on a topic to nest under it, or on its top or bottom edge to place it
above or below. A task appears once per mindmap, so dropping it again moves
it.

Drag across empty space to select several topics, or `Shift`-click to add one.
Drag any selected topic to move them together, or press `Backspace` to remove
them. Scroll to pan, `Ctrl`-scroll to zoom, or drag with the middle mouse
button to pan.

Task topics stay linked to their task: renaming or completing one changes the
task everywhere, and selecting one opens it in the task details panel. Task
details list the mindmaps a task appears on. Removing a topic, or deleting a
whole mindmap, keeps its tasks in their projects. Deleting a task removes it
from its mindmaps, and restoring it from the trash puts it back.

## Stash

Stash keeps tasks handy when you know you will need them soon but are not sure
when. You can open it from any page without assigning those tasks a date.

Adding a task to Stash keeps it in its project section. Dragging a scheduled
appearance into Stash removes that appearance from its day. Dragging a Stash
appearance onto a day removes it from Stash and schedules it there.

The inbox holds tasks you have not organized yet. Stash can hold tasks from
any project that you expect to work on soon.

## Task details and checklists

The task details panel shows a task's project, section, schedule, description,
and checklist. Checklist items can be checked off and reordered independently
of the parent task.

Completing a task changes its state wherever it appears. Completing a checklist
item changes that checklist row.

## Recurring tasks

A recurring template is a blueprint that generates tasks on matching dates.
It lives in a project section and stores a title, description, checklist, and
repeat rule.

The repeat editor supports these rules:

| Frequency     | Options                                            |
| ------------- | -------------------------------------------------- |
| Daily         | Every day or a custom number of days               |
| Weekly        | Selected weekdays, with a custom week interval     |
| Monthly       | A day of the month, with a custom month interval   |
| Yearly        | A month and day, with a custom year interval       |
| End condition | Never, after a number of occurrences, or on a date |

Select **Make repeating** in task details or **Convert to template** in the
task's dropdown menu to convert a task into a template.
The app generates occurrences up to the current date when it checks templates.
Future dates are not populated with all future occurrences in advance.
Each generated task has its own state, checklist, and schedule.

Editing a template changes what future generated tasks receive. It does not
rewrite tasks that already exist. Completing an occurrence does not stop the
series. Removing the template stops generation and leaves existing tasks in
place, unlinked from the template.

## Remove an appearance or delete a task

The delete action depends on where you use it:

| View              | Effect                                                            |
| ----------------- | ----------------------------------------------------------------- |
| Project section   | Moves the task to Trash with its scheduled and Stash appearances  |
| Timeline or Today | Removes the scheduled appearance; the task remains in its project |
| Stash             | Removes the Stash appearance; the task remains in its project     |

Resetting a task's schedule also keeps the task. Undo and redo are not available
yet. See [keyboard shortcuts](/docs/keyboard-shortcuts/) for the corresponding keys.

Open **Trash** at the bottom of the sidebar to restore a deleted task or delete
it forever. Restoring returns the task to its section, checklist, schedule, and
Stash; if its project is gone, it returns to the Inbox. Tasks are deleted forever
30 days after they enter Trash. Deleted notes go to Trash the same way.
Deleting a project deletes its tasks and notes without moving them to Trash.

## Imports and space backups

**Space Settings → Import** accepts a TickTick CSV export or a Todoist API
token. Both imports replace the selected space's existing data. Import into an
empty space, or export a backup before importing.

**Space Settings → Backup** exports the selected space as JSON. Restoring that
file replaces the space's existing data. A space export contains its tasks,
projects, notes, templates, checklists, schedules, and Stash entries. It does not back
up your server's accounts or API tokens.
