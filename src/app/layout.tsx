import "~/styles/globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClientRoot } from "./client-root";
import { SessionProfileEditor } from "./_components/session-profile-editor";
import { Footer } from "~/components/Footer";
import { JoinGameModal } from "./_components/join-game-modal";
import { Analytics } from "@vercel/analytics/react"
import { SettingsModal } from "./_components/settings-modal";

export const metadata: Metadata = {
  title: "Games!",
  description: "a game app lol",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`}>
      <body>
        <ClientRoot>
            {children}
        </ClientRoot>
        <Footer />

        {/* Fixed floating button container on right side */}
        <div className="fixed right-8 top-1/2 transform -translate-y-1/2 flex flex-col gap-6 z-50">
          <SessionProfileEditor />
          <JoinGameModal />
          <SettingsModal />
          <Analytics/>
        </div>
      </body>
    </html>
  );
}
