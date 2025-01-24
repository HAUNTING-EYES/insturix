"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import React from "react";
import * as LucideIcons from "lucide-react";

interface Feature {
  title: string;
  description: string;
  icon: string;
}

export default function Features({ features }: { features: Feature[] }) {
  const getIcon = (iconName: string) => {
    const Icon = (LucideIcons[iconName as keyof typeof LucideIcons] || LucideIcons.HelpCircle) as React.ElementType;
    return Icon;
  };

  return (
    <div className="relative bg-zinc-50 dark:bg-black py-16 sm:py-20">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-blue-950/5 to-transparent dark:via-blue-950/10" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.015] mix-blend-overlay" />
      </div>

      <section className="container relative mx-auto px-4">
        <motion.div className="text-center space-y-4 mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            Key Features
          </h2>
          <motion.p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Powerful capabilities that drive our platform
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.05, margin: "100px" }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card
                variant="interactive"
                className="backdrop-blur-xs bg-white/80 dark:bg-zinc-900/80 hover:translate-y-[-2px] transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5"
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <motion.div
                      className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      {(() => {
                        const Icon = getIcon(feature.icon);
                        return <Icon className="w-6 h-6 text-zinc-900 dark:text-zinc-100" />;
                      })()}
                    </motion.div>
                    <h3 className="text-xl font-semibold">{feature.title}</h3>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
