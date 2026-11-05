import { TRPCError } from "@trpc/server";
import { selectAsync, type DB } from "@will-be-done/hyperdb";
import { z } from "zod";
import { enforceRateLimit, protectedProcedure, router } from "../trpc";
import { CalendarFetchError } from "./guardedFetch";
import {
  addCalendarSource,
  CalendarsDisabledError,
  getCalendarConfig,
  publicCalendarSource,
  removeCalendarSource,
  requireCalendarConfig,
  setCalendarEnabled,
  syncCalendarSource,
} from "./service";
import { calendarSourceById, calendarSourcesBySpace } from "./sources";

type CheckSpaceAccess = (spaceId: string, userId: string) => Promise<void>;

const httpUrl = z
  .string()
  .trim()
  .transform((value) => value.replace(/^webcals?:\/\//i, "https://"))
  .pipe(z.url({ protocol: /^https?$/ }));

const toTRPCError = (error: unknown) => {
  if (error instanceof CalendarsDisabledError) {
    return new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error.message,
    });
  }
  if (error instanceof CalendarFetchError) {
    return new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  return error;
};

export function calendarsRouter(
  mainDB: DB,
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

  const run = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (error) {
      throw toTRPCError(error);
    }
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
          enabled: getCalendarConfig() !== null,
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
      .mutation(({ ctx, input }) =>
        run(async () => {
          await checkSpaceAccess(input.spaceId, ctx.user.id);
          const id = await addCalendarSource(mainDB, requireCalendarConfig(), {
            userId: ctx.user.id,
            spaceId: input.spaceId,
            kind: "caldav",
            secret: {
              url: input.url,
              username: input.username,
              password: input.password,
            },
          });
          return { id };
        }),
      ),

    addIcs: protectedProcedure
      .input(z.object({ spaceId: z.string(), url: httpUrl }))
      .use(enforceRateLimit("calendarConnect"))
      .mutation(({ ctx, input }) =>
        run(async () => {
          await checkSpaceAccess(input.spaceId, ctx.user.id);
          const id = await addCalendarSource(mainDB, requireCalendarConfig(), {
            userId: ctx.user.id,
            spaceId: input.spaceId,
            kind: "ics",
            secret: { url: input.url },
          });
          return { id };
        }),
      ),

    setCalendarEnabled: protectedProcedure
      .input(
        z.object({
          sourceId: z.string(),
          calendarKey: z.string(),
          enabled: z.boolean(),
        }),
      )
      .mutation(({ ctx, input }) =>
        run(async () => {
          const source = await ownedSource(input.sourceId, ctx.user.id);
          await setCalendarEnabled(
            mainDB,
            requireCalendarConfig(),
            source,
            input.calendarKey,
            input.enabled,
          );
          return { success: true };
        }),
      ),

    refresh: protectedProcedure
      .input(z.object({ sourceId: z.string() }))
      .use(enforceRateLimit("calendarRefresh"))
      .mutation(({ ctx, input }) =>
        run(async () => {
          const source = await ownedSource(input.sourceId, ctx.user.id);
          await syncCalendarSource(mainDB, source.id, requireCalendarConfig());
          return { success: true };
        }),
      ),

    remove: protectedProcedure
      .input(z.object({ sourceId: z.string() }))
      .mutation(({ ctx, input }) =>
        run(async () => {
          const source = await ownedSource(input.sourceId, ctx.user.id);
          await removeCalendarSource(mainDB, source);
          return { success: true };
        }),
      ),
  });
}
