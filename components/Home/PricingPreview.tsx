"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { SUBSCRIPTION_PLANS } from "@/lib/config/creditCosts";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

export default function PricingPreview() {
  return (
    <section className="py-24 bg-zinc-950 relative">
      <div className="container mx-auto px-4 sm:px-6">
        
        {/* Header — staggered entrance */}
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-60px" }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.1 } },
          }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <motion.p
            variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
            className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-4"
          >
            Simple Pricing
          </motion.p>
          <motion.h2
            variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }}
            className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-6"
          >
            Scale at your own pace.
          </motion.h2>
          <motion.p
            variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
            className="text-lg text-zinc-400"
          >
            Flexible monthly plans or top-up credits. Cancel anytime.
          </motion.p>
        </motion.div>

        {/* Pricing Cards — staggered with scale on highlighted */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mx-auto">
          {SUBSCRIPTION_PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: i * 0.12, ease }}
              whileHover={{
                y: -8,
                transition: { duration: 0.3, ease: "easeOut" },
              }}
              className={`relative p-8 rounded-2xl flex flex-col transition-shadow ${
                plan.popular
                  ? "bg-zinc-900 border-2 border-white/20 shadow-xl hover:shadow-2xl hover:shadow-white/5"
                  : "bg-zinc-900/50 border border-zinc-800 hover:shadow-xl hover:shadow-white/[0.02]"
              }`}
            >
              {plan.popular && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, y: 10 }}
                  whileInView={{ opacity: 1, scale: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.4, type: "spring", stiffness: 300 }}
                  className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-zinc-950 text-[10px] uppercase font-bold tracking-widest px-4 py-1 rounded-full"
                >
                  Most Popular
                </motion.div>
              )}
              
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-sm text-zinc-500">/mo</span>
                </div>
                <p className="text-sm text-zinc-500 mt-3">{plan.description}</p>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, fi) => (
                  <motion.li
                    key={feature}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.1 + fi * 0.05, ease }}
                    className="flex items-center gap-3 text-sm text-zinc-300"
                  >
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    {feature}
                  </motion.li>
                ))}
              </ul>

              <Link href="/upgrade">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 ${
                    plan.popular
                      ? "bg-white text-zinc-950 hover:bg-zinc-100"
                      : "bg-zinc-800 text-white hover:bg-zinc-700 border border-zinc-700"
                  }`}
                >
                  Get Started
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </Link>
            </motion.div>
          ))}

          {/* Enterprise Card */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: 3 * 0.12, ease }}
            whileHover={{
              y: -8,
              transition: { duration: 0.3, ease: "easeOut" },
            }}
            className="relative p-8 rounded-2xl flex flex-col transition-shadow bg-zinc-900/30 border border-dashed border-zinc-700 hover:border-zinc-500 hover:shadow-xl hover:shadow-white/[0.02]"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-2">Enterprise</h3>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-white">Custom</span>
              </div>
              <p className="text-sm text-zinc-500 mt-3">For large scale agencies and enterprises</p>
            </div>

            <ul className="space-y-3 mb-8 flex-1">
              <li className="flex items-center gap-3 text-sm text-zinc-300">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                Custom credit limits
              </li>
              <li className="flex items-center gap-3 text-sm text-zinc-300">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                Dedicated account manager
              </li>
              <li className="flex items-center gap-3 text-sm text-zinc-300">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                SLA & White-glove setup
              </li>
              <li className="flex items-center gap-3 text-sm text-zinc-300">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                Custom billing & APIs
              </li>
            </ul>

            <Link href="mailto:support@insturix.com">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 bg-transparent text-white border border-zinc-700 hover:bg-white/5"
              >
                Contact Support
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </Link>
          </motion.div>
        </div>

        {/* Note about Credits */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 }}
          className="mt-12 text-center"
        >
          <p className="text-zinc-500 text-sm">
            Need more? <Link href="/upgrade" className="text-zinc-300 hover:text-white underline underline-offset-4">Top-up credits</Link> as you go.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
