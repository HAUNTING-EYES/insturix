"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Building2, Shield, Zap } from "lucide-react";

export default function AgencyPreview() {
  return (
    <section className="py-24 bg-zinc-950 relative border-t border-zinc-900">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-5xl mx-auto rounded-2xl bg-zinc-900/50 border border-zinc-800 p-8 md:p-12 lg:p-16"
        >
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            {/* Text Content */}
            <div className="lg:w-1/2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-zinc-800 bg-zinc-900 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-6">
                <Building2 className="w-3 h-3" />
                Enterprise
              </div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-6 leading-tight">
                Insturix{" "}
                <span className="text-zinc-500">Creatives Agency</span>
              </h2>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                Custom AI pipelines, dedicated infrastructure, and white-glove onboarding for teams that move fast.
              </p>

              <Link href="/insturix-creatives-agency">
                <button className="px-6 py-3 bg-white hover:bg-zinc-100 text-zinc-950 font-semibold rounded-lg transition-colors flex items-center gap-2">
                  Explore Enterprise
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </div>

            {/* Stats cards */}
            <div className="lg:w-1/2 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
                <Shield className="w-7 h-7 text-zinc-400 mb-4" />
                <h4 className="text-white font-semibold mb-1">Security First</h4>
                <p className="text-sm text-zinc-500">SOC2 Type II, dedicated instances, custom data retention.</p>
              </div>
              <div className="p-6 rounded-xl bg-zinc-900 border border-zinc-800">
                <Zap className="w-7 h-7 text-zinc-400 mb-4" />
                <h4 className="text-white font-semibold mb-1">Custom Integrations</h4>
                <p className="text-sm text-zinc-500">Direct pipeline connections to your existing DAM or CMS.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
