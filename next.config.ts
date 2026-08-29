import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo clock (addendum A12): pins "today" to the persona's week 7 unless the environment
  // overrides it. Set DEMO_TODAY="" to run on the real clock.
  env: {
    DEMO_TODAY: process.env.DEMO_TODAY === undefined ? "2026-10-20" : process.env.DEMO_TODAY,
  },
  async rewrites() {
    return [
      { source: "/", destination: "/landing.html" },
      { source: "/benchmark", destination: "/benchmark.html" },
    ];
  },
};

export default nextConfig;
