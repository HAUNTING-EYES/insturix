"use client";

/**
 * Contact Page — D2 Hotline + Status Board
 *
 * Phase 1: Ringing hotline with pulsing rings and "Pick up" CTA
 * Phase 2: Departure-board style form after pickup
 */

import React, { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Headphones } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  subject: Yup.string().required("Subject is required"),
  message: Yup.string().required("Message is required"),
});

async function sendContactForm(data: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  const res = await axios.post("/api/contact", data);
  return res.data;
}

/* ---------- Pulsing ring keyframes (injected once) ---------- */
const pulseKeyframes = `
@keyframes contactPulse {
  0% { transform: scale(1); opacity: 0.4; }
  100% { transform: scale(2); opacity: 0; }
}
`;

/* ---------- Departure-board character flip ---------- */
function FlipLabel({ text, delayBase = 0 }: { text: string; delayBase?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.08em",
        color: "var(--text-dim)",
        textTransform: "uppercase" as const,
      }}
    >
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.35,
            delay: delayBase + i * 0.03,
            ease: EASE,
          }}
          style={{ display: "inline-block", minWidth: char === " " ? 4 : undefined }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

/* ---------- Headset icon ---------- */
function HeadsetIcon({ size = 64 }: { size?: number }) {
  return <Headphones size={size} style={{ color: "var(--accent-gold)" }} strokeWidth={1.5} />;
}

/* ---------- Form field row ---------- */
function FormRow({
  label,
  children,
  index,
}: {
  label: string;
  children: React.ReactNode;
  index: number;
}) {
  return (
    <div
      style={{
        background: "var(--bg-canvas)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "16px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <FlipLabel text={label} delayBase={0.15 + index * 0.12} />
      {children}
    </div>
  );
}

/* ---------- Pipeline step ---------- */
function PipelineStep({
  text,
  delay,
}: {
  text: string;
  delay: number;
}) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        color: "var(--text-dim)",
      }}
    >
      {text}
    </motion.span>
  );
}

/* ---------- Main component ---------- */
export function ContactPage() {
  const [answered, setAnswered] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "We'll get back to you within 4 hours.",
      });
      setSubmitted(true);
      formik.resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Something went wrong. Try again.",
        variant: "destructive",
      });
    },
  });

  const formik = useFormik({
    initialValues: { name: "", email: "", subject: "", message: "" },
    validationSchema,
    onSubmit: (values) => mutation.mutate(values),
  });

  const inputBaseStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    fontSize: 14,
    color: "var(--text-primary)",
    fontFamily: "var(--font-sans)",
    caretColor: "var(--accent-gold)",
    padding: 0,
  };

  return (
    <div
      style={{
        background: "var(--bg-canvas)",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Inject pulse keyframes */}
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />

      <AnimatePresence mode="wait">
        {/* ========== PHASE 1: Ringing ========== */}
        {!answered && (
          <motion.div
            key="ringing"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={() => setAnswered(true)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            {/* Icon + pulsing rings */}
            <div
              style={{
                position: "relative",
                width: 160,
                height: 160,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Ring 1 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1px solid var(--accent-gold)",
                  animation: "contactPulse 2.1s infinite ease-out 0s",
                }}
              />
              {/* Ring 2 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1px solid var(--accent-gold)",
                  animation: "contactPulse 2.1s infinite ease-out 0.7s",
                }}
              />
              {/* Ring 3 */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "50%",
                  border: "1px solid var(--accent-gold)",
                  animation: "contactPulse 2.1s infinite ease-out 1.4s",
                }}
              />
              <HeadsetIcon size={120} />
            </div>

            {/* CTA text */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  lineHeight: 1.2,
                  marginBottom: 8,
                }}
              >
                Pick up.
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                We're ready to talk.
              </div>
            </div>
          </motion.div>
        )}

        {/* ========== PHASE 2: Connected / Status Board Form ========== */}
        {answered && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
            style={{
              width: "100%",
              maxWidth: 600,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {/* Status board header */}
            <div
              style={{
                background: "var(--bg-deeper)",
                height: 48,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 24px",
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
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 500,
                    color: "var(--status-success)",
                    letterSpacing: "0.08em",
                  }}
                >
                  {submitted ? "MESSAGE DELIVERED" : "CONNECTED"}
                </span>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-dim)",
                  letterSpacing: "0.08em",
                }}
              >
                AVG RESPONSE &middot; 4H
              </span>
            </div>

            {/* Post-submit pipeline */}
            {submitted && (
              <div
                style={{
                  background: "var(--bg-deeper)",
                  borderTop: "1px solid var(--border-subtle)",
                  padding: "8px 24px 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <PipelineStep text="Received" delay={0} />
                <PipelineStep text="→" delay={0.2} />
                <PipelineStep text="Routing" delay={0.4} />
                <PipelineStep text="→" delay={0.6} />
                <PipelineStep text="ETA: 4h" delay={0.8} />
              </div>
            )}

            {/* Form body — status board rows */}
            <form onSubmit={formik.handleSubmit}>
              <FormRow label="Name" index={0}>
                <input
                  type="text"
                  placeholder="Your name"
                  {...formik.getFieldProps("name")}
                  style={{
                    ...inputBaseStyle,
                    borderBottom:
                      formik.touched.name && formik.errors.name
                        ? "1px solid var(--status-danger)"
                        : undefined,
                  }}
                />
                {formik.touched.name && formik.errors.name && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--status-danger)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {formik.errors.name}
                  </span>
                )}
              </FormRow>

              <FormRow label="Email" index={1}>
                <input
                  type="email"
                  placeholder="you@company.com"
                  {...formik.getFieldProps("email")}
                  style={{
                    ...inputBaseStyle,
                    borderBottom:
                      formik.touched.email && formik.errors.email
                        ? "1px solid var(--status-danger)"
                        : undefined,
                  }}
                />
                {formik.touched.email && formik.errors.email && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--status-danger)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {formik.errors.email}
                  </span>
                )}
              </FormRow>

              <FormRow label="Subject" index={2}>
                <input
                  type="text"
                  placeholder="What is this about?"
                  {...formik.getFieldProps("subject")}
                  style={{
                    ...inputBaseStyle,
                    borderBottom:
                      formik.touched.subject && formik.errors.subject
                        ? "1px solid var(--status-danger)"
                        : undefined,
                  }}
                />
                {formik.touched.subject && formik.errors.subject && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--status-danger)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {formik.errors.subject}
                  </span>
                )}
              </FormRow>

              <FormRow label="Message" index={3}>
                <textarea
                  placeholder="Tell us more..."
                  rows={4}
                  {...formik.getFieldProps("message")}
                  style={{
                    ...inputBaseStyle,
                    resize: "vertical" as const,
                    borderBottom:
                      formik.touched.message && formik.errors.message
                        ? "1px solid var(--status-danger)"
                        : undefined,
                  }}
                />
                {formik.touched.message && formik.errors.message && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--status-danger)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {formik.errors.message}
                  </span>
                )}
              </FormRow>

              {/* Footer row */}
              <div
                style={{
                  background: "var(--bg-deeper)",
                  padding: "16px 24px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    color: "var(--text-dim)",
                  }}
                >
                  support@insturix.com
                </span>
                <button
                  type="submit"
                  disabled={mutation.isPending || submitted}
                  style={{
                    background: submitted
                      ? "var(--status-success)"
                      : "var(--accent-gold)",
                    color: submitted
                      ? "#fff"
                      : "var(--bg-canvas)",
                    border: "none",
                    borderRadius: 7,
                    padding: "8px 24px",
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: "var(--font-sans)",
                    cursor:
                      mutation.isPending || submitted ? "default" : "pointer",
                    opacity: mutation.isPending ? 0.7 : 1,
                    transition:
                      "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  {submitted
                    ? "Sent ✓"
                    : mutation.isPending
                      ? "Sending..."
                      : "Transmit"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
