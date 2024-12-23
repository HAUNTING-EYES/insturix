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
    color: "bg-yellow-400",
  },
  {
    title: "Rapid Deployment",
    description:
      "Our streamlined processes ensure quick implementation of solutions.",
    icon: Rocket,
    color: "bg-red-500",
  },
  {
    title: "Customer-Centric Approach",
    description:
      "Your success is our priority. We tailor our services to your needs.",
    icon: Users,
    color: "bg-blue-500",
  },
  {
    title: "Robust Security",
    description:
      "We implement state-of-the-art security measures to protect your data.",
    icon: Shield,
    color: "bg-green-500",
  },
  {
    title: "24/7 Support",
    description: "Our dedicated team is always available to assist you.",
    icon: Clock,
    color: "bg-purple-500",
  },
  {
    title: "Proven Track Record",
    description:
      "Years of successful projects and satisfied clients speak for themselves.",
    icon: HeartHandshake,
    color: "bg-pink-500",
  },
];

export function WhyUs() {
  return (
    <section className="py-16 bg-white text-black dark:bg-black dark:text-white">
      <div className="container mx-auto px-4">
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-5xl md:text-6xl font-extrabold text-center mb-16"
        >
          <span className="bg-gradient-to-r from-purple-600 to-blue-600 text-transparent bg-clip-text">
            Why Choose Us?
          </span>
        </motion.h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {reasons.map((reason, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
            >
              <Card className="h-full transition-all duration-300 ease-in-out transform hover:scale-105 hover:shadow-2xl bg-black text-white dark:bg-white dark:text-black border-2 border-transparent hover:border-purple-600">
                <CardHeader className={`${reason.color} rounded-t-lg`}>
                  <CardTitle className="flex items-center space-x-3 text-white">
                    <reason.icon className="w-8 h-8" />
                    <span className="text-xl font-bold">{reason.title}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <p className="text-lg">{reason.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
        <motion.div
          className="mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
        ></motion.div>
      </div>
    </section>
  );
}
