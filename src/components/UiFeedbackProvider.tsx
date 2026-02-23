"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type ToastKind = "info" | "success" | "error";

type Toast = {
  id: string;
  title: string;
  description?: string;
  kind?: ToastKind;
};

type UiFeedbackContextValue = {
  startProgress: () => void;
  stopProgress: () => void;
  pushToast: (toast: Omit<Toast, "id">) => void;
};

const UiFeedbackContext = createContext<UiFeedbackContextValue | null>(null);

export function useUiFeedback() {
  const ctx = useContext(UiFeedbackContext);
  if (!ctx) {
    throw new Error("useUiFeedback must be used within UiFeedbackProvider");
  }
  return ctx;
}

export default function UiFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [progressCount, setProgressCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const startProgress = () => setProgressCount((count) => count + 1);
  const stopProgress = () => setProgressCount((count) => Math.max(0, count - 1));

  const pushToast = (toast: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  };

  const value = useMemo(
    () => ({
      startProgress,
      stopProgress,
      pushToast,
    }),
    []
  );

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.sessionStorage.getItem("mc:toast") : null;
    if (stored) {
      pushToast({ title: stored });
      window.sessionStorage.removeItem("mc:toast");
    }
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) return;
      const toast = target.dataset.toast;
      const progress = target.dataset.progress;
      const submitEvent = event as SubmitEvent;
      const submitter = submitEvent?.submitter instanceof HTMLButtonElement ? submitEvent.submitter : null;
      const shouldTrack =
        progress !== "false" && target.method.toLowerCase() !== "get";
      if (progress || shouldTrack) {
        startProgress();
        target.setAttribute("aria-busy", "true");
        if (submitter) {
          submitter.disabled = true;
          submitter.setAttribute("aria-busy", "true");
          submitter.classList.add("mc-loading");
          if (!submitter.dataset.originalLabel) {
            submitter.dataset.originalLabel = submitter.textContent || "";
          }
          if (!submitter.dataset.submittingLabel) {
            submitter.dataset.submittingLabel = "Working...";
          }
          submitter.textContent = submitter.dataset.submittingLabel;
        }
      }
      if (toast) {
        window.sessionStorage.setItem("mc:toast", toast);
      }
    };
    document.addEventListener("submit", handler, true);
    return () => document.removeEventListener("submit", handler, true);
  }, []);

  useEffect(() => {
    const clickHandler = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button =
        target.closest("button") ||
        (target.getAttribute("role") === "button" ? target : null);
      if (!(button instanceof HTMLElement)) return;
      if (
        button instanceof HTMLButtonElement &&
        (button.disabled || button.getAttribute("aria-disabled") === "true")
      ) {
        return;
      }
      button.classList.add("mc-clicked");
      window.setTimeout(() => {
        button.classList.remove("mc-clicked");
      }, 220);
    };
    document.addEventListener("click", clickHandler, true);
    return () => document.removeEventListener("click", clickHandler, true);
  }, []);

  return (
    <UiFeedbackContext.Provider value={value}>
      {children}
      <GlobalProgressBar active={progressCount > 0} />
      <ToastStack toasts={toasts} />
    </UiFeedbackContext.Provider>
  );
}

function GlobalProgressBar({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="fixed left-0 right-0 top-0 z-[90] h-1 bg-blue-100">
      <div className="h-full w-full animate-pulse bg-blue-700" />
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[90] grid max-w-xs gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
          <div className="font-semibold">{toast.title}</div>
          {toast.description && <div className="mt-1 text-slate-500">{toast.description}</div>}
        </div>
      ))}
    </div>
  );
}
