"use client";

import { useState, useCallback, createContext, useContext } from "react";

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
      <div className="toast-bar">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.level}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
