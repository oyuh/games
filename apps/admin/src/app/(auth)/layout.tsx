import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Games Admin - Login",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
