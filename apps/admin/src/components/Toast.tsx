"use client";

import { useState, useCallback, createContext, useContext } from "react";
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

  const show = useCallback((message: string, level: ToastItem["level"] = "info") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, level }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, show }}>
      {children}
      <div className="fixed right-4 top-4 z-[110] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-[24px] border px-4 py-3 shadow-[0_24px_60px_-34px_rgba(0,0,0,0.95)] backdrop-blur-xl",
              t.level === "success" && "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
              t.level === "error" && "border-red-300/20 bg-red-300/10 text-red-50",
              t.level === "info" && "border-cyan-300/20 bg-cyan-300/10 text-cyan-50"
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
  return useContext(ToastContext);
}
