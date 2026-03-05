import { Outlet } from "react-router-dom";
import { ConnectionDebugPanel } from "./shared/ConnectionDebugPanel";
import { FloatingHeader } from "./FloatingHeader";
import { Footer } from "./Footer";

export function AppShell() {
  return (
    <div className="min-h-screen bg-main text-main flex flex-col">
      <FloatingHeader />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-6 pt-16">
        <Outlet />
      </main>
      <Footer />
      <ConnectionDebugPanel />
    </div>
  );
}
