import { useState } from "react";
import { FiX, FiMoon, FiSun, FiAlignLeft, FiAlignRight, FiAlignCenter, FiVolume2, FiVolumeX, FiChevronDown } from "react-icons/fi";
import { useSettings, updateSettings } from "../../lib/settings";
import type { SidebarPosition, Theme, SoundPreferences } from "../../lib/settings";
import { playPress } from "../../lib/sounds";

const positionIcons: Record<SidebarPosition, React.ReactNode> = {
  left: <FiAlignLeft size={14} />,
  right: <FiAlignRight size={14} />,
  top: <FiAlignCenter size={14} />,
};

export function OptionsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const [soundCustomizeOpen, setSoundCustomizeOpen] = useState(false);

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

          {/* Sound */}
          <div className="option-group">
            <label className="option-label">Sound Effects</label>
            <div className="option-toggle-row">
              <button
                className={`option-toggle-btn ${!settings.soundEnabled ? "option-toggle-btn--active" : ""}`}
                onClick={() => updateSettings({ soundEnabled: false })}
              >
                <FiVolumeX size={14} /> Off
              </button>
              <button
                className={`option-toggle-btn ${settings.soundEnabled ? "option-toggle-btn--active" : ""}`}
                onClick={() => {
                  updateSettings({ soundEnabled: true });
                  // Play a sound so the user hears it's on
                  setTimeout(() => playPress(), 50);
                }}
              >
                <FiVolume2 size={14} /> On
              </button>
            </div>

            {settings.soundEnabled && (
              <div className="sound-customize" data-no-sound>
                <button
                  className="sound-customize-toggle"
                  onClick={() => setSoundCustomizeOpen((v) => !v)}
                >
                  Customize Sounds <FiChevronDown size={14} className={`sound-customize-chevron ${soundCustomizeOpen ? "sound-customize-chevron--open" : ""}`} />
                </button>

                {soundCustomizeOpen && (
                  <div className="sound-customize-list">
                    <SoundPrefToggle label="Hover Sounds" prefKey="hoverSounds" prefs={settings.soundPreferences} />
                    <SoundPrefToggle label="Click Sounds" prefKey="clickSounds" prefs={settings.soundPreferences} />
                    <SoundPrefToggle label="Game Notifications" prefKey="gameNotifications" prefs={settings.soundPreferences} />
                    <SoundPrefToggle label="Action Feedback" prefKey="actionFeedback" prefs={settings.soundPreferences} />
                    <SoundPrefToggle label="Player Sounds" prefKey="playerSounds" prefs={settings.soundPreferences} />
                  </div>
                )}
              </div>
            )}
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

function SoundPrefToggle({ label, prefKey, prefs }: { label: string; prefKey: keyof SoundPreferences; prefs: SoundPreferences }) {
  const enabled = prefs[prefKey];
  return (
    <div className="sound-pref-item">
      <span className="sound-pref-label">{label}</span>
      <button
        className={`sound-pref-switch ${enabled ? "sound-pref-switch--on" : ""}`}
        role="switch"
        aria-checked={enabled}
        onClick={() => updateSettings({ soundPreferences: { ...prefs, [prefKey]: !enabled } })}
      >
        <span className="sound-pref-switch-knob" />
      </button>
    </div>
  );
}
