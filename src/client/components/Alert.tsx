import type { ReactNode } from "react";

interface AlertProps {
  tone: "error" | "success";
  children: ReactNode;
}

/** Inline status message. Uses role="alert" for errors so screen readers announce them. */
export function Alert({ tone, children }: AlertProps) {
  const styles =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${styles}`}
    >
      {children}
    </p>
  );
}
