"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type RoomKey = "script" | "edit" | "analyze" | "design" | "distribute" | "share";

interface Room {
  key: RoomKey;
  label: string;
  color: string;
  staffed: boolean;
  teamSize?: string;
}

interface JobPosition {
  title: string;
  room: RoomKey;
  location: string;
  type: string;
  experience: string;
  description: string;
  skills: string[];
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const rooms: Room[] = [
  { key: "script", label: "Content", color: "var(--accent-gold)", staffed: true, teamSize: "3 team members" },
  { key: "edit", label: "Platform", color: "var(--status-danger)", staffed: false },
  { key: "analyze", label: "Intelligence", color: "var(--category-purple)", staffed: false },
  { key: "design", label: "Creative", color: "var(--category-cyan)", staffed: false },
  { key: "distribute", label: "Growth", color: "var(--status-success)", staffed: false },
  { key: "share", label: "Community", color: "var(--category-pink)", staffed: true, teamSize: "2 team members" },
];

const jobPositions: JobPosition[] = [
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

function getHiringRoles(roomKey: RoomKey): JobPosition[] {
  return jobPositions.filter((j) => j.room === roomKey);
}

/* ------------------------------------------------------------------ */
/*  Keyframe style (injected once)                                     */
/* ------------------------------------------------------------------ */

const pulseKeyframes = `
@keyframes constructionPulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes borderPulse {
  0%, 100% { border-color: color-mix(in srgb, var(--room-color) 40%, transparent); }
  50% { border-color: var(--room-color); }
}
`;

/* ------------------------------------------------------------------ */
/*  Motion config                                                      */
/* ------------------------------------------------------------------ */

const ease = [0.16, 1, 0.3, 1] as const;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function RoomCard({ room, index, isMobile = false }: { room: Room; index: number; isMobile?: boolean }) {
  const hiringRoles = getHiringRoles(room.key);
  const isHiring = !room.staffed;
  const roleCount = hiringRoles.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease }}
      viewport={{ amount: 0.2 }}
      style={{
        // @ts-expect-error CSS custom property
        "--room-color": room.color,
        minHeight: isMobile ? 140 : 180,
        backgroundColor: room.staffed ? "var(--bg-raised)" : "transparent",
        border: room.staffed
          ? `1px solid ${room.color}`
          : `2px dashed ${room.color}`,
        borderRadius: 12,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        position: "relative",
        overflow: "hidden",
        ...(isHiring
          ? {
              animation: "borderPulse 2s ease-in-out infinite",
            }
          : {}),
      }}
    >
      {/* Room header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: room.color,
            display: "inline-block",
            flexShrink: 0,
            ...(isHiring
              ? {
                  animation: "constructionPulse 2s ease-in-out infinite",
                  boxShadow: `0 0 8px ${room.color}`,
                }
              : {}),
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fontWeight: 500,
            color: room.color,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {room.label}
        </span>
      </div>

      {/* Status */}
      {room.staffed ? (
        <>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--status-success)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            OPERATIONAL
          </span>
          <span
            style={{
              fontSize: 13,
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              color: "var(--text-secondary)",
            }}
          >
            {room.teamSize}
          </span>
        </>
      ) : (
        <>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fontWeight: 500,
              color: "var(--accent-gold)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            HIRING
          </span>
          <span
            style={{
              fontSize: 13,
              fontFamily: "var(--font-sans)",
              fontWeight: 400,
              color: "var(--text-secondary)",
            }}
          >
            {roleCount} open {roleCount === 1 ? "role" : "roles"}
          </span>

          {/* Role names */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {hiringRoles.map((role) => (
              <span
                key={role.title}
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono)",
                  fontWeight: 400,
                  color: "var(--text-muted)",
                }}
              >
                {role.title}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Construction markers for hiring rooms */}
      {isHiring && (
        <div
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            width: 24,
            height: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect
              x="3"
              y="3"
              width="12"
              height="12"
              rx="2"
              stroke={room.color}
              strokeWidth="1.5"
              strokeDasharray="3 2"
              opacity={0.5}
            />
            <line x1="9" y1="6" x2="9" y2="12" stroke={room.color} strokeWidth="1.5" opacity={0.7} />
            <line x1="6" y1="9" x2="12" y2="9" stroke={room.color} strokeWidth="1.5" opacity={0.7} />
          </svg>
        </div>
      )}
    </motion.div>
  );
}

function PositionCard({ job, index }: { job: JobPosition; index: number }) {
  const room = rooms.find((r) => r.key === job.room);
  if (!room) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.06, ease }}
      viewport={{ amount: 0.15 }}
      style={{
        backgroundColor: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        padding: 24,
        borderLeft: `4px solid ${room.color}`,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Room + construction zone label */}
      <span
        style={{
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          fontWeight: 500,
          color: room.color,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {room.label}{" "}
        <span style={{ color: "var(--text-dim)" }}>/ CONSTRUCTION ZONE</span>
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

      {/* Skills pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
          flexWrap: "wrap",
          gap: "4px 16px",
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

      {/* CTA */}
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
        Join this room <ArrowRight size={13} />
      </Link>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function CareersConstruction() {
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--bg-canvas)",
        color: "var(--text-primary)",
      }}
    >
      {/* Inject keyframes */}
      <style>{pulseKeyframes}</style>

      {/* ---- Hero ---- */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: isMobile ? "80px var(--r-page-padding, 12px) 48px" : "128px 24px 64px",
          textAlign: "center",
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          viewport={{ amount: 0.3 }}
          style={{
            fontSize: "var(--r-hero-size, 44px)",
            fontWeight: 800,
            fontFamily: "var(--font-sans)",
            color: "var(--text-primary)",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          The floor is being built.
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
          Some rooms are ready. Others need you.
        </motion.p>
      </section>

      {/* ---- Floor Plan (3x2 grid) ---- */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: isMobile ? "0 var(--r-page-padding, 12px) 48px" : "0 24px 64px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)",
            gap: 16,
          }}
        >
          {rooms.map((room, i) => (
            <RoomCard key={room.key} room={room} index={i} isMobile={isMobile} />
          ))}
        </div>
      </section>

      {/* ---- Open Positions ---- */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: isMobile ? "0 var(--r-page-padding, 12px) 48px" : "0 24px 64px",
        }}
      >
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
          viewport={{ amount: 0.3 }}
          style={{
            fontSize: 24,
            fontWeight: 500,
            fontFamily: "var(--font-sans)",
            color: "var(--text-primary)",
            margin: "0 0 32px 0",
          }}
        >
          Open positions
        </motion.h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)",
            gap: 16,
          }}
        >
          {jobPositions.map((job, i) => (
            <PositionCard key={job.title} job={job} index={i} />
          ))}
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: isMobile ? "0 var(--r-page-padding, 12px) 80px" : "0 24px 128px",
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
            padding: isMobile ? 24 : 48,
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
            Help us finish the floor.
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
            Every room we complete makes the whole production stronger.
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
  );
}
