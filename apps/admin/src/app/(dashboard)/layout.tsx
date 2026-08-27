import type { Metadata } from "next";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/Toast";
import { AdminShell } from "@/components/admin/admin-shell";
import { BroadcastControlsDialog } from "@/components/admin/broadcast-controls-dialog";
import { SignOutButton } from "@/components/admin/sign-out-button";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeBootstrapScript } from "@/components/theme-bootstrap-script";
import "../globals.css";

export const metadata: Metadata = {
  title: "Games Admin",
  description: "Admin panel for games.lawsonhart.me",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeBootstrapScript />
        <ToastProvider>
          <ConfirmDialogProvider>
            <TooltipProvider>
              <AdminShell
                sessionLabel={
                  session.user.name ?? session.user.email ?? "Admin"
                }
                actions={
                  <>
                    <BroadcastControlsDialog />
                    <form
                      action={async () => {
                        "use server";
                        await signOut();
                      }}
                    >
                      <SignOutButton />
                    </form>
                  </>
                }
              >
                {children}
              </AdminShell>
            </TooltipProvider>
          </ConfirmDialogProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
