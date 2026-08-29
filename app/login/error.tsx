"use client";

import { ErrorShell } from "@/app/components/route-states";

export default function LoginError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorShell onRetry={reset} />;
}
