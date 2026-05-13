"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";

const tutorials = [
  {
    category: "Getting Started",
    items: [
      {
        title: "Quick Start Guide",
        description: "Learn the basics and get up and running in minutes",
        duration: "5 min read",
        difficulty: "Beginner",
      },
      {
        title: "Platform Overview",
        description: "Understanding the key features and capabilities",
        duration: "10 min read",
        difficulty: "Beginner",
      },
    ],
  },
  {
    category: "Advanced Topics",
    items: [
      {
        title: "API Integration",
        description: "Learn how to integrate our APIs into your applications",
        duration: "15 min read",
        difficulty: "Advanced",
      },
      {
        title: "Security Best Practices",
        description: "Implementing secure authentication and data protection",
        duration: "20 min read",
        difficulty: "Advanced",
      },
    ],
  },
  {
    category: "Tips & Tricks",
    items: [
      {
        title: "Performance Optimization",
        description: "Optimize your implementation for better performance",
        duration: "12 min read",
        difficulty: "Intermediate",
      },
      {
        title: "Troubleshooting Guide",
        description: "Common issues and their solutions",
        duration: "8 min read",
        difficulty: "Intermediate",
      },
    ],
  },
];

export default function TutorialContent() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
      {/* Animated wave background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <svg
          className="absolute w-full h-64 opacity-[0.03] dark:opacity-[0.05]"
          viewBox="0 0 1440 320"
        >
          <motion.path
            initial={{
              d: "M0,192L48,165.3C96,139,192,85,288,80C384,75,480,117,576,149.3C672,181,768,203,864,186.7C960,171,1056,117,1152,101.3C1248,85,1344,107,1392,117.3L1440,128L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z",
            }}
            animate={{
              d: [
                "M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,101.3C672,85,768,107,864,128C960,149,1056,171,1152,165.3C1248,160,1344,128,1392,112L1440,96L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z",
                "M0,192L48,197.3C96,203,192,213,288,192C384,171,480,117,576,101.3C672,85,768,107,864,128C960,149,1056,171,1152,165.3C1248,160,1344,128,1392,112L1440,96L1440,0L1392,0C1344,0,1248,0,1152,0C1056,0,960,0,864,0C768,0,672,0,576,0C480,0,384,0,288,0C192,0,96,0,48,0L0,0Z",
              ],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              repeatType: "reverse",
            }}
            fill="currentColor"
          />
        </svg>
      </div>

      <div className="container mx-auto px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-6xl mx-auto space-y-12"
        >
          {/* Search Section */}
          <div className="relative flex flex-col items-center text-center space-y-4">
            <h1 className="text-[32px] font-semibold mb-2">
              Tutorials & Documentation
              <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 max-w-2xl">
              Learn how to make the most of our platform with detailed tutorials
              and guides
            </p>
            <div className="w-full max-w-md mt-6">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-zinc-400" />
                <Input placeholder="Search tutorials..." className="pl-10" />
              </div>
            </div>
          </div>

          {/* Tutorial Categories */}
          {tutorials.map((category, index) => (
            <motion.section
              key={category.category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-semibold">{category.category}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {category.items.map((item) => (
                  <Link href="#" key={item.title}>
                    <Card className="p-6 h-full bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs border-zinc-200/40 dark:border-[rgb(var(--border-light))]/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
                      <h3 className="text-lg font-medium mb-2 group-hover:text-blue-500">
                        {item.title}
                      </h3>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                        {item.description}
                      </p>
                      <div className="flex items-center justify-between text-sm text-zinc-500">
                        <span>{item.duration}</span>
                        <span className="px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                          {item.difficulty}
                        </span>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </motion.section>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
 