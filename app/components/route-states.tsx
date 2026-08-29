// D4: shared loading/error shells for every server-rendered app screen. "Loading state for
// every server-rendered page: the page shell with copy replaced by 'Loading your path…' in
// labelSecondary — no skeletons are designed. Error state: a #F2F2F7 card with the message and
// a 'Try again' quiet button."

export function LoadingShell() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface)",
      }}
    >
      <span style={{ fontSize: 15, color: "var(--label-2)" }}>Loading your path…</span>
    </main>
  );
}

export function ErrorShell({ onRetry }: { onRetry: () => void }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface)",
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 390,
          background: "var(--surface-sunken)",
          borderRadius: "var(--radius-md)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 15, color: "var(--label)" }}>Something didn&apos;t load. Nothing was lost.</span>
        <button
          type="button"
          onClick={onRetry}
          style={{
            alignSelf: "center",
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontSize: 15,
            fontWeight: 600,
            color: "var(--accent)",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
