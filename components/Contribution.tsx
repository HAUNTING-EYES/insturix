"use client";

import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";
import { ArrowRight, Lightbulb, Code, MessageSquare } from "lucide-react";
import Link from "next/link";

export default function ContributionPage() {
  const contributionTypes = [
    {
      title: "Share Ideas",
      icon: Lightbulb,
      description:
        "Have innovative ideas for new features or improvements? We'd love to hear them.",
      link: "/contactus",
      color: "bg-amber-500/10 dark:bg-amber-500/5",
      iconColor: "text-amber-500",
    },
    {
      title: "Technical Contributions",
      icon: Code,
      description:
        "Are you a developer? Join our team and help build the future of our platform.",
      link: "/contactus",
      color: "bg-blue-500/10 dark:bg-blue-500/5",
      iconColor: "text-blue-500",
    },
    {
      title: "Feedback",
      icon: MessageSquare,
      description:
        "Your feedback helps us improve. Share your experience and suggestions.",
      link: "/contactus",
      color: "bg-purple-500/10 dark:bg-purple-500/5",
      iconColor: "text-purple-500",
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative flex items-center">
      {/* Background pattern */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]">
          <svg className="w-full h-full">
            <pattern
              id="grid"
              width="32"
              height="32"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 .5H32M.5 0V32"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto"
        >
          <h1 className="text-3xl font-semibold mb-2 relative">
            Contribute
            <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mb-12">
            Help us shape the future of our platform. Your contributions make a
            difference.
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {contributionTypes.map((type, index) => (
              <motion.div
                key={type.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 + 0.2 }}
              >
                <Link href={type.link}>
                  <Card className="p-6 h-full bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg group">
                    <div
                      className={`w-12 h-12 rounded-lg ${type.color} flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110`}
                    >
                      <type.icon className={`w-6 h-6 ${type.iconColor}`} />
                    </div>
                    <h3 className="text-lg font-medium mb-2 group-hover:text-blue-500 transition-colors">
                      {type.title}
                    </h3>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                      {type.description}
                    </p>
                    <div className="flex items-center text-sm text-blue-500 font-medium opacity-0 transform translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                      Learn more
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Decorative gradient orbs */}
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/5 rounded-full blur-3xl -translate-x-1/2" />
      <div className="absolute bottom-1/4 right-0 w-96 h-96 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl translate-x-1/2" />
    </div>
  );
}
