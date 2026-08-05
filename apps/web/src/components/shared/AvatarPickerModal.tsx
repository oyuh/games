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
  paletteAt,
  setStoredAvatar,
  avatarLook,
  type AvatarLook,
} from "../../lib/avatar";
import "../../styles/avatar-picker.css";

/**
 * Pick a shape, pick a color, independently. Both apply as you go rather than
 * behind a save button, so the preview at the top is always the real thing.
 * Reset drops back to the look derived from your session id.
 */
export function AvatarPickerModal({
  sessionId,
  name,
  onClose,
}: {
  sessionId: string;
  name: string;
  onClose: () => void;
}) {
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

  return (
    <ModalShell
      icon={<FiSmile size={18} />}
      kicker="Your look"
      title="Choose an avatar"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={reset} disabled={!custom}>
            <FiRotateCcw size={14} /> Reset
          </button>
          <button className="btn btn-ghost" type="button" onClick={shuffle}>
            <FiShuffle size={14} /> Surprise me
          </button>
          <button className="btn btn-primary" type="button" onClick={onClose}>
            <FiCheck size={14} /> Done
          </button>
        </>
      }
      aside={
        <div className="ap-preview">
          <AvatarArt look={look} className="ap-preview-avatar" />
          <div className="ap-preview-copy">
            <span className="ap-preview-name">{name}</span>
            {/* Honest about where the pick lives: on this device, until the
                session row learns to carry an avatar. */}
            <span className="ap-preview-hint">
              {custom ? "Saved on this device" : "Picked for you from your session id"}
            </span>
          </div>
        </div>
      }
    >
      <ModalSection label="Color" hint="Sets the ground and the shape together.">
        <div className="ap-colors" role="radiogroup" aria-label="Avatar color">
          {Array.from({ length: AVATAR_COLOR_COUNT }, (_, color) => {
            const { bg, fg } = paletteAt(color);
            const on = color === look.color;
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Color ${color + 1}`}
                className={`ap-color${on ? " ap-color--on" : ""}`}
                style={{ background: bg, color: fg }}
                onClick={() => apply({ ...look, color })}
              >
                {on && <FiCheck size={12} />}
              </button>
            );
          })}
        </div>
      </ModalSection>

      <ModalSection label="Shape" hint="Tap one to wear it. It saves as you go.">
        <div className="ap-grid" role="radiogroup" aria-label="Avatar shape">
          {Array.from({ length: AVATAR_SHAPE_COUNT }, (_, shape) => {
            const on = shape === look.shape;
            return (
              <button
                key={shape}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`Shape ${shape + 1}`}
                className={`ap-opt${on ? " ap-opt--on" : ""}`}
                onClick={() => apply({ ...look, shape })}
              >
                {/* Drawn in the color you are already wearing, so the grid is a
                    preview of the choice rather than a catalogue of unrelated
                    combinations. */}
                <AvatarArt look={{ shape, color: look.color }} className="ap-opt-art" />
              </button>
            );
          })}
        </div>
      </ModalSection>
    </ModalShell>
  );
}
