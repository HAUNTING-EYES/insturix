"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <section className="relative py-24">
      <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/50 to-background"></div>
      <div className="container relative mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          viewport={{ once: true }}
          className="text-center space-y-4 mb-16"
        >
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl primtext">
            Why Choose Us?
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Discover the unique advantages that set us apart
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map((reason, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
            >
              <Card className="h-full bg-card/50 backdrop-blur-sm border-neutral-200/50 dark:border-neutral-700/50 hover:bg-card/80 transition-all duration-300">
                <CardHeader>
                  <CardTitle className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <reason.icon className="w-6 h-6 text-primary" />
                    </div>
                    <span className="text-xl">{reason.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{reason.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}