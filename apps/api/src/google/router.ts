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
const password = z.string().min(8).max(1024);
export const googleRouter = (
  db: DB,
  google?: GoogleService,
  analytics?: BackendAnalytics,
) =>
  router({
    beginSignIn: publicProcedure
      .use(enforceRateLimit("googleAuth"))
      .mutation(() => requireGoogle(google).begin()),
    beginLink: protectedProcedure
      .use(enforceRateLimit("googleAuth"))
      .mutation(({ ctx }) =>
        requireGoogle(google).begin({
          userId: ctx.user.id,
          tokenId: ctx.tokenId!,
        }),
      ),
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
