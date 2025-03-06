"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import Timeline from "./TimeLine";
import { useEffect } from "react";

export default function AboutContent() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 30, stiffness: 200 };
  const moveX = useSpring(mouseX, springConfig);
  const moveY = useSpring(mouseY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Convert mouse position to relative values (-0.5 to 0.5)
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      mouseX.set(x);
      mouseY.set(y);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [mouseX, mouseY]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
      {/* Background dots with perspective movement */}
      <motion.div 
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{
          perspective: "1000px",
          transformStyle: "preserve-3d"
        }}
      >
        <motion.div 
          className="absolute inset-0"
          style={{
            rotateX: moveY.get() * 20,
            rotateY: moveX.get() * -20,
            transformStyle: "preserve-3d"
          }}
        >
          {[...Array(150)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 bg-blue-500/20 dark:bg-blue-400/10 rounded-full"
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0.1, 0.3, 0.1],
                scale: [1, 1.2, 1],
                z: Math.random() * 100 - 50 // Random Z position for depth
              }}
              transition={{
                duration: Math.random() * 3 + 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                transform: `translateZ(${Math.random() * 50}px)`
              }}
            />
          ))}
        </motion.div>
      </motion.div>

      <div className="container mx-auto px-4 py-16 sm:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-6xl mx-auto space-y-24"
        >
          {/* Hero Section */}
          <section className="text-center py-16 relative">
            <motion.h1 
              className="text-5xl sm:text-7xl font-bold mb-6 relative inline-block"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              About Insturance
              <div className="absolute -top-8 -left-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl" />
              <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />
            </motion.h1>
            <p className="text-xl sm:text-2xl text-zinc-600 dark:text-zinc-400 max-w-3xl mx-auto mb-12">
              Building the future of digital solutions
            </p>
          </section>

          {/* Vision & Mission Section */}
          <section className="grid lg:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <Card className="p-8 bg-white/40 dark:bg-[rgb(var(--surface-1))]/40 backdrop-blur-lg border border-white/20 dark:border-white/10 shadow-xl hover:shadow-2xl transition-all duration-300 h-full">
                <h2 className="text-2xl font-semibold mb-6">Our Vision</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-lg">
                  To become the leading platform that revolutionizes the
                  influencer ecosystem by merging protection, innovation, and
                  growth, ensuring every creator feels secure, valued, and
                  unstoppable in their journey.
                </p>
                <p className="text-zinc-600 dark:text-zinc-400 text-lg">
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
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <Card className="p-8 bg-white/40 dark:bg-[rgb(var(--surface-1))]/40 backdrop-blur-lg border border-white/20 dark:border-white/10 shadow-xl hover:shadow-2xl transition-all duration-300 h-full">
                <h2 className="text-2xl font-semibold mb-6">Our Mission</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-6 text-lg">
                  To empower social media users, influencers, and content
                  creators by safeguarding their digital presence, simplifying
                  their growth journey, and providing them with tools to focus
                  on what they do best—creating impactful content thus creating
                  a whole ecosystem for the creators.
                </p>
                <Link href="/about/team">
                  <Button className="w-full group text-lg py-6">
                    Meet Our Team
                    <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              </Card>
            </motion.div>
          </section>

          {/* Values Section */}
          <section>
            <h2 className="text-3xl font-semibold mb-8 text-center">Our Values</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
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
                  whileHover={{ y: -5 }}
                  viewport={{ once: true }}
                  transition={{ 
                    delay: index * 0.1,
                    duration: 0.3
                  }}
                >
                  <Card className="p-6 bg-white/40 dark:bg-[rgb(var(--surface-1))]/40 backdrop-blur-lg border border-white/20 dark:border-white/10 shadow-lg hover:shadow-xl transition-all duration-300 h-full">
                    <h3 className="text-xl font-semibold mb-4">
                      {value.title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 text-base">
                      {value.description}
                    </p>
                  </Card>
                </motion.div>
              ))}
            </div>
          </section>

          {/* Journey Section */}
          <section>
            <Card className="p-8 bg-white/40 dark:bg-[rgb(var(--surface-1))]/40 backdrop-blur-lg border border-white/20 dark:border-white/10 shadow-xl hover:shadow-2xl transition-all duration-300 overflow-hidden">
              <Timeline />
            </Card>
          </section>

          {/* CTA Section */}
          <section className="text-center py-16">
            <Link href="/about/team">
              <Button size="lg" className="group text-lg py-6 px-8">
                Meet Our Team
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </section>
        </motion.div>
      </div>
    </div>
  );
}
