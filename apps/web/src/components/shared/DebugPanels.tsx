import { lazy, Suspense, useEffect, useState } from "react";

/* Both panels are developer tools, so neither should cost a normal visitor
   anything. The dev game panel is gated on a literal Vite replaces with
   `false` in prod, which drops the import with it, so that chunk is never
   even built. The connection panel does ship, but stays unfetched until
   someone turns it on from the console. */

const DevGamePanel = import.meta.env.DEV
  ? lazy(() => import("./DevGamePanel").then(({ DevGamePanel }) => ({ default: DevGamePanel })))
  : null;

const ConnectionDebugPanel = lazy(() =>
  import("./ConnectionDebugPanel").then(({ ConnectionDebugPanel }) => ({ default: ConnectionDebugPanel }))
);

const STORAGE_KEY = "connection-debug";

export function DebugPanels() {
  const [connectionOpen, setConnectionOpen] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "enabled"
  );

  // Registered here rather than inside the panel, so the switch still exists
  // when the panel itself has not been loaded yet.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).connectionDebug = (action: unknown) => {
      if (action === "enable" || action === true) {
        localStorage.setItem(STORAGE_KEY, "enabled");
        setConnectionOpen(true);
        console.log("Connection debug panel enabled.");
      } else if (action === "disable" || action === false) {
        localStorage.removeItem(STORAGE_KEY);
        setConnectionOpen(false);
        console.log("Connection debug panel disabled.");
      } else {
        console.log("Usage: connectionDebug('enable') or connectionDebug('disable')");
      }
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).connectionDebug;
    };
  }, []);

  return (
    <Suspense fallback={null}>
      {connectionOpen ? <ConnectionDebugPanel /> : null}
      {DevGamePanel ? <DevGamePanel /> : null}
    </Suspense>
  );
}
