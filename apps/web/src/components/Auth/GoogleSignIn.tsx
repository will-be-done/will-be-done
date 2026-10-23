import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { isDemoMode } from "@/lib/auth";
import { useGoogleFlow } from "@/hooks/useGoogleFlow";
import type { GoogleAuthSource } from "@/lib/analytics";

export function GoogleMark() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.85 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  );
}

export function GoogleSignIn({
  source,
}: {
  source: Extract<GoogleAuthSource, "login" | "signup">;
}) {
  const trpc = useTRPC();
  const config = useQuery(
    trpc.getAuthConfig.queryOptions(undefined, { enabled: !isDemoMode() }),
  );
  const google = useGoogleFlow("signin", source);
  if (isDemoMode() || !config.data?.googleEnabled) return null;
  return (
    <div className="mb-6 space-y-3">
      <button
        type="button"
        disabled={google.busy}
        onClick={() => void google.start()}
        className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-[#747775] bg-[#131314] px-4 py-3 text-sm font-medium text-[#e3e3e3] hover:bg-[#252628] disabled:opacity-60"
      >
        <GoogleMark />
        Continue with Google
      </button>
      {google.busy && (
        <div className="text-center text-sm text-slate-300">
          <p role="status">Finish signing in with Google in your browser.</p>
          <button
            type="button"
            className="mt-2 cursor-pointer underline"
            onClick={google.cancel}
          >
            Cancel Google sign-in
          </button>
        </div>
      )}
      {google.error && (
        <p role="alert" className="text-sm text-red-300">
          {google.error}
        </p>
      )}
      <p className="text-center text-xs text-slate-400">
        or continue with email
      </p>
    </div>
  );
}
