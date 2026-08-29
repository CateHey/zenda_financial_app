import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./tokens.css";

// D10 task 14 (installable): the manifest link and theme-color/viewport meta go through Next's
// metadata/viewport exports (confirmed the convention for this Next version in
// node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md and
// generate-metadata.md's `manifest` field) rather than hand-written <head> tags. Nothing else in
// this file changes — app/admin/**, public/manifest.json and public/icon.svg are the rest of
// task 14/13's surface.
export const metadata: Metadata = {
  title: "Zenda",
  description: "The path from your paycheck to your goal.",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#5856D6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
