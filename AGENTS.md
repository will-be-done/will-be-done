# Agent Notes

# Definitions

- Task: a concrete work item with a title, state, project section, order, and optional template origin.
- TaskNature: the optional color/nature marker for a Task or TaskTemplate: `red`, `green`, or `unknown`.
- TaskTemplate: a repeatable task blueprint that generates Tasks from a recurrence rule.
- Project: a top-level container for organizing project sections; one Project can be the inbox.
- ProjectSection: an ordered section inside a Project that contains Tasks and TaskTemplates.
- DailyList: a dated schedule list, identified by date, that contains scheduled Task placements.
- Projection / TaskProjection: a scheduled placement of a Task in a DailyList. Its `id` is the Task id; it stores the DailyList and order for that task on that date.
- Stash: the unscheduled holding area represented by StashProjections. It keeps items quickly accessible from any page.
- StashProjection: an unscheduled placement of a Task in the stash. Its `id` is the Task id; it stores the stash order.
- ChecklistItem: an ordered checklist row attached to a Task or TaskTemplate.
- ChecklistParentType: the model types that can own ChecklistItems: Task or TaskTemplate.
- Card: a Task or TaskTemplate, the two primary content items shown in project/section lists.
- CardWrapper: a Card or a projection wrapper that can stand in for a Card in ordered views.
- CardWrapperType: the model type of a CardWrapper.
- ProjectSectionTaskStats: derived counts of total, todo, and done Tasks for a ProjectSection.
- ScheduledTodoTask: a derived index row for a todo Task scheduled through a Projection.
- SpaceMigration: a record that a space-level migration has been applied.
- Model / AnyModel: a syncable domain object from the space tables.
- ModelType / AnyModelType: a model discriminator used to route domain objects and include the virtual `stash` type.
- Table: a HyperDB table that stores one kind of model or derived record.

# HyperDB

If you are interacting with HyperDB(@will-be-done/hyperdb), read small guide what is it, and how
to work with it at @.guides/hyperdb.md
