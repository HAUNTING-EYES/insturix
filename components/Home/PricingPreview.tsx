"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    description: "Get started with basic access to all tools.",
    features: ["50 credits/month", "720p exports", "All 7 tools", "Community support"],
    cta: "Start Free",
    href: "/signup",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "₹999",
    period: "/month",
    description: "For creators who need serious processing power.",
    features: ["2,500 credits/month", "4K exports", "Priority processing", "Brand Vault", "Email support"],
    cta: "Upgrade to Pro",
    href: "/pricing",
    highlighted: true,
  },
  {
    name: "Credits",
    price: "₹149",
    period: "per 100",
    description: "Pay-as-you-go. No subscription needed.",
    features: ["Never expire", "Works across all tools", "Buy any amount", "Instant delivery"],
    cta: "Buy Credits",
    href: "/pricing",
    highlighted: false,
  },
];

export default function PricingPreview() {
  return (
    <section className="py-24 bg-zinc-950 relative">
      <div className="container mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-4">
            Simple Pricing
          </p>
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6">
            Scale at your own pace.
          </h2>
          <p className="text-lg text-zinc-400">
            Choose a plan or just buy credits. No hidden fees.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative p-8 rounded-2xl flex flex-col ${
                plan.highlighted
                  ? "bg-zinc-900 border-2 border-white/20 shadow-xl"
                  : "bg-zinc-900/50 border border-zinc-800"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-zinc-950 text-[10px] uppercase font-bold tracking-widest px-4 py-1 rounded-full">
                  Most Popular
                </div>
              )}
              
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">{plan.price}</span>
                  <span className="text-sm text-zinc-500">{plan.period}</span>
                </div>
                <p className="text-sm text-zinc-500 mt-3">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link href={plan.href}>
                <button className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                  plan.highlighted
                    ? "bg-white text-zinc-950 hover:bg-zinc-100"
                    : "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
                }`}>
                  {plan.cta}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
