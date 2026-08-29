"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutLink } from "./logout-link";

type Props = { isAuthed: boolean; isAdmin: boolean };

const LINKS: Array<{ href: string; label: string; short: string; icon: string }> = [
  { href: "/menu", label: "Menu", short: "Menu", icon: "M4 6h16M4 12h16M4 18h16" },
  { href: "/roadmap", label: "Roadmap", short: "Roadmap", icon: "M4 18l5-5 4 3 7-8" },
  { href: "/achievable", label: "What's achievable", short: "Reach", icon: "M12 3v18M5 10l7-7 7 7" },
  { href: "/prioritise", label: "Prioritise", short: "Priority", icon: "M4 6h16M4 12h10M4 18h6" },
  { href: "/progress", label: "Progress", short: "Progress", icon: "M5 12l4 4L19 6" },
  { href: "/discover", label: "Edit my numbers", short: "Edit", icon: "M4 20l4-1 10-10-3-3L5 16z" },
];

// Persistent menu on every app screen: a top bar on web, and on phones a slim top strip with a
// "Menu" button plus a bottom bar. Hidden on the landing and the auth pages, and when signed out.
export function NavBar({ isAuthed, isAdmin }: Props) {
  const pathname = usePathname() ?? "/";
  if (!isAuthed || pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/signup")) return null;

  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin", short: "Admin", icon: "M3 20h18M6 20V9M12 20V4M18 20v-7" }] : LINKS;
  const current = (href: string) => (pathname === href || (href !== "/discover" && pathname.startsWith(href + "/")) ? "page" : undefined);

  return (
    <>
      <nav className="znav-top" aria-label="Main">
        <Link href="/menu" className="znav-brand">Zenda</Link>
        <div className="znav-links">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="znav-link" aria-current={current(l.href)}>
              {l.label}
            </Link>
          ))}
        </div>
        <div className="znav-right">
          <LogoutLink />
        </div>
      </nav>
      <div className="znav-mini">
        <Link href="/menu" className="znav-menu-btn" aria-current={current("/menu")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          Menu
        </Link>
        <Link href="/menu" className="znav-brand">Zenda</Link>
      </div>
      <nav className="znav-bottom" aria-label="Main">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={current(l.href)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={l.icon} />
            </svg>
            {l.short}
          </Link>
        ))}
      </nav>
    </>
  );
}
