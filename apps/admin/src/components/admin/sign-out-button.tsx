"use client";

import { LogOut } from "lucide-react";

import { SidebarAction } from "@/components/admin/sidebar-action";

/**
 * The submit button for the sign-out form.
 *
 * It exists as its own client component so the icon never crosses the
 * server/client boundary. The dashboard layout is a server component, and
 * passing `icon={LogOut}` from there sends a component reference, which React
 * cannot serialize: "Only plain objects can be passed to Client Components".
 * The form and its server action stay in the layout; only the button, and
 * therefore only the icon import, live on the client.
 */
export function SignOutButton() {
  return (
    <SidebarAction
      type="submit"
      icon={LogOut}
      label="Sign out"
      accent="var(--danger)"
    />
  );
}
