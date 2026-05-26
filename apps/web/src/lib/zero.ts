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
import { showDedupedToast } from "./toast";

export { useQuery } from "@rocicorp/zero/react";

const BLOCKED = { client: Promise.resolve(), server: Promise.resolve() };

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return String(error);
}

function handleSecurityError(error: unknown) {
  const message = normalizeErrorMessage(error).toLowerCase();

  if (message.includes("429") || message.includes("rate_limited") || message.includes("too many requests")) {
    showDedupedToast("You're doing that too fast — try again in a second.", "error");
    return;
  }

  if (
    message.includes("403") ||
    message.includes("forbidden") ||
    message.includes("unauthorized") ||
    message.includes("not allowed") ||
    message.includes("only host can")
  ) {
    showDedupedToast("You're not allowed to do that in this game.", "error");
  }
}

function withSecurityToast<T>(promise: Promise<T>): Promise<T> {
  return promise.catch((error) => {
    handleSecurityError(error);
    throw error;
  });
}

export function useZero() {
  const z = _useZero();
  return useMemo(
    () =>
      new Proxy(z, {
        get(target, prop, receiver) {
          if (prop === "mutate") {
            return (...args: unknown[]) => {
              if (!checkRateLimit()) return BLOCKED;
              const mutationResult = (target.mutate as Function)(...args);
              if (
                mutationResult &&
                typeof mutationResult === "object" &&
                "client" in mutationResult &&
                "server" in mutationResult
              ) {
                return {
                  ...mutationResult,
                  client: withSecurityToast(mutationResult.client as Promise<unknown>),
                  server: withSecurityToast(mutationResult.server as Promise<unknown>),
                };
              }
              return mutationResult;
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
    [z],
  ) as typeof z;
}
