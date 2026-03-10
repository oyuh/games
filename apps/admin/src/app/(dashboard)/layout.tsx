import type { Metadata } from "next";
import { auth } from "@/auth";
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
    <html lang="en" className="dark">
      <body>
        <ToastProvider>
          <div className="min-h-screen bg-[#0a0a0a] text-gray-100">
            <nav className="border-b border-gray-800 bg-[#111] px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h1 className="text-lg font-semibold text-white">🎮 Games Admin</h1>
                <a href="/" className="text-sm text-gray-400 hover:text-gray-200">Dashboard</a>
                <a href="/clients" className="text-sm text-gray-400 hover:text-gray-200">Clients</a>
                <a href="/games" className="text-sm text-gray-400 hover:text-gray-200">Games</a>
                <a href="/bans" className="text-sm text-gray-400 hover:text-gray-200">Bans</a>
                <a href="/broadcast" className="text-sm text-gray-400 hover:text-gray-200">Broadcast</a>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400">{session.user.name ?? session.user.email}</span>
                <form action="/api/auth/signout" method="POST">
                  <button type="submit" className="text-sm text-red-400 hover:text-red-300">
                    Sign Out
                  </button>
                </form>
              </div>
            </nav>
            <main className="max-w-7xl mx-auto px-6 py-8">
              {children}
            </main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
