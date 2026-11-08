import { TRPCError } from "@trpc/server";
import { selectAsync, type DB } from "@will-be-done/hyperdb";
import { Effect, type Context } from "effect";
import { z } from "zod";
import { MainDatabase } from "../db/mainDatabase";
import { enforceRateLimit, protectedProcedure, router } from "../trpc";
import type { CalendarFetchError } from "./http";
import type { CalendarServices } from "./scheduler";
import {
  addCalendarSource,
  publicCalendarSource,
  removeCalendarSource,
  setCalendarEnabled,
  setCalendarSyncWindow,
  syncCalendarSource,
} from "./service";
import { calendarSourceById, calendarSourcesBySpace } from "./sources";
import { calendarSyncWindows } from "./tables";

type CheckSpaceAccess = (spaceId: string, userId: string) => Promise<void>;

const httpUrl = z
  .string()
  .trim()
  .transform((value) => value.replace(/^webcals?:\/\//i, "https://"))
  .pipe(z.url({ protocol: /^https?$/ }));

export function calendarsRouter(
  mainDB: DB,
  calendars: Context.Context<CalendarServices> | undefined,
  checkSpaceAccess: CheckSpaceAccess,
) {
  const ownedSource = async (sourceId: string, userId: string) => {
    const source = await selectAsync(mainDB, {
      selector: calendarSourceById,
      args: { id: sourceId },
    });
    if (!source || source.userId !== userId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Calendar not found" });
    }
    await checkSpaceAccess(source.spaceId, userId);
    return source;
  };

  const run = <A>(
    effect: Effect.Effect<A, CalendarFetchError, CalendarServices>,
  ) => {
    if (!calendars) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "Calendar connections are turned off on this server. Set WBD_CALENDAR_ENCRYPTION_KEY to enable them.",
      });
    }
    return Effect.runPromise(
      effect.pipe(
        Effect.catchTag("CalendarFetchError", (error) =>
          Effect.fail(
            new TRPCError({ code: "BAD_REQUEST", message: error.message }),
          ),
        ),
        Effect.provideContext(calendars),
      ),
    );
  };

  return router({
    list: protectedProcedure
      .input(z.object({ spaceId: z.string() }))
      .query(async ({ ctx, input }) => {
        await checkSpaceAccess(input.spaceId, ctx.user.id);
        const sources = await selectAsync(mainDB, {
          selector: calendarSourcesBySpace,
          args: { spaceId: input.spaceId },
        });
        return {
          enabled: calendars !== undefined,
          sources: sources
            .filter((source) => source.userId === ctx.user.id)
            .map(publicCalendarSource),
        };
      }),

    addCalDav: protectedProcedure
      .input(
        z.object({
          spaceId: z.string(),
          url: httpUrl,
          username: z.string().trim().min(1),
          password: z.string().min(1),
        }),
      )
      .use(enforceRateLimit("calendarConnect"))
      .mutation(async ({ ctx, input }) => {
        await checkSpaceAccess(input.spaceId, ctx.user.id);
        const id = await run(
          addCalendarSource({
            userId: ctx.user.id,
            spaceId: input.spaceId,
            kind: "caldav",
            secret: {
              url: input.url,
              username: input.username,
              password: input.password,
            },
          }),
        );
        return { id };
      }),

    addIcs: protectedProcedure
      .input(z.object({ spaceId: z.string(), url: httpUrl }))
      .use(enforceRateLimit("calendarConnect"))
      .mutation(async ({ ctx, input }) => {
        await checkSpaceAccess(input.spaceId, ctx.user.id);
        const id = await run(
          addCalendarSource({
            userId: ctx.user.id,
            spaceId: input.spaceId,
            kind: "ics",
            secret: { url: input.url },
          }),
        );
        return { id };
      }),

    setCalendarEnabled: protectedProcedure
      .input(
        z.object({
          sourceId: z.string(),
          calendarKey: z.string(),
          enabled: z.boolean(),
        }),
      )
      // Each change runs a full sync of the source.
      .use(enforceRateLimit("calendarRefresh"))
      .mutation(async ({ ctx, input }) => {
        const source = await ownedSource(input.sourceId, ctx.user.id);
        await run(setCalendarEnabled(source, input.calendarKey, input.enabled));
        return { success: true };
      }),

    setSyncWindow: protectedProcedure
      .input(
        z.object({
          sourceId: z.string(),
          syncWindow: z.enum(calendarSyncWindows),
        }),
      )
      // Each change runs a full sync of the source.
      .use(enforceRateLimit("calendarRefresh"))
      .mutation(async ({ ctx, input }) => {
        const source = await ownedSource(input.sourceId, ctx.user.id);
        await run(setCalendarSyncWindow(source, input.syncWindow));
        return { success: true };
      }),

    refresh: protectedProcedure
      .input(z.object({ sourceId: z.string() }))
      .use(enforceRateLimit("calendarRefresh"))
      .mutation(async ({ ctx, input }) => {
        const source = await ownedSource(input.sourceId, ctx.user.id);
        await run(syncCalendarSource(source.id));
        return { success: true };
      }),

    // Works with calendars turned off, so a source can still be removed.
    remove: protectedProcedure
      .input(z.object({ sourceId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const source = await ownedSource(input.sourceId, ctx.user.id);
        await Effect.runPromise(
          removeCalendarSource(source).pipe(
            Effect.provideService(MainDatabase, mainDB),
          ),
        );
        return { success: true };
      }),
  });
}
