"use client";

import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { motion } from "framer-motion";

const tutorials = [
  {
    title: "Your first video in 5 minutes",
    description:
      "Walk through the Script room, generate shots, and export your first production in under five minutes.",
    difficulty: "Beginner",
    difficultyColor: "var(--status-success)",
    duration: "5 min",
    room: "Script room",
    roomColor: "var(--status-success)",
  },
  {
    title: "Editing uploaded footage",
    description:
      "Upload raw clips, let the AI analyze and cut them, then fine-tune pacing and transitions in the Edit room.",
    difficulty: "Intermediate",
    difficultyColor: "var(--accent-gold)",
    duration: "12 min",
    room: "Edit room",
    roomColor: "var(--accent-gold)",
  },
  {
    title: "Custom brand profiles",
    description:
      "Create a brand profile with your color palette, typography, logo placement, and default pacing rules.",
    difficulty: "Intermediate",
    difficultyColor: "var(--accent-gold)",
    duration: "8 min",
    room: "Design room",
    roomColor: "var(--accent-gold)",
  },
  {
    title: "API integration guide",
    description:
      "Connect Insturix to your pipeline with the REST API. Trigger renders, upload assets, and poll for results.",
    difficulty: "Advanced",
    difficultyColor: "var(--status-danger)",
    duration: "20 min",
    room: "Distribute room",
    roomColor: "var(--status-danger)",
  },
];

export default function TutorialsPage() {
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
            TUTORIALS
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
            Learn the floor
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
            Step-by-step guides for every room in the production pipeline.
          </motion.p>
        </section>

        {/* Tutorial cards */}
        <section
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px 64px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {tutorials.map((tut, index) => (
              <motion.div
                key={tut.title}
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
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                {/* Left: difficulty badge */}
                <div style={{ flexShrink: 0 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      fontWeight: 500,
                      color: tut.difficultyColor,
                      backgroundColor: `color-mix(in srgb, ${tut.difficultyColor} 10%, transparent)`,
                      borderRadius: 4,
                      padding: "4px 12px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tut.difficulty}
                  </span>
                </div>

                {/* Center: title + description */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      margin: "0 0 4px",
                    }}
                  >
                    {tut.title}
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 400,
                      color: "var(--text-secondary)",
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {tut.description}
                  </p>
                </div>

                {/* Right: time + room dot */}
                <div
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 400,
                      color: "var(--text-dim)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tut.duration}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        backgroundColor: tut.roomColor,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-dim)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tut.room}
                    </span>
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
