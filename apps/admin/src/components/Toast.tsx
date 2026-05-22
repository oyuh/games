"use client";

import { use, useCallback, createContext, useState } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = {
  id: number;
  message: string;
  level: "success" | "error" | "info";
};

let nextId = 0;

const ToastContext = createContext<{
  toasts: ToastItem[];
  show: (message: string, level?: ToastItem["level"]) => void;
}>({ toasts: [], show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback(
    (message: string, level: ToastItem["level"] = "info") => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, message, level }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toasts, show }}>
      {children}
      <div className="fixed right-4 top-4 z-[110] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border px-4 py-3 shadow-none ",
              t.level === "success" && "border-border bg-muted text-foreground",
              t.level === "error" && "border-border bg-muted text-foreground",
              t.level === "info" && "border-border bg-muted text-foreground",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                {t.level === "success" ? (
                  <CheckCircle2 className="size-4" />
                ) : t.level === "error" ? (
                  <AlertCircle className="size-4" />
                ) : (
                  <Info className="size-4" />
                )}
              </div>
              <div className="text-sm leading-6">{t.message}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return use(ToastContext);
}
