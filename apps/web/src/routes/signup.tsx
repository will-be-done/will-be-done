import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { authUtils } from "@/lib/auth";
import { useTRPC } from "@/lib/trpc";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  beforeLoad: () => {
    if (authUtils.isAuthenticated()) {
      throw redirect({ to: "/vault" });
    }
  },
});

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

        void navigate({ to: "/vault" });
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
    <div className="flex min-h-screen items-center justify-center bg-surface">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-panel p-8 shadow-lg">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-primary">
            Create account
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-content"
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
                className="mt-1 block w-full rounded-md bg-surface px-3 py-2 text-content placeholder-content-tinted-2 shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-content"
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
                className="mt-1 block w-full rounded-md bg-surface px-3 py-2 text-content placeholder-content-tinted-2 shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Create a password (min. 8 characters)"
              />
            </div>

            <div>
              <label
                htmlFor="confirm-password"
                className="block text-sm font-medium text-content"
              >
                Confirm Password
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
                className="mt-1 block w-full rounded-md bg-surface px-3 py-2 text-content placeholder-content-tinted-2 shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          {(error || registerMutation.error) && (
            <div className="rounded-md bg-notice/10 px-4 py-3 text-sm text-notice">
              {error ||
                (registerMutation.error instanceof Error
                  ? registerMutation.error.message
                  : "An error occurred")}
            </div>
          )}

          <Button
            type="submit"
            disabled={registerMutation.isPending}
            className="w-full cursor-pointer"
          >
            {registerMutation.isPending ? "Creating account..." : "Sign up"}
          </Button>

          <div className="text-center text-sm">
            <span className="text-content-tinted">
              Already have an account?{" "}
            </span>
            <Link
              to="/login"
              className="font-medium text-accent hover:underline"
            >
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
