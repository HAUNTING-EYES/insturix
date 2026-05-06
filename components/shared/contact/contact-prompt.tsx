"use client";

/**
 * ContactPrompt — "The Prompt"
 *
 * The entire contact page is ONE massive input field.
 * Like the homepage hero prompt, but for contact.
 * "Tell us what you need." As user types, intent detection
 * shows a label. Submit is hitting enter. The page is as
 * simple as the product's own prompt.
 */

import React, { useRef, useCallback, useMemo, useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ─── Intent detection ─── */

interface DetectedIntent {
  label: string;
  color: string;
}

function detectIntent(message: string): DetectedIntent | null {
  if (!message.trim()) return null;
  const lower = message.toLowerCase();

  if (/\b(demo|try|see)\b/.test(lower)) {
    return { label: "Sounds like a demo request", color: "var(--accent-gold)" };
  }
  if (/\b(help|bug|issue|broken)\b/.test(lower)) {
    return { label: "Routing to support", color: "#22d3ee" };
  }
  if (/\b(partner|integrat|resell)\b/.test(lower)) {
    return { label: "Partnership inquiry", color: "var(--status-success)" };
  }
  return null;
}

/* ─── Validation ─── */

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  message: Yup.string()
    .min(10, "Tell us a bit more")
    .required("Message is required"),
});

/* ─── Submit handler ─── */

async function sendContactForm(data: {
  name: string;
  email: string;
  message: string;
}) {
  const res = await axios.post("/api/contact", data);
  return res.data;
}

/* ─── Component ─── */

export function ContactPrompt() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      setSubmitted(true);
      toast({
        title: "Message received",
        description: "We'll respond within 4 hours.",
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

  /* Auto-resize textarea */
  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  /* Intent derived from message */
  const intent = useMemo(
    () => detectIntent(formik.values.message),
    [formik.values.message]
  );

  /* Show hidden fields when message >= 10 chars */
  const showFields = formik.values.message.length >= 10;

  /* Cmd/Ctrl + Enter to submit */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        formik.handleSubmit();
      }
    },
    [formik]
  );

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
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* ─── The prompt area ─── */}
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          padding: "0 24px",
        }}
      >
        <AnimatePresence mode="wait">
          {!submitted ? (
            <motion.form
              key="form"
              onSubmit={formik.handleSubmit}
              onKeyDown={handleKeyDown}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              viewport={{ margin: "-48px" }}
              transition={{ duration: 0.5, ease: EASE }}
              style={{ display: "flex", flexDirection: "column" }}
            >
              {/* Mono label */}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  fontWeight: 500,
                  color: "var(--text-dim)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                  marginBottom: 16,
                }}
              >
                TELL US WHAT YOU NEED
              </span>

              {/* The massive textarea */}
              <textarea
                ref={textareaRef}
                placeholder="I need help with..."
                {...formik.getFieldProps("message")}
                onInput={handleTextareaInput}
                rows={1}
                style={{
                  width: "100%",
                  fontSize: 24,
                  fontWeight: 400,
                  fontFamily: "var(--font-sans)",
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                  resize: "none",
                  overflow: "hidden",
                  lineHeight: 1.45,
                  padding: 0,
                  minHeight: 44,
                }}
              />

              {/* Gold underline */}
              <div
                style={{
                  width: "100%",
                  height: 1,
                  background: "var(--accent-gold)",
                  opacity: 0.4,
                  marginTop: 12,
                }}
              />

              {/* Intent detection label */}
              <div style={{ minHeight: 24, marginTop: 8 }}>
                <AnimatePresence mode="wait">
                  {intent && (
                    <motion.span
                      key={intent.label}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 500,
                        color: intent.color,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {intent.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              {/* Validation error for message */}
              {formik.touched.message && formik.errors.message && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--status-danger, #ef4444)",
                    fontFamily: "var(--font-mono)",
                    marginTop: 4,
                  }}
                >
                  {formik.errors.message}
                </span>
              )}

              {/* Hidden fields — name, email, submit */}
              <AnimatePresence>
                {showFields && (
                  <motion.div
                    key="fields"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    style={{ overflow: "hidden" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        marginTop: 24,
                        alignItems: "flex-start",
                      }}
                    >
                      {/* Name */}
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          placeholder="Your name"
                          {...formik.getFieldProps("name")}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            background: "var(--bg-deeper)",
                            border: "1px solid var(--border-emphasis)",
                            borderRadius: 7,
                            fontSize: 14,
                            fontWeight: 400,
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-sans)",
                            outline: "none",
                            transition:
                              "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor =
                              "rgba(212,166,82,0.4)";
                          }}
                          onBlur={(e) => {
                            formik.handleBlur(e);
                            e.currentTarget.style.borderColor =
                              "var(--border-emphasis)";
                          }}
                        />
                        {formik.touched.name && formik.errors.name && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--status-danger, #ef4444)",
                              display: "block",
                              marginTop: 4,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {formik.errors.name}
                          </span>
                        )}
                      </div>

                      {/* Email */}
                      <div style={{ flex: 1 }}>
                        <input
                          type="email"
                          placeholder="you@company.com"
                          {...formik.getFieldProps("email")}
                          style={{
                            width: "100%",
                            padding: "12px 16px",
                            background: "var(--bg-deeper)",
                            border: "1px solid var(--border-emphasis)",
                            borderRadius: 7,
                            fontSize: 14,
                            fontWeight: 400,
                            color: "var(--text-primary)",
                            fontFamily: "var(--font-sans)",
                            outline: "none",
                            transition:
                              "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor =
                              "rgba(212,166,82,0.4)";
                          }}
                          onBlur={(e) => {
                            formik.handleBlur(e);
                            e.currentTarget.style.borderColor =
                              "var(--border-emphasis)";
                          }}
                        />
                        {formik.touched.email && formik.errors.email && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--status-danger, #ef4444)",
                              display: "block",
                              marginTop: 4,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {formik.errors.email}
                          </span>
                        )}
                      </div>

                      {/* Submit button */}
                      <button
                        type="submit"
                        disabled={mutation.isPending}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "12px 24px",
                          background: "var(--accent-gold)",
                          color: "var(--bg-canvas)",
                          border: "none",
                          borderRadius: 48,
                          fontSize: 13,
                          fontWeight: 500,
                          fontFamily: "var(--font-sans)",
                          cursor: mutation.isPending ? "wait" : "pointer",
                          opacity: mutation.isPending ? 0.7 : 1,
                          transition:
                            "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {mutation.isPending ? "Sending..." : "Send →"}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.form>
          ) : (
            /* ─── Success state ─── */
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
              }}
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  duration: 0.4,
                  delay: 0.15,
                  ease: EASE,
                }}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 48,
                  background: "var(--status-success)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Check size={24} style={{ color: "var(--bg-canvas)" }} />
              </motion.div>
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 400,
                  color: "var(--text-secondary)",
                  textAlign: "center",
                  lineHeight: 1.55,
                }}
              >
                Message received. We&rsquo;ll respond within 4 hours.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Bottom fixed email ─── */}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: 0,
          right: 0,
          textAlign: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 400,
            color: "var(--text-dim)",
            letterSpacing: "0.04em",
          }}
        >
          contact@insturix.com
        </span>
      </div>
    </div>
  );
}
