"use client";

/**
 * Contact Page — Insturix Design System v1.0
 *
 * RAMS: The form IS the page. Nothing decorative.
 * JOBS: User wants to send a message → form → done.
 * MÜLLER-BROCKMANN: ONE focal point — the submit button.
 */

import React from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { Send, Mail, MapPin, Clock } from "lucide-react";
import { motion } from "framer-motion";

const EASE = [0.16, 1, 0.3, 1] as const;

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  subject: Yup.string().required("Subject is required"),
  message: Yup.string().required("Message is required"),
});

async function sendContactForm(data: { name: string; email: string; subject: string; message: string }) {
  const res = await axios.post("/api/contact", data);
  return res.data;
}

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

export function ContactPage() {
  const mutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      toast({ title: "Message sent", description: "We'll get back to you within 24 hours." });
      formik.resetForm();
    },
    onError: () => {
      toast({ title: "Error", description: "Something went wrong. Try again.", variant: "destructive" });
    },
  });

  const formik = useFormik({
    initialValues: { name: "", email: "", subject: "", message: "" },
    validationSchema,
    onSubmit: (values) => mutation.mutate(values),
  });

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "96px 48px 120px",
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          gap: 64,
          alignItems: "start",
        }}
      >
        {/* Left — context */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-48px" }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <span className="mono-label" style={{ display: "block", marginBottom: 24, color: "var(--accent-gold)" }}>
            CONTACT
          </span>
          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              marginBottom: 16,
              color: "var(--text-primary)",
            }}
          >
            Get in touch.
          </h1>
          <p
            style={{
              fontSize: 18,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
              marginBottom: 48,
            }}
          >
            Have a question, a partnership idea, or need support? We respond within 24 hours.
          </p>

          {/* Info cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              { icon: Mail, label: "Email", value: "contact@insturix.com" },
              { icon: MapPin, label: "Location", value: "India" },
              { icon: Clock, label: "Response time", value: "Under 24 hours" },
            ].map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px",
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
                  }}
                >
                  <Icon size={14} style={{ color: "var(--text-dim)" }} />
                </div>
                <div>
                  <span className="mono-label" style={{ display: "block", marginBottom: 4 }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 14, color: "var(--text-secondary)" }}>{value}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right — form */}
        <motion.form
          onSubmit={formik.handleSubmit}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="mono-label" style={{ display: "block", marginBottom: 8 }}>Name</label>
              <input
                type="text"
                placeholder="Your name"
                {...formik.getFieldProps("name")}
                style={{
                  ...inputStyle,
                  borderColor: formik.touched.name && formik.errors.name ? "var(--status-danger)" : "var(--border-emphasis)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)"; }}
                onBlur={(e) => { formik.handleBlur(e); e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
              />
              {formik.touched.name && formik.errors.name && (
                <span style={{ fontSize: 11, color: "var(--status-danger)", marginTop: 4, display: "block" }}>{formik.errors.name}</span>
              )}
            </div>
            <div>
              <label className="mono-label" style={{ display: "block", marginBottom: 8 }}>Email</label>
              <input
                type="email"
                placeholder="you@company.com"
                {...formik.getFieldProps("email")}
                style={{
                  ...inputStyle,
                  borderColor: formik.touched.email && formik.errors.email ? "var(--status-danger)" : "var(--border-emphasis)",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)"; }}
                onBlur={(e) => { formik.handleBlur(e); e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
              />
              {formik.touched.email && formik.errors.email && (
                <span style={{ fontSize: 11, color: "var(--status-danger)", marginTop: 4, display: "block" }}>{formik.errors.email}</span>
              )}
            </div>
          </div>

          <div>
            <label className="mono-label" style={{ display: "block", marginBottom: 8 }}>Subject</label>
            <input
              type="text"
              placeholder="What's this about?"
              {...formik.getFieldProps("subject")}
              style={{
                ...inputStyle,
                borderColor: formik.touched.subject && formik.errors.subject ? "var(--status-danger)" : "var(--border-emphasis)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)"; }}
              onBlur={(e) => { formik.handleBlur(e); e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
            />
            {formik.touched.subject && formik.errors.subject && (
              <span style={{ fontSize: 11, color: "var(--status-danger)", marginTop: 4, display: "block" }}>{formik.errors.subject}</span>
            )}
          </div>

          <div>
            <label className="mono-label" style={{ display: "block", marginBottom: 8 }}>Message</label>
            <textarea
              placeholder="Tell us more..."
              rows={5}
              {...formik.getFieldProps("message")}
              style={{
                ...inputStyle,
                resize: "vertical" as const,
                minHeight: 120,
                borderColor: formik.touched.message && formik.errors.message ? "var(--status-danger)" : "var(--border-emphasis)",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)"; }}
              onBlur={(e) => { formik.handleBlur(e); e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
            />
            {formik.touched.message && formik.errors.message && (
              <span style={{ fontSize: 11, color: "var(--status-danger)", marginTop: 4, display: "block" }}>{formik.errors.message}</span>
            )}
          </div>

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
        </motion.form>
      </div>
    </div>
  );
}
