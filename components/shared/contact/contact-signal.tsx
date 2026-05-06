"use client";

/**
 * ContactSignal — "The Signal"
 *
 * Live status indicator + form (left) + mini FAQ (right).
 * Reduces support tickets by answering common questions inline.
 */

import React, { useState } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, MapPin, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

/* ── Validation ── */

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

/* ── FAQ data ── */

const FAQ_ITEMS = [
  {
    question: "What’s included in the free plan?",
    answer:
      "10 credits to explore all six rooms. No card required.",
  },
  {
    question: "Can I upload my own footage?",
    answer:
      "Yes. AI applies professional cuts, color, pacing, and audio mixing to your raw footage.",
  },
  {
    question: "How does enterprise pricing work?",
    answer:
      "Custom credits, dedicated support, SLA guarantees. Contact us for a tailored quote.",
  },
  {
    question: "What video formats do you support?",
    answer:
      "MP4, MOV, WebM for upload. We export to all major formats and aspect ratios.",
  },
] as const;

/* ── Shared input style ── */

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

/* ── Pulse keyframes (injected once) ── */

const PULSE_KEYFRAMES = `
@keyframes signal-pulse {
  0%   { transform: scale(1);   opacity: 1;   }
  50%  { transform: scale(1.4); opacity: 0.5; }
  100% { transform: scale(1);   opacity: 1;   }
}
`;

/* ── Component ── */

export function ContactSignal() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "We’ll get back to you within 24 hours.",
      });
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

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {/* Inject pulse keyframes */}
      <style dangerouslySetInnerHTML={{ __html: PULSE_KEYFRAMES }} />

      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "96px 48px 120px",
        }}
      >
        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-48px" }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              marginBottom: 24,
              color: "var(--text-primary)",
            }}
          >
            We&rsquo;re listening.
          </h1>

          {/* ── Live status bar ── */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 7,
              padding: "8px 24px",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--status-success)",
                display: "inline-block",
                animation: "signal-pulse 2s infinite",
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                fontFamily: "var(--font-sans)",
              }}
            >
              Team online
            </span>
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "var(--text-dim)",
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: "var(--text-dim)",
                fontFamily: "var(--font-mono)",
              }}
            >
              Avg response: 4 hours
            </span>
          </div>
        </motion.div>

        {/* ── Two-column layout ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 48,
            alignItems: "start",
          }}
        >
          {/* ── Left: Form ── */}
          <motion.form
            onSubmit={formik.handleSubmit}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-48px" }}
            transition={{ duration: 0.6, ease: EASE }}
            style={{
              background: "var(--bg-raised)",
              borderRadius: 12,
              border: "1px solid var(--border-subtle)",
              padding: 32,
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {/* Name */}
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

            {/* Email */}
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

            {/* Subject */}
            <div>
              <label
                className="mono-label"
                style={{ display: "block", marginBottom: 8 }}
              >
                Subject
              </label>
              <input
                type="text"
                placeholder="What’s this about?"
                {...formik.getFieldProps("subject")}
                style={{
                  ...inputStyle,
                  borderColor:
                    formik.touched.subject && formik.errors.subject
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
              {formik.touched.subject && formik.errors.subject && (
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--status-danger)",
                    marginTop: 4,
                    display: "block",
                  }}
                >
                  {formik.errors.subject}
                </span>
              )}
            </div>

            {/* Message */}
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

            {/* Submit */}
            <button
              type="submit"
              disabled={mutation.isPending}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                padding: "14px 24px",
                background: "var(--accent-gold)",
                color: "var(--bg-canvas)",
                border: "none",
                borderRadius: 7,
                fontSize: 14,
                fontWeight: 800,
                cursor: mutation.isPending ? "wait" : "pointer",
                fontFamily: "var(--font-sans)",
                opacity: mutation.isPending ? 0.7 : 1,
                transition: "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <Send size={14} />
              {mutation.isPending ? "Sending..." : "Send message"}
            </button>

            {/* Info row below submit */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingTop: 8,
              }}
            >
              {[
                { icon: Mail, text: "contact@insturix.com" },
                { icon: Clock, text: "Under 4 hours" },
                { icon: MapPin, text: "India" },
              ].map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon
                    size={10}
                    style={{ color: "var(--text-dim)" }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </motion.form>

          {/* ── Right: Mini FAQ ── */}
          <motion.div
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-48px" }}
            transition={{ duration: 0.6, delay: 0.1, ease: EASE }}
            style={{
              background: "var(--bg-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {FAQ_ITEMS.map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ margin: "-24px" }}
                transition={{
                  duration: 0.4,
                  delay: 0.15 * idx,
                  ease: EASE,
                }}
              >
                {/* Question toggle */}
                <div
                  onClick={() =>
                    setOpenFaq(openFaq === idx ? null : idx)
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 16,
                    cursor: "pointer",
                    borderBottom:
                      idx < FAQ_ITEMS.length - 1
                        ? "1px solid var(--border-subtle)"
                        : "none",
                    userSelect: "none",
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
                      fontSize: 18,
                      color: "var(--text-dim)",
                      fontFamily: "var(--font-mono)",
                      lineHeight: 1,
                      flexShrink: 0,
                      marginLeft: 16,
                    }}
                  >
                    {openFaq === idx ? "−" : "+"}
                  </span>
                </div>

                {/* Answer (animated expand/collapse) */}
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          padding: 16,
                          background: "var(--bg-deeper)",
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-sans)",
                          lineHeight: 1.55,
                        }}
                      >
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
