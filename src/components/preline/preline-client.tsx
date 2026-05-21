"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function PrelineClient() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    import("preline/non-auto").then(({ HSStaticMethods }) => {
      if (!cancelled) {
        HSStaticMethods.autoInit();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
