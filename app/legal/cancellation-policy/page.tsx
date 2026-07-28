import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cancellation Policy",
};

export default function CancellationPolicy() {
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
            Cancellation Policy
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
              <li>Cancel anytime.</li>
              <li>Your access continues until the billing period ends.</li>
              <li>No penalties.</li>
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
                { id: "intro", label: "Introduction" },
                { id: "general-policy-overview", label: "1. General Policy Overview" },
                { id: "cancel-subscription-plans", label: "2. Subscription Cancellation" },
                { id: "cancel-commands-orders", label: "3. Commands & Orders" },
                { id: "automated-services", label: "4. Automated Services" },
                { id: "termination-by-insturix", label: "5. Termination by Insturix" },
                { id: "how-to-cancel", label: "6. How to Cancel" },
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
            {/* Introduction */}
            <section id="intro" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                Transparency and Integrity
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
                At <strong>Insturix</strong>, transparency and integrity are at the core of our policies. As we provide AI-driven digital services and tools, this cancellation policy has been drafted to ensure fairness while protecting the integrity of our operations and digital infrastructure.
              </p>
            </section>

            {/* 1. General Policy Overview */}
            <section id="general-policy-overview" style={{ marginBottom: 48 }}>
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
                General Policy Overview
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
                Insturix offers Platform-as-a-service (PaaS) and AI-powered solutions. Due to the automated and digital nature of our Platform, cancellations are only applicable to ongoing subscription plans, not on individual actions or executed commands.
              </p>
            </section>

            {/* 2. Cancellation of Subscription Plans */}
            <section id="cancel-subscription-plans" style={{ marginBottom: 48 }}>
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
                Cancellation of Subscription Plans
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
                <li style={{ marginBottom: 8 }}>Customers have the right to cancel their active subscription plans at any time via their account dashboard.</li>
                <li style={{ marginBottom: 8 }}>Upon cancellation, the subscription remains active until the end of the billing cycle as outlined in the original plan description.</li>
                <li style={{ marginBottom: 8 }}>No refunds or partial refunds will be issued for unused days in the active period.</li>
                <li style={{ marginBottom: 8 }}>All plan-based services and access rights will be automatically terminated at the end of the current billing period.</li>
                <li>Users will receive a confirmation email upon successful cancellation.</li>
              </ul>
            </section>

            {/* 3. Cancellation of Commands, Orders, or Executed Services */}
            <section id="cancel-commands-orders" style={{ marginBottom: 48 }}>
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
                Cancellation of Commands, Orders, or Executed Services
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
                <li style={{ marginBottom: 8 }}>Once a command is executed (e.g., an AI request, project generation, code execution, business report generation, video editing job, etc.), it is final and irreversible.</li>
                <li style={{ marginBottom: 8 }}>This includes actions initiated through Insturix tools such as content planning, generation, editing, analysis, publishing, sharing, or any other automated service.</li>
                <li>No cancellations, pauses, or amendments are permitted after an order or command has been submitted, as our systems allocate computational and human resources in real time.</li>
              </ul>
            </section>

            {/* 4. Automated Services & No Manual Interventions */}
            <section id="automated-services" style={{ marginBottom: 48 }}>
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
                Automated Services &amp; No Manual Interventions
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
                <li style={{ marginBottom: 8 }}>Many Insturix tools operate in real time with minimal human intervention.</li>
                <li style={{ marginBottom: 8 }}>Once a service is triggered, backend systems and AI modules begin immediate processing.</li>
                <li>For this reason, manual override or cancellation requests cannot be accommodated after initiation.</li>
              </ul>
            </section>

            {/* 5. Termination by Insturix */}
            <section id="termination-by-insturix" style={{ marginBottom: 48 }}>
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
                Termination by Insturix
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
                <li style={{ marginBottom: 8 }}>
                  We reserve the right to cancel a user&apos;s access or subscription at our sole discretion in the following cases:
                  <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                    <li style={{ marginBottom: 4 }}>Violation of our Terms of Use</li>
                    <li style={{ marginBottom: 4 }}>Fraudulent behavior or misuse of AI systems</li>
                    <li style={{ marginBottom: 4 }}>Unauthorized commercial redistribution of our services</li>
                    <li>Use of our tools for harmful or unethical purposes</li>
                  </ul>
                </li>
                <li>In such cases, no refund or compensation will be provided.</li>
              </ul>
            </section>

            {/* 6. How to Cancel a Plan */}
            <section id="how-to-cancel" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>06</span>
                How to Cancel a Plan
              </h2>
              <ol
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 24px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 8 }}>Go to your Insturix Account</li>
                <li style={{ marginBottom: 8 }}>Navigate to &quot;Manage Plan&quot; &gt; &quot;Cancel Subscription&quot;</li>
                <li style={{ marginBottom: 8 }}>Follow the confirmation steps</li>
                <li>A confirmation email will be sent immediately</li>
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
                For any cancellation support, contact us at{" "}
                <a href="mailto:support@insturix.com" style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}>
                  support@insturix.com
                </a>
              </p>
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
                By using Insturix, you acknowledge that you have read, understood, and agree to be bound by this Cancellation &amp; Refund Policy.
              </p>
            </section>
          </main>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
