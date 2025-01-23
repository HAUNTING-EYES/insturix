"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function AboutContent() {
    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
            {/* Animated dot pattern background */}
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
                            <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-sm h-full">
                                <h2 className="text-xl font-semibold mb-4">Our Vision</h2>
                                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                                    At Insturance, we envision a world where technology seamlessly integrates with daily life, making digital experiences more intuitive, secure, and accessible for everyone.
                                </p>
                                <p className="text-zinc-600 dark:text-zinc-400">
                                    Our commitment to innovation drives us to develop cutting-edge solutions that address real-world challenges and transform industries.
                                </p>
                            </Card>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-sm h-full">
                                <h2 className="text-xl font-semibold mb-4">Our Mission</h2>
                                <p className="text-zinc-600 dark:text-zinc-400 mb-6">
                                    We're on a mission to revolutionize digital experiences through innovative technology solutions that empower businesses and individuals alike.
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
                                    title: "Innovation",
                                    description: "Pushing boundaries and exploring new possibilities in technology"
                                },
                                {
                                    title: "Excellence",
                                    description: "Striving for the highest quality in everything we do"
                                },
                                {
                                    title: "Integrity",
                                    description: "Building trust through transparency and ethical practices"
                                },
                                {
                                    title: "Collaboration",
                                    description: "Working together to achieve extraordinary results"
                                },
                                {
                                    title: "User-Focused",
                                    description: "Putting our users' needs at the heart of our solutions"
                                },
                                {
                                    title: "Impact",
                                    description: "Creating meaningful change in the digital landscape"
                                }
                            ].map((value, index) => (
                                <motion.div
                                    key={value.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    viewport={{ once: true }}
                                >
                                    <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-sm h-full">
                                        <h3 className="text-lg font-semibold mb-2">{value.title}</h3>
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
                        <h2 className="text-2xl font-semibold mb-6">Our Journey</h2>
                        <Card className="p-8 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-sm">
                            <div className="space-y-8">
                                {[
                                    {
                                        year: "2020",
                                        title: "The Beginning",
                                        description: "Founded with a vision to transform digital experiences"
                                    },
                                    {
                                        year: "2021",
                                        title: "Rapid Growth",
                                        description: "Expanded our team and launched our first major product"
                                    },
                                    {
                                        year: "2022",
                                        title: "Global Expansion",
                                        description: "Opened offices in multiple countries and reached 1M users"
                                    },
                                    {
                                        year: "2023",
                                        title: "Innovation Leader",
                                        description: "Recognized as an industry leader in AI solutions"
                                    }
                                ].map((milestone, index) => (
                                    <motion.div
                                        key={milestone.year}
                                        className="flex gap-4"
                                        initial={{ opacity: 0, x: -20 }}
                                        whileInView={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.2 }}
                                        viewport={{ once: true }}
                                    >
                                        <div className="text-lg font-semibold text-blue-500 w-20">
                                            {milestone.year}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold mb-1">{milestone.title}</h3>
                                            <p className="text-zinc-600 dark:text-zinc-400">
                                                {milestone.description}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
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
