import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Context } from "../trpc";
import { authFlowCookie } from "../auth/routes";
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
  disconnectOidcAccount,
  requireOidc,
  type OidcService,
} from "./service";

const proof = z.object({
  id: z.string().regex(/^[\w-]{43}$/),
  secret: z.string().regex(/^[\w-]{43}$/),
  completion: z
    .string()
    .regex(/^[\w-]{43}$/)
    .optional(),
});
const beginInput = z.object({ desktop: z.boolean().optional() }).optional();
async function begin(
  oidc: OidcService | undefined,
  ctx: Context,
  desktop?: boolean,
  link = false,
) {
  const service = requireOidc(oidc);
  const initiator = randomBytes(32).toString("base64url");
  if (!desktop && !ctx.setCookie)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Start SSO sign-in over HTTP.",
    });
  const flow = await service.begin(
    link ? { userId: ctx.user!.id, tokenId: ctx.tokenId! } : undefined,
    desktop ? { desktop: true } : { initiator },
    ctx.origin,
  );
  if (!desktop)
    ctx.setCookie!(
      authFlowCookie(
        "oidc",
        new URL(flow.launchUrl).origin,
        flow.id,
        initiator,
        600,
      ),
    );
  return flow;
}
const password = z.string().min(8).max(1024);
export const oidcRouter = (
  db: DB,
  oidc?: OidcService,
  analytics?: BackendAnalytics,
) =>
  router({
    beginSignIn: publicProcedure
      .input(beginInput)
      .use(enforceRateLimit("oidcAuth"))
      .mutation(({ ctx, input }) => begin(oidc, ctx, input?.desktop)),
    beginLink: protectedProcedure
      .input(beginInput)
      .use(enforceRateLimit("oidcAuth"))
      .mutation(({ ctx, input }) => begin(oidc, ctx, input?.desktop, true)),
    poll: publicProcedure
      .input(proof)
      .use(enforceRateLimit("oidcPoll"))
      .mutation(({ input }) => requireOidc(oidc).poll(input)),
    completeSignIn: publicProcedure
      .input(proof)
      .use(enforceRateLimit("oidcAuth"))
      .mutation(({ input }) => requireOidc(oidc).completeSignIn(input)),
    completeLink: protectedProcedure
      .input(proof.extend({ password }))
      .use(enforceRateLimit("oidcAuth"))
      .mutation(({ input, ctx }) =>
        requireOidc(oidc).completeLink(
          input,
          { userId: ctx.user.id, tokenId: ctx.tokenId! },
          input.password,
        ),
      ),
    cancel: publicProcedure
      .input(proof)
      .use(enforceRateLimit("oidcPoll"))
      .mutation(({ input }) => requireOidc(oidc).cancel(input)),
    disconnect: protectedProcedure
      .input(z.object({ password }))
      .use(enforceRateLimit("oidcAuth"))
      .mutation(({ input, ctx }) => {
        const session = { userId: ctx.user.id, tokenId: ctx.tokenId! };
        return oidc
          ? oidc.disconnect(session, input.password)
          : disconnectOidcAccount(db, session, input.password, analytics);
      }),
  });
