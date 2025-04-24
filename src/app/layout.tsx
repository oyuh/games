import "~/styles/globals.css";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { TRPCReactProvider } from "~/trpc/react";
import { ClientRoot } from "./client-root";
import { SessionProfileEditor } from "./_components/session-profile-editor";

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
        <SessionProfileEditor />
        <ClientRoot>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </ClientRoot>
      </body>
    </html>
  );
}
