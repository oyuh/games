import { useState } from "react";
import { FiCheck, FiRotateCcw, FiShuffle, FiSmile } from "react-icons/fi";
import { ModalShell, ModalSection } from "./ModalShell";
import { AvatarArt } from "./PlayerAvatar";
import {
  AVATAR_COLOR_COUNT,
  AVATAR_SHAPE_COUNT,
  derivedLook,
  formatAvatar,
  getStoredAvatar,
  setStoredAvatar,
  avatarLook,
  type AvatarLook,
} from "../../lib/avatar";
import "../../styles/avatar-picker.css";

/**
 * Pick a shape, pick a color, independently. Both apply as you go rather than
 * behind a save button, so the preview at the top is always the real thing.
 * Reset drops back to the look derived from your session id. Shared by the
 * desktop modal and the mobile drawer (mobile/components/AvatarPickerSheet).
 */
export function useAvatarPicker(sessionId: string) {
  const stored = getStoredAvatar();
  const [look, setLook] = useState<AvatarLook>(() => avatarLook(sessionId, stored));
  const [custom, setCustom] = useState(Boolean(stored));

  const apply = (next: AvatarLook) => {
    setLook(next);
    setCustom(true);
    setStoredAvatar(formatAvatar(next));
  };

  const reset = () => {
    setLook(derivedLook(sessionId));
    setCustom(false);
    setStoredAvatar("");
  };

  const shuffle = () => {
    apply({
      shape: Math.floor(Math.random() * AVATAR_SHAPE_COUNT),
      color: Math.floor(Math.random() * AVATAR_COLOR_COUNT),
    });
  };

  return { look, custom, apply, reset, shuffle };
}

type AvatarPicker = ReturnType<typeof useAvatarPicker>;

export function AvatarPreview({ picker, name }: { picker: AvatarPicker; name: string }) {
  return (
    <div className="ap-preview">
      <AvatarArt look={picker.look} className="ap-preview-avatar" />
      <div className="ap-preview-copy">
        <span className="ap-preview-name">{name}</span>
        {/* Honest about where the pick lives: on this device, until the
            session row learns to carry an avatar. */}
        <span className="ap-preview-hint">
          {picker.custom ? "Saved on this device" : "Picked for you from your session id"}
        </span>
      </div>
    </div>
  );
}

/* Every option is drawn as the avatar you'd end up with: colors wear your
   current shape, shapes wear your current color. So both lists are a preview
   of the choice rather than a catalogue of unrelated combinations. */
export function AvatarChoices({ picker }: { picker: AvatarPicker }) {
  const { look, apply } = picker;
  return (
    <>
      <ModalSection label="Color">
        <div className="ap-swatches ap-colors" role="radiogroup" aria-label="Avatar color">
          {Array.from({ length: AVATAR_COLOR_COUNT }, (_, color) => (
            <Swatch
              key={color}
              label={`Color ${color + 1}`}
              look={{ ...look, color }}
              on={color === look.color}
              onPick={apply}
            />
          ))}
        </div>
      </ModalSection>

      <ModalSection label="Shape">
        <div className="ap-swatches" role="radiogroup" aria-label="Avatar shape">
          {Array.from({ length: AVATAR_SHAPE_COUNT }, (_, shape) => (
            <Swatch
              key={shape}
              label={`Shape ${shape + 1}`}
              look={{ ...look, shape }}
              on={shape === look.shape}
              onPick={apply}
            />
          ))}
        </div>
      </ModalSection>
    </>
  );
}

function Swatch({ label, look, on, onPick }: { label: string; look: AvatarLook; on: boolean; onPick: (look: AvatarLook) => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      className={`ap-swatch${on ? " ap-swatch--on" : ""}`}
      onClick={() => onPick(look)}
    >
      <AvatarArt look={look} className="ap-swatch-art" />
    </button>
  );
}

export function AvatarPickerModal({
  sessionId,
  name,
  onClose,
}: {
  sessionId: string;
  name: string;
  onClose: () => void;
}) {
  const picker = useAvatarPicker(sessionId);

  return (
    <ModalShell
      icon={<FiSmile size={18} />}
      title="Choose an avatar"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={picker.reset} disabled={!picker.custom}>
            <FiRotateCcw size={14} /> Reset
          </button>
          <button className="btn btn-ghost" type="button" onClick={picker.shuffle}>
            <FiShuffle size={14} /> Surprise me
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            <FiCheck size={14} /> Done
          </button>
        </>
      }
      aside={<AvatarPreview picker={picker} name={name} />}
    >
      <AvatarChoices picker={picker} />
    </ModalShell>
  );
}
