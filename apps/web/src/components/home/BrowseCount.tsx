/**
 * The number of public games waiting, as a pill after the Browse public
 * label. It sits in the button's trailing slot rather than on the globe's
 * corner, so two digits widen the pill instead of covering the icon. Zero
 * shows too, quiet, so the pill never appears from nowhere and shifts the eye.
 */
export function BrowseCount({ count }: { count: number }) {
  return (
    <span className={`hc-browse-pill${count > 0 ? " is-live" : ""}`} aria-hidden="true">
      {count > 99 ? "99+" : count}
    </span>
  );
}
