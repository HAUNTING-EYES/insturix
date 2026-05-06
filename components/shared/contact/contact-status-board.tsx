"use client";

/**
 * ContactStatusBoard — "The Status Board"
 *
 * Airport departure board aesthetic. Rows show operational data
 * with digit-flip animations. Each row is clickable — opens the
 * form pre-filled. Trust through operational transparency.
 */

import React, { useState, useRef, useCallback } from "react";
import { useFormik } from "formik";
import * as Yup from "yup";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "@/hooks/use-toast";
import { Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* ── constants ────────────────────────────────────────────── */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

type DeptId = "sales" | "support" | "partnership" | "general";

interface DeptRow {
  id: DeptId;
  label: string;
  status: "Online" | "Busy";
  responseTime: string;
}

const DEPARTMENTS: DeptRow[] = [
  { id: "sales", label: "Sales", status: "Online", responseTime: "~2h" },
  { id: "support", label: "Support", status: "Online", responseTime: "~4h" },
  { id: "partnership", label: "Partnership", status: "Busy", responseTime: "~24h" },
  { id: "general", label: "General", status: "Online", responseTime: "~4h" },
];

const DEPT_LABELS: Record<DeptId, string> = {
  sales: "Sales",
  support: "Support",
  partnership: "Partnership",
  general: "General",
};

/* ── validation ───────────────────────────────────────────── */

const validationSchema = Yup.object({
  name: Yup.string().required("Name is required"),
  email: Yup.string().email("Invalid email").required("Email is required"),
  message: Yup.string().required("Message is required"),
});

async function sendContactForm(data: {
  name: string;
  email: string;
  message: string;
  department: string;
}) {
  const res = await axios.post("/api/contact", data);
  return res.data;
}

/* ── shared styles ────────────────────────────────────────── */

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

/* ── digit flip character ─────────────────────────────────── */

function FlipChar({
  char,
  delay,
}: {
  char: string;
  delay: number;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: -14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ margin: "-32px" }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      style={{
        display: "inline-block",
        fontSize: 14,
        fontFamily: "var(--font-mono)",
        color: "var(--text-secondary)",
      }}
    >
      {char}
    </motion.span>
  );
}

/* ── status dot ───────────────────────────────────────────── */

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: online ? "var(--status-success)" : "var(--accent-gold)",
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}

/* ── board row ────────────────────────────────────────────── */

function BoardRow({
  dept,
  index,
  onClick,
  isSelected,
  isLast,
}: {
  dept: DeptRow;
  index: number;
  onClick: () => void;
  isSelected: boolean;
  isLast: boolean;
}) {
  const isOnline = dept.status === "Online";
  const chars = dept.responseTime.split("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ margin: "-32px" }}
      transition={{ duration: 0.4, delay: 0.08 * index, ease: EASE }}
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 100px 100px",
        alignItems: "center",
        padding: "16px 24px",
        cursor: "pointer",
        background: isSelected ? "var(--bg-deeper)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        transition: "background 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = "var(--bg-deeper)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      {/* Department */}
      <span
        style={{
          fontSize: 14,
          fontWeight: 500,
          color: "var(--text-primary)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {dept.label}
      </span>

      {/* Status */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: isOnline ? "var(--status-success)" : "var(--accent-gold)",
        }}
      >
        <StatusDot online={isOnline} />
        {dept.status}
      </span>

      {/* Response time — digit flip */}
      <span style={{ display: "flex", overflow: "hidden", height: 18 }}>
        {chars.map((c, i) => (
          <FlipChar
            key={`${dept.id}-${i}`}
            char={c}
            delay={0.12 * index + 0.05 * i}
          />
        ))}
      </span>

      {/* Action */}
      <span
        style={{
          fontSize: 13,
          color: "var(--accent-gold)",
          fontFamily: "var(--font-sans)",
          textAlign: "right",
        }}
      >
        Contact {"→"}
      </span>
    </motion.div>
  );
}

/* ── main component ───────────────────────────────────────── */

export function ContactStatusBoard() {
  const [selectedDept, setSelectedDept] = useState<DeptId | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const handleSelectDept = useCallback((deptId: DeptId) => {
    setSelectedDept(deptId);
    /* scroll to form after next paint */
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const mutation = useMutation({
    mutationFn: sendContactForm,
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: `We'll get back to you from ${selectedDept ? DEPT_LABELS[selectedDept] : "our team"}.`,
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
    onSubmit: (values) => {
      if (!selectedDept) return;
      mutation.mutate({ ...values, department: selectedDept });
    },
  });

  return (
    <div style={{ background: "var(--bg-canvas)", minHeight: "100vh" }}>
      {/* ── Hero ──────────────────────────────────────────── */}
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "96px 24px 48px",
          textAlign: "center",
        }}
      >
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-48px" }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Get in touch.
        </motion.h1>
      </section>

      {/* ── The Board ─────────────────────────────────────── */}
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-48px" }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            background: "var(--bg-raised)",
            border: "1px solid var(--border-subtle)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {/* Header row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 100px 100px 100px",
              padding: "12px 24px",
              background: "var(--bg-deeper)",
            }}
          >
            {["DEPARTMENT", "STATUS", "AVG RESPONSE", "ACTION"].map(
              (col) => (
                <span
                  key={col}
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    color: "var(--text-dim)",
                    textAlign: col === "ACTION" ? "right" : "left",
                  }}
                >
                  {col}
                </span>
              )
            )}
          </div>

          {/* Data rows */}
          {DEPARTMENTS.map((dept, i) => (
            <BoardRow
              key={dept.id}
              dept={dept}
              index={i}
              onClick={() => handleSelectDept(dept.id)}
              isSelected={selectedDept === dept.id}
              isLast={i === DEPARTMENTS.length - 1}
            />
          ))}
        </motion.div>
      </section>

      {/* ── Form section ──────────────────────────────────── */}
      <section
        ref={formRef}
        style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}
      >
        <AnimatePresence mode="wait">
          {selectedDept ? (
            <motion.div
              key={selectedDept}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 500,
                  color: "var(--text-primary)",
                  marginBottom: 24,
                  fontFamily: "var(--font-sans)",
                }}
              >
                Message to {DEPT_LABELS[selectedDept]}
              </h2>

              <form
                onSubmit={formik.handleSubmit}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                }}
              >
                {/* Name + Email row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  {/* Name */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                        marginBottom: 8,
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
                        e.currentTarget.style.borderColor =
                          "var(--accent-gold)";
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
                        fontSize: 10,
                        fontFamily: "var(--font-mono)",
                        fontWeight: 500,
                        letterSpacing: "0.08em",
                        color: "var(--text-dim)",
                        textTransform: "uppercase",
                        marginBottom: 8,
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
                        e.currentTarget.style.borderColor =
                          "var(--accent-gold)";
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

                {/* Message */}
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                      letterSpacing: "0.08em",
                      color: "var(--text-dim)",
                      textTransform: "uppercase",
                      marginBottom: 8,
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
                      e.currentTarget.style.borderColor =
                        "var(--accent-gold)";
                    }}
                    onBlur={(e) => {
                      formik.handleBlur(e);
                      e.currentTarget.style.borderColor =
                        "var(--border-emphasis)";
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
                    transition:
                      "opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                  }}
                >
                  <Send size={14} />
                  {mutation.isPending
                    ? "Sending..."
                    : `Send to ${DEPT_LABELS[selectedDept]}`}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.p
              key="prompt"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              style={{
                textAlign: "center",
                fontSize: 13,
                color: "var(--text-muted)",
                fontFamily: "var(--font-sans)",
                padding: "24px 0",
              }}
            >
              Select a department above to get started.
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      {/* ── Bottom info ───────────────────────────────────── */}
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "0 24px 64px",
          textAlign: "center",
        }}
      >
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ margin: "-32px" }}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--text-dim)",
            letterSpacing: "0.02em",
          }}
        >
          contact@insturix.com {"·"} Under 24h response
        </motion.p>
      </section>
    </div>
  );
}
