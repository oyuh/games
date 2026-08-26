import type { Metadata } from "next";
import { ThemeBootstrapScript } from "@/components/theme-bootstrap-script";
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeBootstrapScript />
        {children}
      </body>
    </html>
  );
}
