"use client";

import { motion } from "framer-motion";
import { PinContainer } from "@/components/ui/3d-pin";
import {
  TrendingUp,
  Shield,
  BarChart3,
  Layers,
  ArrowRight,
  Lock,
  Zap,
  Headphones,
  BrainCircuit,
} from "lucide-react";

const benefits = [
  {
    title: "Scale Content Production",
    description: "Produce 50% more content without increasing headcount. Editron and Musitron automate the heavy lifting of production.",
    icon: TrendingUp,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    stat: "50%",
    statLabel: "More Output",
    href: "/products/editron",
    className: "md:col-span-2",
  },
  {
    title: "Protect Brand IP",
    description: "Secure your digital assets with Shield. Automated monitoring and rights management ensure your brand stays safe.",
    icon: Shield,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    stat: "100%",
    statLabel: "Monitored",
    href: "/products/shield",
    className: "md:col-span-1",
  },
  {
    title: "Data-Driven Strategy",
    description: "Stop guessing. Alyzitron provides pre-production insights so you invest in content that is guaranteed to perform.",
    icon: BarChart3,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    stat: "3x",
    statLabel: "Engagement",
    href: "/products/alyzitron",
    className: "md:col-span-1",
  },
  {
    title: "Unified Workflow",
    description: "One platform for the entire content lifecycle. From ThinkForge ideation to Socialize distribution.",
    icon: Layers,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    stat: "All-in-1",
    statLabel: "Ecosystem",
    href: "/enterprise",
    className: "md:col-span-1",
  },
  {
    title: "Global Compliance",
    description: "Ensure your data and content adhere to global standards. SOC 2 Type 2, GDPR, and CCPA compliance built-in.",
    icon: Lock,
    color: "text-red-500",
    bg: "bg-red-500/10",
    stat: "100%",
    statLabel: "Compliant",
    href: "/enterprise",
    className: "md:col-span-1",
  },
  {
    title: "Cost Optimization",
    description: "Reduce production overhead by 40%. Automate repetitive tasks and eliminate expensive fragmented toolchains.",
    icon: Zap,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    stat: "40%",
    statLabel: "Savings",
    href: "/enterprise",
    className: "md:col-span-2",
  },
  {
    title: "Priority Support",
    description: "Get 24/7 access to our enterprise support team with guaranteed response times under one hour.",
    icon: Headphones,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    stat: "<1hr",
    statLabel: "Response",
    href: "/enterprise",
    className: "md:col-span-2",
  },
  {
    title: "Brand-Specific AI",
    description: "Train our AI models on your brand voice and style guides for perfectly aligned content every time.",
    icon: BrainCircuit,
    color: "text-indigo-500",
    bg: "bg-indigo-500/10",
    stat: "Custom",
    statLabel: "AI Models",
    href: "/enterprise",
    className: "md:col-span-2",
  },
];

export default function EnterpriseBenefits() {
  return (
    <section className="py-24 bg-neutral-950 text-neutral-50 relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="w-full px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-20 text-center max-w-3xl mx-auto"
        >
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">
            Why Choose Insturix Enterprise?
          </h2>
          <p className="text-lg text-neutral-400">
            Discover the unique advantages that set us apart from the competition.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12 w-full auto-rows-[300px]">
          {benefits.map((benefit, index) => (
            <motion.div
              key={benefit.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`flex items-center justify-center w-full ${benefit.className || ""}`}
            >
              <PinContainer
                title={benefit.stat}
                href={benefit.href}
                className="w-full h-full"
              >
                <div className="flex flex-col justify-between p-6 tracking-tight text-slate-100/50 w-full h-full bg-neutral-900/80 backdrop-blur-xl rounded-[1.5rem] border border-white/10 group-hover/pin:border-white/20 transition-colors">
                  <div>
                    <div className="flex justify-between items-start mb-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${benefit.bg}`}>
                        <benefit.icon className={`w-7 h-7 ${benefit.color}`} />
                      </div>
                      <div className="text-right opacity-0 group-hover/pin:opacity-100 transition-opacity duration-500 transform translate-y-2 group-hover/pin:translate-y-0">
                        <span className="text-xs font-bold uppercase tracking-wider text-white bg-white/10 px-2 py-1 rounded-md">
                          {benefit.statLabel}
                        </span>
                      </div>
                    </div>
                    
                    <h3 className="text-2xl font-bold text-white mb-3">
                      {benefit.title}
                    </h3>
                    
                    <p className="text-base text-neutral-400 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2 text-sm font-medium text-white/50 group-hover/pin:text-white transition-colors mt-6">
                    Learn more <ArrowRight className="w-4 h-4" />
                  </div>
                  
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/50 to-transparent rounded-b-[1.5rem] pointer-events-none" />
                </div>
              </PinContainer>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
