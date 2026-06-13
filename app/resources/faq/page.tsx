"use client";

import { useState } from "react";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { motion, AnimatePresence } from "framer-motion";

const faqItems = [
  {
    question: "What is Insturix?",
    answer:
      "Insturix is an automated content production platform for agencies, in-house teams, businesses, enterprises, creator houses, and filmmakers. It helps teams plan, script, edit, analyze, package, publish, and share content from one production workflow.",
  },
  {
    question: "Who is Insturix built for?",
    answer:
      "Insturix is primarily built for agencies, in-house teams, businesses, filmmakers, enterprises, and creator houses that need repeatable production and brand consistency. Individual creators can use it too, but the highest-priority use case is team-based production.",
  },
  {
    question: "How does the content production workflow work?",
    answer:
      "A team can start from a prompt, brief, script, raw footage, or campaign need. Insturix then helps move the work through planning, scripting, editing, analysis, asset creation, music and sound, publishing, and sharing.",
  },
  {
    question: "Is Insturix only a video editor?",
    answer:
      "No. Editing is one part of Insturix, but the product is positioned around the broader production layer: planning, creating, improving, publishing, and keeping content aligned with the brand.",
  },
  {
    question: "Can I upload footage I already have?",
    answer:
      "Yes. Insturix supports workflows where teams bring uploaded material or raw footage into the production process. The goal is to help turn existing assets into finished, review-ready output without rebuilding context across separate tools.",
  },
  {
    question: "What public capabilities does Insturix include?",
    answer:
      "The public workflow includes planning and scripting, editing, analysis, visual asset creation, music and sound, publishing, sharing, and brand profiles. These capability names are the public way to describe the product surface.",
  },
  {
    question: "How do brand profiles help?",
    answer:
      "Brand profiles help preserve tone, pacing, visual style, fonts, colors, and preferences across outputs. They are especially useful for agencies and teams that need to produce consistent content for different brands or campaigns.",
  },
  {
    question: "Does Insturix help with content analysis?",
    answer:
      "Yes. Insturix includes content analysis as part of the production workflow. Analysis can help teams review quality, understand signals, and improve the next output without treating publishing as the end of the process.",
  },
  {
    question: "Does Insturix help create thumbnails and visual assets?",
    answer:
      "Yes. Visual asset creation is part of the public workflow. Teams can use Insturix to create content assets such as thumbnails and campaign visuals while keeping them connected to the same production context.",
  },
  {
    question: "Does Insturix support publishing?",
    answer:
      "Publishing is part of the Insturix workflow. The product is designed to help teams move finished media toward distribution, while specific supported platforms and account-level options should be checked in the current product experience.",
  },
  {
    question: "Can agencies manage multiple client brands?",
    answer:
      "Insturix is designed with agency workflows in mind, including repeated production across different brands and campaigns. Brand profiles help keep each client or campaign context separate and easier to reuse.",
  },
  {
    question: "Is Insturix useful for in-house teams?",
    answer:
      "Yes. In-house teams can use Insturix to keep campaign content, recurring assets, brand rules, and publishing workflows in one place. The main benefit is reducing scattered handoffs while keeping output consistent.",
  },
  {
    question: "Is the output fully autonomous?",
    answer:
      "Insturix is an AI-assisted production workflow, not a promise to replace creative judgment. Teams can guide the brief, review outputs, and control the final direction before publishing.",
  },
  {
    question: "How do pricing and credits work?",
    answer:
      "Pricing, credits, and plan limits can change, so the current pricing page is the best source of truth. Use the pricing page for available plans and contact Insturix for team, agency, or enterprise questions.",
  },
  {
    question: "How do I get support or talk to sales?",
    answer:
      "Use the support page for product help and the contact page for sales or business inquiries. For direct support, Insturix also lists support@insturix.com as the support email.",
  },
];

const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqItems.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.answer,
    },
  })),
};

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  function toggle(index: number) {
    setOpenIndex(openIndex === index ? null : index);
  }

  return (
    <>
      <SiteNavbar />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
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
            padding: "var(--r-section-padding) var(--r-page-padding) 48px",
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
              fontSize: "var(--r-heading-size)",
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
            padding: "0 var(--r-page-padding) var(--r-section-padding)",
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
