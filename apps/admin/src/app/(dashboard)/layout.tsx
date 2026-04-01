import type { Metadata } from "next";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/Toast";
import { AdminShell } from "@/components/admin/admin-shell";
import { BroadcastControlsDialog } from "@/components/admin/broadcast-controls-dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
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
    <html lang="en">
      <body>
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
                      className="min-w-[112px] justify-center border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
                    >
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
