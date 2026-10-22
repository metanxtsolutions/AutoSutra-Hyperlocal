"use client";

import { buttonClass } from "@/components/ui/button";

export function PrintButton() {
  return (
    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => window.print()}>
      Print or save as PDF
    </button>
  );
}
