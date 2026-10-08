import type { ComponentPropsWithRef, CSSProperties } from "react";
import "../../styles/controls.css";

/**
 * The site's switch. One component, used everywhere something is on or off,
 * desktop and mobile.
 *
 * The geometry is the part that makes it read as a real control: the thumb is
 * the full height of the track and slides exactly its own width, so there is
 * no floating pill inside a taller pill. Off is a plain track with a dark
 * thumb; on tints the track with the accent and lifts the thumb to a light
 * tint of it.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = "md",
  orientation = "horizontal",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Pair with a visible label via SwitchRow where there is one. */
  label: string;
  disabled?: boolean | undefined;
  size?: "sm" | "md";
  /** Vertical stands it on end, on is up, for a switch beside two lines of text. */
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="ui-switch"
      data-size={size}
      data-orientation={orientation}
      onClick={() => onChange(!checked)}
    >
      <span className="ui-switch-thumb" />
    </button>
  );
}

/** A switch with a visible label, in a bordered row. */
export function SwitchRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean | undefined;
}) {
  return (
    <div className="ui-switch-row">
      <span className="ui-switch-row-label">{label}</span>
      <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

/**
 * The switch, stretched into a slider. Same track, ring, and squircle
 * corners; the part behind the thumb fills with the switch's "on" color, and
 * the thumb is the switch's thumb. Still a native range input underneath, so
 * keyboard, touch, and screen readers all work as they always have.
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  onChange,
  style,
  className = "",
  ...rest
}: Omit<ComponentPropsWithRef<"input">, "type" | "value" | "min" | "max" | "onChange"> & {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
}) {
  const fraction = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  return (
    <input
      type="range"
      className={`ui-slider ${className}`.trim()}
      value={value}
      min={min}
      max={max}
      style={{ ...style, "--sl-p": fraction } as CSSProperties}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      {...rest}
    />
  );
}
