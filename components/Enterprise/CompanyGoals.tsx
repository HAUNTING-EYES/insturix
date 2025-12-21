"use client";

import { motion } from "framer-motion";
import { CpuArchitecture } from "@/components/ui/CpuArchitecture";

export default function CompanyGoals() {
  return (
    <section className="py-24 bg-neutral-950 text-neutral-50 relative overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center max-w-3xl mx-auto"
        >
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">
            The Central Nervous System
          </h2>
          <p className="text-lg text-neutral-400">
            Insturix connects every aspect of your content operation into a single, unified brain.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1 }}
          className="w-full h-[400px] md:h-[600px] flex items-center justify-center -mt-12"
        >
          <CpuArchitecture />
        </motion.div>
      </div>
    </section>
  );
}
