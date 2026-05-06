"use client";

/**
 * ContactReception — "The Reception Terminal"
 *
 * The form IS a production floor terminal. Dark chrome, mono labels, topbar.
 * Room routing strip shows where the message goes. Submit triggers a mini
 * pipeline animation: Received -> Routing -> Assigned -> ETA.
 */

import React, { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ─── Room definitions ─── */
const ROOMS = [
  { id: "script", label: "Script", color: "var(--accent-gold)" },
  { id: "edit", label: "Edit", color: "var(--status-danger)" },
  { id: "analyze", label: "Analyze", color: "var(--category-cyan)" },
  { id: "design", label: "Design", color: "var(--category-purple)" },
  { id: "distribute", label: "Distribute", color: "var(--status-success)" },
  { id: "share", label: "Share", color: "var(--category-pink)" },
] as const;

/* ─── Topic -> room mapping ─── */
const TOPICS = [
  { id: "demo", label: "Demo", room: "script" },
  { id: "support", label: "Support", room: "edit" },
  { id: "partnership", label: "Partnership", room: "distribute" },
  { id: "general", label: "General", room: null },
] as const;

const TOPIC_LABELS: Record<string, string> = {
  demo: "Sales",
  support: "Support",
  partnership: "Partnerships",
  general: "General",
};

/* ─── Validation ─── */
const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  message: Yup.string().required("Message is required"),
});

async function sendContactForm(data: {
  name: string;
  email: string;
  topic: string;
  message: string;
}) {
  const res = await axios.post("/api/contact", data);
  return res.data;
}

/* ─── Shared input style ─── */
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  background: "var(--bg-deeper)",
  border: "1px solid var(--border-emphasis)",
  borderRadius: 7,
  fontSize: 14,
  color: "var(--text-primary)",
  outline: "none",
  fontFamily: "var(--font-sans)",
  transition: "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
};

export function ContactReception() {
  const [topic, setTopic] = useState<string>("general");
  const [submitted, setSubmitted] = useState<boolean>(false);

  const activeRoom = TOPICS.find((t) => t.id === topic)?.room ?? null;

  const mutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Message transmitted",
        description: "Routed to the right team.",
      });
    },
    onError: () => {
      toast({
        title: "Transmission failed",
        description: "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const formik = useFormik({
    initialValues: { name: "", email: "", message: "" },
    validationSchema,
    onSubmit: (values) =>
      mutation.mutate({ ...values, topic }),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ margin: "-48px" }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
      }}
    >
      {/* ─── The Terminal Card ─── */}
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          background: "var(--bg-raised)",
          borderRadius: 12,
          border: "1px solid var(--border-subtle)",
          overflow: "hidden",
        }}
      >
        {/* Topbar */}
        <div
          style={{
            height: 32,
            background: "var(--bg-deeper)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--status-success)",
              }}
            />
            <span
              style={{
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                fontWeight: 500,
                color: "var(--text-secondary)",
                letterSpacing: "0.08em",
              }}
            >
              RECEPTION
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              color: "var(--status-success)",
              letterSpacing: "0.04em",
            }}
          >
            ONLINE
          </span>
        </div>

        {/* ─── Room routing strip ─── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "12px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-canvas)",
          }}
        >
          {ROOMS.map((room) => {
            const isActive = activeRoom === room.id;
            return (
              <motion.div
                key={room.id}
                animate={{
                  opacity: isActive ? 1 : 0.25,
                  scale: isActive ? 1.08 : 1,
                }}
                transition={{ duration: 0.3, ease: EASE }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {/* Room icon circle */}
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 7,
                    background: isActive
                      ? `color-mix(in srgb, ${room.color} 15%, transparent)`
                      : "var(--bg-deeper)",
                    border: `1px solid ${isActive ? room.color : "var(--border-subtle)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition:
                      "background 0.3s cubic-bezier(0.16,1,0.3,1), border-color 0.3s cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      color: isActive ? room.color : "var(--text-dim)",
                      transition:
                        "color 0.3s cubic-bezier(0.16,1,0.3,1)",
                    }}
                  >
                    {room.label.charAt(0)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: isActive ? room.color : "var(--text-dim)",
                    letterSpacing: "0.04em",
                    transition:
                      "color 0.3s cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  {room.label}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* ─── Terminal body ─── */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Topic selector pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {TOPICS.map((t) => {
              const isActive = topic === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTopic(t.id);
                    setSubmitted(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 7,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "var(--font-sans)",
                    cursor: "pointer",
                    background: isActive
                      ? "transparent"
                      : "var(--bg-deeper)",
                    border: isActive
                      ? "1px solid var(--accent-gold)"
                      : "1px solid var(--border-emphasis)",
                    color: isActive
                      ? "var(--accent-gold)"
                      : "var(--text-secondary)",
                    transition:
                      "border-color 0.25s cubic-bezier(0.16,1,0.3,1), color 0.25s cubic-bezier(0.16,1,0.3,1)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Form fields */}
          <form
            onSubmit={formik.handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {/* Name + Email row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label
                  className="mono-label"
                  style={{ display: "block", marginBottom: 8 }}
                >
                  Name
                </label>
                <input
                  type="text"
                  placeholder="Your name"
                  {...formik.getFieldProps("name")}
                  style={{
                    ...inputStyle,
                    borderColor:
                      formik.touched.name && formik.errors.name
                        ? "var(--status-danger)"
                        : "var(--border-emphasis)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-gold)";
                  }}
                  onBlur={(e) => {
                    formik.handleBlur(e);
                    e.currentTarget.style.borderColor = "var(--border-emphasis)";
                  }}
                />
                {formik.touched.name && formik.errors.name && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--status-danger)",
                      marginTop: 4,
                      display: "block",
                    }}
                  >
                    {formik.errors.name}
                  </span>
                )}
              </div>
              <div>
                <label
                  className="mono-label"
                  style={{ display: "block", marginBottom: 8 }}
                >
                  Email
                </label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  {...formik.getFieldProps("email")}
                  style={{
                    ...inputStyle,
                    borderColor:
                      formik.touched.email && formik.errors.email
                        ? "var(--status-danger)"
                        : "var(--border-emphasis)",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent-gold)";
                  }}
                  onBlur={(e) => {
                    formik.handleBlur(e);
                    e.currentTarget.style.borderColor = "var(--border-emphasis)";
                  }}
                />
                {formik.touched.email && formik.errors.email && (
                  <span
                    style={{
                      fontSize: 11,
                      color: "var(--status-danger)",
                      marginTop: 4,
                      display: "block",
                    }}
                  >
                    {formik.errors.email}
                  </span>
                )}
              </div>
            </div>

            {/* Message textarea */}
            <div>
              <label
                className="mono-label"
                style={{ display: "block", marginBottom: 8 }}
              >
                Message
              </label>
              <textarea
                placeholder="Tell us more..."
                rows={5}
                {...formik.getFieldProps("message")}
                style={{
                  ...inputStyle,
                  resize: "vertical" as const,
                  minHeight: 120,
                  borderColor:
                    formik.touched.message && formik.errors.message
                      ? "var(--status-danger)"
                      : "var(--border-emphasis)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--accent-gold)";
                }}
                onBlur={(e) => {
                  formik.handleBlur(e);
                  e.currentTarget.style.borderColor = "var(--border-emphasis)";
                }}
              />
              {formik.touched.message && formik.errors.message && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--status-danger)",
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  {formik.errors.message}
                </span>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={mutation.isPending || submitted}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                padding: "14px 24px",
                background: submitted
                  ? "var(--status-success)"
                  : "var(--accent-gold)",
                color: "var(--bg-canvas)",
                border: "none",
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 500,
                cursor: mutation.isPending || submitted ? "default" : "pointer",
                fontFamily: "var(--font-sans)",
                opacity: mutation.isPending ? 0.7 : 1,
                transition:
                  "opacity 0.25s cubic-bezier(0.16,1,0.3,1), background 0.35s cubic-bezier(0.16,1,0.3,1)",
              }}
            >
              {mutation.isPending
                ? "Transmitting..."
                : submitted
                  ? "Transmitted"
                  : "Transmit"}
            </button>

            {/* ─── Pipeline animation ─── */}
            <AnimatePresence>
              {submitted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: "16px",
                    background: "var(--bg-deeper)",
                    borderRadius: 7,
                    border: "1px solid var(--border-subtle)",
                    overflow: "hidden",
                  }}
                >
                  {/* Step 1 — Received */}
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0, ease: EASE }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--status-success)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-secondary)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Message received
                    </span>
                  </motion.div>

                  {/* Step 2 — Routing */}
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.5, ease: EASE }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--accent-gold)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-secondary)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Routing to {TOPIC_LABELS[topic] ?? "General"}
                    </span>
                  </motion.div>

                  {/* Step 3 — ETA */}
                  <motion.div
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 1.0, ease: EASE }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "var(--category-cyan)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: "var(--font-mono)",
                        color: "var(--text-secondary)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Expected response: 4 hours
                    </span>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        </div>
      </div>

      {/* ─── Footer line ─── */}
      <motion.span
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ margin: "-24px" }}
        transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
          letterSpacing: "0.04em",
          textAlign: "center",
        }}
      >
        contact@insturix.com &middot; Under 24h response
      </motion.span>
    </motion.div>
  );
}
