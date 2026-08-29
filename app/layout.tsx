import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./tokens.css";
import "./web.css";
import { supabaseServer } from "@/lib/supabase/server";
import { aiEnabled } from "@/lib/ai/enabled";
import { NavBar } from "./components/nav-bar";
import { AskZenda } from "./components/ask-zenda";

export const metadata: Metadata = {
  title: "Zenda",
  description: "The path from your paycheck to your goal.",
  manifest: "/manifest.json",
  icons: { icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#5856D6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

// The shell: the persistent menu (web top bar / phone bottom bar) and the Zenda Coach on every
// app screen. App screens are already behind the auth proxy, so the menu shows on any path that
// is not the landing or an auth page — it never depends on this layout resolving the session.
// The session is only consulted, best-effort, to decide whether to show the Admin link.
export default async function RootLayout({ children }: { children: ReactNode }) {
  let isAdmin = false;
  try {
    const supabase = await supabaseServer();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
        isAdmin = data?.role === "admin";
      }
    }
  } catch (err) {
    console.error("layout role check", err);
  }
  return (
    <html lang="en">
      <body className="has-nav">
        <NavBar isAuthed={true} isAdmin={isAdmin} />
        {children}
        <AskZenda enabled={aiEnabled()} />
      </body>
    </html>
  );
}
