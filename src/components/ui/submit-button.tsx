"use client";

import { useFormStatus } from "react-dom";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={cn("button-primary", className)} disabled={pending} type="submit">
      {pending ? "Working..." : children}
    </button>
  );
}
