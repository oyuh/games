import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiHome, FiMenu, FiX, FiSettings, FiInfo } from "react-icons/fi";
import { OptionsModal } from "./shared/OptionsModal";
import { InfoModal } from "./shared/InfoModal";
import { useSettings } from "../lib/settings";

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modal, setModal] = useState<"options" | "info" | null>(null);
  const location = useLocation();
  const settings = useSettings();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isTop = settings.sidebarPosition === "top";

  return (
    <>
      {/* Mobile toggle */}
      {!isTop && (
        <button
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
          className="sidebar-mobile-toggle"
        >
          {mobileOpen ? <FiX size={18} /> : <FiMenu size={18} />}
        </button>
      )}

      {/* Mobile backdrop */}
      {mobileOpen && !isTop && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}

      {/* Floating sidebar / top bar */}
      <nav className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <SidebarLink to="/" icon={<FiHome size={16} />} label="Home" active={location.pathname === "/"} />
        <SidebarButton icon={<FiInfo size={16} />} label="Info" onClick={() => { setModal("info"); setMobileOpen(false); }} />
        <SidebarButton icon={<FiSettings size={16} />} label="Options" onClick={() => { setModal("options"); setMobileOpen(false); }} />
      </nav>

      {/* Modals */}
      {modal === "options" && <OptionsModal onClose={() => setModal(null)} />}
      {modal === "info" && <InfoModal onClose={() => setModal(null)} />}
    </>
  );
}

function SidebarLink({
  to,
  icon,
  label,
  active,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
}) {
  return (
    <Link to={to} className={`sidebar-link ${active ? "sidebar-link--active" : ""}`} title={label}>
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </Link>
  );
}

function SidebarButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="sidebar-link" title={label} onClick={onClick}>
      {icon}
      <span className="sidebar-link-label">{label}</span>
    </button>
  );
}
