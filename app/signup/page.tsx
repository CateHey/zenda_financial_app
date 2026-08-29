"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { isProtectedPath } from "@/lib/auth/protected-routes";
import "../auth-form.css";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState("DEMO");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password needs at least 8 characters.");
      return;
    }

    const supabase = supabaseBrowser();
    if (!supabase) {
      setError("Couldn't reach Zenda. Try again.");
      return;
    }

    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError) {
      setLoading(false);
      setError(
        /already|registered|exists/i.test(signUpError.message)
          ? "That email already has an account — log in instead."
          : "Couldn't reach Zenda. Try again.",
      );
      return;
    }
    if (!signUpData.session) {
      // Email confirmation is on (should be off for the demo — D9 step 3, an owner action).
      setLoading(false);
      setError("Couldn't reach Zenda. Try again.");
      return;
    }

    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName, join_code: joinCode }),
      });
      if (!response.ok) {
        setLoading(false);
        if (response.status === 404) {
          setError("We don't know that company code.");
        } else {
          setError("Couldn't reach Zenda. Try again.");
        }
        return;
      }
    } catch {
      setLoading(false);
      setError("Couldn't reach Zenda. Try again.");
      return;
    }

    // D3 redirect rule: a fresh signup has no goals yet, so /discover unless ?next= wins.
    const target = nextParam && isProtectedPath(nextParam) ? nextParam : "/discover";
    setLoading(false);
    router.push(target);
  }

  return (
    <main className="authMain">
      <div className="authCard">
        <p className="authEyebrow">Zenda</p>
        <h1 className="authTitle">Start your journey</h1>
        <form className="authForm" onSubmit={handleSubmit}>
          <label className="authLabel" htmlFor="signup-name">
            Display name
            <input
              id="signup-name"
              className="authInput"
              type="text"
              autoComplete="name"
              required
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="authLabel" htmlFor="signup-email">
            Email
            <input
              id="signup-email"
              className="authInput"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="authLabel" htmlFor="signup-password">
            Password
            <input
              id="signup-password"
              className="authInput"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="authLabel" htmlFor="signup-code">
            Company code
            <input
              id="signup-code"
              className="authInput"
              type="text"
              required
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
            />
          </label>
          {error && <p className="authError">{error}</p>}
          <button className="authButton" type="submit" disabled={loading}>
            {loading ? "One moment…" : "Start your journey"}
          </button>
        </form>
        <p className="authQuiet">
          Already have an account?{" "}
          <a className="authLink" href="/login">
            Log in
          </a>
        </p>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
