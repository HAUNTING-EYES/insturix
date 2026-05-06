"use client";

/**
 * ContactHotline — "The Hotline"
 *
 * Full-screen dark page. Massive gold headset icon with pulsing concentric rings.
 * "Pick up." — user clicks — rings stop, icon scales down, form slides up.
 * Physical metaphor: picking up a ringing phone to connect.
 */

import React, { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ─── Validation ─── */
const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  message: Yup.string().required("Message is required"),
});

async function sendContactForm(data: {
  name: string;
  email: string;
  message: string;
}) {
  const res = await axios.post("/api/contact", data);
  return res.data;
}

/* ─── Headset SVG ─── */
function HeadsetIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Headband arc */}
      <path
        d="M12 36 C12 20 20 8 32 8 C44 8 52 20 52 36"
        stroke="var(--accent-gold)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      {/* Left earpiece */}
      <rect
        x="8"
        y="32"
        width="8"
        height="16"
        rx="4"
        fill="var(--accent-gold)"
      />
      {/* Right earpiece */}
      <rect
        x="48"
        y="32"
        width="8"
        height="16"
        rx="4"
        fill="var(--accent-gold)"
      />
      {/* Microphone arm */}
      <path
        d="M48 44 C48 52 42 56 36 56"
        stroke="var(--accent-gold)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Mic tip */}
      <circle cx="36" cy="56" r="3" fill="var(--accent-gold)" />
    </svg>
  );
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

/* ─── Ring animation keyframes (injected once) ─── */
const ringKeyframes = `
@keyframes hotline-pulse {
  0% {
    transform: scale(1);
    opacity: 0.4;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}
`;

export function ContactHotline() {
  const [answered, setAnswered] = useState(false);
  const [sent, setSent] = useState(false);

  const mutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      setSent(true);
      toast({
        title: "Message sent",
        description: "We'll get back to you within 24 hours.",
      });
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
    initialValues: { name: "", email: "", message: "" },
    validationSchema,
    onSubmit: (values) => mutation.mutate(values),
  });

  return (
    <div
      style={{
        background: "var(--bg-canvas)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        padding: "64px 24px",
      }}
    >
      {/* Inject ring keyframes */}
      <style>{ringKeyframes}</style>

      <AnimatePresence mode="wait">
        {!answered ? (
          /* ─── RINGING STATE ─── */
          <motion.button
            key="ringing"
            type="button"
            onClick={() => setAnswered(true)}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            viewport={{ margin: "-48px" }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 24,
              padding: 0,
              position: "relative",
            }}
          >
            {/* Icon + rings container */}
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
              {/* Concentric pulsing rings */}
              {[0, 0.7, 1.4].map((delay, i) => (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: 80,
                    height: 80,
                    marginTop: -40,
                    marginLeft: -40,
                    border: "2px solid var(--accent-gold)",
                    borderRadius: "50%",
                    animation: `hotline-pulse 2.1s infinite`,
                    animationDelay: `${delay}s`,
                    pointerEvents: "none",
                  }}
                />
              ))}
              {/* Headset icon */}
              <HeadsetIcon size={64} />
            </div>

            {/* CTA text */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "-0.02em",
                }}
              >
                Pick up.
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-sans)",
                  fontWeight: 400,
                }}
              >
                We&apos;re ready to talk.
              </span>
            </div>
          </motion.button>
        ) : (
          /* ─── ANSWERED STATE — form card ─── */
          <motion.div
            key="answered"
            initial={{ opacity: 0, y: 48 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: EASE }}
            style={{
              width: "100%",
              maxWidth: 560,
              background: "var(--bg-raised)",
              borderRadius: 12,
              border: "1px solid var(--border-subtle)",
              padding: 32,
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {/* Header: icon + title + green dot */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <HeadsetIcon size={24} />
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-sans)",
                  letterSpacing: "-0.01em",
                }}
              >
                You&apos;re connected.
              </span>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--status-success)",
                  flexShrink: 0,
                }}
              />
            </div>

            {/* Form */}
            <form
              onSubmit={formik.handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {/* Name */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  NAME
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

              {/* Email */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  EMAIL
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

              {/* Message */}
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: 8,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    color: "var(--text-muted)",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  MESSAGE
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

              {/* Submit — "Hang up" */}
              <button
                type="submit"
                disabled={mutation.isPending || sent}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  padding: "14px 24px",
                  background: sent
                    ? "var(--status-success)"
                    : "var(--accent-gold)",
                  color: "var(--bg-canvas)",
                  border: "none",
                  borderRadius: 7,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor:
                    mutation.isPending || sent ? "default" : "pointer",
                  fontFamily: "var(--font-sans)",
                  opacity: mutation.isPending ? 0.7 : 1,
                  transition:
                    "opacity 0.25s cubic-bezier(0.16,1,0.3,1), background 0.35s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                {mutation.isPending
                  ? "Sending..."
                  : sent
                    ? (
                      <>
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 14 14"
                          fill="none"
                        >
                          <path
                            d="M2.5 7.5L5.5 10.5L11.5 3.5"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Message sent
                      </>
                    )
                    : "Hang up"}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Footer line — always visible ─── */}
      <motion.span
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ margin: "-24px" }}
        transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
        style={{
          position: "absolute",
          bottom: 32,
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
          letterSpacing: "0.04em",
          textAlign: "center",
        }}
      >
        contact@insturix.com &middot; Under 24h response
      </motion.span>
    </div>
  );
}
