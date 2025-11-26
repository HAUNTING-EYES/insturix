"use client";

import { motion } from "framer-motion";
import Spotlight from "@/components/ui/Spotlight";
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
    title: "Creator-First Architecture",
    description: "Built specifically for the unique needs of digital creators, not generic businesses.",
    icon: Lightbulb,
    color: "#6366F1", // Indigo
  },
  {
    title: "Rapid Implementation",
    description: "Get up and running in minutes with our intuitive, AI-driven onboarding.",
    icon: Rocket,
    color: "#10B981", // Emerald
  },
  {
    title: "Community Powered",
    description: "Join a thriving network of creators sharing insights, growth hacks, and support.",
    icon: Users,
    color: "#F59E0B", // Amber
  },
  {
    title: "Enterprise Security",
    description: "Bank-grade protection for your accounts and digital assets. Sleep soundly.",
    icon: Shield,
    color: "#F43F5E", // Rose
  },
  {
    title: "24/7 Expert Support",
    description: "Real humans who understand the creator economy, available whenever you need them.",
    icon: Clock,
    color: "#06B6D4", // Cyan
  },
  {
    title: "Proven Growth",
    description: "Our tools are backed by data and proven to increase engagement and revenue.",
    icon: HeartHandshake,
    color: "#8B5CF6", // Violet
  },
];

export function WhyUs() {
  return (
    <section className="py-24 bg-neutral-950 text-neutral-50 relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">
            Why Choose Us?
          </h2>
          <p className="text-lg text-neutral-400">
            Discover the unique advantages that set us apart from the competition.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map((reason, index) => (
            <Spotlight
              key={index}
              className="rounded-2xl p-8 min-h-[280px] flex flex-col justify-between group"
              spotlightColor={reason.color + "26"} // 15% opacity
            >
              <div 
                className="absolute top-4 right-6 text-9xl font-bold select-none pointer-events-none transition-colors duration-500"
                style={{ color: `${reason.color}10` }} // Very faint number
              >
                {String(index + 1).padStart(2, '0')}
              </div>
              
              <div className="relative z-10">
                <div 
                  className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-6 transition-colors duration-300"
                  style={{ borderColor: `${reason.color}30` }}
                >
                  <reason.icon 
                    className="w-6 h-6 transition-colors duration-300" 
                    style={{ color: reason.color }}
                  />
                </div>
                
                <h3 className="text-xl font-semibold mb-3 group-hover:text-white transition-colors">
                  {reason.title}
                </h3>
                <p className="text-neutral-400 leading-relaxed group-hover:text-neutral-300 transition-colors">
                  {reason.description}
                </p>
              </div>
            </Spotlight>
          ))}
        </div>
      </div>
    </section>
  );
}
