import type { Metadata } from "next";
import { ThemeBootstrapScript } from "@/components/theme-bootstrap-script";
import { geistMono, geistSans } from "../fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "Games Admin - Login",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ThemeBootstrapScript />
        {children}
      </body>
    </html>
  );
}
