"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  className,
  disabled = false,
}: {
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-cyan-800 focus:outline-none focus:ring-4 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      disabled={isDisabled}
      type="submit"
    >
      {pending ? "Working..." : children}
    </button>
  );
}
