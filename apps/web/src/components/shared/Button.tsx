import type { ComponentPropsWithRef, ReactNode } from "react";
import { Link } from "react-router-dom";
import "../../styles/button.css";

/**
 * The site's button. Kumo's shape and variant set, with more depth: every
 * filled button has a lit top edge, a shaded bottom edge, and a short drop
 * shadow, and pressing one sinks it. See /dev/shared for every variant in
 * every state.
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-secondary"
  | "text"
  | "link";
export type ButtonSize = "xs" | "sm" | "md" | "lg";
export type ButtonShape = "base" | "square" | "circle";

export interface ButtonProps extends Omit<ComponentPropsWithRef<"button">, "className"> {
  /** primary is the one you are meant to press, secondary is the everyday
   *  one, outline and ghost step down from it, danger is for what you cannot
   *  take back, and text and link are bare words. */
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** square and circle are for icon-only buttons, which need an aria-label. */
  shape?: ButtonShape | undefined;
  /** Sits before the label. */
  icon?: ReactNode | undefined;
  /** Sits after it, for a count or a chevron. */
  trailing?: ReactNode | undefined;
  /** Blocks the press and shows the loader. With an icon the loader takes
   *  its slot; without one it sits over the hidden label. Either way the
   *  button keeps its width. */
  loading?: boolean | undefined;
  /** Takes the width it is given. */
  full?: boolean | undefined;
  className?: string | undefined;
}

type ButtonLook = Pick<ButtonProps, "variant" | "size" | "shape" | "icon" | "loading" | "full" | "className">;

function buttonClasses({ variant = "secondary", size = "md", shape = "base", icon, loading, full, className }: ButtonLook) {
  return [
    "ui-btn",
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    shape !== "base" ? `ui-btn--${shape}` : "",
    full ? "ui-btn--full" : "",
    icon ? "has-icon" : "",
    loading ? "is-loading" : "",
    className,
  ].filter(Boolean).join(" ");
}

export function Button({
  variant,
  size,
  shape,
  icon,
  trailing,
  loading = false,
  full,
  disabled,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = buttonClasses({ variant, size, shape, icon, loading, full, className });

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      {...(loading ? { "aria-busy": true } : {})}
      {...rest}
    >
      {loading ? <Loader /> : icon && <span className="ui-btn-icon">{icon}</span>}
      {children != null && <span className="ui-btn-label">{children}</span>}
      {trailing && <span className="ui-btn-icon ui-btn-trailing">{trailing}</span>}
    </button>
  );
}

export interface ButtonLinkProps
  extends Omit<ComponentPropsWithRef<"a">, "className" | "href">,
    Omit<ButtonLook, "loading"> {
  /** An in-app route, through the router. */
  to?: string | undefined;
  /** Anywhere else. Opens in a new tab. */
  href?: string | undefined;
  trailing?: ReactNode | undefined;
}

/**
 * A link that looks like a Button, for anything that navigates rather than
 * acts. Same variants and sizes; no loading, since a link has nothing to wait on.
 */
export function ButtonLink({ to, href, variant, size, shape, icon, trailing, full, className, children, ...rest }: ButtonLinkProps) {
  const classes = buttonClasses({ variant, size, shape, icon, full, className });
  const body = (
    <>
      {icon && <span className="ui-btn-icon">{icon}</span>}
      {children != null && <span className="ui-btn-label">{children}</span>}
      {trailing && <span className="ui-btn-icon ui-btn-trailing">{trailing}</span>}
    </>
  );

  if (to != null) {
    return <Link to={to} className={classes} {...rest}>{body}</Link>;
  }
  return <a href={href} className={classes} target="_blank" rel="noreferrer" {...rest}>{body}</a>;
}

/**
 * Three bars that rise and fall in turn, like a level meter. Sized in em so
 * it matches whatever text it sits next to.
 */
export function Loader({ className = "" }: { className?: string }) {
  return (
    <span className={`ui-loader ${className}`.trim()} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * Buttons joined edge to edge into one control, for a toolbar or a set of
 * options. Give the chosen one aria-pressed.
 */
export function ButtonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ui-btn-group" role="group" aria-label={label}>
      {children}
    </div>
  );
}
