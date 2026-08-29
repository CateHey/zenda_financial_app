"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isProtectedPath } from "@/lib/auth/protected-routes";
import "../auth-form.css";

// D8 seed credentials — prefilled only when the landing page's "See Vinuy's journey" CTA
// arrives with ?demo=vinuy (D3 mapping table).
const VINUY_EMAIL = "vinuy@demo.zenda.app";
const VINUY_PASSWORD = "Zenda-demo-2026!";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isVinuyDemo = searchParams.get("demo") === "vinuy";
  const nextParam = searchParams.get("next");

  const [email, setEmail] = useState(isVinuyDemo ? VINUY_EMAIL : "");
  const [password, setPassword] = useState(isVinuyDemo ? VINUY_PASSWORD : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const supabase = supabaseBrowser();
    if (!supabase) {
      setError("Couldn't reach Zenda. Try again.");
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setLoading(false);
      setError(
        /invalid/i.test(signInError.message)
          ? "Email or password didn't match."
          : "Couldn't reach Zenda. Try again.",
      );
      return;
    }

    // D3 redirect rule: >=1 goal -> /roadmap, else /discover; ?next= wins when protected.
    let target = "/discover";
    try {
      const { count } = await supabase.from("goals").select("id", { count: "exact", head: true });
      target = (count ?? 0) > 0 ? "/roadmap" : "/discover";
    } catch {
      // Goals unreadable (e.g. migrations not yet applied) — fall back to /discover.
    }
    if (nextParam && isProtectedPath(nextParam)) target = nextParam;

    setLoading(false);
    router.push(target);
  }

  return (
    <main className="authMain">
      <div className="authCard">
        <p className="authEyebrow">Zenda</p>
        <h1 className="authTitle">Log in</h1>
        <form className="authForm" onSubmit={handleSubmit}>
          <label className="authLabel" htmlFor="login-email">
            Email
            <input
              id="login-email"
              className="authInput"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="authLabel" htmlFor="login-password">
            Password
            <input
              id="login-password"
              className="authInput"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="authError">{error}</p>}
          <button className="authButton" type="submit" disabled={loading}>
            {loading ? "One moment…" : "Log in"}
          </button>
        </form>
        <p className="authQuiet">
          New here?{" "}
          <a className="authLink" href="/signup">
            Create an account
          </a>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
