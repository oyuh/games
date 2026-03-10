import type { Metadata } from "next";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/components/Toast";
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
          <nav className="admin-nav">
            <div className="admin-nav__left">
              <a href="/" className="admin-nav__brand">🎮 Games Admin</a>
              <div className="admin-nav__links">
                <a href="/" className="admin-nav__link">Dashboard</a>
                <a href="/clients" className="admin-nav__link">Clients</a>
                <a href="/games" className="admin-nav__link">Games</a>
                <a href="/bans" className="admin-nav__link">Bans</a>
                <a href="/broadcast" className="admin-nav__link">Broadcast</a>
              </div>
            </div>
            <div className="admin-nav__right">
              <span className="admin-nav__user">{session.user.name ?? session.user.email}</span>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button type="submit" className="admin-nav__signout">Sign Out</button>
              </form>
            </div>
          </nav>
          <main className="admin-main">
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
