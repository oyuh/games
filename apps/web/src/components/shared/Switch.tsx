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
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Pair with a visible label via SwitchRow where there is one. */
  label: string;
  disabled?: boolean | undefined;
  size?: "sm" | "md";
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
