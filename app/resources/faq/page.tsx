"use client";

import { useState } from "react";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { motion, AnimatePresence } from "framer-motion";

const faqItems = [
  {
    question: "What is Insturix?",
    answer:
      "Insturix is an AI-powered video production platform that transforms scripts into fully edited videos. It handles everything from shot composition and pacing to color grading and sound design, giving you studio-quality output without the traditional production overhead.",
  },
  {
    question: "How does AI editing work?",
    answer:
      "You provide a script or upload raw footage, and our six-room production pipeline takes over. The AI analyzes your content for creative intent, selects optimal cuts and transitions, applies cinematic color and sound, then renders the final deliverable. Every decision is rule-driven, not random.",
  },
  {
    question: "What's included in each plan?",
    answer:
      "Each plan includes access to the full production floor, a set number of monthly credits, export in multiple resolutions, and priority rendering. Higher tiers add API access, custom brand profiles, dedicated support, and increased storage and rendering limits.",
  },
  {
    question: "Can I upload my own footage?",
    answer:
      "Yes. Mode 2 lets you upload raw video clips, and the AI edits them into a polished cut. It analyzes each clip for content, motion, and audio, then assembles them according to your script or creative direction.",
  },
  {
    question: "What video formats are supported?",
    answer:
      "We accept MP4, MOV, and WebM on input. Exports are available in MP4 at 720p, 1080p, and 4K resolution. Aspect ratios include 16:9, 9:16, and 1:1 to cover landscape, vertical, and square formats.",
  },
  {
    question: "Is there an API?",
    answer:
      "Yes. The Insturix API lets you trigger production runs, upload assets, and retrieve finished videos programmatically. API access is available on Pro and Enterprise plans. Full documentation is available in the developer portal.",
  },
  {
    question: "How do credits work?",
    answer:
      "Each production run consumes credits based on video duration, resolution, and complexity. One credit typically covers one minute of standard-definition output. Credits refresh monthly and unused credits do not roll over.",
  },
  {
    question: "How do I cancel?",
    answer:
      "You can cancel your subscription at any time from your account settings. Your access continues until the end of the current billing period. There are no cancellation fees or long-term contracts.",
  },
];

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index);
  }

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
            FAQ
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
            Frequently asked questions
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
            Everything you need to know about the platform, pricing, and
            production workflow.
          </motion.p>
        </section>

        {/* Accordion */}
        <section
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 24px 64px",
          }}
        >
          <div
            style={{
              borderTop: "1px solid var(--border-subtle)",
            }}
          >
            {faqItems.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ amount: 0.3 }}
                transition={{
                  duration: 0.5,
                  delay: index * 0.04,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <button
                  onClick={() => toggle(index)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "16px 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--text-primary)",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    {item.question}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      color: "var(--text-dim)",
                      flexShrink: 0,
                      marginLeft: 16,
                      transition: "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
                      transform:
                        openIndex === index ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    +
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {openIndex === index && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        duration: 0.35,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          backgroundColor: "var(--bg-deeper)",
                          borderRadius: 7,
                          padding: "12px 16px",
                          marginBottom: 16,
                        }}
                      >
                        <p
                          style={{
                            fontSize: 13,
                            fontWeight: 400,
                            color: "var(--text-secondary)",
                            lineHeight: 1.7,
                            margin: 0,
                          }}
                        >
                          {item.answer}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
