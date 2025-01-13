"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { HoverCard } from "./ui/HoverCard";
import { useState } from "react";
import {
  Lightbulb,
  Rocket,
  Users,
  Shield,
  Clock,
  HeartHandshake,
} from "lucide-react";

const reasons = [
  {
    title: "Innovative Solutions",
    description:
      "We leverage cutting-edge technology to solve complex problems.",
    icon: Lightbulb,
  },
  {
    title: "Rapid Deployment",
    description:
      "Our streamlined processes ensure quick implementation of solutions.",
    icon: Rocket,
  },
  {
    title: "Customer-Centric Approach",
    description:
      "Your success is our priority. We tailor our services to your needs.",
    icon: Users,
  },
  {
    title: "Robust Security",
    description:
      "We implement state-of-the-art security measures to protect your data.",
    icon: Shield,
  },
  {
    title: "24/7 Support",
    description: "Our dedicated team is always available to assist you.",
    icon: Clock,
  },
  {
    title: "Proven Track Record",
    description:
      "Years of successful projects and satisfied clients speak for themselves.",
    icon: HeartHandshake,
  },
];

export function WhyUs() {
  const { scrollYProgress } = useScroll();
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);

  return (
    <motion.section
      style={{ scale }}
      className="relative py-24 bg-background"
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 50% 50%, var(--primary-color)/0.1, transparent)",
        }}
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center space-y-6 mb-16"
        >
          <div className="flex flex-col items-center space-y-2">
            <h1 className="text-5xl font-bold tracking-tight">
              Why Choose Us?
            </h1>
            <div className="flex items-center space-x-4">
              <div className="h-[1px] w-12 bg-neutral-300 dark:bg-neutral-700" />
              <div className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600" />
              <div className="h-[1px] w-12 bg-neutral-300 dark:bg-neutral-700" />
            </div>
          </div>
          <motion.p
            className="text-xl text-muted-foreground max-w-2xl mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            Discover the unique advantages that set us apart
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map((reason, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.5,
                delay: index * 0.1,
                type: "spring",
                stiffness: 100
              }}
              viewport={{ once: true }}
              whileHover={{ y: -5 }}
              className="h-full"
            >
              <HoverCard className="h-full relative overflow-hidden">
                <motion.div
                  className="absolute inset-0 bg-gradient-to-tr from-primary/5 via-transparent to-transparent"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "0%" }}
                  transition={{ duration: 0.3 }}
                />
                <div className="relative z-10 h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <motion.div
                      className="p-2 rounded-lg bg-primary/10"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.2 }}
                    >
                      <reason.icon className="w-6 h-6 text-primary" />
                    </motion.div>
                    <h3 className="text-xl font-semibold">{reason.title}</h3>
                  </div>
                  <p className="text-muted-foreground flex-grow">{reason.description}</p>
                </div>
              </HoverCard>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}