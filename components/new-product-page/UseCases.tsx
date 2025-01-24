"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

interface UseCase {
  title: string;
  description: string;
}

// sample for usecases
// useCases = [
//   {
//     title: "Healthcare",
//     description: "AI-powered diagnostics and personalized treatment plans.",
//   },
//   {
//     title: "Finance",
//     description:
//       "Intelligent fraud detection and automated trading strategies.",
//   },
//   {
//     title: "Education",
//     description: "Adaptive learning systems and automated grading.",
//   },
// ];

export default function UseCases({ useCases }: { useCases: UseCase[] }) {
  return (
    <div className="relative bg-zinc-50 dark:bg-black py-16 sm:py-20">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-blue-950/5 to-transparent dark:via-blue-950/10" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.015] mix-blend-overlay" />
      </div>

      <section className="container relative mx-auto px-4">
        <motion.div className="text-center space-y-4 mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            Industry Use Cases
          </h2>
          <motion.p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            Explore how our solutions are applied across various industries
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {useCases.map((useCase, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
            >
              <Card
                variant="interactive"
                className="backdrop-blur-xs bg-white/80 dark:bg-zinc-900/80 hover:translate-y-[-2px] transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 p-6"
              >
                <h3 className="text-xl font-semibold mb-2">{useCase.title}</h3>
                <p className="text-muted-foreground">{useCase.description}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
