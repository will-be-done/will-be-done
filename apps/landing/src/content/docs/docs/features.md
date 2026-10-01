---
title: Features
description: How tasks, projects, scheduling, Stash, and recurring templates work.
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

## Weekly timeline and Today

The timeline shows days side by side. Each day contains an ordered task list.
Scheduling assigns a day, with no time of day or duration.

A scheduled task still belongs to its project section. Its appearance on the
timeline refers to the same task, so edits and completion apply in both views.

Drag a task onto a day to schedule it. Drag its scheduled appearance to another
day to reschedule it. Reorder tasks within a day to change their order there.
The Today view shows the current day's list.

An unfinished task keeps its scheduled day. It does not automatically move to
today. A yellow schedule indicator marks unfinished work scheduled in the past.

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
| Project section   | Deletes the task and its scheduled and Stash appearances          |
| Timeline or Today | Removes the scheduled appearance; the task remains in its project |
| Stash             | Removes the Stash appearance; the task remains in its project     |

Resetting a task's schedule also keeps the task. Undo and redo are not available
yet. See [keyboard shortcuts](/docs/keyboard-shortcuts/) for the corresponding keys.

## Imports and space backups

**Space Settings → Import** accepts a TickTick CSV export or a Todoist API
token. Both imports replace the selected space's existing data. Import into an
empty space, or export a backup before importing.

**Space Settings → Backup** exports the selected space as JSON. Restoring that
file replaces the space's existing data. A space export contains its tasks,
projects, templates, checklists, schedules, and Stash entries. It does not back
up your server's accounts or API tokens.
