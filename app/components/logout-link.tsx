"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

// D4: "Every app screen shares a 44px header row: ... a 'Log out' quiet link at the right."
// Bindings doc, Common: "--label-2, 15px." Dropped into each screen's existing top bar.
export function LogoutLink() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = supabaseBrowser();
    if (supabase) await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        font: "inherit",
        fontSize: 15,
        color: "var(--label-2)",
        cursor: loading ? "default" : "pointer",
      }}
    >
      Log out
    </button>
  );
}
