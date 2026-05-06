"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";

type RoomKey = "script" | "edit" | "analyze" | "design" | "distribute" | "share";

const roomColors: Record<RoomKey, string> = {
  script: "var(--accent-gold)",
  edit: "var(--status-danger)",
  analyze: "var(--category-purple)",
  design: "var(--category-cyan)",
  distribute: "var(--status-success)",
  share: "var(--category-pink)",
};

const rooms: { key: RoomKey; label: string }[] = [
  { key: "script", label: "Script" },
  { key: "edit", label: "Edit" },
  { key: "analyze", label: "Analyze" },
  { key: "design", label: "Design" },
  { key: "distribute", label: "Distribute" },
  { key: "share", label: "Share" },
];

interface JobPosition {
  title: string;
  room: RoomKey;
  location: string;
  type: string;
  experience: string;
  description: string;
  skills: string[];
}

const jobPositions: JobPosition[] = [
  {
    title: "Marketing Lead",
    room: "distribute",
    location: "Remote / Hybrid",
    type: "Full-time",
    experience: "3-5 years",
    description:
      "Lead our marketing strategy and drive growth across all channels. Shape our brand presence and accelerate user acquisition.",
    skills: ["Digital Marketing", "Growth Strategy", "Analytics", "Brand Management"],
  },
  {
    title: "Branding Manager",
    room: "design",
    location: "Remote / Hybrid",
    type: "Full-time",
    experience: "2-4 years",
    description:
      "Define and maintain our brand identity across all touchpoints. Create compelling visual narratives that resonate with creators.",
    skills: ["Brand Strategy", "Visual Design", "Creative Direction", "Content Strategy"],
  },
  {
    title: "Full Stack Developer",
    room: "edit",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "2-5 years",
    description:
      "Build and scale our platform using modern web technologies. Work on both frontend experiences and backend infrastructure.",
    skills: ["React", "Node.js", "TypeScript", "Next.js", "Database Design"],
  },
  {
    title: "AI Engineer",
    room: "analyze",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "3-6 years",
    description:
      "Develop and optimize AI models that power our creator tools. Work on cutting-edge machine learning applications.",
    skills: ["Machine Learning", "Python", "TensorFlow/PyTorch", "AI/ML Pipelines", "Data Science"],
  },
  {
    title: "MLOps Engineer",
    room: "edit",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "3-5 years",
    description:
      "Build and maintain ML infrastructure. Ensure our AI models run efficiently and reliably at scale.",
    skills: ["MLOps", "DevOps", "Kubernetes", "AWS/GCP", "CI/CD", "Monitoring"],
  },
  {
    title: "Go-To-Market Strategist",
    room: "distribute",
    location: "Remote / Hybrid",
    type: "Full-time",
    experience: "4-7 years",
    description:
      "Drive market entry strategies and product launches. Connect our innovation with market opportunities.",
    skills: ["Market Analysis", "Product Strategy", "Business Development", "Partnership Management"],
  },
];

function getRoleCount(roomKey: RoomKey): number {
  return jobPositions.filter((j) => j.room === roomKey).length;
}

const ease = [0.16, 1, 0.3, 1] as const;

export default function Careers() {
  const [selectedRoom, setSelectedRoom] = useState<string>("all");

  const filteredJobs =
    selectedRoom === "all"
      ? jobPositions
      : jobPositions.filter((j) => j.room === selectedRoom);

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
            transition={{ duration: 0.5, ease }}
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
            transition={{ duration: 0.5, delay: 0.1, ease }}
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
            Every room needs a crew. Find yours.
          </motion.p>
        </section>

        {/* Room selector strip */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px 48px",
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15, ease }}
            viewport={{ amount: 0.3 }}
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {/* All rooms pill */}
            <button
              onClick={() => setSelectedRoom("all")}
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                color:
                  selectedRoom === "all"
                    ? "var(--text-primary)"
                    : "var(--text-muted)",
                backgroundColor:
                  selectedRoom === "all"
                    ? "var(--bg-well)"
                    : "var(--bg-raised)",
                border:
                  selectedRoom === "all"
                    ? "1px solid var(--border-emphasis)"
                    : "1px solid var(--border-subtle)",
                borderRadius: 7,
                padding: "8px 16px",
                cursor: "pointer",
                letterSpacing: "0.03em",
                transition:
                  "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1), color 0.25s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              All rooms
            </button>

            {rooms.map((room) => {
              const count = getRoleCount(room.key);
              const isActive = selectedRoom === room.key;
              return (
                <button
                  key={room.key}
                  onClick={() => setSelectedRoom(room.key)}
                  style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    color: isActive
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                    backgroundColor: isActive
                      ? "var(--bg-well)"
                      : "var(--bg-raised)",
                    border: isActive
                      ? `1px solid ${roomColors[room.key]}`
                      : "1px solid var(--border-subtle)",
                    borderRadius: 7,
                    padding: "8px 16px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    letterSpacing: "0.03em",
                    transition:
                      "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1), color 0.25s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      backgroundColor: roomColors[room.key],
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  {room.label}
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-dim)",
                      fontWeight: 400,
                    }}
                  >
                    {count} {count === 1 ? "role" : "roles"}
                  </span>
                </button>
              );
            })}
          </motion.div>
        </section>

        {/* Role cards */}
        <section
          style={{
            maxWidth: 960,
            margin: "0 auto",
            padding: "0 24px 64px",
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedRoom}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease }}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 16,
              }}
            >
              {filteredJobs.map((job, i) => (
                <motion.div
                  key={job.title}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.45,
                    delay: i * 0.06,
                    ease,
                  }}
                  viewport={{ amount: 0.15 }}
                  style={{
                    backgroundColor: "var(--bg-raised)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 12,
                    padding: 24,
                    borderLeft: `4px solid ${roomColors[job.room]}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                  }}
                >
                  {/* Room label */}
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      color: roomColors[job.room],
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {rooms.find((r) => r.key === job.room)?.label}
                  </span>

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
                    <span>&middot;</span>
                    <span>{job.type}</span>
                    <span>&middot;</span>
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
            </motion.div>
          </AnimatePresence>
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
            transition={{ duration: 0.5, ease }}
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
              Don&apos;t see your room?
            </h2>
            <p
              style={{
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                fontWeight: 400,
                color: "var(--text-secondary)",
                marginTop: 12,
                marginBottom: 32,
              }}
            >
              We&apos;re always expanding the floor. Tell us where you fit.
            </p>
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
          </motion.div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
