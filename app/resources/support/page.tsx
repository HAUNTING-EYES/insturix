"use client";

import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const categories = [
  {
    name: "Getting started",
    articleCount: 4,
    description: "First steps on the production floor",
  },
  {
    name: "Billing & credits",
    articleCount: 3,
    description: "Plans, payments, and credit usage",
  },
  {
    name: "Production floor",
    articleCount: 6,
    description: "Using the six rooms",
  },
  {
    name: "Integrations",
    articleCount: 2,
    description: "API access and third-party tools",
  },
];

export default function SupportPage() {
  return (
    <>
      <SiteNavbar />
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg-canvas)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {/* Hero */}
        <section
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "64px 24px 48px",
            textAlign: "center",
          }}
        >
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ amount: 0.3 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.12em",
              color: "var(--text-dim)",
              textTransform: "uppercase",
              display: "block",
              marginBottom: 12,
            }}
          >
            SUPPORT
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ amount: 0.3 }}
            transition={{
              duration: 0.6,
              delay: 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: "0 0 12px",
              lineHeight: 1.2,
            }}
          >
            How can we help?
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ amount: 0.3 }}
            transition={{
              duration: 0.6,
              delay: 0.16,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: "var(--text-secondary)",
              maxWidth: 440,
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            Browse help articles by category or contact our team directly.
          </motion.p>
        </section>

        {/* Category grid */}
        <section
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px 48px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
            }}
          >
            {categories.map((cat, index) => (
              <motion.div
                key={cat.name}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ amount: 0.3 }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.06,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  backgroundColor: "var(--bg-raised)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  padding: 24,
                }}
              >
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    margin: "0 0 4px",
                  }}
                >
                  {cat.name}
                </p>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 400,
                    color: "var(--text-dim)",
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  {cat.articleCount} articles
                </span>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: "var(--text-secondary)",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {cat.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Contact CTA */}
        <section
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px 64px",
            textAlign: "center",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ amount: 0.3 }}
            transition={{
              duration: 0.5,
              delay: 0.24,
              ease: [0.16, 1, 0.3, 1],
            }}
            style={{
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: 32,
            }}
          >
            <p
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: "var(--text-muted)",
                margin: "0 0 8px",
              }}
            >
              Need more help?
            </p>
            <Link
              href="/contactus"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                fontWeight: 500,
                color: "var(--accent-gold)",
                textDecoration: "none",
              }}
            >
              Contact us
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
