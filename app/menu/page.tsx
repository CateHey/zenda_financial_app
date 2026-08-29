import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { LogoutLink } from "@/app/components/logout-link";

type Tile = { href: string; title: string; line: string; color: string };

const TILES: Tile[] = [
  { href: "/roadmap", title: "Roadmap", line: "Your path, today to the goal. What-if lives here.", color: "#5856D6" },
  { href: "/achievable", title: "What's achievable", line: "A verdict per goal and the lever that moves it.", color: "#007AFF" },
  { href: "/prioritise", title: "Prioritise", line: "When goals compete, decide which wins.", color: "#0057D9" },
  { href: "/progress", title: "Progress", line: "One question per payday. Partly counts.", color: "#8450DA" },
  { href: "/progress/adapt", title: "Life changed", line: "Rent up, bonus in, new goal — the path redraws.", color: "#AF52DE" },
  { href: "/discover", title: "Edit my numbers", line: "Change anything you told us, any time.", color: "#10265F" },
];

// The principal menu: every screen, one tap away, from every screen.
export default async function MenuPage() {
  const supabase = await supabaseServer();
  if (!supabase) redirect("/login?next=%2Fmenu");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=%2Fmenu");
  const { data: profile } = await supabase.from("profiles").select("display_name, role").eq("user_id", user.id).maybeSingle();
  const tiles = profile?.role === "admin"
    ? [...TILES, { href: "/admin", title: "Employer view", line: "Seats and headcount. Never a goal, never a number.", color: "#8E8E93" }]
    : TILES;

  return (
    <main className="screen" data-web="grid" style={{ maxWidth: 390, margin: "0 auto", minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "20px 20px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 44 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5856D6" }}>Menu</span>
        <LogoutLink />
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, margin: "8px 0 4px" }}>
        {profile?.display_name ? `Hi ${profile.display_name}.` : "Where to?"}
      </h1>
      <p style={{ margin: "0 0 18px", fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Everything in Zenda, one tap away.</p>
      <div className="cards" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", borderRadius: 14, background: "#FFFFFF", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)", textDecoration: "none", color: "inherit", minHeight: 72 }}>
            <span style={{ width: 12, height: 12, borderRadius: 999, background: t.color, flexShrink: 0, boxShadow: `0 0 0 4px ${t.color}22` }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>{t.title}</span>
              <span style={{ fontSize: 14, color: "rgba(60,60,67,0.78)" }}>{t.line}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5856D6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto", flexShrink: 0 }}><path d="M9 6l6 6-6 6" /></svg>
          </Link>
        ))}
      </div>
    </main>
  );
}
