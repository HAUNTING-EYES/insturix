"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ClosingCTA() {
  return (
    <section className="py-32 bg-zinc-950 relative overflow-hidden">
      {/* Subtle top gradient for depth */}
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/20 to-transparent pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-zinc-50 mb-6">
            Ready to run your content like a studio?
          </h2>
          <p className="text-lg text-zinc-400 mb-10 max-w-xl mx-auto leading-relaxed">
            Join thousands of creators and teams who have consolidated their workflow into one intelligent platform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <button className="px-8 py-4 bg-white hover:bg-zinc-100 text-zinc-950 font-semibold rounded-lg transition-colors flex items-center gap-2 text-lg shadow-lg">
                Start Building Free
                <ArrowRight className="w-5 h-5" />
              </button>
            </Link>
            <Link href="/contactus">
              <button className="px-8 py-4 border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 font-medium rounded-lg transition-colors text-lg">
                Talk to Sales
              </button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-zinc-500">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              No credit card required
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Pay-as-you-go credits
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Cancel anytime
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
