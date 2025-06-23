"use client";

import React, { useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useScroll, useTransform } from "framer-motion";
import { CheckCircle, Star, Zap, Crown, ArrowRight } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    description: "Get started with basic features",
    price: "$0",
    period: "per month",
    features: [
      "5 video analyses per month",
      "Basic risk assessment",
      "Content quality score",
      "Community support",
    ],
    cta: "Get Started",
    popular: false,
    gradient: "from-neutral-600 to-neutral-700",
    ctaVariant: "outline" as const,
  },
  {
    name: "Plus",
    description: "Advanced features for professionals",
    price: "$2.99",
    period: "per month",
    features: [
      "50 video analyses per month",
      "Advanced risk assessment",
      "Comprehensive SEO analysis",
      "Audience targeting insights",
      "Priority support",
    ],
    cta: "Start Free Trial",
    popular: true,
    gradient: "from-blue-500 to-blue-600",
    ctaVariant: "default" as const,
  },
  {
    name: "Pro",
    description: "Complete solution for teams",
    price: "$5.99",
    period: "per month",
    features: [
      "Unlimited video analyses",
      "Real-time risk monitoring",
      "Advanced AI recommendations",
      "Team collaboration tools",
      "24/7 dedicated support",
    ],
    cta: "Contact Sales",
    popular: false,
    gradient: "from-blue-600 to-cyan-500",
    ctaVariant: "default" as const,
  },
];

export default function AlyzitronPricing() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start end", "end start"],
  });
  const y1 = useTransform(scrollYProgress, [0, 1], [-150, 150]);
  const y2 = useTransform(scrollYProgress, [0, 1], [100, -100]);

  return (
    <section ref={targetRef} className="relative py-32 bg-white dark:bg-black">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-grid-neutral-100/5 dark:bg-grid-neutral-900/5 bg-[size:50px_50px]" />
        <motion.div style={{ y: y1 }} className="absolute inset-0 bg-gradient-to-r from-blue-800/10 via-transparent to-cyan-800/10 blur-3xl" />
        <motion.div style={{ y: y2 }} className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 container mx-auto px-6">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-blue-500/50 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm font-medium mb-6">
            <Crown className="w-4 h-4" />
            Simple Pricing
          </div>
          
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            <span className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-700 dark:from-white dark:via-neutral-200 dark:to-neutral-400 bg-clip-text text-transparent">
              Choose Your
            </span>
            <br />
            <span className="bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 bg-clip-text text-transparent">
              Perfect Plan
            </span>
          </h2>
          
          <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-2xl mx-auto leading-relaxed">
            Start with our free plan or unlock advanced features with our professional tiers. No hidden fees, cancel anytime.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.2 }}
              className={`group relative ${plan.popular ? 'md:scale-105' : ''}`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-semibold border-2 border-white dark:border-black">
                    <Star className="w-3 h-3" />
                    Most Popular
                  </div>
                </div>
              )}

              <div className={`relative h-full p-8 rounded-2xl border transition-all duration-300 ${
                plan.popular
                  ? 'bg-white dark:bg-neutral-900 border-blue-500'
                  : 'bg-white/80 dark:bg-neutral-900/80 backdrop-blur-sm border-neutral-200 dark:border-neutral-800 group-hover:border-neutral-300 dark:group-hover:border-neutral-700'
              }`}>
                
                {/* Plan Header */}
                <div className="text-center mb-8">
                  <div className={`inline-flex p-3 rounded-lg bg-gray-100 dark:bg-neutral-800 mb-4 border border-neutral-200 dark:border-neutral-700`}>
                    {plan.name === "Free" && <Zap className="w-6 h-6 text-blue-500" />}
                    {plan.name === "Plus" && <Star className="w-6 h-6 text-blue-500" />}
                    {plan.name === "Pro" && <Crown className="w-6 h-6 text-blue-500" />}
                  </div>
                  
                  <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
                    {plan.name}
                  </h3>
                  
                  <p className="text-neutral-600 dark:text-neutral-400 text-sm mb-4">
                    {plan.description}
                  </p>

                  <div className="flex items-baseline justify-center gap-2">
                    <span className="text-4xl font-bold text-neutral-900 dark:text-white">
                      {plan.price}
                    </span>
                    <span className="text-neutral-600 dark:text-neutral-400 text-sm">
                      {plan.period}
                    </span>
                  </div>
                </div>

                {/* Features */}
                <div className="space-y-4 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-neutral-700 dark:text-neutral-300 text-sm">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <Link href={plan.name === "Pro" ? "/contact" : "/signup"} className="block">
                  <Button
                    size="lg"
                    className={`w-full py-3 font-semibold transition-colors duration-200 ${
                      plan.popular
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-neutral-200 text-neutral-800 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {plan.cta}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </Link>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom Note */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="text-center mt-16"
        >
          <div className="inline-flex items-center gap-4 px-6 py-3 rounded-md bg-gray-100/80 dark:bg-neutral-900/80 border border-neutral-200 dark:border-neutral-800">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-neutral-700 dark:text-neutral-300 font-medium">
              7-day free trial • No credit card required • Cancel anytime
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}