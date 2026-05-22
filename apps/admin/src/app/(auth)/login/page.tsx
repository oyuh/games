import { signIn } from "@/auth";
import { ThemeToggle } from "@/components/theme-toggle";

const isDev = process.env.NODE_ENV !== "production";
const hasDevSecret = !!process.env.ADMIN_DEV_SECRET;

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-[380px] rounded-lg border border-border bg-card p-10 text-center shadow-none">
        <h1 className="mb-2 text-2xl font-semibold text-foreground">
          Games Admin
        </h1>
        <p className="mb-8 text-[0.8125rem] text-muted-foreground">
          Sign in with your authorized GitHub account to continue.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Sign in with GitHub
          </button>
        </form>
        {isDev && hasDevSecret && (
          <>
            <div className="mt-6 mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">DEV</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("dev-login", {
                  secret: process.env.ADMIN_DEV_SECRET!,
                  redirectTo: "/",
                });
              }}
            >
              <button
                type="submit"
                className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-muted px-6 py-2.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                Dev Login (Local Only)
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
