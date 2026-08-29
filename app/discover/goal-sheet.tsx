"use client";

import { useState } from "react";

// A6 · Goal detail sheet (D4 missing screen). "A bottom sheet in the Discover sheet's row
// style with three rows: Title (text), Target (currency, integer dollars -> cents), By (month
// picker, YYYY-MM, stored as the first of that month). 'Done' closes it."
export type GoalSheetValues = { title: string; targetCents: number; targetDate: string };

export function GoalSheet({
  title,
  initial,
  onDone,
  onRemove,
  onClose,
}: {
  title: string;
  initial: GoalSheetValues;
  onDone: (values: GoalSheetValues) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [titleValue, setTitleValue] = useState(initial.title);
  const [targetDollars, setTargetDollars] = useState(String(Math.round(initial.targetCents / 100)));
  const [byMonth, setByMonth] = useState(initial.targetDate.slice(0, 7)); // YYYY-MM

  function handleDone() {
    const dollars = Math.max(0, Math.round(Number(targetDollars) || 0));
    const monthValue = /^\d{4}-\d{2}$/.test(byMonth) ? byMonth : initial.targetDate.slice(0, 7);
    onDone({
      title: titleValue.trim() || initial.title,
      targetCents: dollars * 100,
      targetDate: `${monthValue}-01`,
    });
  }

  return (
    <div
      role="dialog"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.32)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 390,
          background: "#FFFFFF",
          borderRadius: "20px 20px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.12)",
          padding: "12px 20px 24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            background: "#D1D1D6",
            alignSelf: "center",
            marginBottom: 4,
          }}
        />
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.01em" }}>{title}</span>
          <button
            type="button"
            onClick={handleDone}
            style={{
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
            Done
          </button>
        </div>

        <label
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 40,
            borderBottom: "1px solid rgba(60,60,67,0.18)",
          }}
        >
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Title</span>
          <input
            type="text"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            maxLength={80}
            style={{ fontSize: 15, textAlign: "right", border: "none", outline: "none", width: 180, font: "inherit" }}
          />
        </label>

        <label
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 40,
            borderBottom: "1px solid rgba(60,60,67,0.18)",
          }}
        >
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>Target</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 15 }}>$</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={targetDollars}
              onChange={(e) => setTargetDollars(e.target.value)}
              style={{ fontSize: 15, textAlign: "right", border: "none", outline: "none", width: 110, font: "inherit" }}
            />
          </span>
        </label>

        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 40 }}>
          <span style={{ fontSize: 15, color: "rgba(60,60,67,0.78)" }}>By</span>
          <input
            type="month"
            value={byMonth}
            onChange={(e) => setByMonth(e.target.value)}
            style={{ fontSize: 15, textAlign: "right", border: "none", outline: "none", font: "inherit" }}
          />
        </label>

        <button
          type="button"
          onClick={onRemove}
          style={{
            marginTop: 10,
            background: "none",
            border: "none",
            padding: 0,
            font: "inherit",
            fontSize: 14,
            color: "var(--danger)",
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Remove this goal
        </button>
      </div>
    </div>
  );
}
