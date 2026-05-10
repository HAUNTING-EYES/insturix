"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

export default function ClosingCTA() {
  return (
    <section className="py-32 bg-zinc-950 relative overflow-hidden">
      {/* Subtle top gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/20 to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.12 } },
          }}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.h2
            variants={{
              hidden: { opacity: 0, y: 30, scale: 0.95 },
              show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease } },
            }}
            className="text-[32px] md:text-[44px] font-bold tracking-tight text-zinc-50 mb-6"
          >
            Ready to run your content like a studio?
          </motion.h2>
          <motion.p
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
            }}
            className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto leading-relaxed"
          >
            Join thousands of creators and teams who have consolidated their workflow into one intelligent platform.
          </motion.p>

          <motion.div
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } },
            }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link href="/signup">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 10px 40px rgba(255,255,255,0.15)" }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 bg-white hover:bg-zinc-100 text-zinc-950 font-semibold rounded-lg transition-colors flex items-center gap-2 text-lg shadow-lg"
              >
                Start Building Free
                <ArrowRight className="w-5 h-5" />
              </motion.button>
            </Link>
            <Link href="/contactus">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="px-8 py-4 border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 font-medium rounded-lg transition-colors text-lg"
              >
                Talk to Sales
              </motion.button>
            </Link>
          </motion.div>

          {/* Trust indicators — staggered */}
          <motion.div
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } },
            }}
            className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-zinc-500"
          >
            {["No credit card required", "Pay-as-you-go credits", "Cancel anytime"].map((text) => (
              <motion.div
                key={text}
                variants={{
                  hidden: { opacity: 0, y: 10 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } },
                }}
                className="flex items-center gap-2"
              >
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                />
                {text}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
