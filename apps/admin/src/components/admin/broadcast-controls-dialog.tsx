"use client";

import { useState } from "react";
import {
  BellRing,
  Megaphone,
  RefreshCcw,
  Rocket,
  Send,
  Siren,
  TriangleAlert,
} from "lucide-react";

import { api } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/Toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Action failed.";
}

export function BroadcastControlsDialog() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [open, setOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastLevel, setToastLevel] = useState<"info" | "success" | "error">("info");
  const [warningMinutes, setWarningMinutes] = useState(5);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setPendingAction(label);
    try {
      await action();
    } catch (error) {
      show(getErrorMessage(error), "error");
    } finally {
      setPendingAction(null);
    }
  };

  const sendCountdown = async () => {
    const confirmed = await confirm({
      title: "Send update countdown?",
      description: `Warn every connected client about a ${warningMinutes}-minute refresh window and queue the staged countdown notices.`,
      confirmLabel: "Send countdown",
      tone: "warning",
    });

    if (!confirmed) {
      return;
    }

    await runAction("update-warning", async () => {
      await api("/broadcast/update-warning", {
        method: "POST",
        body: { minutes: warningMinutes },
      });
      show(`Scheduled a ${warningMinutes}-minute update warning.`, "success");
    });
  };

  const forceRefresh = async () => {
    const confirmed = await confirm({
      title: "Force-refresh all clients?",
      description: "This will immediately reload every connected client session.",
      confirmLabel: "Force refresh",
      tone: "warning",
    });

    if (!confirmed) {
      return;
    }

    await runAction("refresh", async () => {
      await api("/broadcast/refresh", { method: "POST" });
      show("Forced refresh sent.", "success");
    });
  };

  const endAllAndWarn = async () => {
    const confirmed = await confirm({
      title: "End all live games?",
      description: "Every active game will be terminated and a five-minute refresh warning will be sent to clients right after.",
      confirmLabel: "End games and warn",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    await runAction("end-all", async () => {
      const response = await api("/games/end-all", { method: "POST" });
      await api("/broadcast/update-warning", {
        method: "POST",
        body: { minutes: 5 },
      });
      show(`Ended ${response.ended?.total ?? 0} games and scheduled refresh.`, "success");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={cn("border-[#38589a] bg-[#16305a] text-slate-50 hover:bg-[#1c3969]")}>
          <Megaphone className="size-4" />
          Broadcast
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[min(980px,95vw)] border-white/8 bg-[#0d1624]/96 text-foreground shadow-[0_36px_120px_-52px_rgba(0,0,0,0.96)]">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">Broadcast controls</DialogTitle>
          <DialogDescription className="text-slate-300/74">
            Keep the messaging actions together without forcing a separate admin page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-[24px] border border-white/8 bg-[#111b2a] p-5 lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Global Toast
                </div>
                <div className="mt-2 text-xl font-semibold tracking-[-0.04em] text-white">
                  Broadcast a live system message
                </div>
                <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-300/72">
                  Send one message to every connected client without leaving the header flow.
                </div>
              </div>
              <Badge variant="secondary" className="w-fit border border-white/8 bg-[#0d1624] text-slate-100">
                Live
              </Badge>
            </div>

            <Textarea
              value={toastMessage}
              onChange={(event) => setToastMessage(event.target.value)}
              placeholder="Tell everyone what is happening..."
              className="mt-5 min-h-32 border-white/8 bg-[#0d1624] text-slate-50 placeholder:text-slate-400"
              maxLength={300}
            />

            <div className="mt-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {([
                  ["info", "Info"],
                  ["success", "Success"],
                  ["error", "Error"],
                ] as const).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    variant={toastLevel === value ? "default" : "outline"}
                    className={
                      toastLevel === value
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/6"
                    }
                    onClick={() => setToastLevel(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
                  {toastMessage.length}/300
                </div>
                <Button
                  disabled={!toastMessage.trim() || pendingAction !== null}
                  onClick={() =>
                    runAction("toast", async () => {
                      await api("/broadcast/toast", {
                        method: "POST",
                        body: { message: toastMessage.trim(), level: toastLevel },
                      });
                      show("Broadcast sent.", "success");
                      setToastMessage("");
                    })
                  }
                >
                  <Send className="size-4" />
                  Send toast
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/8 bg-[#111b2a] p-5">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-10 items-center justify-center rounded-[16px] border border-amber-300/20 bg-amber-300/10 text-amber-100">
                <BellRing className="size-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Update Countdown
                </div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">
                  Stage a controlled refresh warning
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300/72">
                  Clients get the start notice, one-minute reminder, and ten-second countdown.
                </div>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Input
                type="number"
                min={1}
                max={30}
                value={warningMinutes}
                onChange={(event) => setWarningMinutes(Number(event.target.value) || 1)}
                className="max-w-28 border-white/8 bg-[#0d1624] text-slate-50"
              />
              <div className="text-sm text-slate-300/72">minutes</div>
            </div>

            <Button
              className="mt-5 w-full justify-center border border-amber-300/20 bg-amber-300/12 text-amber-50 hover:bg-amber-300/20"
              disabled={pendingAction !== null}
              onClick={() => void sendCountdown()}
            >
              <Siren className="size-4" />
              Send countdown
            </Button>
          </section>

          <section className="rounded-[24px] border border-white/8 bg-[#111b2a] p-5">
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-10 items-center justify-center rounded-[16px] border border-red-300/20 bg-red-300/10 text-red-100">
                <TriangleAlert className="size-4" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Fast Actions
                </div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">
                  Immediate operational controls
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-300/72">
                  Use these when you need an instant refresh or a hard stop before rollout.
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/6"
                disabled={pendingAction !== null}
                onClick={() => void forceRefresh()}
              >
                <RefreshCcw className="size-4" />
                Force refresh all
              </Button>

              <Button
                variant="destructive"
                className="w-full justify-start border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
                disabled={pendingAction !== null}
                onClick={() => void endAllAndWarn()}
              >
                <Rocket className="size-4" />
                End all and warn
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
