"use client";

import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { motion } from "framer-motion";

export function SectionWrapper({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("relative py-20 md:py-28", className)}>
      {/* soft gradient wash */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -right-24 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-[#3A9EFF]/15 via-transparent to-[#FF2EE6]/15 blur-3xl" />
        {/* floating orbs for depth */}
        <div className="orb -top-24 -left-16" />
        <div className="orb -bottom-24 -right-16" />
      </div>
      <div className="relative container">
        {children}
      </div>
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "center",
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: 0.5 }}
      className={cn("mb-10", align === "center" ? "text-center mx-auto max-w-3xl" : "")}
    >
      {eyebrow && (
        <div className="mb-2 text-[11px] tracking-[0.2em] uppercase text-[#8abfff]">
          {eyebrow}
        </div>
      )}
      <h2 className="text-3xl md:text-5xl font-extrabold text-zinc-900 dark:text-zinc-100 glow-pulse">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-zinc-600 dark:text-zinc-400 text-lg">{subtitle}</p>
      )}
    </motion.div>
  );
}
