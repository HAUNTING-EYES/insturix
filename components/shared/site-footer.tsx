"use client";

/**
 * Site Footer — Insturix Design System v1.0
 *
 * Preserved from current footer:
 *  - Newsletter subscription (formik + react-query)
 *  - Support/Company link groups
 *  - Legal links + social icons
 *
 * Design system compliance:
 *  - All colors via CSS custom properties
 *  - No zinc, no gradients, no backdrop-blur
 *  - Plus Jakarta Sans + JetBrains Mono
 *  - Gold accent for CTA only (Subscribe button)
 *
 * RAMS: minimal. Three sections, nothing decorative.
 * MÜLLER-BROCKMANN: clear hierarchy — newsletter (action) → links (navigation) → legal (fine print).
 */

import Link from "next/link";
import { useFormik } from "formik";
import * as Yup from "yup";
import { Linkedin, Instagram, ArrowRight } from "lucide-react";
import { BsTwitterX } from "react-icons/bs";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";

// ─── Data ───────────────────────────────────────────────────────

const footerSections = [
  {
    heading: "Product",
    links: [
      { label: "Products", href: "/products" },
      { label: "Showcase", href: "/showcase" },
      { label: "Pricing", href: "/upgrade" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Team", href: "/about/team" },
      { label: "Careers", href: "/careers" },
      { label: "Newsroom", href: "/newsroom" },
      { label: "Support us", href: "/support-us" },
      { label: "Contact", href: "/contactus" },
    ],
  },
  {
    heading: "Resources",
    links: [
      { label: "Blog", href: "/resources/blogs" },
      { label: "Tutorials", href: "/resources/tutorials" },
      { label: "Support", href: "/resources/support" },
      { label: "FAQ", href: "/resources/faq" },
    ],
  },
];

const legalLinks = [
  { label: "Terms", href: "/legal/terms" },
  { label: "Privacy", href: "/legal/privacy" },
  { label: "Cancellation", href: "/legal/cancellation-policy" },
  { label: "Refund", href: "/legal/refund-policy" },
  { label: "Contact", href: "/contactus" },
];

const socials = [
  { Icon: BsTwitterX, label: "X", href: "https://x.com/insturix" },
  { Icon: Linkedin, label: "LinkedIn", href: "https://linkedin.com/company/insturix" },
  { Icon: Instagram, label: "Instagram", href: "https://instagram.com/insturix" },
];

// ─── Newsletter ─────────────────────────────────────────────────

const validationSchema = Yup.object({
  email: Yup.string().email("Invalid email").required("Required"),
});

async function subscribeToNewsletter(email: string) {
  const res = await axios.post("/api/newsletter", { email });
  return res.data;
}

function Newsletter() {
  const mutation = useMutation({
    mutationFn: subscribeToNewsletter,
    onSuccess: () => {
      toast({ title: "Subscribed", description: "You'll hear from us soon." });
    },
    onError: () => {
      toast({ title: "Error", description: "Something went wrong. Try again.", variant: "destructive" });
    },
  });

  const formik = useFormik({
    initialValues: { email: "" },
    validationSchema,
    onSubmit: (values, { resetForm }) => {
      mutation.mutate(values.email);
      resetForm();
    },
  });

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border-subtle)",
        padding: "48px 0",
      }}
    >
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 24,
        }}
      >
        <div>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              marginBottom: 4,
              color: "var(--text-primary)",
            }}
          >
            Stay in the loop
          </h3>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Product updates, no spam.
          </p>
        </div>
        <form
          onSubmit={formik.handleSubmit}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <div style={{ position: "relative" }}>
            <input
              type="email"
              placeholder="you@company.com"
              {...formik.getFieldProps("email")}
              style={{
                width: 240,
                padding: "8px 16px",
                background: "var(--bg-deeper)",
                border: `1px solid ${
                  formik.touched.email && formik.errors.email
                    ? "var(--status-danger)"
                    : "var(--border-emphasis)"
                }`,
                borderRadius: 7,
                fontSize: 13,
                color: "var(--text-primary)",
                outline: "none",
                fontFamily: "var(--font-sans)",
                transition: "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
              onFocus={(e) => {
                if (!(formik.touched.email && formik.errors.email)) {
                  e.currentTarget.style.borderColor = "rgba(212, 166, 82, 0.4)";
                }
              }}
              onBlur={(e) => {
                formik.handleBlur(e);
                e.currentTarget.style.borderColor = "var(--border-emphasis)";
              }}
            />
          </div>
          <button
            type="submit"
            disabled={mutation.isPending}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              background: "var(--accent-gold)",
              color: "var(--bg-canvas)",
              border: "none",
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 800,
              cursor: mutation.isPending ? "wait" : "pointer",
              fontFamily: "var(--font-sans)",
              opacity: mutation.isPending ? 0.7 : 1,
              transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            Subscribe
            <ArrowRight size={14} />
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Footer ────────────────────────────────────────────────

export function SiteFooter() {
  return (
    <footer
      style={{
        background: "var(--bg-canvas)",
        borderTop: "1px solid var(--border-subtle)",
      }}
    >
      <Newsletter />

      {/* Link columns */}
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "48px 48px 32px",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 48,
        }}
      >
        {footerSections.map((section) => (
          <div key={section.heading}>
            <span
              className="mono-label"
              style={{ display: "block", marginBottom: 16 }}
            >
              {section.heading}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {section.links.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  style={{
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textDecoration: "none",
                    transition: "color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "0 48px",
        }}
      >
        <div
          style={{
            borderTop: "1px solid var(--border-subtle)",
            padding: "24px 0 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          {/* Left — copyright + legal */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
              fontSize: 13,
              color: "var(--text-dim)",
            }}
          >
            <span>© 2026 Insturix. All rights reserved.</span>
            {legalLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                style={{
                  color: "var(--text-dim)",
                  textDecoration: "none",
                  transition: "color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-dim)";
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right — social icons */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {socials.map(({ Icon, label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  color: "var(--text-dim)",
                  transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                  e.currentTarget.style.background = "var(--bg-well)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-dim)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon size={16} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
