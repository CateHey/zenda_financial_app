import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./tokens.css";

export const metadata: Metadata = {
  title: "Zenda",
  description: "The path from your paycheck to your goal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
