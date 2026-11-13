---
title: Features
description: How tasks, notes, text formatting, projects, scheduling, search, Stash, and recurring templates work.
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
appearance, and checklist; select **Undo** in the popup to get them back.
Select **Convert to task** on a note to turn it back into a todo task. With a
note focused, press `o` or `Shift+O` to add another note below or above it.

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

The timeline shows days side by side, opening on Monday of the current week.
Each day contains an ordered task list. Scheduling assigns a day. A start time
and duration are optional; see [Calendar](#calendar).

Scroll sideways to move through days in either direction without end. The
arrows next to the date move one day, **Today** returns to the current week,
and clicking the date picks any day. Click a day's name to fold it away.

A scheduled task still belongs to its project section. Its appearance on the
timeline refers to the same task, so edits and completion apply in both views.

Drag a task onto a day to schedule it. Drag its scheduled appearance to another
day to reschedule it. Reorder tasks within a day to change their order there.
Hold a dragged task near the left or right edge to scroll to days further away.
In the projects panel, tasks scheduled on a day currently on screen have a
dashed outline.
The Today view shows the current day's list.

An unfinished task keeps its scheduled day. It does not automatically move to
today. A yellow schedule indicator marks unfinished work scheduled in the past.

## Calendar

The calendar shows scheduled tasks in Day, Week, Month, or Plan view. Plan
shows two weeks at a time.

A task can have a start time and a duration. In Day and Week views, timed
tasks appear as blocks on an hourly grid and tasks without a time sit in the
all-day row. Drag a block to change its day or time, or drag its bottom edge to
change its duration. On a touch screen, press and hold a block briefly before
dragging it. Drag a task from a project section onto the calendar to schedule
it. Set or clear the time and duration from the task details panel.

## Calendar events

Connect your calendars to see their events next to your tasks. Open **Space
settings → Calendars** and add either:

- a **CalDAV account**: the server address, your username, and an app
  password. For iCloud use `caldav.icloud.com` with an app-specific password;
  Fastmail and Nextcloud work the same way. Untick calendars you don't want to
  see.
- a **calendar link**: an `.ics` or `webcal://` subscription address, such as
  Google Calendar's "Secret address in iCal format" or a published Outlook
  calendar.

Events appear in the Calendar views, at the top of each day on the timeline,
and in Today. Timed events show in your device's time zone, and repeating
events show on every day they occur. Click an event to see its description,
guests, and a **Join meeting** button for Zoom, Meet, Teams and similar links.

Invitations you declined are hidden. Events you haven't answered or marked as
maybe are striped, and events marked as free are shown as an outline. Events
are read-only: change them in the calendar app they come from. The server
refreshes them every 15 minutes, and **Refresh** in settings fetches them right
away. Past events are kept for one month by default; choose 2 weeks up to
**All events** under each calendar in settings. Upcoming events are always
included. Once synced, they are available offline. Removing a calendar removes its events from every device.

## Mindmaps

A mindmap lays out ideas around a central topic, and its branches can hold
tasks and notes from any project. Open **maps** in the view switcher, then
create a mindmap and name it. The name also becomes its central topic; after
that, renaming the mindmap (the pencil next to its name, or the mindmaps list)
leaves the topic as it is. Delete one from the list or its name's menu.

Select a topic and press `Tab` to add a subtopic, or `Enter` to add a topic
below it. On a task or note, the same keys add another task or note. New tasks
and notes go to the project shown in the panel below the map, or the inbox.
Turn a topic into a task or a note with the buttons above it. Stash is on the
left edge of the map, as on the timeline.
Drag a task or note from the project panel onto a topic to place it under that
topic, or onto empty space to start a new branch on that side. Drag one of
several selected tasks and notes to place them all. Drag topics to
rearrange them. While you drag, a faded copy shows where the topic will land:
drop on a topic to nest under it, or on its top or bottom edge to place it
above or below. A task or note can be on several topics at once, even on one
mindmap: dropping or pasting it again adds another.

Double-click empty space to start a floating topic there. It works like the
central topic, with its own branches on both sides; drag it to move it, or onto
another topic to attach it there.

Drag across empty space to select several topics, `Shift`-click to select every
topic from the selected one to the clicked one, or `Ctrl`-click (`Cmd` on
macOS) to add or remove one. Copy, cut, and paste work
on topics, and tasks or notes copied from any list paste onto the mindmap.
Pasting other text adds a topic for each line, nested as it was: an outline
copied from MindNode or another outliner, a Markdown list, bulleted lists from
Google Docs or Notion, or OPML.
Drag any selected topic to move them together, or press `Backspace` to remove
them. Scroll to pan, `Ctrl`-scroll to zoom, or drag with the middle mouse
button to pan. On a touch screen, drag with one finger to pan and pinch to
zoom; tap a topic to select it, tap it again to edit, and double-tap empty
space to start a floating topic. On a phone, the bar at the bottom adds topics,
edits, removes, opens a task or note's page, and opens **More**
for the rest of a topic's actions.

Task and note topics stay linked to their item: renaming or completing one
changes it everywhere, and selecting one opens it in the details panel, which
lists the mindmaps it appears on; click one to jump to its topic. Task and
note topics show their selected cover image, project, and section; click the
project or section to move the item. A task topic shows its checklist, and `c`
adds an item. Hover a topic and open **…**, or press `a`, for the same actions a
task has in a list. Converting a task to a note, or back, keeps its place on the
map. Removing a topic, or deleting a whole mindmap, keeps its tasks and notes
in their projects. Deleting a task or note removes it from its mindmaps, and
restoring it from the trash puts it back.

## Search

Press `/`, or select Search in the sidebar or the search icon next to the page
links, to search a space.
Search finds tasks and notes by their titles and descriptions, and mindmap
topics by title. It includes done tasks and works offline. Each word you type
matches the start of a word, so `gro list` finds "Grocery list". Chinese,
Japanese, Korean, and Thai text matches anywhere inside a word, and hiragana
and katakana match each other. Select a task or
note to open its page, or a topic to jump to it on its mindmap.

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

Every task, note, and repeating task also has its own page, with a link you
can copy and share between your devices. Open it with the expand button in the
details panel, **Open page** in the task's **…** menu, or from search. On a
phone, the details button opens it. Press `Esc` or the close button to go back.

Completing a task changes its state wherever it appears. Completing a checklist
item changes that checklist row.

## Attachments

Paste or drop a file into a task, template, or note title or description to
place it inline. In a description, images show in the text; in a title, a file
shows as a small chip with its name, size, and a thumbnail for images. The first
image you paste into a title or description also becomes the card's cover. In
the details panel, use **Cover** to choose another attached image, upload a new
one, or remove the cover. You can also focus a task, template, or note card and
paste an image to attach it directly as the cover. Select an image to view it
full screen and download it. Drag an image's corner handle to resize it, or
double-click the handle to return it to its original size. **Attach file** in
the details panel adds a file to the item's list without placing it in the text.
Inline files appear in that list too, and you can drag a file from the list into
the title or description to place it inline. Files can be up to 50 MB.

Files you add work offline and upload in the background. On each device, the
app downloads every file in the space so it can open offline. The sync
indicator shows upload and download progress.

Removing a file from an item's list also removes it from that item's title
and description. Tasks generated from a template share its files.

**Space Settings → Files** lists every file in the space with the items that
use it. Select an item to open it, or delete a file to remove it everywhere. A
file no item has used for 30 days is deleted automatically. Adding, removing,
and deleting files can't be undone.

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

Resetting a task's schedule also keeps the task. After a delete, a popup in the
corner offers **Undo** for a few seconds. Press `u`, `Cmd+Z`, or `Ctrl+Z` to
undo a delete or any other change at any time; see
[undo and redo](/docs/keyboard-shortcuts/#undo-and-redo).

Open **Trash** at the bottom of the sidebar to restore a deleted task or delete
it forever. Restoring returns the task to its section, checklist, schedule, and
Stash; if its project is gone, it returns to the Inbox. Tasks are deleted forever
30 days after they enter Trash. Deleted notes go to Trash the same way.
Deleting a project deletes its tasks and notes without moving them to Trash.

## Imports and space backups

**Space Settings → Import** accepts a TickTick CSV export or a Todoist API
token. Both imports replace the selected space's existing data. Import into an
empty space, or export a backup before importing.

**Space Settings → Backup** exports the selected space as a ZIP archive.
Restoring that archive, or a JSON backup from an older version, replaces the
space's existing data. A space export contains its tasks, projects, notes,
templates, checklists, schedules, Stash entries, and attached files. It does not
back up your server's accounts or API tokens.
