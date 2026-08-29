"use client";

import { ErrorShell } from "@/app/components/route-states";

export default function TradeoffError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorShell onRetry={reset} />;
}
