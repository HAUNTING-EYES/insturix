"use client";

import { motion } from "framer-motion";
import { PinContainer } from "@/components/ui/3d-pin";
import {
  TrendingUp,
  Shield,
  BarChart3,
  Layers,
  FastForward,
  Zap,
  BrainCircuit,
  HeartHandshake,
} from "lucide-react";

const benefits = [
  {
    title: "Scale Content Production",
    description:
      "Move briefs, scripts, edits, visuals, audio, analysis, publishing, and profiles through one automated production workflow.",
    icon: TrendingUp,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    stat: "Production Workflow",
    href: "/products",
    className: "md:col-span-2",
  },
  {
    title: "Protect Brand IP",
    description:
      "Keep digital assets secured with end-to-end encryption, workflow controls, and storage practices built for production teams.",
    icon: Shield,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    stat: "Brand Safety",
    href: "/legal/privacy#storage-security",
    className: "md:col-span-1",
  },
  {
    title: "Data-Driven Strategy",
    description:
      "Review brand fit, clarity, audience readiness, and channel packaging before content moves into production.",
    icon: BarChart3,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    stat: "Pre-Publish Review",
    href: "/products",
    className: "md:col-span-1",
  },
  {
    title: "Unified Workflow",
    description:
      "One platform for the content lifecycle: planning, production, review, publishing, and public profiles.",
    icon: Layers,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    stat: "One Production System",
    href: "/products",
    className: "md:col-span-1",
  },
  {
    title: "Accelerate Your Content Journey",
    description:
      "Turn approved ideas into packaged assets faster, with fewer handoffs between planning, production, and publishing.",
    icon: FastForward,
    color: "text-red-500",
    bg: "bg-red-500/10",
    stat: "Faster Production",
    href: "/products",
    className: "md:col-span-1",
  },
  {
    title: "Cost Optimization",
    description:
      "Reduce tool sprawl by bringing repetitive planning, editing, asset creation, and publishing work into one platform.",
    icon: Zap,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    stat: "Lower Tool Sprawl",
    href: "/products",
    className: "md:col-span-2",
  },
  {
    title: "Coordinate Teams and Partners",
    description:
      "Keep agencies, in-house teams, creator houses, and production partners aligned from brief to final delivery.",
    icon: HeartHandshake,
    color: "text-[#ff5722]",
    bg: "bg-[#ff5722]/10",
    stat: "Aligned Production",
    href: "/products",
    className: "md:col-span-2",
  },
  {
    title: "Automate the Heavy Lifting of Creation",
    description:
      "Let AI handle ideation, scripting, editing, visual assets, audio, and workflow management while your team focuses on strategy and storytelling.",
    icon: BrainCircuit,
    color: "text-orange-600",
    bg: "bg-orange-600/10",
    stat: "Automated Creation",
    href: "/products",
    className: "md:col-span-2",
  },
];

export default function EnterpriseBenefits() {
  return (
    <section className="py-24 bg-neutral-950 text-neutral-50 relative overflow-hidden">
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
            How businesses scale content production with Insturix
          </h2>
          <p className="text-lg text-neutral-400">
            One automated content production platform for teams that need planning, creation, review, and publishing to move together.
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
