import { Outlet } from "react-router-dom";
import { ConnectionDebugPanel } from "./shared/ConnectionDebugPanel";
import { Sidebar } from "./FloatingHeader";
import { Footer } from "./Footer";
import { ToastContainer } from "./shared/ToastContainer";

export function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="shell-content">
        <main className="shell-main">
          <Outlet />
        </main>
        <Footer />
      </div>
      <ToastContainer />
      <ConnectionDebugPanel />
    </div>
  );
}
