"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Timeline from "./TimeLine";

export default function AboutContent() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0">
          {[...Array(100)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-blue-500/20 dark:bg-blue-400/10 rounded-full"
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0.1, 0.3, 0.1],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-5xl mx-auto space-y-16"
        >
          {/* Hero Section */}
          <section>
            <h1 className="text-3xl font-semibold mb-2 relative">
              About Insturance
              <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 text-lg mb-8">
              Building the future of digital solutions
            </p>
          </section>

          {/* Vision & Mission Section */}
          <section className="grid lg:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs h-full">
                <h2 className="text-xl font-semibold mb-4">Our Vision</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                  To become the leading platform that revolutionizes the
                  influencer ecosystem by merging protection, innovation, and
                  growth, ensuring every creator feels secure, valued, and
                  unstoppable in their journey. We aim to tap into every social
                  media platform, creating a seamless and unified experience for
                  creators across all networks.
                </p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  As we evolve, our vision extends toward integrating
                  groundbreaking technologies like General AI, paving the way
                  for a future where creators can collaborate with tools that
                  understand and grow with them—transforming HUMAN aspirations
                  into tangible results.
                </p>
              </Card>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs h-full">
                <h2 className="text-xl font-semibold mb-4">Our Mission</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                  To empower social media users, influencers, and content
                  creators by safeguarding their digital presence, simplifying
                  their growth journey, and providing them with tools to focus
                  on what they do best—creating impactful content thus creating
                  a whole ecosystem for the creators.
                </p>
                <Link href="/about/team">
                  <Button className="w-full group">
                    Meet Our Team
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              </Card>
            </motion.div>
          </section>

          {/* Values Section */}
          <section>
            <h2 className="text-2xl font-semibold mb-6">Our Values</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  title: "Empowerment",
                  description:
                    "We strive to provide creators with the tools and confidence to grow without fear of setbacks.",
                },
                {
                  title: "Innovation",
                  description:
                    "Leveraging cutting-edge technology to deliver unique, reliable, and scalable solutions",
                },
                {
                  title: "Integrity",
                  description:
                    "We operate transparently and uphold trust as the foundation of our business.",
                },
                {
                  title: "Community First",
                  description:
                    "Supporting creators by fostering collaboration, inclusivity, and mutual growth.",
                },
              ].map((value, index) => (
                <motion.div
                  key={value.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  viewport={{ once: true }}
                >
                  <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs h-full">
                    <h3 className="text-lg font-semibold mb-2">
                      {value.title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                      {value.description}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Journey Section */}
          <section>
            <Card className="p-8 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs overflow-hidden">
              <Timeline />
            </Card>
          </section>

          {/* CTA Section */}
          <section className="text-center">
            <Link href="/about/team">
              <Button size="lg" className="group">
                Meet Our Team
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
