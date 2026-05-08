"use client";

import Link from "next/link";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";

export default function NotFound() {
  return (
    <>
      <SiteNavbar />
      <main style={{
        background: "var(--bg-canvas)", minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--font-sans)", padding: "64px 24px",
      }}>
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <span style={{
            display: "block", fontFamily: "var(--font-mono)", fontSize: 110,
            fontWeight: 800, letterSpacing: "-0.06em", lineHeight: 1,
            color: "var(--text-faint)", marginBottom: 24,
          }}>
            404
          </span>
          <h1 style={{
            fontSize: 24, fontWeight: 500, color: "var(--text-primary)",
            letterSpacing: "-0.02em", marginBottom: 12,
          }}>
            This room doesn&apos;t exist.
          </h1>
          <p style={{
            fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6,
            marginBottom: 32,
          }}>
            The page you&apos;re looking for has been moved or doesn&apos;t exist.
          </p>
          <Link href="/" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "12px 24px", background: "var(--accent-gold)",
            color: "var(--bg-canvas)", fontSize: 13, fontWeight: 500,
            borderRadius: 7, textDecoration: "none",
          }}>
            Back to the floor
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
