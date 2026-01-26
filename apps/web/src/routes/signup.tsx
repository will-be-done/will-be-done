import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { authUtils } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  beforeLoad: () => {
    if (authUtils.isAuthenticated()) {
      throw redirect({ to: "/spaces" });
    }
  },
});

const logoPath =
  "M40.4835 111.929C39.5895 111.929 38.7321 111.575 38.0999 110.945C37.4678 110.316 37.1126 109.462 37.1126 108.571V41.4286C37.1126 40.5382 37.4678 39.6843 38.0999 39.0547C38.7321 38.4251 39.5895 38.0714 40.4835 38.0714H102.845C104.186 38.0714 105.472 37.5409 106.42 36.5965C107.368 35.6521 107.901 34.3713 107.901 33.0357C107.901 31.7002 107.368 30.4193 106.42 29.4749C105.472 28.5305 104.186 28 102.845 28H40.4835C36.9074 28 33.4779 29.4148 30.9492 31.9331C28.4206 34.4515 27 37.8671 27 41.4286V108.571C27 112.133 28.4206 115.549 30.9492 118.067C33.4779 120.585 36.9074 122 40.4835 122H107.901C111.477 122 114.907 120.585 117.435 118.067C119.964 115.549 121.384 112.133 121.384 108.571V86.75C121.384 85.4144 120.852 84.1336 119.903 83.1892C118.955 82.2448 117.669 81.7143 116.328 81.7143C114.987 81.7143 113.701 82.2448 112.753 83.1892C111.804 84.1336 111.272 85.4144 111.272 86.75V108.571C111.272 109.462 110.917 110.316 110.284 110.945C109.652 111.575 108.795 111.929 107.901 111.929H40.4835ZM126.643 52.7086C127.536 51.754 128.022 50.4914 127.999 49.1868C127.976 47.8822 127.445 46.6375 126.519 45.7148C125.593 44.7922 124.343 44.2637 123.033 44.2407C121.723 44.2177 120.455 44.7019 119.497 45.5914L82.0261 82.9027L69.3988 69.9039C68.9381 69.4244 68.3868 69.0404 67.7766 68.7739C67.1664 68.5074 66.5093 68.3636 65.843 68.3508C65.1768 68.3381 64.5147 68.4566 63.8946 68.6995C63.2746 68.9425 62.7088 69.3051 62.23 69.7666C61.7511 70.228 61.3685 70.7791 61.1042 71.3883C60.84 71.9975 60.6992 72.6527 60.69 73.3163C60.6808 73.9798 60.8034 74.6386 61.0508 75.2548C61.2981 75.871 61.6653 76.4325 62.1312 76.9069L78.3316 93.5851C78.7978 94.0666 79.3555 94.4508 79.9724 94.7152C80.5892 94.9797 81.2528 95.1191 81.9243 95.1254C82.5959 95.1316 83.2619 95.0046 83.8836 94.7517C84.5053 94.4987 85.0702 94.125 85.5453 93.6523L126.643 52.7086Z";

function Logo({ size = 32 }: { size?: number }) {
  const id = `logo_signup_${size}`;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-[13%] bg-blue-500/30 blur-md"
        style={{ transform: "scale(1.15)" }}
      />
      <svg
        width={size}
        height={size}
        viewBox="0 0 150 150"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative"
      >
        <rect width="150" height="150" rx="19" fill={`url(#paint0_${id})`} />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={logoPath}
          fill={`url(#paint1_${id})`}
        />
        <defs>
          <linearGradient
            id={`paint0_${id}`}
            x1="9"
            y1="5.5"
            x2="150"
            y2="150"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#3b82f6" />
            <stop offset="1" stopColor="#1e40af" />
          </linearGradient>
          <linearGradient
            id={`paint1_${id}`}
            x1="27"
            y1="28"
            x2="118.5"
            y2="120.5"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#93c5fd" />
            <stop offset="1" stopColor="#60a5fa" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function SignupPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const registerMutation = useMutation(
    trpc.register.mutationOptions({
      onSuccess: (result) => {
        authUtils.setToken(result.token);
        authUtils.setUserId(result.userId);

        void navigate({ to: "/spaces" });
      },
    }),
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    registerMutation.mutate({ email, password });
  };

  return (
    <div className="relative min-h-screen bg-[#0a0a0f] text-slate-100 antialiased">
      {/* Gradient orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-[400px] left-1/2 h-[800px] w-[800px] -translate-x-1/2 rounded-full bg-blue-600/8 blur-[120px]" />
        <div className="absolute -bottom-[200px] -right-[200px] h-[600px] w-[600px] rounded-full bg-indigo-500/6 blur-[100px]" />
      </div>

      {/* Noise texture overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Logo and title */}
          <div className="mb-8 flex flex-col items-center">
            <Logo size={48} />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
              Create your account
            </h1>
            <p className="mt-2 text-[14px] text-slate-400">
              Start organizing your week with Will Be Done
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-lg bg-white/[0.03] p-8 ring-1 ring-white/[0.06] backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-[13px] font-medium text-slate-300"
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md bg-white/[0.05] px-4 py-3 text-[14px] text-white placeholder-slate-500 ring-1 ring-white/[0.08] transition-all focus:bg-white/[0.07] focus:outline-none focus:ring-blue-500/50"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-[13px] font-medium text-slate-300"
                >
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md bg-white/[0.05] px-4 py-3 text-[14px] text-white placeholder-slate-500 ring-1 ring-white/[0.08] transition-all focus:bg-white/[0.07] focus:outline-none focus:ring-blue-500/50"
                  placeholder="Min. 8 characters"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-2 block text-[13px] font-medium text-slate-300"
                >
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full rounded-md bg-white/[0.05] px-4 py-3 text-[14px] text-white placeholder-slate-500 ring-1 ring-white/[0.08] transition-all focus:bg-white/[0.07] focus:outline-none focus:ring-blue-500/50"
                  placeholder="Confirm your password"
                />
              </div>

              {(error || registerMutation.error) && (
                <div className="rounded-md bg-red-500/10 px-4 py-3 text-[13px] text-red-400 ring-1 ring-red-500/20">
                  {error ||
                    (registerMutation.error instanceof Error
                      ? registerMutation.error.message
                      : "An error occurred")}
                </div>
              )}

              <button
                type="submit"
                disabled={registerMutation.isPending}
                className="group mt-2 w-full cursor-pointer rounded-lg bg-blue-500 px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-400 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {registerMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Creating account...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Create account
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </span>
                )}
              </button>
            </form>
          </div>

          {/* Sign in link */}
          <p className="mt-6 text-center text-[14px] text-slate-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-blue-400 transition-colors hover:text-blue-300"
            >
              Sign in
            </Link>
          </p>

          {/* Back to home */}
          <div className="mt-8 flex justify-center">
            <Link
              to="/"
              className="flex items-center gap-2 text-[13px] text-slate-500 transition-colors hover:text-slate-300"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
                />
              </svg>
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
