import { asyncDispatch, selectAsync } from "@will-be-done/hyperdb";
import {
  dailyReportByDate,
  dailyReportsInDateRange,
  deleteDailyReportByDate,
  upsertDailyReport,
  type DailyReport,
  type DailyReportRating,
} from "@will-be-done/slices/space";
import { getSpaceDatabase } from "./databaseAccess";
import { decodeStringCursor, encodeStringCursor } from "./pagination";
import { ResourceNotFoundError } from "./errors";

export interface PublicDailyReport {
  date: string;
  notes: string;
  completedTasks: { id: string; title: string }[];
  mood?: DailyReportRating;
  energy?: DailyReportRating;
  focus?: DailyReportRating;
  accomplishment?: DailyReportRating;
  createdAt: number;
  updatedAt: number;
}

export interface DailyReportSearchResult {
  dailyReports: PublicDailyReport[];
  nextCursor: string | null;
}

export function toPublicDailyReport(report: DailyReport): PublicDailyReport {
  return {
    date: report.date,
    notes: report.notes,
    completedTasks: report.completedTasks,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    ...(report.mood !== undefined ? { mood: report.mood } : {}),
    ...(report.energy !== undefined ? { energy: report.energy } : {}),
    ...(report.focus !== undefined ? { focus: report.focus } : {}),
    ...(report.accomplishment !== undefined
      ? { accomplishment: report.accomplishment }
      : {}),
  };
}

export async function listDailyReportsInRange({
  spaceId,
  userId,
  from,
  to,
  cursor,
  limit,
}: {
  spaceId: string;
  userId: string;
  from: string;
  to: string;
  cursor?: string;
  limit: number;
}): Promise<DailyReportSearchResult> {
  const db = await getSpaceDatabase(spaceId, userId);
  const decodedCursor = cursor ? decodeStringCursor(cursor) : null;
  const dailyReports = await selectAsync(db, {
    selector: dailyReportsInDateRange,
    args: {
      from,
      to,
      cursorDate: decodedCursor?.sort ?? null,
      cursorId: decodedCursor?.id ?? null,
      limit: limit + 1,
    },
  });
  const page = dailyReports.slice(0, limit);
  const last = page.at(-1);
  return {
    dailyReports: page.map(toPublicDailyReport),
    nextCursor:
      dailyReports.length > limit && last
        ? encodeStringCursor({ sort: last.date, id: last.id })
        : null,
  };
}

export async function getDailyReport({
  spaceId,
  userId,
  date,
}: {
  spaceId: string;
  userId: string;
  date: string;
}): Promise<PublicDailyReport> {
  const db = await getSpaceDatabase(spaceId, userId);
  const report = await selectAsync(db, {
    selector: dailyReportByDate,
    args: { date },
  });
  if (!report) throw new ResourceNotFoundError("Daily report");
  return toPublicDailyReport(report);
}

export async function putDailyReport({
  spaceId,
  userId,
  date,
  notes,
  completedTasks,
  mood,
  energy,
  focus,
  accomplishment,
}: {
  spaceId: string;
  userId: string;
  date: string;
  notes?: string;
  completedTasks?: { id: string; title: string }[];
  mood?: DailyReportRating | null;
  energy?: DailyReportRating | null;
  focus?: DailyReportRating | null;
  accomplishment?: DailyReportRating | null;
}): Promise<PublicDailyReport> {
  const db = await getSpaceDatabase(spaceId, userId);
  const report = (await asyncDispatch(
    db,
    upsertDailyReport({
      date,
      ...(notes !== undefined ? { notes } : {}),
      ...(completedTasks !== undefined ? { completedTasks } : {}),
      ...(mood !== undefined ? { mood } : {}),
      ...(energy !== undefined ? { energy } : {}),
      ...(focus !== undefined ? { focus } : {}),
      ...(accomplishment !== undefined ? { accomplishment } : {}),
    }),
  )) as DailyReport;
  return toPublicDailyReport(report);
}

export async function removeDailyReport({
  spaceId,
  userId,
  date,
}: {
  spaceId: string;
  userId: string;
  date: string;
}): Promise<void> {
  const db = await getSpaceDatabase(spaceId, userId);
  const report = await selectAsync(db, {
    selector: dailyReportByDate,
    args: { date },
  });
  if (!report) throw new ResourceNotFoundError("Daily report");
  await asyncDispatch(db, deleteDailyReportByDate({ date }));
}
