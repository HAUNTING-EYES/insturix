"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  HelpCircle,
  BookOpen,
  Play,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EASE = [0.16, 1, 0.3, 1] as const;

const TABS = ["blog", "faq", "support", "tutorials"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  blog: "Blog",
  faq: "FAQ",
  support: "Support",
  tutorials: "Tutorials",
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

type CategoryColor = "gold" | "red" | "purple" | "green" | "cyan" | "pink";

const CATEGORY_COLORS: Record<CategoryColor, string> = {
  gold: "var(--accent-gold)",
  red: "#E5484D",
  purple: "#8E4EC6",
  green: "#30A46C",
  cyan: "#0091FF",
  pink: "#E93D82",
};

interface BlogArticle {
  title: string;
  category: string;
  categoryColor: CategoryColor;
  date: string;
  excerpt: string;
}

const BLOG_ARTICLES: BlogArticle[] = [
  {
    title: "Introducing AI editing — upload footage, get a final cut",
    category: "Product",
    categoryColor: "gold",
    date: "2026-05-01",
    excerpt:
      "Mode 2 is live. Upload raw footage and let the production floor handle the rest — analysis, assembly, color, and export.",
  },
  {
    title: "How the 6-room architecture works",
    category: "Engineering",
    categoryColor: "red",
    date: "2026-04-22",
    excerpt:
      "A deep dive into Script, Analyze, Design, Edit, Review, and Distribute — the rooms that make up every project.",
  },
  {
    title: "Why deterministic beats probabilistic",
    category: "Engineering",
    categoryColor: "red",
    date: "2026-04-15",
    excerpt:
      "LLMs are creative partners, not decision-makers. How rule-driven pipelines deliver consistent, professional output.",
  },
  {
    title: "Building for agencies: lessons from 50 beta users",
    category: "Industry",
    categoryColor: "purple",
    date: "2026-04-08",
    excerpt:
      "What we learned from onboarding production teams — brand profiles, batch processing, and the approval loop.",
  },
  {
    title: "Inside the scoring engine: how Analyze rates your video",
    category: "Engineering",
    categoryColor: "red",
    date: "2026-03-28",
    excerpt:
      "5-track analysis, confidence scoring, and the asset briefing pipeline that powers every editing decision.",
  },
  {
    title: "Production timeline comparison: scattered handoffs versus one workflow",
    category: "Industry",
    categoryColor: "purple",
    date: "2026-03-20",
    excerpt:
      "A practical comparison of traditional post-production handoffs and the Insturix production workflow.",
  },
];

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What’s included in the free plan?",
    answer:
      "The free plan includes 3 projects per month, 720p export, and access to all 6 rooms. No credit card required.",
  },
  {
    question: "Can I upload my own footage?",
    answer:
      "Yes. Mode 2 lets you upload raw footage and the production floor handles analysis, assembly, and finishing automatically.",
  },
  {
    question: "How does credit billing work?",
    answer:
      "Credits are consumed per operation — video generation, analysis passes, and exports. Unused credits roll over monthly.",
  },
  {
    question: "What video formats are supported?",
    answer:
      "We accept MP4, MOV, and WebM for uploads. Exports are available in MP4 (H.264/H.265) up to 4K resolution.",
  },
  {
    question: "Is there an API?",
    answer:
      "Yes. The Insturix API provides programmatic access to all pipeline operations. Documentation is available in the Integrations section.",
  },
  {
    question: "How does enterprise pricing work?",
    answer:
      "Enterprise plans include unlimited projects, dedicated support, custom brand profiles, and SLA guarantees. Contact sales for details.",
  },
];

interface SupportCategory {
  icon: "BookOpen" | "HelpCircle" | "Play" | "ArrowRight";
  name: string;
  articleCount: number;
  description: string;
}

const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    icon: "BookOpen",
    name: "Getting started",
    articleCount: 4,
    description:
      "Account setup, your first project, and navigating the production floor.",
  },
  {
    icon: "HelpCircle",
    name: "Billing & credits",
    articleCount: 3,
    description:
      "Plans, credit usage, invoices, and upgrading your subscription.",
  },
  {
    icon: "Play",
    name: "Production floor",
    articleCount: 6,
    description:
      "Room-by-room guides for Script, Analyze, Design, Edit, Review, and Distribute.",
  },
  {
    icon: "ArrowRight",
    name: "Integrations & API",
    articleCount: 2,
    description:
      "REST API reference, webhooks, and connecting external tools.",
  },
];

const SUPPORT_ICONS = { BookOpen, HelpCircle, Play, ArrowRight };

type Difficulty = "Beginner" | "Intermediate" | "Advanced";

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  Beginner: CATEGORY_COLORS.green,
  Intermediate: CATEGORY_COLORS.gold,
  Advanced: CATEGORY_COLORS.red,
};

interface Tutorial {
  title: string;
  description: string;
  difficulty: Difficulty;
  time: string;
  room: string;
  roomColor: CategoryColor;
}

const TUTORIALS: Tutorial[] = [
  {
    title: "Your first video in 5 minutes",
    description:
      "Walk through creating a project, writing a script, and exporting your first video from the production floor.",
    difficulty: "Beginner",
    time: "5 min",
    room: "Script",
    roomColor: "green",
  },
  {
    title: "Editing uploaded footage",
    description:
      "Upload raw footage in Mode 2 and let the pipeline handle analysis, assembly, and color correction.",
    difficulty: "Intermediate",
    time: "12 min",
    room: "Edit",
    roomColor: "gold",
  },
  {
    title: "Custom brand profiles",
    description:
      "Create brand profiles with typography, color palettes, and pacing rules that apply to every project.",
    difficulty: "Intermediate",
    time: "8 min",
    room: "Design",
    roomColor: "purple",
  },
  {
    title: "API integration guide",
    description:
      "Connect your application to the Insturix API for programmatic project creation, rendering, and export.",
    difficulty: "Advanced",
    time: "20 min",
    room: "Distribute",
    roomColor: "red",
  },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CategoryTag({
  label,
  color,
}: {
  label: string;
  color: string;
}) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color,
      }}
    >
      {label}
    </span>
  );
}

function FaqAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
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
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          style={{
            flexShrink: 0,
            marginLeft: 16,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div
              style={{
                padding: "0 24px 20px",
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                fontFamily: "var(--font-sans)",
              }}
            >
              {item.answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab content renderers                                              */
/* ------------------------------------------------------------------ */

function BlogTab({ articles }: { articles: BlogArticle[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 16,
      }}
    >
      {articles.map((article, i) => (
        <motion.div
          key={article.title}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: i * 0.06, ease: EASE }}
          viewport={{ amount: 0.2 }}
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <CategoryTag
            label={article.category}
            color={CATEGORY_COLORS[article.categoryColor]}
          />
          <div
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: "var(--text-primary)",
              lineHeight: 1.35,
            }}
          >
            {article.title}
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--text-dim)",
            }}
          >
            {article.date}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {article.excerpt}
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--accent-gold)",
              marginTop: "auto",
              cursor: "pointer",
            }}
          >
            Read &rarr;
          </span>
        </motion.div>
      ))}
    </div>
  );
}

function FaqTab({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <motion.div
          key={item.question}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
          viewport={{ amount: 0.2 }}
        >
          <FaqAccordionItem
            item={item}
            isOpen={openIndex === i}
            onToggle={() =>
              setOpenIndex(openIndex === i ? null : i)
            }
          />
        </motion.div>
      ))}
    </div>
  );
}

function SupportTab({ categories }: { categories: SupportCategory[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 16,
      }}
    >
      {categories.map((cat, i) => {
        const Icon = SUPPORT_ICONS[cat.icon];
        return (
          <motion.div
            key={cat.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.06, ease: EASE }}
            viewport={{ amount: 0.2 }}
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              cursor: "pointer",
            }}
          >
            <Icon size={20} style={{ color: "var(--accent-gold)" }} />
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {cat.name}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-dim)",
              }}
            >
              {cat.articleCount} article{cat.articleCount !== 1 ? "s" : ""}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.55,
              }}
            >
              {cat.description}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function TutorialsTab({ tutorials }: { tutorials: Tutorial[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {tutorials.map((tut, i) => (
        <motion.div
          key={tut.title}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.06, ease: EASE }}
          viewport={{ amount: 0.2 }}
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            padding: 24,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: 24,
          }}
        >
          {/* Left: difficulty badge */}
          <div
            style={{
              flexShrink: 0,
              width: 88,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: DIFFICULTY_COLORS[tut.difficulty],
              }}
            >
              {tut.difficulty}
            </span>
          </div>

          {/* Center: title + description */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
                marginBottom: 4,
              }}
            >
              {tut.title}
            </div>
            <div
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              {tut.description}
            </div>
          </div>

          {/* Right: time + room tag */}
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
                color: "var(--text-dim)",
              }}
            >
              {tut.time}
            </span>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: CATEGORY_COLORS[tut.roomColor],
                  display: "inline-block",
                }}
              />
              {tut.room}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ResourcesLibrary() {
  const [activeTab, setActiveTab] = useState<Tab>("blog");
  const [searchTerm, setSearchTerm] = useState<string>("");

  const lowerSearch = searchTerm.toLowerCase().trim();

  /* ---------- Filtered data per tab ---------- */

  const filteredBlog = useMemo(
    () =>
      lowerSearch
        ? BLOG_ARTICLES.filter(
            (a) =>
              a.title.toLowerCase().includes(lowerSearch) ||
              a.excerpt.toLowerCase().includes(lowerSearch) ||
              a.category.toLowerCase().includes(lowerSearch)
          )
        : BLOG_ARTICLES,
    [lowerSearch]
  );

  const filteredFaq = useMemo(
    () =>
      lowerSearch
        ? FAQ_ITEMS.filter(
            (f) =>
              f.question.toLowerCase().includes(lowerSearch) ||
              f.answer.toLowerCase().includes(lowerSearch)
          )
        : FAQ_ITEMS,
    [lowerSearch]
  );

  const filteredSupport = useMemo(
    () =>
      lowerSearch
        ? SUPPORT_CATEGORIES.filter(
            (s) =>
              s.name.toLowerCase().includes(lowerSearch) ||
              s.description.toLowerCase().includes(lowerSearch)
          )
        : SUPPORT_CATEGORIES,
    [lowerSearch]
  );

  const filteredTutorials = useMemo(
    () =>
      lowerSearch
        ? TUTORIALS.filter(
            (t) =>
              t.title.toLowerCase().includes(lowerSearch) ||
              t.description.toLowerCase().includes(lowerSearch) ||
              t.room.toLowerCase().includes(lowerSearch) ||
              t.difficulty.toLowerCase().includes(lowerSearch)
          )
        : TUTORIALS,
    [lowerSearch]
  );

  /* ---------- Tab content map ---------- */

  function renderTabContent() {
    switch (activeTab) {
      case "blog":
        return filteredBlog.length > 0 ? (
          <BlogTab articles={filteredBlog} />
        ) : (
          <EmptyState />
        );
      case "faq":
        return filteredFaq.length > 0 ? (
          <FaqTab items={filteredFaq} />
        ) : (
          <EmptyState />
        );
      case "support":
        return filteredSupport.length > 0 ? (
          <SupportTab categories={filteredSupport} />
        ) : (
          <EmptyState />
        );
      case "tutorials":
        return filteredTutorials.length > 0 ? (
          <TutorialsTab tutorials={filteredTutorials} />
        ) : (
          <EmptyState />
        );
    }
  }

  return (
    <section
      style={{
        background: "var(--bg-canvas)",
        minHeight: "100vh",
        paddingTop: 120,
        paddingBottom: 64,
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: "0 auto",
          padding: "0 24px",
        }}
      >
        {/* ========== Hero ========== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          viewport={{ amount: 0.3 }}
          style={{ marginBottom: 48, textAlign: "center" }}
        >
          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: "var(--text-primary)",
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            The library.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              maxWidth: 420,
              margin: "0 auto",
              lineHeight: 1.5,
            }}
          >
            Everything you need to get the most out of the production floor.
          </p>
        </motion.div>

        {/* ========== Search bar ========== */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
          viewport={{ amount: 0.3 }}
          style={{
            maxWidth: 480,
            margin: "0 auto 40px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--bg-deeper)",
              border: "1px solid var(--border-emphasis)",
              borderRadius: 7,
              padding: "10px 14px",
            }}
          >
            <Search
              size={16}
              style={{
                color: "var(--text-muted)",
                flexShrink: 0,
                fontFamily: "var(--font-mono)",
              }}
            />
            <input
              type="text"
              placeholder="Search resources..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 14,
                color: "var(--text-primary)",
                fontFamily: "var(--font-sans)",
                caretColor: "var(--accent-gold)",
              }}
            />
          </div>
        </motion.div>

        {/* ========== Tab bar ========== */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
          viewport={{ amount: 0.3 }}
          style={{
            display: "flex",
            gap: 24,
            borderBottom: "1px solid var(--border-subtle)",
            marginBottom: 32,
          }}
        >
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: "none",
                border: "none",
                borderBottom:
                  activeTab === tab
                    ? "2px solid var(--accent-gold)"
                    : "2px solid transparent",
                padding: "8px 0 12px",
                fontSize: 13,
                fontWeight: 500,
                color:
                  activeTab === tab
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                transition: "color 0.2s, border-color 0.2s",
              }}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </motion.div>

        {/* ========== Tab content ========== */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab + lowerSearch}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>

        {/* ========== Bottom CTA ========== */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
          viewport={{ amount: 0.3 }}
          style={{
            textAlign: "center",
            marginTop: 64,
          }}
        >
          <span
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
            }}
          >
            Can&apos;t find what you need?{" "}
          </span>
          <Link
            href="/contactus"
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--accent-gold)",
              textDecoration: "none",
            }}
          >
            Contact support
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "48px 0",
      }}
    >
      <Search
        size={24}
        style={{ color: "var(--text-dim)", marginBottom: 12 }}
      />
      <div
        style={{
          fontSize: 14,
          color: "var(--text-muted)",
        }}
      >
        No results found.
      </div>
    </div>
  );
}
