"use client";

import { motion } from "framer-motion";
import { Circle, ArrowUpRight, Zap, Sparkles, Edit, HandCoins, Music, Shield, Share2, Lightbulb, BarChart3, MousePointer2, Users, BrainCircuit, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Link from "next/link";
import Spotlight from "@/components/ui/Spotlight";

function ElegantShape({
    className,
    delay = 0,
    width = 400,
    height = 100,
    rotate = 0,
    gradient = "from-white/5",
    mobileWidth,
    mobileHeight,
}: {
    className?: string;
    delay?: number;
    width?: number;
    height?: number;
    rotate?: number;
    gradient?: string;
    mobileWidth?: number;
    mobileHeight?: number;
}) {
    return (
        <motion.div
            initial={{
                opacity: 0,
                y: -150,
                rotate: rotate - 15,
            }}
            animate={{
                opacity: 1,
                y: 0,
                rotate: rotate,
            }}
            transition={{
                duration: 2.4,
                delay,
                ease: [0.23, 0.86, 0.39, 0.96] as any,
                opacity: { duration: 1.2 },
            }}
            className={cn("absolute", className)}
        >
            <motion.div
                animate={{
                    y: [0, 15, 0],
                }}
                transition={{
                    duration: 12,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                }}
                className="relative"
            >
                {/* Mobile size */}
                <div
                    style={{
                        width: mobileWidth || width * 0.5,
                        height: mobileHeight || height * 0.5,
                    }}
                    className="md:hidden relative"
                >
                    <div
                        className={cn(
                            "absolute inset-0 rounded-full",
                            "bg-linear-to-r to-transparent",
                            gradient,
                            "backdrop-blur-[2px] border-2 border-white/15",
                            "shadow-[0_8px_32px_0_rgba(255,255,255,0.1)]",
                            "after:absolute after:inset-0 after:rounded-full",
                            "after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]"
                        )}
                    />
                </div>
                {/* Desktop size */}
                <div
                    style={{
                        width,
                        height,
                    }}
                    className="hidden md:block relative"
                >
                    <div
                        className={cn(
                            "absolute inset-0 rounded-full",
                            "bg-linear-to-r to-transparent",
                            gradient,
                            "backdrop-blur-[2px] border-2 border-white/15",
                            "shadow-[0_8px_32px_0_rgba(255,255,255,0.1)]",
                            "after:absolute after:inset-0 after:rounded-full",
                            "after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.2),transparent_70%)]"
                        )}
                    />
                </div>
            </motion.div>
        </motion.div>
    );
}

const products = [
    {
        id: "alyzitron",
        title: "Alyzitron",
        description: "Perfect your video before you publish with AI-powered analytics and quality scoring.",
        icon: BarChart3,
        href: "/products/alyzitron",
        className: "md:col-span-2",
        color: "#3B81F5", // Blue
        visual: (
            <div className="absolute bottom-0 left-0 right-0 h-40 flex items-end justify-around px-8 pb-8 gap-2 opacity-50 group-hover:opacity-100 transition-opacity duration-500">
                {[40, 70, 50, 90, 60, 80, 45, 75].map((h, i) => (
                    <motion.div
                        key={i}
                        className="w-full bg-neutral-800/50 rounded-t-sm group-hover:bg-blue-500/20 transition-colors duration-500"
                        initial={{ height: "10%" }}
                        whileInView={{ height: `${h}%` }}
                        transition={{ delay: i * 0.1, duration: 0.5 }}
                    />
                ))}
            </div>
        )
    },
    {
        id: "clickatron",
        title: "Clickatron",
        description: "Generate viral thumbnails that maximize CTR using advanced AI models.",
        icon: MousePointer2,
        href: "/products/clickatron",
        className: "md:col-span-1",
        color: "#9333EA", // Purple
        visual: (
             <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
                <MousePointer2 className="w-40 h-40 text-purple-500/20" />
            </div>
        )
    },
    {
        id: "editron",
        title: "Editron",
        description: "Automate video editing. Cut, crop, and enhance with a single click.",
        icon: Video,
        href: "/products/editron",
        className: "md:col-span-1",
        color: "#14B8A6", // Teal
        visual: (
            <div className="absolute right-0 bottom-0 w-3/4 h-3/4 bg-neutral-900/80 border-t border-l border-neutral-800 rounded-tl-2xl overflow-hidden group-hover:border-teal-500/30 transition-colors duration-500">
                <div className="w-full h-full p-4 grid gap-2">
                    <div className="w-full h-8 bg-neutral-800/50 rounded animate-pulse" />
                    <div className="w-3/4 h-8 bg-neutral-800/50 rounded animate-pulse delay-75" />
                    <div className="absolute bottom-0 left-0 h-1 w-full bg-linear-to-r from-teal-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>
            </div>
        )
    },
    {
        id: "meditron",
        title: "Meditron",
        description: "Connect with premium brands for sponsorships and monetise your influence.",
        icon: HandCoins,
        href: "/products/meditron",
        className: "md:col-span-2",
        color: "#22c55e", // Green
        visual: (
             <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
                <HandCoins className="w-48 h-48 text-green-500/10 -rotate-12" />
            </div>
        )
    },
    {
        id: "thinkforge",
        title: "ThinkForge",
        description: "Brainstorm viral content ideas and generate scripts instantly.",
        icon: BrainCircuit,
        href: "/products/thinkforge",
        className: "md:col-span-2",
        color: "#ef4444", // Red
        visual: (
            <div className="absolute inset-0 flex items-center justify-center">
                 <div className="absolute inset-0 bg-grid-white/[0.02] bg-size-[20px_20px]" />
                 <BrainCircuit className="w-48 h-48 text-red-500/5 group-hover:text-red-500/10 transition-colors duration-500" />
            </div>
        )
    },
    {
        id: "musitron",
        title: "Musitron",
        description: "AI-composed royalty-free music tailored to your video's mood.",
        icon: Music,
        href: "/products/musitron",
        className: "md:col-span-1",
        color: "#EAB308", // Amber
        visual: (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
                <Music className="w-40 h-40 text-amber-500/20" />
            </div>
        )
    },
    {
        id: "shield",
        title: "Shield",
        description: "Protect your content and reputation with AI legal support.",
        icon: Shield,
        href: "/products/shield",
        className: "md:col-span-1",
        color: "#8b5cf6", // Violet
        visual: (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
                <Shield className="w-40 h-40 text-violet-500/20" />
            </div>
        )
    },
    {
        id: "socialize",
        title: "Socialize",
        description: "The ultimate link-in-bio tool to unify your digital presence.",
        icon: Users,
        href: "/products/socialize",
        className: "md:col-span-2",
        color: "#0EA5E9", // Sky
        visual: (
             <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-10 transition-opacity duration-500">
                <div className="flex gap-4">
                    <div className="w-12 h-12 rounded-full bg-sky-500/10 flex items-center justify-center border border-sky-500/20">
                         <Share2 className="w-6 h-6 text-sky-500/40" />
                    </div>
                     <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                         <Users className="w-6 h-6 text-blue-500/40" />
                    </div>
                     <div className="w-12 h-12 rounded-full bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20">
                         <Zap className="w-6 h-6 text-cyan-500/40" />
                    </div>
                </div>
            </div>
        )
    }
];

export default function ProductsPage() {
    const fadeUpVariants = {
        hidden: { opacity: 0, y: 30 },
        visible: (i: number) => ({
            opacity: 1,
            y: 0,
            transition: {
                duration: 1,
                delay: 0.5 + i * 0.2,
                ease: [0.25, 0.4, 0.25, 1] as any,
            },
        }),
    };

  return (
        <div className="min-h-screen bg-[#030303] text-white">
      <Navbar />
            
            <div className="relative w-full overflow-hidden">
                {/* Hero Background */}
                <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 via-transparent to-rose-500/5 blur-3xl" />
                
                {/* Elegant Shapes */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <ElegantShape
                        delay={0.3}
                        width={600}
                        height={140}
                        mobileWidth={280}
                        mobileHeight={70}
                        rotate={12}
                        gradient="from-indigo-500/15"
                        className="left-[-20%] md:left-[-5%] top-[15%] md:top-[20%]"
                    />
                    <ElegantShape
                        delay={0.5}
                        width={500}
                        height={120}
                        mobileWidth={240}
                        mobileHeight={60}
                        rotate={-15}
                        gradient="from-rose-500/15"
                        className="right-[-15%] md:right-[0%] top-[60%] md:top-[75%]"
                    />
                    <ElegantShape
                        delay={0.4}
                        width={300}
                        height={80}
                        mobileWidth={180}
                        mobileHeight={50}
                        rotate={-8}
                        gradient="from-violet-500/15"
                        className="hidden sm:block left-[5%] md:left-[10%] bottom-[5%] md:bottom-[10%]"
                    />
                    <ElegantShape
                        delay={0.6}
                        width={200}
                        height={60}
                        mobileWidth={120}
                        mobileHeight={35}
                        rotate={20}
                        gradient="from-amber-500/15"
                        className="hidden sm:block right-[15%] md:right-[20%] top-[10%] md:top-[15%]"
                    />
                    <ElegantShape
                        delay={0.7}
                        width={150}
                        height={40}
                        mobileWidth={100}
                        mobileHeight={25}
                        rotate={-25}
                        gradient="from-cyan-500/15"
                        className="hidden md:block left-[20%] md:left-[25%] top-[5%] md:top-[10%]"
                    />
                </div>

                {/* Hero Content */}
                <div className="relative z-10 container mx-auto px-4 md:px-6 pt-24 pb-12 md:pt-40 md:pb-24">
                    <div className="max-w-3xl mx-auto text-center">
                        <motion.div
                            custom={1}
                            variants={fadeUpVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <h1 className="text-3xl sm:text-5xl md:text-8xl font-bold mb-4 md:mb-8 tracking-tight leading-tight">
                                <span className="bg-clip-text text-transparent bg-linear-to-b from-white to-white/80">
                                    Empower Your
                                </span>
                                <br />
                                <span
                                    className={cn(
                                        "bg-clip-text text-transparent bg-linear-to-r from-indigo-300 via-white/90 to-rose-300 "
                                    )}
                                >
                                    Creative Journey
                                </span>
                            </h1>
                        </motion.div>

                        <motion.div
                            custom={2}
                            variants={fadeUpVariants}
                            initial="hidden"
                            animate="visible"
                        >
                            <p className="text-sm sm:text-base md:text-xl text-white/40 mb-6 md:mb-8 leading-relaxed font-light tracking-wide max-w-xl mx-auto">
                                Crafting exceptional digital experiences through
                                innovative design and cutting-edge technology.
                            </p>
                        </motion.div>
                    </div>
                </div>
            </div>

            {/* Products Bento Grid */}
            <div className="relative z-10 container mx-auto px-4 md:px-6 pb-16 md:pb-32">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 auto-rows-[240px] md:auto-rows-[300px]">
                    {products.map((product, i) => (
                        <Spotlight
                            key={product.id}
                            className={`rounded-3xl border-neutral-800 bg-neutral-900/50 ${product.className}`}
                            spotlightColor={product.color + "26"} // ~15% opacity hex
                        >
                            <Link href={product.href} className="block h-full group relative">
                                <div className="relative h-full p-5 md:p-8 flex flex-col z-20">
                                    <div className="flex items-start justify-between mb-4 md:mb-6">
                                        <div 
                                            className="p-2 md:p-3 rounded-xl md:rounded-2xl bg-neutral-950 border border-neutral-800 transition-all duration-300 group-hover:scale-110"
                                            style={{ borderColor: `${product.color}30` }}
                                        >
                                            <product.icon 
                                                className="w-5 h-5 md:w-6 md:h-6 transition-colors duration-300" 
                                                style={{ color: product.color }}
                                            />
                                        </div>
                                        <div className="p-2 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-y-2 group-hover:translate-y-0">
                                            <ArrowUpRight className="w-5 h-5 text-white" />
                                        </div>
                                    </div>
                                    
                                    <div className="mt-auto">
                                        <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-3 text-neutral-100 group-hover:text-white transition-colors">
                                            {product.title}
                                        </h3>
                                        <p className="text-neutral-400 text-xs sm:text-sm md:text-base leading-relaxed max-w-[95%] group-hover:text-neutral-300 transition-colors">
                                            {product.description}
                                        </p>
                                    </div>
                                </div>

                                {/* Visual Background Layer */}
                                <div className="absolute inset-0 z-0 overflow-hidden rounded-3xl">
                                    {product.visual}
                                    <div className="absolute inset-0 bg-linear-to-t from-neutral-950/80 via-neutral-950/40 to-transparent pointer-events-none" />
                                </div>
                            </Link>
                        </Spotlight>
                    ))}
                </div>
            </div>

      <Footer />
    </div>
  );
}
