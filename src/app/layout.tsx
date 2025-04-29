import "~/styles/globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ClientRoot } from "./client-root";
import { Footer } from "~/components/Footer";
import { JoinGameModal } from "./_components/join-game-modal";
import { Analytics } from "@vercel/analytics/react";
import { SettingsModal } from "./_components/settings-modal";
import { MobileMenuButton } from "./_components/mobile-menu-button";
import { FloatingHeader } from "../components/FloatingHeader";
import { SessionProfileEditor } from "./_components/session-profile-editor";
import { MobileFooter } from "~/components/MobileFooter";

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
          <div className="hidden sm:block">
            <FloatingHeader />
          </div>
          {children}
        </ClientRoot>
        <div className="hidden sm:block">
          <Footer />
        </div>
        <MobileFooter />

        {/* Modals for mobile menu actions */}
        <SessionProfileEditor />
        <JoinGameModal />
        <SettingsModal />
        <div className="fixed right-4 bottom-20 sm:hidden z-50">
          <MobileMenuButton />
        </div>
        <Analytics/>
      </body>
    </html>
  );
}
