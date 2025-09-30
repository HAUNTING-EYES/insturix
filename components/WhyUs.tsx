"use client";

import { motion } from "framer-motion";
import { HoverCard } from "./ui/HoverCard";
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
    title: "Innovative Solutions",
    description:
      "We leverage cutting-edge technology to solve complex problems.",
    icon: Lightbulb,
  },
  {
    title: "Rapid Deployment",
    description:
      "Our streamlined processes ensure quick implementation of solutions.",
    icon: Rocket,
  },
  {
    title: "Customer-Centric Approach",
    description:
      "Your success is our priority. We tailor our services to your needs.",
    icon: Users,
  },
  {
    title: "Robust Security",
    description:
      "We implement state-of-the-art security measures to protect your data.",
    icon: Shield,
  },
  {
    title: "24/7 Support",
    description: "Our dedicated team is always available to assist you.",
    icon: Clock,
  },
  {
    title: "Proven Track Record",
    description:
      "Years of successful projects and satisfied clients speak for themselves.",
    icon: HeartHandshake,
  },
];

export function WhyUs() {
  return (
    <div className="py-6 sm:py-12 md:py-16 bg-[rgb(var(--surface-0))]">
      <section className="container mx-auto px-4 sm:px-6 space-y-6 sm:space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="text-center space-y-4 sm:space-y-6 mb-8"
        >
          <div className="flex flex-col items-center space-y-2">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">
              Why Choose Us?
            </h1>
            <div className="flex items-center space-x-4">
              <div className="h-[1px] w-12 bg-neutral-300 dark:bg-neutral-700" />
              <div className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600" />
              <div className="h-[1px] w-12 bg-neutral-300 dark:bg-neutral-700" />
            </div>
          </div>
          <motion.p
            className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-6 sm:px-4 md:px-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            Discover the unique advantages that set us apart
          </motion.p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6 pb-12 sm:pb-16 md:pb-20 overflow-visible">
          {reasons.map((reason, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{
                opacity: 1,
                y: 0,
                transition: {
                  type: "spring",
                  duration: 0.8,
                  delay: index * 0.1,
                },
              }}
              viewport={{ once: true, amount: 0.05, margin: "100px" }}
              className="h-full touch-hover"
            >
              <HoverCard className="h-full relative overflow-hidden">
                <div className="relative z-10 h-full flex flex-col p-1 sm:p-0">
                  <div className="flex items-start sm:items-center gap-3 mb-3 sm:mb-4">
                    <motion.div
                      className="p-2 rounded-lg bg-primary/10 touch-feedback flex-shrink-0"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <reason.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                    </motion.div>
                    <h3 className="text-lg sm:text-xl font-semibold leading-tight">{reason.title}</h3>
                  </div>
                  <p className="text-sm sm:text-base text-muted-foreground grow leading-relaxed">
                    {reason.description}
                  </p>
                </div>
              </HoverCard>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
