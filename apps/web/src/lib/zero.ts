/**
 * Rate-limited re-exports of @rocicorp/zero/react.
 *
 * Import { useQuery, useZero } from this module instead of
 * "@rocicorp/zero/react" so every zero.mutate() call is
 * automatically guarded by the global rate limiter.
 */
import { useZero as _useZero } from "@rocicorp/zero/react";
import { useMemo } from "react";
import { checkRateLimit } from "./rate-limit";

export { useQuery } from "@rocicorp/zero/react";

const BLOCKED = { client: Promise.resolve(), server: Promise.resolve() };

export function useZero() {
  const z = _useZero();
  return useMemo(
    () =>
      new Proxy(z, {
        get(target, prop, receiver) {
          if (prop === "mutate") {
            return (...args: unknown[]) => {
              if (!checkRateLimit()) return BLOCKED;
              return (target.mutate as Function)(...args);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
    [z],
  ) as typeof z;
}
