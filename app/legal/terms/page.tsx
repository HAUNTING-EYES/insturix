import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions",
};

export default function Terms() {
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
            Terms and Conditions
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-dim)",
              margin: "8px 0 0",
            }}
          >
            Last Updated: April 10, 2025
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
              <li>You own your content. We provide the tools.</li>
              <li>Don&apos;t misuse them.</li>
              <li>We can update these terms.</li>
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
                { id: "welcome", label: "Welcome" },
                { id: "acceptance-of-terms", label: "1. Acceptance of Terms" },
                { id: "services-overview", label: "2. Services Overview" },
                { id: "eligibility", label: "3. Eligibility" },
                { id: "service-plan-terms", label: "4. Service Plan Terms" },
                { id: "user-responsibilities", label: "5. User Responsibilities" },
                { id: "account-registration", label: "6. Account Registration" },
                { id: "payment-and-fees", label: "7. Payment and Fees" },
                { id: "disclaimer", label: "8. Disclaimer of Warranties" },
                { id: "limitation", label: "9. Limitation of Liability" },
                { id: "ip-rights", label: "10. IP Rights" },
                { id: "prohibited", label: "11. Prohibited Conduct" },
                { id: "privacy-policy", label: "12. Privacy Policy" },
                { id: "third-party-links", label: "13. Third-Party Links" },
                { id: "modifications", label: "14. Modification of T&Cs" },
                { id: "termination", label: "15. Termination of Access" },
                { id: "governing-law", label: "16. Governing Law" },
                { id: "contact", label: "17. Contact Information" },
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
            {/* Welcome */}
            <section id="welcome" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                Welcome to INSTURIX!
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
                These Terms and Conditions (&quot;T&Cs&quot;) govern your access to and use of the INSTURIX website and the services provided by INSTURIX (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). By accessing or using the Website, you agree to be bound by these T&Cs.
              </p>
            </section>

            {/* 1. Acceptance of Terms */}
            <section id="acceptance-of-terms" style={{ marginBottom: 48 }}>
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
                Acceptance of Terms
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
                By using this Website, you accept and agree to comply with these T&Cs. If you do not agree to these T&Cs, please do not use the Website.
              </p>
            </section>

            {/* 2. Services Overview */}
            <section id="services-overview" style={{ marginBottom: 48 }}>
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
                Services Overview
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
                We provide digital protection policies and SaaS products for content creators on platforms such as Instagram.
              </p>
            </section>

            {/* 3. Eligibility */}
            <section id="eligibility" style={{ marginBottom: 48 }}>
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
                Eligibility
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
                By using our Website, you confirm that you are at least 18 years old and have the legal capacity to enter into binding agreements.
              </p>
            </section>

            {/* 4. Service Plan Terms */}
            <section id="service-plan-terms" style={{ marginBottom: 48 }}>
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
                Service Plan Terms
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 16px",
                }}
              >
                For clients enrolled in paid service plans or add-on support services:
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
                <li style={{ marginBottom: 8 }}>
                  <strong>Scope:</strong> Detailed information on service access, usage limits, and support coverage is outlined in the applicable plan, order, or service documentation.
                </li>
                <li style={{ marginBottom: 8 }}>
                  <strong>Exclusions:</strong> Certain services, requests, or usage scenarios may be excluded as detailed in the applicable plan, order, or service documentation.
                </li>
                <li>
                  <strong>Non-Insurance Clause:</strong> Insturix services are not insurance products and do not confer legal insurance status.
                </li>
              </ul>
            </section>

            {/* 5. User Responsibilities */}
            <section id="user-responsibilities" style={{ marginBottom: 48 }}>
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
                User Responsibilities
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 16px",
                }}
              >
                By using this Website and/or subscribing to our paid services, you agree to:
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
                <li style={{ marginBottom: 8 }}>Provide accurate, current, and complete information as required.</li>
                <li style={{ marginBottom: 8 }}>Maintain the confidentiality of your account credentials and notify us immediately of any unauthorized use.</li>
                <li>Not engage in activities that violate these T&Cs, any applicable law, or the rights of others.</li>
              </ul>
            </section>

            {/* 6. Account Registration and Security */}
            <section id="account-registration" style={{ marginBottom: 48 }}>
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
                Account Registration and Security
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
                To access certain features, you may be required to create an account. You agree to provide accurate and complete registration information, update your information as necessary, and maintain the security of your account and notify us of any unauthorized access.
              </p>
            </section>

            {/* 7. Payment and Fees */}
            <section id="payment-and-fees" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>07</span>
                Payment and Fees
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
                Fees for our services are detailed on the Website and in the applicable plan, order, or service documentation. Payments are due in full when placing an order or subscribing to a plan. All fees are non-refundable except as specified in our Refund Policy. We reserve the right to modify fees at any time, with prior notice being posted on the Website or sent by email.
              </p>
            </section>

            {/* 8. Disclaimer of Warranties */}
            <section id="disclaimer" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>08</span>
                Disclaimer of Warranties
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
                The Website and all content and services are provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. We disclaim all warranties, express or implied, including but not limited to the accuracy, completeness, or suitability of information on the Website. We do not guarantee uninterrupted, error-free, or virus-free access to the Website.
              </p>
            </section>

            {/* 9. Limitation of Liability */}
            <section id="limitation" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>09</span>
                Limitation of Liability
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
                To the fullest extent permitted by law: INSTURIX and its affiliates shall not be liable for any direct, indirect, incidental, or consequential damages, including but not limited to loss of profits, data, or use, arising from the use of the Website or our services. Our total liability for any claims relating to the use of our services shall be limited to the amount paid by you for the services in the preceding 6 months.
              </p>
            </section>

            {/* 10. Intellectual Property Rights */}
            <section id="ip-rights" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>10</span>
                Intellectual Property Rights
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
                All content on the Website, including but not limited to text, images, logos, and software, is owned by INSTURIX or licensed to us. You are granted a limited, non-exclusive, non-transferable right to access and use the Website for personal and non-commercial purposes. You may not reproduce, distribute, or create derivative works without our express written consent.
              </p>
            </section>

            {/* 11. Prohibited Conduct */}
            <section id="prohibited" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>11</span>
                Prohibited Conduct
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
                You agree not to: engage in any form of data scraping, data extraction, or similar activity; use the Website to infringe on the rights of others or promote illegal activities; or bypass or attempt to bypass any security measures on the Website.
              </p>
            </section>

            {/* 12. Privacy Policy */}
            <section id="privacy-policy" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>12</span>
                Privacy Policy
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
                Our Privacy Policy outlines how we collect, use, and protect your personal information. By using the Website, you agree to the practices described in our Privacy Policy.
              </p>
            </section>

            {/* 13. Third-Party Links */}
            <section id="third-party-links" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>13</span>
                Third-Party Links
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
                Our Website may contain links to third-party websites or resources. We are not responsible for the availability or accuracy of these resources or their content.
              </p>
            </section>

            {/* 14. Modification of T&Cs */}
            <section id="modifications" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>14</span>
                Modification of T&amp;Cs
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
                We reserve the right to modify these T&Cs at any time. Changes will be posted on the Website and, where feasible, notified to users via email. Continued use of the Website after changes are made constitutes acceptance of the new T&Cs.
              </p>
            </section>

            {/* 15. Termination of Access */}
            <section id="termination" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>15</span>
                Termination of Access
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
                We reserve the right to suspend or terminate your access to the Website and services at our discretion, including for any violation of these T&Cs.
              </p>
            </section>

            {/* 16. Governing Law and Dispute Resolution */}
            <section id="governing-law" style={{ marginBottom: 48 }}>
              <h2
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 16px",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>16</span>
                Governing Law and Dispute Resolution
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
                These T&Cs and any disputes arising from them shall be governed by and construed in accordance with the laws of India. Any disputes shall be resolved through arbitration in Delhi, India, in accordance with Indian Arbitration and Conciliation laws.
              </p>
            </section>

            {/* 17. Contact Information */}
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
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>17</span>
                Contact Information
              </h2>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 16px",
                }}
              >
                If you have any questions about these T&Cs, please contact us at:
              </p>
              <div
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                }}
              >
                <p style={{ margin: "0 0 4px", fontWeight: 500 }}>INSTURIX</p>
                <p style={{ margin: "0 0 4px" }}>+91 92201 21372</p>
                <p style={{ margin: "0 0 4px" }}>support@insturix.com</p>
                <p style={{ margin: 0 }}>www.insturix.com</p>
              </div>
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
                By using INSTURIX, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
              </p>
            </section>
          </main>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
