import type { Metadata } from "next";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/Toast";
import { AdminShell } from "@/components/admin/admin-shell";
import { BroadcastControlsDialog } from "@/components/admin/broadcast-controls-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { ThemeBootstrapScript } from "@/components/theme-bootstrap-script";
import { geistMono, geistSans } from "../fonts";
import "../globals.css";
import { LogOut } from "lucide-react";

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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeBootstrapScript />
        <ToastProvider>
          <ConfirmDialogProvider>
            <AdminShell
              sessionLabel={session.user.name ?? session.user.email ?? "Admin"}
              actions={
                <>
                  <BroadcastControlsDialog />
                  <form
                    action={async () => {
                      "use server";
                      await signOut();
                    }}
                  >
                    <Button
                      type="submit"
                      variant="outline"
                      className="min-w-[112px] justify-center"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </Button>
                  </form>
                </>
              }
            >
              {children}
            </AdminShell>
          </ConfirmDialogProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
