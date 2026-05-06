"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";

const jobPositions = [
  {
    title: "Marketing Lead",
    department: "Marketing",
    location: "Remote / Hybrid",
    type: "Full-time",
    experience: "3-5 years",
    description:
      "Lead our marketing strategy and drive growth across all channels. Shape our brand presence and accelerate user acquisition.",
    skills: ["Digital Marketing", "Growth Strategy", "Analytics", "Brand Management"],
  },
  {
    title: "Branding Manager",
    department: "Marketing",
    location: "Remote / Hybrid",
    type: "Full-time",
    experience: "2-4 years",
    description:
      "Define and maintain our brand identity across all touchpoints. Create compelling visual narratives that resonate with creators.",
    skills: ["Brand Strategy", "Visual Design", "Creative Direction", "Content Strategy"],
  },
  {
    title: "Full Stack Developer",
    department: "Engineering",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "2-5 years",
    description:
      "Build and scale our platform using modern web technologies. Work on both frontend experiences and backend infrastructure.",
    skills: ["React", "Node.js", "TypeScript", "Next.js", "Database Design"],
  },
  {
    title: "AI Engineer",
    department: "Engineering",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "3-6 years",
    description:
      "Develop and optimize AI models that power our creator tools. Work on cutting-edge machine learning applications.",
    skills: ["Machine Learning", "Python", "TensorFlow/PyTorch", "AI/ML Pipelines", "Data Science"],
  },
  {
    title: "MLOps Engineer",
    department: "Engineering",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "3-5 years",
    description:
      "Build and maintain ML infrastructure. Ensure our AI models run efficiently and reliably at scale.",
    skills: ["MLOps", "DevOps", "Kubernetes", "AWS/GCP", "CI/CD", "Monitoring"],
  },
  {
    title: "Go-To-Market Strategist",
    department: "Strategy",
    location: "Remote / Hybrid",
    type: "Full-time",
    experience: "4-7 years",
    description:
      "Drive market entry strategies and product launches. Connect our innovation with market opportunities.",
    skills: ["Market Analysis", "Product Strategy", "Business Development", "Partnership Management"],
  },
];

const heroPills = ["Remote-first", "6 open roles", "Production-grade culture"];

export default function Careers() {
  return (
    <>
      <SiteNavbar />
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "var(--bg-canvas)",
          color: "var(--text-primary)",
        }}
      >
        {/* Hero */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "128px 24px 64px",
            textAlign: "center",
          }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ amount: 0.3 }}
            style={{
              fontSize: 44,
              fontWeight: 800,
              fontFamily: "var(--font-sans)",
              color: "var(--text-primary)",
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Build the production floor.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ amount: 0.3 }}
            style={{
              fontSize: 14,
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              color: "var(--text-secondary)",
              marginTop: 16,
              maxWidth: 560,
              marginLeft: "auto",
              marginRight: "auto",
              lineHeight: 1.6,
            }}
          >
            We&apos;re looking for people who think in systems, ship with precision,
            and care about craft.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ amount: 0.3 }}
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 12,
              marginTop: 32,
              flexWrap: "wrap",
            }}
          >
            {heroPills.map((label) => (
              <span
                key={label}
                style={{
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  backgroundColor: "var(--bg-deeper)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 4,
                  padding: "4px 12px",
                  letterSpacing: "0.03em",
                  textTransform: "uppercase",
                }}
              >
                {label}
              </span>
            ))}
          </motion.div>
        </section>

        {/* Open Roles */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px 64px",
          }}
        >
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ amount: 0.3 }}
            style={{
              fontSize: 24,
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              color: "var(--text-primary)",
              marginBottom: 32,
            }}
          >
            Open roles
          </motion.h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 16,
            }}
          >
            {jobPositions.map((job, i) => (
              <motion.div
                key={job.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.45,
                  delay: i * 0.07,
                  ease: [0.16, 1, 0.3, 1],
                }}
                viewport={{ amount: 0.15 }}
                style={{
                  backgroundColor: "var(--bg-raised)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                {/* Top: department + hiring dot */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      color: "var(--text-dim)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {job.department}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      color: "var(--status-success)",
                      letterSpacing: "0.03em",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: "var(--status-success)",
                        display: "inline-block",
                      }}
                    />
                    Hiring
                  </span>
                </div>

                {/* Title */}
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    fontFamily: "var(--font-sans)",
                    color: "var(--text-primary)",
                    margin: 0,
                    lineHeight: 1.3,
                  }}
                >
                  {job.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    fontSize: 13,
                    fontFamily: "var(--font-sans)",
                    fontWeight: 400,
                    color: "var(--text-secondary)",
                    margin: 0,
                    lineHeight: 1.55,
                  }}
                >
                  {job.description}
                </p>

                {/* Skills */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {job.skills.map((skill) => (
                    <span
                      key={skill}
                      style={{
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 400,
                        color: "var(--text-muted)",
                        backgroundColor: "var(--bg-deeper)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 4,
                        padding: "4px 12px",
                      }}
                    >
                      {skill}
                    </span>
                  ))}
                </div>

                {/* Meta row */}
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 400,
                    color: "var(--text-dim)",
                  }}
                >
                  <span>{job.location}</span>
                  <span>{job.type}</span>
                  <span>{job.experience}</span>
                </div>

                {/* Apply CTA */}
                <Link
                  href="/contactus"
                  style={{
                    fontSize: 13,
                    fontFamily: "var(--font-sans)",
                    fontWeight: 500,
                    color: "var(--accent-gold)",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    marginTop: "auto",
                  }}
                >
                  Apply <ArrowRight size={13} />
                </Link>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Bottom CTA */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px 128px",
            textAlign: "center",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            viewport={{ amount: 0.3 }}
            style={{
              backgroundColor: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: 48,
            }}
          >
            <h2
              style={{
                fontSize: 24,
                fontWeight: 500,
                fontFamily: "var(--font-sans)",
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              Don&apos;t see your role?
            </h2>
            <p
              style={{
                fontSize: 14,
                fontFamily: "var(--font-sans)",
                fontWeight: 400,
                color: "var(--text-secondary)",
                marginTop: 12,
                marginBottom: 32,
              }}
            >
              Send us a note — we read every application.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <Link
                href="/contactus"
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  color: "var(--bg-canvas)",
                  backgroundColor: "var(--accent-gold)",
                  border: "none",
                  borderRadius: 7,
                  padding: "12px 24px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  transition: "opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                Get in touch
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/about"
                style={{
                  fontSize: 13,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  backgroundColor: "transparent",
                  border: "1px solid var(--border-emphasis)",
                  borderRadius: 7,
                  padding: "12px 24px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  transition: "border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                Learn about us
              </Link>
            </div>
          </motion.div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
