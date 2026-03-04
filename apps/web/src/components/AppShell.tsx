import { Navbar } from "flowbite-react";
import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar fluid rounded className="border-b">
        <Navbar.Brand href="/">
          <span className="self-center whitespace-nowrap text-xl font-semibold text-[var(--color-primary-500)]">
            Games! 🎲
          </span>
        </Navbar.Brand>
      </Navbar>
      <main className="mx-auto max-w-5xl p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
