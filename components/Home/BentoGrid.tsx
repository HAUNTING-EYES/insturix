"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { 
  Video, 
  Shield, 
  BarChart3, 
  Music, 
  MousePointer2, 
  Users,
  ArrowUpRight,
  BrainCircuit
} from "lucide-react";
import Link from "next/link";
import Spotlight from "@/components/ui/Spotlight";

const products = [
  {
    title: "Editron",
    description: "AI-powered video editing suite. Automate your workflow.",
    icon: Video,
    className: "md:col-span-2",
    href: "/products/editron",
    color: "#14B8A6", // Teal
    visual: (
      <div className="absolute right-0 bottom-0 w-3/4 h-3/4 bg-neutral-900/80 border-t border-l border-neutral-800 rounded-tl-2xl overflow-hidden group-hover:border-teal-500/30 transition-colors duration-500">
        <div className="w-full h-full p-4 grid gap-2">
          <div className="w-full h-8 bg-neutral-800/50 rounded animate-pulse" />
          <div className="w-3/4 h-8 bg-neutral-800/50 rounded animate-pulse delay-75" />
          <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-teal-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>
      </div>
    )
  },
  {
    title: "Shield",
    description: "Digital rights management & insurance.",
    icon: Shield,
    className: "md:col-span-1",
    href: "/products/shield",
    color: "#9333EA", // Purple
    visual: (
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
        <Shield className="w-32 h-32 text-purple-500/10" />
      </div>
    )
  },
  {
    title: "Alyzitron",
    description: "Pre-upload insights and post-upload analytics to maximize content performance.",
    icon: BarChart3,
    className: "md:col-span-2",
    href: "/products/alyzitron",
    color: "#3B81F5", // Blue
    visual: (
      <div className="absolute bottom-0 left-0 right-0 h-32 flex items-end justify-around px-8 pb-8 gap-2">
        {[40, 70, 50, 90, 60, 80].map((h, i) => (
          <motion.div 
            key={i} 
            className="w-full bg-neutral-800/50 rounded-t-sm group-hover:bg-blue-500/20 transition-colors duration-500"
            initial={{ height: "0%" }}
            whileInView={{ height: `${h}%` }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
          />
        ))}
      </div>
    )
  },
  {
    title: "Musitron",
    description: "Generate copyright-free, AI-composed music tailored to your video's mood.",
    icon: Music,
    className: "md:col-span-1",
    href: "/products/musitron",
    color: "#EAB308", // Amber
    visual: (
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
        <Music className="w-32 h-32 text-amber-500/10" />
      </div>
    )
  },
  {
    title: "Clickatron",
    description: "Optimize your CTR with AI thumbnails.",
    icon: MousePointer2,
    className: "md:col-span-1",
    href: "/products/clickatron",
    color: "#9333EA", // Purple (matches product page)
    visual: (
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
        <MousePointer2 className="w-32 h-32 text-purple-500/10" />
      </div>
    )
  },
  {
    title: "Socialize",
    description: "The ultimate customizable bio-link for creators. Own your traffic.",
    icon: Users,
    className: "md:col-span-1",
    href: "/products/socialize",
    color: "#0EA5E9", // Sky/Cyan (matches product page)
    visual: (
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
        <Users className="w-32 h-32 text-sky-500/10" />
      </div>
    )
  },
  {
    title: "ThinkForge",
    description: "Idea generation & brainstorming.",
    icon: BrainCircuit,
    className: "md:col-span-1",
    href: "/products/thinkforge",
    color: "#ef4444", // Red (matches product page)
    visual: (
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
        <BrainCircuit className="w-32 h-32 text-red-500/10" />
      </div>
    )
  }
];

export default function BentoGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], [100, -100]);

  return (
    <section ref={containerRef} className="py-24 bg-neutral-950 text-neutral-50 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="mb-16 relative">
          <motion.div style={{ y }} className="absolute -top-20 -left-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4 relative z-10">
            Our Ecosystem of <span
              className="px-2 ml-2 font-mono bg-neutral-800"
              style={{ fontFamily: '"Space Mono", "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, "Courier New", monospace' }}
            >
              Innovation
            </span>
          </h2>
          <p className="text-neutral-400 text-lg max-w-2xl relative z-10">
            A complete suite of AI-powered tools designed to supercharge every aspect of your creative journey.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[280px]">
          {products.map((product, i) => (
            <Spotlight
              key={product.title}
              className={`rounded-3xl ${product.className}`}
              spotlightColor={product.color + "26"} // 15% opacity hex
            >
              <Link href={product.href} className="block h-full">
                <div className="relative h-full p-8 flex flex-col z-10">
                  <div className="flex items-start justify-between mb-4">
                    <div 
                      className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 transition-colors duration-300"
                      style={{ borderColor: `${product.color}30` }}
                    >
                      <product.icon 
                        className="w-6 h-6 transition-colors duration-300" 
                        style={{ color: product.color }}
                      />
                    </div>
                    <ArrowUpRight className="w-5 h-5 text-neutral-600 group-hover:text-neutral-300 transition-colors" />
                  </div>
                  
                  <div className="mt-auto">
                    <h3 className="text-xl font-semibold mb-2 group-hover:text-white transition-colors">
                      {product.title}
                    </h3>
                    <p className="text-neutral-400 text-sm leading-relaxed max-w-[90%] group-hover:text-neutral-300 transition-colors">
                      {product.description}
                    </p>
                  </div>
                </div>

                {/* Visual Background Layer */}
                <div className="absolute inset-0 z-0 pointer-events-none">
                  {product.visual}
                </div>
              </Link>
            </Spotlight>
          ))}
        </div>
      </div>
    </section>
  );
}
