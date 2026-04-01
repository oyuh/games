"use client";

import * as React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmationTone = "default" | "warning" | "destructive";

type ConfirmationOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmationTone;
};

type ConfirmHandler = (options: ConfirmationOptions) => Promise<boolean>;

const ConfirmDialogContext = React.createContext<ConfirmHandler | null>(null);

function getToneStyles(tone: ConfirmationTone) {
  if (tone === "destructive") {
    return {
      icon: ShieldAlert,
      iconClassName: "border-red-300/18 bg-red-400/12 text-red-100",
      buttonVariant: "destructive" as const,
      buttonClassName: "border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22",
    };
  }

  if (tone === "warning") {
    return {
      icon: AlertTriangle,
      iconClassName: "border-amber-300/18 bg-amber-300/12 text-amber-100",
      buttonVariant: "outline" as const,
      buttonClassName: "border border-amber-300/20 bg-amber-300/12 text-amber-50 hover:bg-amber-300/20",
    };
  }

  return {
    icon: AlertTriangle,
    iconClassName: "border-[#38589a] bg-[#15274a] text-slate-50",
    buttonVariant: "default" as const,
    buttonClassName: "bg-primary text-primary-foreground hover:bg-primary/90",
  };
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);
  const [options, setOptions] = React.useState<ConfirmationOptions | null>(null);

  const close = React.useCallback((value: boolean) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolver?.(value);
  }, []);

  const confirm = React.useCallback<ConfirmHandler>((nextOptions) => {
    if (resolverRef.current) {
      resolverRef.current(false);
    }

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setOptions({
        cancelLabel: "Cancel",
        confirmLabel: "Continue",
        tone: "default",
        ...nextOptions,
      });
    });
  }, []);

  const tone = options?.tone ?? "default";
  const toneStyles = getToneStyles(tone);
  const ToneIcon = toneStyles.icon;

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(options)}
        onOpenChange={(open) => {
          if (!open) {
            close(false);
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-[min(460px,calc(100vw-2rem))] border-white/8 bg-[#0d1624]/96 text-foreground shadow-[0_36px_120px_-52px_rgba(0,0,0,0.96)]"
        >
          <DialogHeader>
            <div className="flex items-start gap-4">
              <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-[18px] border", toneStyles.iconClassName)}>
                <ToneIcon className="size-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg text-white">{options?.title}</DialogTitle>
                {options?.description ? (
                  <DialogDescription className="mt-2 text-sm leading-6 text-slate-300/74">
                    {options.description}
                  </DialogDescription>
                ) : null}
              </div>
            </div>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]" onClick={() => close(false)}>
              {options?.cancelLabel}
            </Button>
            <Button
              variant={toneStyles.buttonVariant}
              className={toneStyles.buttonClassName}
              onClick={() => close(true)}
            >
              {options?.confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = React.useContext(ConfirmDialogContext);

  if (!context) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider.");
  }

  return context;
}
