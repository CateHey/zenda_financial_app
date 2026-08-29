"use client";

import { ErrorShell } from "@/app/components/route-states";

export default function AchievableError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorShell onRetry={reset} />;
}
