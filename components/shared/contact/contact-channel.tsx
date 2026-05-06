"use client";

/**
 * ContactChannel — "Open a channel"
 *
 * Left: mini chat mockup (styled like AI Director chat panel)
 * Right: form fields styled as a new conversation
 * Below: info row (email, response time, location)
 *
 * Design system v1.0 locked. NO gradients, blur, shadows.
 */

import React from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, MapPin, Clock } from "lucide-react";
import { motion } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EASE = [0.16, 1, 0.3, 1] as const;

const CHAT_MESSAGES = [
  {
    role: "user" as const,
    text: "Hi, I run a 15-person agency. Can Insturix handle multi-brand workflows?",
  },
  {
    role: "ai" as const,
    text: "Absolutely. Each brand gets its own config — colors, fonts, voice, templates. Your team switches between clients in one click.",
  },
  {
    role: "user" as const,
    text: "What about footage we’ve already shot?",
  },
  {
    role: "ai" as const,
    text: "Upload it. AI handles cuts, color, pacing, audio. Same editor, whether you generate or bring your own.",
  },
] as const;

const INFO_ITEMS = [
  { icon: Mail, label: "Email", value: "contact@insturix.com" },
  { icon: Clock, label: "Response time", value: "Under 24 hours" },
  { icon: MapPin, label: "Location", value: "India" },
] as const;

/* ------------------------------------------------------------------ */
/*  Validation + API                                                   */
/* ------------------------------------------------------------------ */

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  message: Yup.string().required("Message is required"),
});

async function sendContactForm(data: { name: string; email: string; message: string }) {
  const res = await axios.post("/api/contact", data);
  return res.data;
}

/* ------------------------------------------------------------------ */
/*  Shared styles                                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ChatBubble({
  role,
  text,
  index,
}: {
  role: "user" | "ai";
  text: string;
  index: number;
}) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ margin: "-24px" }}
      transition={{ duration: 0.45, delay: 0.15 + index * 0.12, ease: EASE }}
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "85%",
          padding: "12px 16px",
          borderRadius: 12,
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text-primary)",
          ...(isUser
            ? {
                background: "var(--bg-well)",
                borderBottomRightRadius: 4,
              }
            : {
                background: "var(--bg-raised)",
                border: "1px solid var(--border-subtle)",
                borderBottomLeftRadius: 4,
              }),
        }}
      >
        {text}
      </div>
    </motion.div>
  );
}

function ChatMockup() {
  return (
    <div
      style={{
        background: "var(--bg-raised)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 12,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "var(--status-success)",
          }}
        />
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--text-secondary)",
          }}
        >
          Insturix Team
        </span>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          overflowY: "auto",
        }}
      >
        {CHAT_MESSAGES.map((msg, i) => (
          <ChatBubble key={i} role={msg.role} text={msg.text} index={i} />
        ))}
      </div>

      {/* Input mockup */}
      <div
        style={{
          padding: "12px 24px 16px",
          borderTop: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <div
          style={{
            flex: 1,
            padding: "10px 16px",
            background: "var(--bg-deeper)",
            border: "1px solid var(--border-emphasis)",
            borderRadius: 7,
            fontSize: 13,
            color: "var(--text-dim)",
            fontFamily: "var(--font-sans)",
          }}
        >
          Ask anything...
        </div>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 7,
            background: "var(--bg-well)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Send size={13} style={{ color: "var(--text-dim)" }} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ContactChannel() {
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
    initialValues: { name: "", email: "", message: "" },
    validationSchema,
    onSubmit: (values) => mutation.mutate(values),
  });

  return (
    <section style={{ background: "var(--bg-canvas)" }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "96px 48px 64px",
        }}
      >
        {/* ---- Hero ---- */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-48px" }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{ textAlign: "center", marginBottom: 64 }}
        >
          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              color: "var(--text-primary)",
              marginBottom: 16,
            }}
          >
            Start a conversation.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
              maxWidth: 480,
              margin: "0 auto",
            }}
          >
            Same chat interface your team will use inside the product.
          </p>
        </motion.div>

        {/* ---- Two-column: chat + form ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1.2fr",
            gap: 48,
            alignItems: "stretch",
          }}
        >
          {/* Left: Chat mockup */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-48px" }}
            transition={{ duration: 0.5, ease: EASE }}
            style={{ display: "flex" }}
          >
            <ChatMockup />
          </motion.div>

          {/* Right: Form as new conversation */}
          <motion.form
            onSubmit={formik.handleSubmit}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-48px" }}
            transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
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
            {/* Form header */}
            <span
              className="mono-label"
              style={{
                display: "block",
                color: "var(--text-muted)",
              }}
            >
              Your message
            </span>

            {/* Name */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ margin: "-24px" }}
              transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
            >
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
                  e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)";
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
            </motion.div>

            {/* Email */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ margin: "-24px" }}
              transition={{ duration: 0.4, delay: 0.25, ease: EASE }}
            >
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
                  e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)";
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
            </motion.div>

            {/* Message */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ margin: "-24px" }}
              transition={{ duration: 0.4, delay: 0.35, ease: EASE }}
            >
              <label
                className="mono-label"
                style={{ display: "block", marginBottom: 8 }}
              >
                Message
              </label>
              <textarea
                placeholder="Tell us more..."
                rows={6}
                {...formik.getFieldProps("message")}
                style={{
                  ...inputStyle,
                  resize: "vertical" as const,
                  minHeight: 140,
                  borderColor:
                    formik.touched.message && formik.errors.message
                      ? "var(--status-danger)"
                      : "var(--border-emphasis)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)";
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
            </motion.div>

            {/* Submit */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ margin: "-24px" }}
              transition={{ duration: 0.4, delay: 0.45, ease: EASE }}
            >
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
            </motion.div>
          </motion.form>
        </div>

        {/* ---- Info row ---- */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-48px" }}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 24,
            marginTop: 48,
          }}
        >
          {INFO_ITEMS.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: 16,
                background: "var(--bg-raised)",
                borderRadius: 12,
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: "var(--bg-deeper)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={14} style={{ color: "var(--text-dim)" }} />
              </div>
              <div>
                <span
                  className="mono-label"
                  style={{ display: "block", marginBottom: 4 }}
                >
                  {label}
                </span>
                <span
                  style={{ fontSize: 14, color: "var(--text-secondary)" }}
                >
                  {value}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
