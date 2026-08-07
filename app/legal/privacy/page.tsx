import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/legal/privacy" },
  title: "Privacy Policy",
};

export default function Privacy() {
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
            Privacy Policy
          </h1>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-dim)",
              margin: "8px 0 0",
            }}
          >
            Effective Date: 10 April 2025
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
              <li>We collect what we need to run the service.</li>
              <li>We don&apos;t sell your data.</li>
              <li>You can delete your account.</li>
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
                { id: "welcome", label: "Introduction" },
                { id: "information-we-collect", label: "1. Information We Collect" },
                { id: "how-we-use", label: "2. How We Use Info" },
                { id: "how-we-share", label: "3. How We Share Info" },
                { id: "storage-security", label: "4. Data Storage & Security" },
                { id: "your-rights", label: "5. Your Rights" },
                { id: "cookies-tracking", label: "6. Cookies & Tracking" },
                { id: "third-party-links", label: "7. Third-Party Links" },
                { id: "childrens-privacy", label: "8. Children's Privacy" },
                { id: "changes", label: "9. Changes to Policy" },
                { id: "contact", label: "10. Contact Us" },
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
                Welcome to INSTURIX
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
                We are committed to protecting your privacy and ensuring the security of your personal data. This Privacy Policy explains how we collect, use, disclose, and protect your information when you use our services, including content planning, scripting, editing, analysis, asset creation, publishing, sharing, account management, and related support features.
                <br />
                By accessing or using our services, you agree to the terms outlined in this Privacy Policy.
              </p>
            </section>

            {/* 1. Information We Collect */}
            <section id="information-we-collect" style={{ marginBottom: 48 }}>
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
                Information We Collect
              </h2>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                1.1 Personal Information
              </h3>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 24px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 4 }}>Name, email address, phone number, and other contact details.</li>
                <li style={{ marginBottom: 4 }}>Social media account details (e.g., usernames, follower count, engagement metrics).</li>
                <li>Payment information for subscription-based services.</li>
              </ul>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                1.2 Uploaded Content
              </h3>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 24px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 4 }}>Media files, captions, or other content uploaded for analysis, editing, or promotional purposes.</li>
                <li>Business promotional material submitted for campaigns.</li>
              </ul>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                1.3 Usage Data
              </h3>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 24px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 4 }}>Information about how you use our services (e.g., login times, feature usage, search queries).</li>
                <li>Device information, including IP address, browser type, and operating system.</li>
              </ul>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                1.4 Third-Party Information
              </h3>
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
                <li style={{ marginBottom: 4 }}>Publicly available information from social media platforms for account analysis and verification.</li>
                <li>Business details for creating and managing team workflows, campaigns, or production requests.</li>
              </ul>
            </section>

            {/* 2. How We Use Your Information */}
            <section id="how-we-use" style={{ marginBottom: 48 }}>
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
                How We Use Your Information
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
                <li style={{ marginBottom: 8 }}>Provide and improve our services, including content planning, analysis, editing, account management, and production workflow support.</li>
                <li style={{ marginBottom: 8 }}>Personalize your experience based on your preferences and history.</li>
                <li style={{ marginBottom: 8 }}>Coordinate team, client, or partner collaboration when you use shared workflows.</li>
                <li style={{ marginBottom: 8 }}>Communicate with you about updates, subscriptions, support, and service opportunities.</li>
                <li style={{ marginBottom: 8 }}>Send company updates, product announcements, newsletters, and other informational communications via email to keep you informed about our services and website developments.</li>
                <li style={{ marginBottom: 8 }}>Process payments, manage billing, and issue refunds when applicable.</li>
                <li>Comply with legal obligations and prevent fraud or misuse.</li>
              </ul>
            </section>

            {/* 3. How We Share Your Information */}
            <section id="how-we-share" style={{ marginBottom: 48 }}>
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
                How We Share Your Information
              </h2>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                3.1 Service Providers
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 24px",
                }}
              >
                With trusted third-party providers who assist in hosting, payment processing, and technical support.
              </p>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                3.2 Legal Obligations
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 24px",
                }}
              >
                To comply with laws, regulations, or legal requests.
              </p>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                3.3 Business Transfers
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 24px",
                }}
              >
                In the event of a merger, acquisition, or sale of assets, your data may be transferred to the new entity.
              </p>

              <h3
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  margin: "0 0 8px",
                }}
              >
                3.4 Shared Workflows and Collaboration
              </h3>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                When you use shared workspaces, campaigns, or collaboration features, relevant project details may be shared with approved participants as necessary to support the workflow.
              </p>
            </section>

            {/* 4. Data Storage and Security */}
            <section id="storage-security" style={{ marginBottom: 48 }}>
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
                Data Storage and Security
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
                <li style={{ marginBottom: 8 }}>Your data is stored on secure servers with encryption and access controls.</li>
                <li style={{ marginBottom: 8 }}>We retain your information only as long as necessary to fulfill our services or comply with legal obligations.</li>
                <li>While we strive to protect your data, no system is 100% secure, and we cannot guarantee absolute security.</li>
              </ul>
            </section>

            {/* 5. Your Rights */}
            <section id="your-rights" style={{ marginBottom: 48 }}>
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
                Your Rights
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
                <li style={{ marginBottom: 8 }}><strong>Access and Portability:</strong> Request a copy of your data.</li>
                <li style={{ marginBottom: 8 }}><strong>Correction:</strong> Update or correct inaccurate information.</li>
                <li style={{ marginBottom: 8 }}><strong>Deletion:</strong> Request the deletion of your data, subject to legal requirements.</li>
                <li><strong>Objection:</strong> Opt-out of certain uses of your data, such as marketing emails.</li>
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
                To exercise these rights, contact us at{" "}
                <a href="mailto:support@insturix.com" style={{ color: "var(--text-primary)", fontWeight: 500, textDecoration: "none" }}>
                  support@insturix.com
                </a>
              </p>
            </section>

            {/* 6. Cookies and Tracking Technologies */}
            <section id="cookies-tracking" style={{ marginBottom: 48 }}>
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
                Cookies and Tracking Technologies
              </h2>
              <ul
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: "0 0 8px",
                  paddingLeft: 20,
                }}
              >
                <li style={{ marginBottom: 4 }}>Enhance your experience on our website and services.</li>
                <li style={{ marginBottom: 4 }}>Analyze user behavior to improve our offerings.</li>
                <li>Track campaign performance for creators and businesses.</li>
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
                You can manage cookie preferences in your browser settings.
              </p>
            </section>

            {/* 7. Third-Party Links */}
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
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>07</span>
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
                Our services may include links to third-party websites. We are not responsible for their privacy practices and encourage you to review their policies.
              </p>
            </section>

            {/* 8. Children's Privacy */}
            <section id="childrens-privacy" style={{ marginBottom: 48 }}>
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
                Children&apos;s Privacy
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
                Our services are not intended for individuals under 13 years of age. We do not knowingly collect personal data from children.
              </p>
            </section>

            {/* 9. Changes to This Privacy Policy */}
            <section id="changes" style={{ marginBottom: 48 }}>
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
                Changes to This Privacy Policy
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
                We may update this policy to reflect changes in our practices, services, or legal requirements. Significant changes will be communicated via email or our website.
              </p>
            </section>

            {/* 10. Contact Us */}
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
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)", marginRight: 8 }}>10</span>
                Contact Us
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
                For questions or concerns about this Privacy Policy, contact us at:
              </p>
              <p
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  margin: 0,
                }}
              >
                Email:{" "}
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
                By using INSTURIX, you acknowledge that you have read, understood, and agree to be bound by this Privacy Policy.
              </p>
            </section>
          </main>
        </section>
      </div>
      <SiteFooter />
    </>
  );
}
