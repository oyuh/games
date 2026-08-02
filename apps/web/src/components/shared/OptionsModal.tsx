import { FiMoon, FiSun, FiAlignLeft, FiAlignRight, FiAlignCenter, FiVolume2, FiVolumeX, FiNavigation, FiMonitor, FiMove, FiMoreVertical, FiMoreHorizontal, FiSettings } from "react-icons/fi";
import { CURSOR_SCALE_MAX, CURSOR_SCALE_MIN, CURSOR_SCALE_STEP, updateSettings, useSettings } from "../../lib/settings";
import type { SidebarPosition, Theme, SoundPreferences } from "../../lib/settings";
import { playPress } from "../../lib/sounds";
import { Segmented, type SoloSetupRow } from "./SoloGameMenu";
import { MultiSelect } from "./Select";
import { SwitchRow } from "./Switch";
import { ModalSection, ModalShell } from "./ModalShell";

/** Every picker here is the solo menu's segmented control, so a setting in
 *  this modal looks and moves exactly like a setting on a game menu. */
function pick(label: string, value: string, onChange: (value: string) => void, options: SoloSetupRow["options"]): SoloSetupRow {
  return { label, value, onChange, options };
}

export function OptionsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings();

  return (
    <ModalShell
      icon={<FiSettings size={18} />}
      kicker="Preferences"
      title="Options"
      onClose={onClose}
    >
      <ModalSection label="Theme">
        <Segmented
          row={pick("Theme", settings.theme, (value) => updateSettings({ theme: value as Theme }), [
            { value: "dark", label: "Dark", title: "Dark theme", icon: <FiMoon size={14} /> },
            { value: "light", label: "Light", title: "Light theme", icon: <FiSun size={14} /> },
          ])}
        />
      </ModalSection>

      <ModalSection label="Cursor" hint="The custom cursor is drawn by the site. System hands it back to your OS.">
        <Segmented
          row={pick("Cursor", settings.customCursor ? "custom" : "system", (value) => updateSettings({ customCursor: value === "custom" }), [
            { value: "custom", label: "Custom", title: "Site cursor", icon: <FiNavigation size={14} /> },
            { value: "system", label: "System", title: "System cursor", icon: <FiMonitor size={14} /> },
          ])}
          attached={settings.customCursor}
        />

        {settings.customCursor && (
          <div className="solo-drawer opt-slider">
            <span className="opt-slider-label">Scale</span>
            <input
              className="opt-slider-range"
              type="range"
              min={CURSOR_SCALE_MIN}
              max={CURSOR_SCALE_MAX}
              step={CURSOR_SCALE_STEP}
              value={settings.customCursorScale}
              aria-label="Cursor scale"
              data-cursor="slider"
              onChange={(event) => updateSettings({ customCursorScale: Number(event.currentTarget.value) })}
            />
            <span className="opt-slider-value">{Math.round(settings.customCursorScale * 100)}%</span>
          </div>
        )}
      </ModalSection>

      <ModalSection label="Sidebar" hint="Pick an edge, or turn on custom placement and drag it anywhere.">
        {!settings.sidebarCustom ? (
          <Segmented
            row={pick("Sidebar position", settings.sidebarPosition, (value) => updateSettings({ sidebarPosition: value as SidebarPosition }), [
              { value: "left", label: "Left", title: "Dock left", icon: <FiAlignLeft size={14} /> },
              { value: "right", label: "Right", title: "Dock right", icon: <FiAlignRight size={14} /> },
              { value: "top", label: "Top", title: "Dock top", icon: <FiAlignCenter size={14} /> },
            ])}
          />
        ) : (
          <Segmented
            row={pick("Sidebar orientation", settings.sidebarOrientation, (value) => updateSettings({ sidebarOrientation: value as "vertical" | "horizontal" }), [
              { value: "vertical", label: "Vertical", title: "Stack buttons vertically", icon: <FiMoreVertical size={14} /> },
              { value: "horizontal", label: "Horizontal", title: "Lay buttons out horizontally", icon: <FiMoreHorizontal size={14} /> },
            ])}
          />
        )}

        <div className="opt-switches">
          <SwitchRow
            label="Custom placement"
            checked={settings.sidebarCustom}
            onChange={(next) => updateSettings({ sidebarCustom: next })}
          />
          {settings.sidebarCustom && (
            <SwitchRow
              label="Movement tool"
              checked={settings.sidebarDragEnabled}
              onChange={(next) => updateSettings({ sidebarDragEnabled: next })}
            />
          )}
        </div>

        {settings.sidebarCustom && settings.sidebarDragEnabled && (
          <p className="mshell-section-hint opt-trailing-hint">
            <FiMove size={12} /> Grab the tab on the sidebar to move it.
          </p>
        )}
      </ModalSection>

      <ModalSection label="Sound">
        <Segmented
          row={pick("Sound effects", settings.soundEnabled ? "on" : "off", (value) => {
            const on = value === "on";
            updateSettings({ soundEnabled: on });
            // Play one so turning it on is audible straight away.
            if (on) setTimeout(() => playPress(), 50);
          }, [
            { value: "off", label: "Off", title: "Mute all sounds", icon: <FiVolumeX size={14} /> },
            { value: "on", label: "On", title: "Play sounds", icon: <FiVolume2 size={14} /> },
          ])}
          attached={settings.soundEnabled}
        />

        {settings.soundEnabled && (
          <div className="solo-drawer opt-drawer" data-no-sound>
            <span className="opt-drawer-label">Play</span>
            <MultiSelect
              id="sound-prefs"
              label="Which sounds to play"
              placeholder="Nothing"
              values={SOUND_PREFS.filter(({ key }) => settings.soundPreferences[key]).map(({ key }) => key)}
              options={SOUND_PREFS.map(({ key, label }) => ({ value: key, label }))}
              // Folding onto the current prefs keeps the result a complete
              // SoundPreferences without a cast.
              onChange={(next) => updateSettings({
                soundPreferences: SOUND_PREFS.reduce<SoundPreferences>(
                  (prefs, { key }) => ({ ...prefs, [key]: next.includes(key) }),
                  settings.soundPreferences,
                ),
              })}
            />
          </div>
        )}
      </ModalSection>
    </ModalShell>
  );
}

const SOUND_PREFS: Array<{ key: keyof SoundPreferences; label: string }> = [
  { key: "hoverSounds", label: "Hover" },
  { key: "clickSounds", label: "Clicks" },
  { key: "gameNotifications", label: "Game notifications" },
  { key: "actionFeedback", label: "Action feedback" },
  { key: "playerSounds", label: "Player sounds" },
];
