const showcaseVideoSrc = "/product_demos/showcase/insturix-final-intro.mp4";

export function ShowcasePage() {
  return (
    <main style={{ background: "#030303", color: "var(--text-primary)", minHeight: "100vh" }}>
      <section
        aria-labelledby="showcase-title"
        style={{
          width: "100%",
          minHeight: "calc(100vh - 88px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(56px, 8vw, 104px) clamp(16px, 5vw, 72px)",
        }}
      >
        <div style={{ width: "min(1180px, 100%)", display: "grid", gap: 28 }}>
          <div style={{ display: "grid", gap: 12, textAlign: "center" }}>
            <p
              style={{
                margin: 0,
                color: "var(--accent-gold)",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
              }}
            >
              A piece we made for ourselves
            </p>
            <h1
              id="showcase-title"
              style={{
                margin: 0,
                fontSize: "clamp(36px, 7vw, 88px)",
                lineHeight: 0.95,
                fontWeight: 800,
                letterSpacing: 0,
                textWrap: "balance",
              }}
            >
              What we made for ourselves.
            </h1>
            <p
              style={{
                margin: "0 auto",
                maxWidth: 720,
                color: "var(--text-secondary)",
                fontSize: "clamp(15px, 1.7vw, 19px)",
                lineHeight: 1.7,
              }}
            >
              A little proof of the thing we keep saying: your vision, not a version.
            </p>
          </div>

          <div
            style={{
              width: "100%",
              aspectRatio: "16 / 9",
              overflow: "hidden",
              border: "1px solid rgba(214, 184, 112, 0.34)",
              background: "#050505",
            }}
          >
            <video
              src={showcaseVideoSrc}
              controls
              playsInline
              preload="metadata"
              style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
              aria-label="Insturix final intro video"
            >
              <a href={showcaseVideoSrc}>Watch the Insturix intro video.</a>
            </video>
          </div>
        </div>
      </section>
    </main>
  );
}
