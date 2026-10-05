import { FiGlobe } from "react-icons/fi";

/**
 * The globe on a Browse public button, with the number of public games
 * waiting on its corner. Zero shows too, quiet, so the badge never appears
 * from nowhere and shifts the eye.
 */
export function BrowseIcon({ count }: { count: number }) {
  return (
    <span className="hc-browse-icon">
      <FiGlobe />
      <span className={`hc-browse-badge${count > 0 ? " is-live" : ""}`} aria-hidden="true">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}
