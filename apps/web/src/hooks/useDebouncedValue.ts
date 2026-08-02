import { useEffect, useState } from "react";

/**
 * The value, but it stops moving for `delay` ms before it updates. Used to keep
 * a search box from firing a request per keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
