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
    <section className="py-16 bg-white text-black dark:text-white dark:bg-black">
      <div className="container mx-auto px-4">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className=" md:text-6xl text-6xl font-bold mb-16 text-center bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent"
        >
          Why Choose Us?
        </motion.h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {reasons.map((reason, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full transition-all duration-300 ease-in-out transform hover:scale-105 hover:shadow-2xl bg-white border-2 border-black">
                <CardHeader className="bg-black rounded-t-lg dark:bg-white">
                  <CardTitle className="flex items-center space-x-3 text-white">
                    <reason.icon className="w-8 h-8 dark:text-black" />
                    <span className="text-xl font-bold dark:text-black">{reason.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-lg text-black dark:text-white">{reason.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}