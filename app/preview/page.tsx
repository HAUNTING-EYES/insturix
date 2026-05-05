import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";

export default function PreviewPage() {
  return (
    <>
      <SiteNavbar />
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: "120px 48px",
        }}
      >
        <span
          className="mono-label"
          style={{ marginBottom: 8 }}
        >
          DESIGN SYSTEM PREVIEW
        </span>
        <h1
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            textAlign: "center",
            color: "var(--text-primary)",
          }}
        >
          Prompt or footage.{" "}
          <span style={{ color: "var(--accent-gold)" }}>Professional either way.</span>
        </h1>
        <p
          style={{
            fontSize: 18,
            color: "var(--text-muted)",
            textAlign: "center",
            maxWidth: 480,
            lineHeight: 1.55,
          }}
        >
          This page previews the new navbar, footer, typography, and design
          tokens. Scroll down to see the footer.
        </p>

        {/* Token swatches */}
        <div style={{ marginTop: 64, width: "100%", maxWidth: 800 }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 16 }}>SURFACES</span>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { name: "Canvas", var: "--bg-canvas" },
              { name: "Raised", var: "--bg-raised" },
              { name: "Deeper", var: "--bg-deeper" },
              { name: "Well", var: "--bg-well" },
            ].map((s) => (
              <div
                key={s.name}
                style={{
                  flex: 1,
                  height: 64,
                  background: `var(${s.var})`,
                  borderRadius: 12,
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "flex-end",
                  padding: 8,
                }}
              >
                <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
                  {s.name}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 32, width: "100%", maxWidth: 800 }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 16 }}>TEXT HIERARCHY</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 14, color: "var(--text-primary)" }}>Primary — main content, headlines</span>
            <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>Secondary — supporting prose</span>
            <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Muted — metadata, hints</span>
            <span style={{ fontSize: 14, color: "var(--text-dim)" }}>Dim — system labels</span>
            <span style={{ fontSize: 14, color: "var(--text-faint)" }}>Faint — decorative, barely there</span>
          </div>
        </div>

        <div style={{ marginTop: 32, width: "100%", maxWidth: 800 }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 16 }}>ACCENT + STATUS</span>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ padding: "8px 16px", background: "var(--accent-gold)", color: "var(--bg-canvas)", borderRadius: 7, fontSize: 13, fontWeight: 800 }}>
              Gold — decisions
            </div>
            <div style={{ padding: "8px 16px", background: "rgba(94,201,126,0.1)", color: "var(--status-success)", borderRadius: 7, fontSize: 13, fontWeight: 500, border: "1px solid rgba(94,201,126,0.2)" }}>
              Success
            </div>
            <div style={{ padding: "8px 16px", background: "rgba(212,106,92,0.1)", color: "var(--status-danger)", borderRadius: 7, fontSize: 13, fontWeight: 500, border: "1px solid rgba(212,106,92,0.2)" }}>
              Danger
            </div>
          </div>
        </div>

        <div style={{ marginTop: 32, width: "100%", maxWidth: 800 }}>
          <span className="mono-label" style={{ display: "block", marginBottom: 16 }}>TYPOGRAPHY</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05 }}>Hero 44px / 800</span>
            <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.035em" }}>Heading 32px / 800</span>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Section 24px / 800</span>
            <span style={{ fontSize: 18, fontWeight: 500 }}>Subheading 18px / 500</span>
            <span style={{ fontSize: 14, fontWeight: 400 }}>Body 14px / 400</span>
            <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary)" }}>Small 13px / 400</span>
            <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--text-dim)" }}>Mono 11px / 500</span>
            <span className="mono-label">Mono label 10px / 500 / uppercase / 0.08em</span>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
