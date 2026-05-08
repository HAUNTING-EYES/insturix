import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ArchivedPage() {
  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ fontSize: 14, color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>This page is being redesigned.</p>
    </div>
  );
}
