"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import Timeline from "./TimeLine";
import { ScannerDivider } from "@/components/ui/ScannerDivider";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

export default function AboutContent() {
  return (
    <div className="min-h-screen bg-zinc-950 relative overflow-hidden font-inter">
      {/* Background radial gradient for subtle depth */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-radial from-zinc-900/50 to-transparent rounded-full opacity-30" />
      </div>

      <div className="container mx-auto px-4 py-24 sm:py-32 relative z-10">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.1 } },
          }}
          className="max-w-6xl mx-auto space-y-32"
        >
          {/* Hero Section */}
          <section className="text-center relative">
            <motion.div
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-8"
            >
              <span className="w-1 h-1 rounded-full bg-zinc-500 animate-pulse" />
              Our Evolution
            </motion.div>

            <motion.h1 
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }}
              className="text-[44px] sm:text-7xl font-bold mb-8 tracking-tighter text-white font-space-grotesk"
            >
              The Studio <span className="text-zinc-500">Vision.</span>
            </motion.h1>

            <motion.p 
              variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
              className="text-[18px] sm:text-2xl text-zinc-400 max-w-3xl mx-auto leading-relaxed"
            >
              Building the operating system for the next generation of content production.
            </motion.p>
          </section>

          {/* Vision & Mission Section */}
          <section className="grid lg:grid-cols-2 gap-8">
            <motion.div
              variants={{ hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0, transition: { duration: 0.6, ease } } }}
            >
              <div className="p-10 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all duration-300 h-full flex flex-col justify-center">
                <h2 className="text-2xl font-bold mb-6 text-white font-space-grotesk tracking-tight">Our Vision</h2>
                <p className="text-zinc-400 mb-6 text-lg leading-relaxed">
                  To become the definitive platform that revolutionizes the
                  influencer ecosystem by merging protection, innovation, and
                  growth.
                </p>
                <p className="text-zinc-500 text-lg leading-relaxed">
                  We are building toward a future where creators collaborate with 
                  autonomous tools that understand their brand language — 
                  transforming technical barriers into creative flow.
                </p>
              </div>
            </motion.div>

            <motion.div
              variants={{ hidden: { opacity: 0, x: 20 }, show: { opacity: 1, x: 0, transition: { duration: 0.6, ease } } }}
            >
              <div className="p-10 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all duration-300 h-full flex flex-col justify-center">
                <h2 className="text-2xl font-bold mb-6 text-white font-space-grotesk tracking-tight">Our Mission</h2>
                <p className="text-zinc-400 mb-8 text-lg leading-relaxed">
                  To empower social media users and creators by safeguarding their 
                  digital presence and providing the technical orchestration required 
                  to scale their impact globally.
                </p>
                <Link href="/about">
                  <motion.button 
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-5 bg-white text-zinc-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-colors hover:bg-zinc-100"
                  >
                    Meet Our Team
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>
                </Link>
              </div>
            </motion.div>
          </section>

          <ScannerDivider />

          {/* Values Section */}
          <section>
            <motion.h2 
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
              className="text-[32px] font-bold mb-12 text-center text-white font-space-grotesk tracking-tight"
            >
              Studio Principles
            </motion.h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                {
                  title: "Empowerment",
                  description:
                    "Providing the tools and confidence to scale production without technical bottlenecks.",
                },
                {
                  title: "Innovation",
                  description:
                    "Leveraging multi-modal AI to deliver unique, reliable, and scalable orchestration solutions.",
                },
                {
                  title: "Integrity",
                  description:
                    "Operating with transparency as the foundation for our users' protected growth.",
                },
                {
                  title: "Community First",
                  description:
                    "Fostering collaboration and inclusivity within the global creator economy.",
                },
              ].map((value, index) => (
                <motion.div
                  key={value.title}
                  variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, delay: index * 0.05, ease } } }}
                  whileHover={{ y: -8, transition: { duration: 0.3 } }}
                  className="p-8 rounded-2xl bg-zinc-900/30 border border-zinc-800/50 hover:border-zinc-700 transition-all duration-300 h-full"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center mb-6">
                    <Check className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-bold mb-4 text-white font-space-grotesk tracking-tight">
                    {value.title}
                  </h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">
                    {value.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Journey Section */}
          <section>
            <motion.div
              variants={{ hidden: { opacity: 0, y: 30 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}
              className="p-1 rounded-2xl bg-gradient-to-br from-zinc-800 to-transparent border border-zinc-800 overflow-hidden"
            >
              <div className="p-8 bg-zinc-950 rounded-[14px]">
                <Timeline />
              </div>
            </motion.div>
          </section>

          {/* CTA Section */}
          <section className="text-center py-16">
            <Link href="/about">
              <motion.button 
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center px-10 py-5 bg-zinc-900 border border-zinc-800 text-white font-bold rounded-xl gap-3 transition-all hover:bg-zinc-800 hover:border-zinc-700"
              >
                Meet the Architects
                <ArrowRight className="w-5 h-5 text-zinc-500" />
              </motion.button>
            </Link>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
