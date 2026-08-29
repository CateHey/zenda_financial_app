import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/data/queries";
import { LogoutLink } from "@/app/components/logout-link";

// S9 · Employer view — MISSING SCREEN (D4 row 9, "cuttable"). /admin. Server Component: loads
// the caller's own profile (RLS-scoped, D2), redirects non-admins to /roadmap, then calls the
// org_seat_stats(org) RPC (D2) for counts only — never a member's goals, income or progress.
// That guarantee is enforced by RLS (no org-admin policy exists on profiles/goals/etc, D2's
// "employer-blindness proof"), not by anything on this page.

type SeatStatsRow = { seats: number; members: number; active_14d: number | null };

const TILE_STYLE: CSSProperties = {
  flex: 1,
  background: "var(--surface-sunken)",
  borderRadius: "var(--radius-md)",
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  boxSizing: "border-box",
};

const TILE_LABEL_STYLE: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "var(--label-3)",
};

const TILE_NUMBER_STYLE: CSSProperties = {
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: "-0.01em",
  color: "var(--label)",
};

export default async function AdminPage() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login");

  const profile = await getProfile(supabase);
  if (!profile || profile.role !== "admin") redirect("/roadmap");

  const [orgResult, statsResult] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", profile.org_id).maybeSingle(),
    supabase.rpc("org_seat_stats", { org: profile.org_id }),
  ]);

  const orgName = (orgResult.data as { name: string } | null)?.name ?? "Your organisation";
  const stats = ((statsResult.data ?? []) as SeatStatsRow[])[0] ?? null;

  return (
    <main className="screen" data-web="grid"
      style={{
        maxWidth: 390,
        margin: "0 auto",
        minHeight: "100vh",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        padding: 20,
        gap: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 44 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--accent)",
          }}
        >
          Your organisation
        </span>
        <LogoutLink />
      </div>

      <span style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.12, color: "var(--label)" }}>
        {orgName}
      </span>

      <div className="cards" style={{ display: "flex", gap: 12 }}>
        <div style={TILE_STYLE}>
          <span style={TILE_LABEL_STYLE}>Seats</span>
          <span style={TILE_NUMBER_STYLE}>{stats ? stats.seats : "—"}</span>
        </div>
        <div style={TILE_STYLE}>
          <span style={TILE_LABEL_STYLE}>Members</span>
          <span style={TILE_NUMBER_STYLE}>{stats ? stats.members : "—"}</span>
        </div>
      </div>

      <div style={{ ...TILE_STYLE, flex: "none" }}>
        <span style={TILE_LABEL_STYLE}>Active in the last 14 days</span>
        {stats && stats.active_14d !== null ? (
          <span style={TILE_NUMBER_STYLE}>{stats.active_14d}</span>
        ) : (
          <span style={{ fontSize: 15, color: "var(--label-2)" }}>Not enough people yet.</span>
        )}
      </div>

      <p style={{ fontSize: 14, lineHeight: 1.4, color: "var(--label-2)", marginTop: "auto" }}>
        Zenda never shows an employer an individual&apos;s goals, income or progress.
      </p>
    </main>
  );
}
