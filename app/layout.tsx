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

// The shell: the persistent menu (web top bar / phone bottom bar) and Ask Zenda are rendered for
// signed-in people on every app screen; the landing and auth pages hide them client-side.
export default async function RootLayout({ children }: { children: ReactNode }) {
  let isAuthed = false;
  let isAdmin = false;
  try {
    const supabase = await supabaseServer();
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        isAuthed = true;
        const { data } = await supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle();
        isAdmin = data?.role === "admin";
      }
    }
  } catch (err) {
    console.error("layout auth check", err);
  }
  return (
    <html lang="en">
      <body className={isAuthed ? "has-nav" : undefined}>
        <NavBar isAuthed={isAuthed} isAdmin={isAdmin} />
        {children}
        <AskZenda enabled={isAuthed && aiEnabled()} />
      </body>
    </html>
  );
}
