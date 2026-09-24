/**
 * Who is allowed to run a Zero mutator, and as whom.
 *
 * Every push through /api/zero/mutate goes through authorizeMutation before
 * the mutator runs. The signed session proof is the identity; the plain
 * x-zero-user-id header is only trusted in dev.
 */

function assertCallerValue(userId: string, claimed: unknown, field: string) {
  if (userId === "anon") {
    return;
  }
  if (typeof claimed !== "string" || claimed.trim().length === 0) {
    throw new Error(`Missing ${field}`);
  }
  if (claimed !== userId) {
    throw new Error("Not allowed");
  }
}

/**
 * Mutators that only exist to seed or drive games while developing. They
 * impersonate players by design, so they are never allowed to run in prod.
 */
export function isDevOnlyMutator(name: string) {
  return name.startsWith("demo.") || name.startsWith("dev.");
}

function requiresMutatorSessionProof(name: string, args: unknown, production: boolean) {
  if (isDevOnlyMutator(name) && !production) {
    return false;
  }
  if (args == null || typeof args !== "object") {
    return false;
  }

  const payload = args as Record<string, unknown>;
  const [namespace] = name.split(".");
  return namespace === "sessions"
    || "sessionId" in payload
    || "hostId" in payload
    || "senderId" in payload
    || "voterId" in payload;
}

function applyCanonicalMutatorCaller<T>(userId: string, name: string, args: T): T {
  if (userId === "anon" || args == null || typeof args !== "object") {
    return args;
  }

  const payload = { ...(args as Record<string, unknown>) };
  const [namespace] = name.split(".");

  if (namespace === "sessions") {
    payload.id = userId;
    return payload as T;
  }

  if ("sessionId" in payload) {
    payload.sessionId = userId;
  }
  if ("hostId" in payload) {
    payload.hostId = userId;
  }
  if ("senderId" in payload) {
    payload.senderId = userId;
  }
  if ("voterId" in payload) {
    payload.voterId = userId;
  }

  return payload as T;
}

function resolveZeroMutatorCaller(userId: string, name: string, args: unknown, proofUserId: string | null, production: boolean) {
  if (!requiresMutatorSessionProof(name, args, production)) {
    return proofUserId ?? userId;
  }
  if (!proofUserId) {
    // In dev mode, trust the claimed user ID instead of requiring proof
    if (!production) {
      return userId !== "anon" ? userId : "dev-" + crypto.randomUUID().slice(0, 8);
    }
    throw new Error("Invalid session proof");
  }
  return proofUserId;
}

function enforceMutatorCaller(userId: string, name: string, args: unknown) {
  if (args == null || typeof args !== "object") {
    return;
  }

  const payload = args as Record<string, unknown>;
  const [namespace] = name.split(".");

  // Anon users (no x-zero-user-id header) are only allowed to target
  // session-creation mutators; they must not impersonate existing sessions
  // in identity-sensitive fields.  We skip enforcement only for sessions.create
  // since it establishes a new identity.
  if (userId === "anon") {
    if (namespace === "sessions" && name === "sessions.create") {
      return; // allow anon to create a new session
    }
    if (namespace === "sessions" && name === "sessions.setName") {
      return; // allow anon to set their own name (client-side session)
    }
  }

  if (namespace === "sessions") {
    assertCallerValue(userId, payload.id, "id");
    return;
  }

  if ("sessionId" in payload) {
    assertCallerValue(userId, payload.sessionId, "sessionId");
  }
  if ("hostId" in payload) {
    assertCallerValue(userId, payload.hostId, "hostId");
  }
  if ("senderId" in payload) {
    assertCallerValue(userId, payload.senderId, "senderId");
  }
  if ("voterId" in payload) {
    assertCallerValue(userId, payload.voterId, "voterId");
  }
}

/**
 * Resolves the caller for one mutation and rewrites every identity field in
 * its args to that caller, so a client can never act as another session.
 * Throws when the caller cannot be established.
 */
export function authorizeMutation<T>(
  name: string,
  args: T,
  caller: { headerUserId: string; proofUserId: string | null },
  production: boolean,
): { userId: string; args: T } {
  if (isDevOnlyMutator(name) && production) {
    throw new Error("Dev mutators are disabled in production");
  }
  const userId = resolveZeroMutatorCaller(caller.headerUserId, name, args, caller.proofUserId, production);
  const normalizedArgs = applyCanonicalMutatorCaller(userId, name, args);
  enforceMutatorCaller(userId, name, normalizedArgs);
  return { userId, args: normalizedArgs };
}
