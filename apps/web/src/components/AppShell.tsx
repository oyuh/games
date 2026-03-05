import { Navbar } from "flowbite-react";
import { Outlet } from "react-router-dom";
import { ConnectionDebugPanel } from "./shared/ConnectionDebugPanel";

export function AppShell() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 [background-image:radial-gradient(circle_at_20%_0%,rgba(31,150,255,0.2),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(14,165,233,0.15),transparent_35%)]">
      <Navbar fluid rounded className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <Navbar.Brand href="/">
          <span className="self-center whitespace-nowrap text-xl font-bold tracking-wide text-[var(--color-primary-500)]">
            Games! 🎲
          </span>
        </Navbar.Brand>
      </Navbar>
      <main className="mx-auto max-w-5xl p-4 md:p-6">
        <Outlet />
      </main>
      <ConnectionDebugPanel />
    </div>
  );
}
