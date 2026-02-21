"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Building2, Shield, Zap } from "lucide-react";

export default function AgencyPreview() {
  return (
    // The outer wrapper has a negative margin top/bottom + extra padding to absorb
    // the area removed by clip-path, so content never gets visually clipped.
    <section
      className="relative bg-zinc-50"
      style={{
        clipPath: "polygon(0 80px, 100% 0, 100% calc(100% - 80px), 0 100%)",
        // Extra top/bottom padding to compensate for the clipped 80px on each side
        paddingTop: "calc(5rem + 80px)",
        paddingBottom: "calc(5rem + 80px)",
        // Pull the section into its neighbors so the clip looks "attached"
        marginTop: "-2px",
        marginBottom: "-2px",
      }}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-5xl mx-auto rounded-[2rem] bg-white border border-zinc-200 shadow-2xl p-8 md:p-12 lg:p-16"
        >
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            {/* Text Content */}
            <div className="lg:w-1/2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-6 drop-shadow-sm">
                <Building2 className="w-3 h-3" />
                Enterprise
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tight text-zinc-950 mb-6 leading-[1.1]">
                Insturix{" "}
                <span className="text-zinc-400">Creatives Agency</span>
              </h2>
              <p className="text-lg text-zinc-600 mb-10 leading-relaxed font-medium">
                Custom AI pipelines, dedicated infrastructure, and white-glove onboarding for teams that move fast.
              </p>

              <Link href="/insturix-creatives-agency">
                <button className="px-8 py-4 bg-zinc-950 hover:bg-zinc-800 text-white font-semibold rounded-xl transition-all flex items-center gap-2 shadow-xl hover:shadow-2xl hover:-translate-y-0.5">
                  Explore Enterprise
                  <ArrowRight className="w-4 h-4" />
                </button>
              </Link>
            </div>

            {/* Stats cards */}
            <div className="lg:w-1/2 w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-8 rounded-2xl bg-zinc-50/50 border border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center mb-6 shadow-sm">
                  <Shield className="w-6 h-6 text-zinc-700" />
                </div>
                <h4 className="text-zinc-950 font-bold mb-2 text-lg">Security First</h4>
                <p className="text-sm text-zinc-500 leading-relaxed">SOC2 Type II, dedicated instances, custom data retention policies.</p>
              </div>
              <div className="p-8 rounded-2xl bg-zinc-50/50 border border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center mb-6 shadow-sm">
                  <Zap className="w-6 h-6 text-zinc-700" />
                </div>
                <h4 className="text-zinc-950 font-bold mb-2 text-lg">Custom Integrations</h4>
                <p className="text-sm text-zinc-500 leading-relaxed">Direct pipeline connections to your existing DAM or custom CMS workflows.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
