"use client";

import React, { useState, useMemo } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import type { LucideIcon } from "lucide-react";
import {
  Send,
  Play,
  HelpCircle,
  Handshake,
  MessageCircle,
  Mail,
  Clock,
  MapPin,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const EASE = [0.16, 1, 0.3, 1] as const;

type PathKey = "demo" | "support" | "partnership" | "general";

interface PathCard {
  key: PathKey;
  icon: LucideIcon;
  title: string;
  description: string;
}

const PATH_CARDS: PathCard[] = [
  {
    key: "demo",
    icon: Play,
    title: "Book a demo",
    description:
      "See the full production floor in action. 30 minutes, no commitment.",
  },
  {
    key: "support",
    icon: HelpCircle,
    title: "Get support",
    description: "Technical issue or question about your project.",
  },
  {
    key: "partnership",
    icon: Handshake,
    title: "Partnership",
    description: "Integration, reselling, or co-marketing opportunity.",
  },
  {
    key: "general",
    icon: MessageCircle,
    title: "General inquiry",
    description: "Anything else — we read every message.",
  },
];

const TEAM_SIZE_OPTIONS = ["1-5", "5-20", "20-50", "50+"] as const;

/* ------------------------------------------------------------------ */
/*  Per-path validation schemas                                        */
/* ------------------------------------------------------------------ */

const baseSchema = {
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
};

const SCHEMAS: Record<PathKey, Yup.ObjectSchema<Record<string, unknown>>> = {
  demo: Yup.object({
    ...baseSchema,
    company: Yup.string().required("Company is required"),
    teamSize: Yup.string().required("Team size is required"),
    message: Yup.string().required("Message is required"),
  }) as unknown as Yup.ObjectSchema<Record<string, unknown>>,
  support: Yup.object({
    ...baseSchema,
    projectId: Yup.string(),
    message: Yup.string().required("Message is required"),
  }) as unknown as Yup.ObjectSchema<Record<string, unknown>>,
  partnership: Yup.object({
    ...baseSchema,
    company: Yup.string().required("Company is required"),
    proposal: Yup.string().required("Proposal is required"),
  }) as unknown as Yup.ObjectSchema<Record<string, unknown>>,
  general: Yup.object({
    ...baseSchema,
    subject: Yup.string().required("Subject is required"),
    message: Yup.string().required("Message is required"),
  }) as unknown as Yup.ObjectSchema<Record<string, unknown>>,
};

const INITIAL_VALUES: Record<PathKey, Record<string, string>> = {
  demo: { name: "", email: "", company: "", teamSize: "", message: "" },
  support: { name: "", email: "", projectId: "", message: "" },
  partnership: { name: "", email: "", company: "", proposal: "" },
  general: { name: "", email: "", subject: "", message: "" },
};

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

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 10,
  fontWeight: 500,
  fontFamily: "var(--font-mono)",
  color: "var(--text-dim)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const errorStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--status-danger)",
  marginTop: 4,
  display: "block",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function focusBorder(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "rgba(212,166,82,0.4)";
}

function blurBorder(
  e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  formikBlur: (e: React.FocusEvent) => void,
) {
  formikBlur(e);
  e.currentTarget.style.borderColor = "var(--border-emphasis)";
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function FormField({
  label,
  fieldName,
  placeholder,
  type = "text",
  formik,
  as,
  rows,
  options,
}: {
  label: string;
  fieldName: string;
  placeholder: string;
  type?: string;
  formik: ReturnType<typeof useFormik>;
  as?: "textarea" | "select";
  rows?: number;
  options?: readonly string[];
}) {
  const touched = formik.touched[fieldName];
  const error = formik.errors[fieldName] as string | undefined;
  const hasError = touched && error;

  const borderColor = hasError
    ? "var(--status-danger)"
    : "var(--border-emphasis)";

  const commonProps = {
    ...formik.getFieldProps(fieldName),
    style: { ...inputStyle, borderColor } as React.CSSProperties,
    onFocus: focusBorder,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      blurBorder(e, formik.handleBlur),
  };

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {as === "textarea" ? (
        <textarea
          placeholder={placeholder}
          rows={rows ?? 5}
          {...(commonProps as React.TextareaHTMLAttributes<HTMLTextAreaElement> & { style: React.CSSProperties })}
          style={{ ...commonProps.style, resize: "vertical", minHeight: 120 }}
        />
      ) : as === "select" ? (
        <select
          {...(commonProps as React.SelectHTMLAttributes<HTMLSelectElement> & { style: React.CSSProperties })}
          style={{ ...commonProps.style, cursor: "pointer", appearance: "none" }}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          placeholder={placeholder}
          {...(commonProps as React.InputHTMLAttributes<HTMLInputElement> & { style: React.CSSProperties })}
        />
      )}
      {hasError && <span style={errorStyle}>{error}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function ContactPickPath() {
  const [selectedPath, setSelectedPath] = useState<PathKey | null>(null);

  const activeSchema = useMemo(
    () => (selectedPath ? SCHEMAS[selectedPath] : SCHEMAS.general),
    [selectedPath],
  );

  const activeInitial = useMemo(
    () => (selectedPath ? INITIAL_VALUES[selectedPath] : INITIAL_VALUES.general),
    [selectedPath],
  );

  const mutation = useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const res = await axios.post("/api/contact", {
        ...data,
        path: selectedPath,
      });
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "We'll get back to you within 24 hours.",
      });
      formik.resetForm();
      setSelectedPath(null);
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
    initialValues: activeInitial,
    validationSchema: activeSchema,
    enableReinitialize: true,
    onSubmit: (values) => mutation.mutate(values),
  });

  function handlePathSelect(key: PathKey) {
    if (key === selectedPath) return;
    formik.resetForm();
    setSelectedPath(key);
  }

  /* ---------------------------------------------------------------- */
  /*  Per-path form fields                                             */
  /* ---------------------------------------------------------------- */

  function renderFormFields() {
    if (!selectedPath) return null;

    const F = (props: Omit<Parameters<typeof FormField>[0], "formik">) => (
      <FormField {...props} formik={formik} />
    );

    const nameEmail = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <F label="Name" fieldName="name" placeholder="Your name" />
        <F
          label="Email"
          fieldName="email"
          placeholder="you@company.com"
          type="email"
        />
      </div>
    );

    switch (selectedPath) {
      case "demo":
        return (
          <>
            {nameEmail}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <F
                label="Company"
                fieldName="company"
                placeholder="Your company"
              />
              <F
                label="Team size"
                fieldName="teamSize"
                placeholder="Select size"
                as="select"
                options={TEAM_SIZE_OPTIONS}
              />
            </div>
            <F
              label="Message"
              fieldName="message"
              placeholder="What would you like to see in the demo?"
              as="textarea"
            />
          </>
        );

      case "support":
        return (
          <>
            {nameEmail}
            <F
              label="Project ID (optional)"
              fieldName="projectId"
              placeholder="e.g. prj_abc123"
            />
            <F
              label="Message"
              fieldName="message"
              placeholder="Describe the issue or question..."
              as="textarea"
            />
          </>
        );

      case "partnership":
        return (
          <>
            {nameEmail}
            <F
              label="Company"
              fieldName="company"
              placeholder="Your company"
            />
            <F
              label="Proposal"
              fieldName="proposal"
              placeholder="Describe the partnership opportunity..."
              as="textarea"
            />
          </>
        );

      case "general":
        return (
          <>
            {nameEmail}
            <F
              label="Subject"
              fieldName="subject"
              placeholder="What's this about?"
            />
            <F
              label="Message"
              fieldName="message"
              placeholder="Tell us more..."
              as="textarea"
            />
          </>
        );

      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "96px 48px 120px",
        }}
      >
        {/* Hero */}
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
              marginBottom: 16,
              color: "var(--text-primary)",
            }}
          >
            How can we help?
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.55,
            }}
          >
            Pick what fits. We'll route it to the right team.
          </p>
        </motion.div>

        {/* Intent cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
            marginBottom: 48,
          }}
        >
          {PATH_CARDS.map((card, i) => {
            const Icon = card.icon;
            const isActive = selectedPath === card.key;

            return (
              <motion.button
                key={card.key}
                type="button"
                onClick={() => handlePathSelect(card.key)}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ margin: "-48px" }}
                transition={{
                  duration: 0.45,
                  delay: i * 0.08,
                  ease: EASE,
                }}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  padding: 24,
                  background: isActive
                    ? "var(--bg-well)"
                    : "var(--bg-raised)",
                  borderRadius: 12,
                  border: `1px solid ${
                    isActive
                      ? "var(--accent-gold)"
                      : "var(--border-subtle)"
                  }`,
                  outline: "none",
                  fontFamily: "var(--font-sans)",
                  transition:
                    "border-color 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 7,
                    background: isActive
                      ? "rgba(212,166,82,0.12)"
                      : "var(--bg-deeper)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  <Icon
                    size={14}
                    style={{
                      color: isActive
                        ? "var(--accent-gold)"
                        : "var(--text-dim)",
                    }}
                  />
                </div>
                <span
                  style={{
                    display: "block",
                    fontSize: 18,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    marginBottom: 4,
                  }}
                >
                  {card.title}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.45,
                  }}
                >
                  {card.description}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Adaptive form */}
        <AnimatePresence mode="wait">
          {selectedPath && (
            <motion.form
              key={selectedPath}
              onSubmit={formik.handleSubmit}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{
                background: "var(--bg-raised)",
                borderRadius: 12,
                border: "1px solid var(--border-subtle)",
                padding: 32,
                display: "flex",
                flexDirection: "column",
                gap: 24,
                marginBottom: 48,
              }}
            >
              {renderFormFields()}

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
                  transition:
                    "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                <Send size={14} />
                {mutation.isPending ? "Sending..." : "Send message"}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Info footer */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-48px" }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 48,
          }}
        >
          {[
            { icon: Mail, label: "Email", value: "contact@insturix.com" },
            { icon: Clock, label: "Response time", value: "Under 24 hours" },
            { icon: MapPin, label: "Location", value: "India" },
          ].map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Icon
                size={13}
                style={{ color: "var(--text-dim)", flexShrink: 0 }}
              />
              <div>
                <span
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-dim)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: 2,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                  }}
                >
                  {value}
                </span>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
