"use client";

import { motion } from "framer-motion";
import { PinContainer } from "@/components/ui/3d-pin";
import {
  TrendingUp,
  Shield,
  BarChart3,
  Layers,
  ArrowRight,
  FastForward,
  Lock,
  Zap,
  Headphones,
  BrainCircuit,
  HeartHandshake,
} from "lucide-react";

const benefits = [
  {
    title: "Scale Content Production",
    description: "Produce 300% more content without increasing headcount, Thinkforge, Editron, Clickatron and Alyzitron automate the heavy lifting of production.",
    icon: TrendingUp,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    stat: "300% More Output",
    href: "/products",
    className: "md:col-span-2",
  },
  {
    title: "Protect Brand IP",
    description: "Your digital assets Stay Secured with end-to-end encryption. Automated monitoring and rights management ensure your brand stays safe.",
    icon: Shield,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    stat: "100% Brand Safety",
    href: "/legal/privacy#storage-security",
    className: "md:col-span-1",
  },
  {
    title: "Data-Driven Strategy",
    description: "Stop guessing. Alyzitron provides pre-production insights so you invest in content that is guaranteed to perform.",
    icon: BarChart3,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    stat: "3x More Engagement",
    href: "/products/alyzitron",
    className: "md:col-span-1",
  },
  {
    title: "Unified Workflow",
    description: "One platform for the entire content lifecycle. From ideation to Upload.",
    icon: Layers,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    stat: "All-in-1 Ecosystem",
    href: "/products",
    className: "md:col-span-1",
  },
  {
    title: "Accelerate Your Content Journey",
    description: "Turn ideas into revenue faster—so every piece ships sooner and travels further.",
    icon: FastForward,
    color: "text-red-500",
    bg: "bg-red-500/10",
    stat: "10x Faster Lifecycle",
    href: "/products",
    className: "md:col-span-1",
  },
  {
    title: "Cost Optimization",
    description: "Reduce production overhead by 50%. Automate repetitive tasks and eliminate expensive fragmented toolchains.",
    icon: Zap,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    stat: "50% Cost Savings",
    href: "/products",
    className: "md:col-span-2",
  },
  {
    title: "Discover the right creators, fast",
    description: "One place to search, evaluate, and book verified and authentic creators for your promotions and brand campaigns—so every collaboration is on-brand and built to perform.",
    icon: HeartHandshake,
    color: "text-[#ff5722]",
    bg: "bg-[#ff5722]/10",
    stat: "10x Faster Creator Discovery",
    href: "/meditron",
    className: "md:col-span-2",
  },
  {
    title: "Automate the Heavy Lifting of Creation",
    description: "Let AI handle ideating, scripting, editing, thumbnails, and management while your team focuses on strategy and storytelling, not production grunt work.",
    icon: BrainCircuit,
    color: "text-orange-600",
    bg: "bg-orange-600/10",
    stat: "Automation of Creation",
    statLabel: "AI Models",
    href: "/products",
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
          <h2 className="text-[32px] sm:text-[44px] font-bold tracking-tight mb-6">
            How Businesses scale up with Insturix ?
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
                    </div>
                    
                    <h3 className="text-2xl font-bold text-white mb-3">
                      {benefit.title}
                    </h3>
                    
                    <p className="text-[14px] text-neutral-400 leading-relaxed">
                      {benefit.description}
                    </p>
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
