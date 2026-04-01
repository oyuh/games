"use client";

import { useEffect, useState } from "react";
import {
  Ban,
  Fingerprint,
  Globe2,
  MessageSquareMore,
  Orbit,
  Shield,
  UserRoundX,
} from "lucide-react";
import { api } from "@/lib/client-api";
import {
  ClientDetailResponse,
  ClientRecord,
  formatDateTime,
  formatGameType,
  formatRelativeTime,
  GameType,
  shortId,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete that action.";
}

function Surface({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[24px] border border-white/8 bg-[#111b2a] p-5">{children}</div>;
}

export function ClientDetailDialog({
  client,
  open,
  onOpenChange,
  onViewGame,
  onChanged,
}: {
  client: ClientRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewGame?: (target: { id: string; type: GameType }) => void;
  onChanged?: () => void;
}) {
  const { show } = useToast();
  const [detail, setDetail] = useState<ClientDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameReason, setNameReason] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [toastLevel, setToastLevel] = useState<"info" | "success" | "error">("info");
  const [restrictionType, setRestrictionType] = useState<"session" | "ip" | "region">("session");
  const [restrictionReason, setRestrictionReason] = useState("");

  useEffect(() => {
    setNameInput(client?.name ?? "");
    setNameReason("");
    setToastMessage("");
    setToastLevel("info");
    setRestrictionType("session");
    setRestrictionReason("");
  }, [client?.sessionId]);

  useEffect(() => {
    if (!open || !client?.sessionId) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    const loadDetail = async () => {
      setLoading(true);
      try {
        const response = await api(`/clients/${client.sessionId}`);
        if (!cancelled) {
          const parsed = response as ClientDetailResponse;
          setDetail(parsed);
          if (parsed.nameOverride) {
            setNameInput(parsed.nameOverride.forcedName);
            setNameReason(parsed.nameOverride.reason || "");
          }
        }
      } catch (error) {
        if (!cancelled) {
          show(getErrorMessage(error), "error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDetail();
    const interval = window.setInterval(() => {
      void loadDetail();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [client?.sessionId, open, show]);

  const activeClient = detail?.client ?? client;

  const runAction = async (label: string, action: () => Promise<void>) => {
    setPendingAction(label);
    try {
      await action();
      onChanged?.();
    } catch (error) {
      show(getErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[min(980px,95vw)] border-white/8 bg-[#0d1624]/96 text-foreground shadow-[0_36px_120px_-52px_rgba(0,0,0,0.96)]">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Client controls</DialogTitle>
          <DialogDescription className="text-slate-300/74">
            Open a live session, inspect what they are attached to, and take action without bouncing through separate admin pages.
          </DialogDescription>
        </DialogHeader>

        {!activeClient ? null : (
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Surface>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-slate-500">Session</div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {activeClient.name || "Anonymous"}
                  </div>
                </div>
                <Badge className="border border-white/10 bg-white/10 text-slate-100">
                  {formatRelativeTime(activeClient.lastSeen)}
                </Badge>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div className="rounded-[20px] border border-white/8 bg-[#0d1624] p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Identity</div>
                  <div className="mt-3 space-y-2 text-slate-100">
                    <div>Session: {shortId(activeClient.sessionId, 18)}</div>
                    <div>Connected: {formatDateTime(activeClient.connectedAt)}</div>
                    <div>Last seen: {formatDateTime(activeClient.lastSeen)}</div>
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/8 bg-[#0d1624] p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    <Globe2 className="size-4" />
                    Network
                  </div>
                  <div className="mt-3 space-y-2 text-slate-100">
                    <div>IP: {activeClient.ip || "Unknown"}</div>
                    <div>Region: {activeClient.region || "Unknown"}</div>
                    <div className="break-all">UA: {activeClient.userAgent || "Unknown"}</div>
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/8 bg-[#0d1624] p-4">
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
                    <Fingerprint className="size-4" />
                    Client fingerprint
                  </div>
                  <div className="mt-3 break-all text-slate-100">
                    {activeClient.fingerprint || "Unavailable"}
                  </div>
                </div>

                <div className="rounded-[20px] border border-white/8 bg-[#0d1624] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Current game</div>
                      <div className="mt-2 text-slate-100">
                        {activeClient.gameId && activeClient.gameType ? formatGameType(activeClient.gameType) : "Not in a game"}
                      </div>
                    </div>
                    {activeClient.gameId && activeClient.gameType && onViewGame && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/8 bg-[#162131] text-slate-100 hover:bg-white/6"
                        onClick={() => {
                          onOpenChange(false);
                          onViewGame({ id: activeClient.gameId!, type: activeClient.gameType! });
                        }}
                      >
                        <Orbit className="size-4" />
                        Open state
                      </Button>
                    )}
                  </div>
                  {activeClient.gameId && (
                    <div className="mt-2 text-sm text-slate-400">{shortId(activeClient.gameId, 16)}</div>
                  )}
                </div>

                {detail?.matchedBans?.length ? (
                  <div className="rounded-[24px] border border-red-300/16 bg-red-300/8 p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-red-100/75">
                      <Shield className="size-4" />
                      Active bans touching this client
                    </div>
                    <div className="mt-3 space-y-2">
                      {detail.matchedBans.map((ban) => (
                        <div key={ban.id} className="rounded-2xl border border-red-300/14 px-3 py-2 text-sm text-red-50">
                          <div className="font-medium">{ban.type.toUpperCase()}</div>
                          <div className="mt-1 text-red-50/75">{ban.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Surface>

            <div className="space-y-4">
              <Surface>
                <div className="text-sm font-semibold text-white">Name override</div>
                <div className="mt-1 text-sm text-slate-300/72">
                  Force a specific display name for this session or clear the override to hand control back.
                </div>

                <Input
                  value={nameInput}
                  onChange={(event) => setNameInput(event.target.value)}
                  placeholder="Forced name"
                  maxLength={20}
                  className="mt-4 border-white/8 bg-[#0d1624] text-slate-50"
                />
                <Textarea
                  value={nameReason}
                  onChange={(event) => setNameReason(event.target.value)}
                  placeholder="Reason (optional)"
                  maxLength={200}
                  className="mt-3 border-white/8 bg-[#0d1624] text-slate-50"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={!activeClient.sessionId || !nameInput.trim() || pendingAction !== null}
                    onClick={() =>
                      activeClient.sessionId &&
                      runAction("name", async () => {
                        await api(`/clients/${activeClient.sessionId}/name`, {
                          method: "POST",
                          body: { name: nameInput.trim(), reason: nameReason.trim() },
                        });
                        show("Name override saved.", "success");
                      })
                    }
                  >
                    Save override
                  </Button>
                  {detail?.nameOverride && activeClient.sessionId && (
                    <Button
                      variant="outline"
                      className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/6"
                      disabled={pendingAction !== null}
                      onClick={() =>
                        runAction("clear-override", async () => {
                          await api(`/clients/${activeClient.sessionId}/name`, { method: "DELETE" });
                          show("Name override cleared.", "success");
                          setNameReason("");
                        })
                      }
                    >
                      Clear override
                    </Button>
                  )}
                </div>
              </Surface>

              <Surface>
                <div className="text-sm font-semibold text-white">Direct moderation</div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    ["session", "Session"],
                    ["ip", "IP"],
                    ["region", "Region"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={restrictionType === value ? "default" : "outline"}
                      className={restrictionType === value ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/6"}
                      onClick={() => setRestrictionType(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                <Textarea
                  value={restrictionReason}
                  onChange={(event) => setRestrictionReason(event.target.value)}
                  placeholder="Reason for the ban or restriction"
                  maxLength={200}
                  className="mt-4 border-white/8 bg-[#0d1624] text-slate-50"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    className="rounded-full border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
                    disabled={!activeClient.sessionId || pendingAction !== null}
                    onClick={() =>
                      activeClient.sessionId &&
                      runAction("restrict", async () => {
                        const value = restrictionType === "session"
                          ? undefined
                          : restrictionType === "ip"
                            ? activeClient.ip
                            : activeClient.region;

                        if (restrictionType !== "session" && !value) {
                          throw new Error(`This client has no ${restrictionType.toUpperCase()} value to ban.`);
                        }

                        await api(`/clients/${activeClient.sessionId}/restrict`, {
                          method: "POST",
                          body: {
                            type: restrictionType,
                            value,
                            reason: restrictionReason.trim(),
                          },
                        });
                        show(`Applied ${restrictionType} restriction.`, "success");
                      })
                    }
                  >
                    <UserRoundX className="size-4" />
                    Restrict client
                  </Button>

                  {activeClient.name && (
                    <Button
                      variant="outline"
                      className="rounded-full border-white/10 bg-white/3 text-slate-100 hover:bg-white/8"
                      disabled={pendingAction !== null}
                      onClick={() =>
                        runAction("ban-name", async () => {
                          await api("/names/restricted", {
                            method: "POST",
                            body: { pattern: activeClient.name, reason: restrictionReason.trim() },
                          });
                          show(`Restricted the name \"${activeClient.name}\".`, "success");
                        })
                      }
                    >
                      <Ban className="size-4" />
                      Ban current name
                    </Button>
                  )}
                </div>
              </Surface>

              <Surface>
                <div className="text-sm font-semibold text-white">Targeted toast</div>
                <Input
                  value={toastMessage}
                  onChange={(event) => setToastMessage(event.target.value)}
                  placeholder="Message this client"
                  maxLength={300}
                  className="mt-4 rounded-full border-white/10 bg-white/4 text-slate-50"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    ["info", "Info"],
                    ["success", "Success"],
                    ["error", "Error"],
                  ] as const).map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      variant={toastLevel === value ? "default" : "outline"}
                      className={toastLevel === value ? "rounded-full bg-white text-slate-900 hover:bg-white/90" : "rounded-full border-white/10 bg-white/3 text-slate-100 hover:bg-white/8"}
                      onClick={() => setToastLevel(value)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                <Button
                  className="mt-4 rounded-full"
                  disabled={!activeClient.sessionId || !toastMessage.trim() || pendingAction !== null}
                  onClick={() =>
                    activeClient.sessionId &&
                    runAction("toast", async () => {
                      await api(`/clients/${activeClient.sessionId}/toast`, {
                        method: "POST",
                        body: { message: toastMessage.trim(), level: toastLevel },
                      });
                      show("Toast delivered.", "success");
                      setToastMessage("");
                    })
                  }
                >
                  <MessageSquareMore className="size-4" />
                  Send toast
                </Button>
              </Surface>
            </div>
          </div>
        )}

        {loading && !detail ? (
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <Skeleton className="h-28 bg-white/5" />
              <Skeleton className="h-28 bg-white/5" />
              <Skeleton className="h-28 bg-white/5" />
              <Skeleton className="h-28 bg-white/5" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-44 bg-white/5" />
              <Skeleton className="h-44 bg-white/5" />
              <Skeleton className="h-36 bg-white/5" />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
