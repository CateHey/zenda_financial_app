/**
 * The protected route prefixes shared by proxy.ts (server-side gate) and the auth pages
 * (client-side redirect honouring ?next=). See ZENDA_SPEC_ADDENDUM.md A1 §4.
 */
export const PROTECTED_PREFIXES = [
  "/discover",
  "/achievable",
  "/prioritise",
  "/roadmap",
  "/progress",
  "/celebrate",
  "/admin",
  "/menu",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
