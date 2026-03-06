import { FiX, FiMoon, FiSun, FiAlignLeft, FiAlignRight, FiAlignCenter } from "react-icons/fi";
import { useSettings, updateSettings } from "../../lib/settings";
import type { SidebarPosition, Theme } from "../../lib/settings";

const positionIcons: Record<SidebarPosition, React.ReactNode> = {
  left: <FiAlignLeft size={14} />,
  right: <FiAlignRight size={14} />,
  top: <FiAlignCenter size={14} />,
};

export function OptionsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Options</h2>
          <button className="modal-close" onClick={onClose}>
            <FiX size={18} />
          </button>
        </div>

        <div className="modal-body">
          {/* Theme */}
          <div className="option-group">
            <label className="option-label">Theme</label>
            <div className="option-toggle-row">
              <ThemeBtn
                active={settings.theme === "dark"}
                icon={<FiMoon size={14} />}
                label="Dark"
                onClick={() => updateSettings({ theme: "dark" })}
              />
              <ThemeBtn
                active={settings.theme === "light"}
                icon={<FiSun size={14} />}
                label="Light"
                onClick={() => updateSettings({ theme: "light" })}
              />
            </div>
          </div>

          {/* Sidebar position */}
          <div className="option-group">
            <label className="option-label">Sidebar Position</label>
            <div className="option-toggle-row">
              {(["left", "right", "top"] as SidebarPosition[]).map((pos) => (
                <button
                  key={pos}
                  className={`option-toggle-btn ${settings.sidebarPosition === pos ? "option-toggle-btn--active" : ""}`}
                  onClick={() => updateSettings({ sidebarPosition: pos })}
                >
                  {positionIcons[pos]} {pos.charAt(0).toUpperCase() + pos.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeBtn({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button className={`option-toggle-btn ${active ? "option-toggle-btn--active" : ""}`} onClick={onClick}>
      {icon} {label}
    </button>
  );
}
