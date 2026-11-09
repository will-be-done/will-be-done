import type { ReactElement, ReactNode } from "react";
import { useAsyncSelector } from "@will-be-done/hyperdb/react";
import {
  externalEventDetails,
  type ExternalEventOccurrence,
  type ExternalEventResponse,
} from "@will-be-done/slices/space";
import { Video } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { formatEventWhen } from "./externalEventsModel";
import { ScrollArea } from "@/components/ui/scroll-area";

const URL_PATTERN = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]/g;

const linkify = (text: string) => {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    parts.push(
      text.slice(last, match.index),
      <a
        key={match.index}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent underline-offset-2 hover:underline"
      >
        {match[0]}
      </a>,
    );
    last = match.index + match[0].length;
  }
  parts.push(text.slice(last));
  return parts;
};

const responseLabels: Record<ExternalEventResponse, string> = {
  accepted: "Going",
  declined: "Declined",
  tentative: "Maybe",
  "needs-action": "Not answered",
};

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex gap-3">
    <div className="w-20 shrink-0 text-content-tinted/70">{label}</div>
    <div className="min-w-0 flex-1 break-words">{children}</div>
  </div>
);

const Details = ({ occurrence }: { occurrence: ExternalEventOccurrence }) => {
  const { data: details } = useAsyncSelector({
    selector: externalEventDetails,
    args: {
      eventId: occurrence.eventId,
      recurrenceKey: occurrence.recurrenceKey,
    },
    defaultValue: null,
  });
  const notes = [
    occurrence.response && occurrence.response !== "accepted"
      ? responseLabels[occurrence.response]
      : null,
    occurrence.status === "tentative" ? "Tentative" : null,
    occurrence.free ? "Free" : null,
  ].filter(Boolean);
  const people = details
    ? [
        ...(details.organizer ? [details.organizer] : []),
        ...details.attendees.filter(
          (attendee) => attendee.email !== details.organizer?.email,
        ),
      ]
    : [];

  return (
    <div className="flex flex-col gap-3 text-sm" data-external-event-details>
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 size-2.5 shrink-0 rounded-full"
          style={{ background: occurrence.color ?? "rgb(148 163 184)" }}
        />
        <div className="min-w-0">
          <div className="break-words font-medium text-content">
            {occurrence.title || "Untitled event"}
          </div>
          <div className="text-content-tinted">
            {formatEventWhen(occurrence)}
          </div>
          {notes.length > 0 && (
            <div className="text-xs text-content-tinted/70">
              {notes.join(" · ")}
            </div>
          )}
        </div>
      </div>

      {details?.meetingUrl && (
        <a
          href={details.meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-accent px-3 font-medium text-white hover:bg-accent/90"
        >
          <Video className="size-4" />
          Join meeting
        </a>
      )}

      <div className="flex flex-col gap-1.5">
        <Row label="Calendar">{occurrence.calendarName}</Row>
        {occurrence.location && (
          <Row label="Location">{linkify(occurrence.location)}</Row>
        )}
        {details?.url && details.url !== details.meetingUrl && (
          <Row label="Link">{linkify(details.url)}</Row>
        )}
        {people.length > 0 && (
          <Row label="Guests">
            <ScrollArea className="max-h-32">
              <ul className="flex flex-col gap-0.5">
                {people.map((person) => (
                  <li key={person.email} className="flex gap-1.5">
                    <span className="min-w-0 truncate" title={person.email}>
                      {person.name ?? person.email}
                      {person.isOwner && " (you)"}
                    </span>
                    <span className="shrink-0 text-content-tinted/70">
                      {person === details?.organizer
                        ? "Organizer"
                        : person.response && responseLabels[person.response]}
                    </span>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </Row>
        )}
      </div>

      {details?.description && (
        <ScrollArea className="max-h-48 whitespace-pre-wrap break-words border-t border-white/10 pt-3 text-content-tinted">
          {linkify(details.description)}
        </ScrollArea>
      )}
    </div>
  );
};

// Opens an external event's details; the event itself stays read-only.
export const ExternalEventPopover = ({
  occurrence,
  children,
}: {
  occurrence: ExternalEventOccurrence;
  children: ReactElement;
}) => (
  <Popover>
    <PopoverTrigger asChild>{children}</PopoverTrigger>
    <PopoverContent align="start" className="w-80 bg-panel-tinted-opaque p-3">
      <Details occurrence={occurrence} />
    </PopoverContent>
  </Popover>
);
