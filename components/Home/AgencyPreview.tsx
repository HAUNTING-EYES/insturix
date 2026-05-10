"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Building2, Shield, Zap } from "lucide-react";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

export default function AgencyPreview() {
  return (
    <section
      className="relative bg-zinc-50"
      style={{
        clipPath: "polygon(0 80px, 100% 0, 100% calc(100% - 80px), 0 100%)",
        paddingTop: "calc(5rem + 80px)",
        paddingBottom: "calc(5rem + 80px)",
        marginTop: "-2px",
        marginBottom: "-2px",
      }}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.1 } },
          }}
          className="max-w-5xl mx-auto rounded-[2rem] bg-white border border-zinc-200 shadow-2xl p-8 md:p-12 lg:p-16"
        >
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            {/* Text Content — staggered */}
            <motion.div
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.08 } },
              }}
              className="lg:w-1/2"
            >
              <motion.div
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-200 bg-zinc-100 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-6 drop-shadow-sm"
              >
                <Building2 className="w-3 h-3" />
                Enterprise
              </motion.div>
              <motion.h2
                variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } } }}
                className="text-[32px] md:text-[44px] font-black tracking-tight text-zinc-950 mb-6 leading-[1.1]"
              >
                Insturix{" "}
                <span className="text-zinc-400">Creatives Agency</span>
              </motion.h2>
              <motion.p
                variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
                className="text-lg text-zinc-600 mb-10 leading-relaxed font-medium"
              >
                Custom AI pipelines, dedicated infrastructure, and white-glove onboarding for teams that move fast.
              </motion.p>

              <motion.div
                variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
              >
                <Link href="/insturix-creatives-agency">
                  <motion.button
                    whileHover={{ scale: 1.04, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
                    whileTap={{ scale: 0.97 }}
                    className="px-8 py-4 bg-zinc-950 hover:bg-zinc-800 text-white font-semibold rounded-xl transition-all flex items-center gap-2 shadow-xl"
                  >
                    Explore Enterprise
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </Link>
              </motion.div>
            </motion.div>

            {/* Stats cards — staggered scale-in */}
            <motion.div
              variants={{
                hidden: {},
                show: { transition: { staggerChildren: 0.12, delayChildren: 0.2 } },
              }}
              className="lg:w-1/2 w-full grid grid-cols-1 sm:grid-cols-2 gap-4"
            >
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.95 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease } },
                }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-8 rounded-2xl bg-zinc-50/50 border border-zinc-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center mb-6 shadow-sm">
                  <Shield className="w-6 h-6 text-zinc-700" />
                </div>
                <h4 className="text-zinc-950 font-bold mb-2 text-lg">Security First</h4>
                <p className="text-sm text-zinc-500 leading-relaxed">SOC2 Type II, dedicated instances, custom data retention policies.</p>
              </motion.div>
              <motion.div
                variants={{
                  hidden: { opacity: 0, y: 20, scale: 0.95 },
                  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease } },
                }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-8 rounded-2xl bg-zinc-50/50 border border-zinc-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-white border border-zinc-200 flex items-center justify-center mb-6 shadow-sm">
                  <Zap className="w-6 h-6 text-zinc-700" />
                </div>
                <h4 className="text-zinc-950 font-bold mb-2 text-lg">Custom Integrations</h4>
                <p className="text-sm text-zinc-500 leading-relaxed">Direct pipeline connections to your existing DAM or custom CMS workflows.</p>
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
