import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Context } from "../trpc";
import { googleCookie } from "./routes";
import type { DB } from "@will-be-done/hyperdb";
import type { BackendAnalytics } from "../analytics";
import { z } from "zod";
import {
  enforceRateLimit,
  protectedProcedure,
  publicProcedure,
  router,
} from "../trpc";
import {
  disconnectGoogleAccount,
  requireGoogle,
  type GoogleService,
} from "./service";

const proof = z.object({
  id: z.string().regex(/^[\w-]{43}$/),
  secret: z.string().regex(/^[\w-]{43}$/),
});
const beginInput = z.object({ desktop: z.boolean().optional() }).optional();
async function begin(
  google: GoogleService | undefined,
  ctx: Context,
  desktop?: boolean,
  link = false,
) {
  const service = requireGoogle(google);
  const initiator = randomBytes(32).toString("base64url");
  if (!desktop && !ctx.setCookie)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Start Google sign-in over HTTP.",
    });
  const flow = await service.begin(
    link ? { userId: ctx.user!.id, tokenId: ctx.tokenId! } : undefined,
    desktop ? { desktop: true } : { initiator },
    ctx.origin,
  );
  if (!desktop)
    ctx.setCookie!(
      googleCookie(new URL(flow.launchUrl).origin, flow.id, initiator, 600),
    );
  return flow;
}
const password = z.string().min(8).max(1024);
export const googleRouter = (
  db: DB,
  google?: GoogleService,
  analytics?: BackendAnalytics,
) =>
  router({
    beginSignIn: publicProcedure
      .input(beginInput)
      .use(enforceRateLimit("googleAuth"))
      .mutation(({ ctx, input }) => begin(google, ctx, input?.desktop)),
    beginLink: protectedProcedure
      .input(beginInput)
      .use(enforceRateLimit("googleAuth"))
      .mutation(({ ctx, input }) => begin(google, ctx, input?.desktop, true)),
    poll: publicProcedure
      .input(proof)
      .use(enforceRateLimit("googlePoll"))
      .mutation(({ input }) => requireGoogle(google).poll(input)),
    completeSignIn: publicProcedure
      .input(proof)
      .use(enforceRateLimit("googleAuth"))
      .mutation(({ input }) => requireGoogle(google).completeSignIn(input)),
    completeLink: protectedProcedure
      .input(proof.extend({ password }))
      .use(enforceRateLimit("googleAuth"))
      .mutation(({ input, ctx }) =>
        requireGoogle(google).completeLink(
          input,
          { userId: ctx.user.id, tokenId: ctx.tokenId! },
          input.password,
        ),
      ),
    cancel: publicProcedure
      .input(proof)
      .use(enforceRateLimit("googlePoll"))
      .mutation(({ input }) => requireGoogle(google).cancel(input)),
    disconnect: protectedProcedure
      .input(z.object({ password }))
      .use(enforceRateLimit("googleAuth"))
      .mutation(({ input, ctx }) =>
        disconnectGoogleAccount(
          db,
          { userId: ctx.user.id, tokenId: ctx.tokenId! },
          input.password,
          analytics,
        ),
      ),
  });
