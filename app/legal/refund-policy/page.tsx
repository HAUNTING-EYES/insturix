import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/legal/refund-policy" },
  title: "Refund Policy",
};

export default function RefundPolicy() {
  return (
    <>
      <SiteNavbar />
      <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
        {/* Hero */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "var(--r-section-padding) var(--r-page-padding) 48px",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              margin: 0,
            }}
          >
            LEGAL
          </p>
          <h1
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--r-heading-size)",
              fontWeight: 800,
              color: "var(--text-primary)",
              margin: "8px 0 0",
              lineHeight: 1.2,
            }}
          >
            Refund Policy
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-dim)",
              margin: "8px 0 0",
            }}
          >
            Effective Date: July 13, 2025
          </p>
        </section>

        {/* TL;DR */}
        <section style={{ maxWidth: 960, margin: "0 auto", padding: "0 var(--r-page-padding)" }}>
          <div
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: 24,
              marginBottom: 48,
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
                margin: "0 0 12px",
              }}
            >
              In plain English
            </p>
            <ul
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.7,
                margin: 0,
                paddingLeft: 20,
              }}
            >
              <li>Refunds available within 7 days of purchase.</li>
              <li>Credits are non-refundable after use.</li>
            </ul>
          </div>
        </section>

        {/* Two-column layout */}
        <section className="legal-grid"
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 var(--r-page-padding) var(--r-section-padding)",
            display: "grid",
            gridTemplateColumns: "200px 1fr",
            gap: 48,
          }}
        >
          {/* Sticky TOC */}
          <aside
            style={{
              display: "var(--r-toc-display)" as React.CSSProperties["display"],
              position: "sticky",
              top: 96,
              alignSelf: "start",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text-dim)",
                margin: "0 0 12px",
              }}
            >
              On this page
            </p>
            <nav>
              {[
                { id: "overview", label: "Refund Policy Overview" },
                { id: "no-refund-areas", label: "1. No-Refund Areas" },
                { id: "eligibility-exceptions", label: "2. Exception Cases" },
                { id: "request-process", label: "3. Refund Request Process" },
                { id: "third-party", label: "4. Third-Party Payments" },
                { id: "final-clause", label: "5. Final Clause" },
                { id: "contact", label: "Contact Information" },
              ].map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  style={{
                    display: "block",
                    fontFamily: "var(--font-sans)",
                    fontSize: 13,
                    color: "var(--text-muted)",
                    textDecoration: "none",
                    padding: "4px 0",
                    lineHeight: 1.4,
                  }}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <main style={{ flex: 1, minWidth: 0 }}>
            {/* Overview */}
            <section id="overview" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                Refund Policy Overview
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                Insturix provides advanced AI systems and digital services built on real-time infrastructure. Due to the automated nature of our offerings, refund eligibility is limited and subject to strict conditions.
              </p>
            </section>

            {/* 1. Strict No-Refund Areas */}
            <section id="no-refund-areas" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>01</span>
                Strict No-Refund Areas
              </h2>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 16px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 8 }}>Executed commands and AI actions (e.g., code generations, AI-based video edits, business analytics, content scripts).</li>
                <li style={{ marginBottom: 8 }}>Partially used or fully used subscription periods.</li>
                <li style={{ marginBottom: 8 }}>Services consumed as part of bundled offerings or promotional packages.</li>
                <li style={{ marginBottom: 8 }}>Failure to cancel a subscription before renewal.</li>
                <li style={{ marginBottom: 8 }}>Dissatisfaction after usage without a provable technical error.</li>
                <li>Buyer&apos;s remorse or change of mind.</li>
              </ul>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                Insturix&apos;s systems begin service execution instantly upon receiving commands, making reversals or rollbacks technically and operationally infeasible.
              </p>
            </section>

            {/* 2. Refund Eligibility - Exception Cases */}
            <section id="eligibility-exceptions" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>02</span>
                Refund Eligibility -- Exception Cases
              </h2>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 8 }}><strong>Technical Failure:</strong> If a paid service fails to deliver due to a backend system issue not caused by the user.</li>
                <li style={{ marginBottom: 8 }}><strong>Duplicate Charges:</strong> Verified duplicate payments on the same account within the same billing cycle.</li>
                <li style={{ marginBottom: 8 }}><strong>Payment Gateway Errors:</strong> Accidental double charges due to gateway processing problems (with supporting documentation).</li>
                <li><strong>Pre-execution Cancellation:</strong> In rare cases where a manually placed custom order (not an automated command) is canceled within 2 hours and before service has begun.</li>
              </ul>
            </section>

            {/* 3. Refund Request Process */}
            <section id="request-process" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>03</span>
                Refund Request Process
              </h2>
              <ol
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 16px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 8 }}>
                  Email{" "}
                  <a href="mailto:support@insturix.com" style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}>
                    support@insturix.com
                  </a>
                </li>
                <li>
                  Include:
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20, listStyleType: "disc" }}>
                    <li style={{ marginBottom: 4 }}>Full name and account email</li>
                    <li style={{ marginBottom: 4 }}>Transaction ID(s)</li>
                    <li style={{ marginBottom: 4 }}>Date of payment</li>
                    <li style={{ marginBottom: 4 }}>Reason for request</li>
                    <li>Any applicable screenshots or logs</li>
                  </ul>
                </li>
              </ol>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                Our team will review all refund requests and respond within 5--7 business days. Approved refunds are typically processed within 7--10 business days, depending on your bank/payment provider.
              </p>
            </section>

            {/* 4. Third-Party Payment Services */}
            <section id="third-party" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>04</span>
                Third-Party Payment Services
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                }}
              >
                Insturix is not liable for delays caused by:
              </p>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 16px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 4 }}>Bank processing times</li>
                <li style={{ marginBottom: 4 }}>Payment gateway disruptions</li>
                <li>Currency conversion issues</li>
              </ul>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                However, we will fully cooperate with users to facilitate resolution.
              </p>
            </section>

            {/* 5. Final Clause */}
            <section id="final-clause" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>05</span>
                Final Clause
              </h2>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 8 }}>All refund decisions are made at the sole discretion of Insturix and are considered final.</li>
                <li>Abuse of refund policies may lead to account suspension or termination of account.</li>
              </ul>
            </section>

            {/* Contact Information */}
            <section id="contact" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                Contact Information
              </h2>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                  paddingLeft: 0,
                  listStyleType: "none",
                }}
              >
                <li style={{ marginBottom: 4 }}>
                  Support Email:{" "}
                  <a href="mailto:support@insturix.com" style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}>
                    support@insturix.com
                  </a>
                </li>
                <li style={{ marginBottom: 4 }}>
                  Legal Queries:{" "}
                  <a href="mailto:legal@insturix.com" style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}>
                    legal@insturix.com
                  </a>
                </li>
                <li>
                  Website:{" "}
                  <a href="https://www.insturix.com" style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}>
                    www.insturix.com
                  </a>
                </li>
              </ul>
            </section>

            {/* Acknowledgement */}
            <section style={{ marginBottom: 48 }}>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                By using Insturix, you acknowledge that you have read, understood, and agree to be bound by this Refund Policy.
              </p>
            </section>
          </main>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
