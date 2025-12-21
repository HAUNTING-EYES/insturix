"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Spotlight from "@/components/ui/Spotlight";

export default function EnterpriseCTA() {
  return (
    <section className="py-24 bg-neutral-950 text-neutral-50 relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto"
        >
          <Spotlight
            className="rounded-3xl p-8 md:p-12 border-neutral-800 bg-neutral-900/90 backdrop-blur-xl shadow-2xl text-center"
            spotlightColor="rgba(99, 102, 241, 0.15)"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-white">
              Get started with Insturix Enterprise
            </h2>
            <p className="text-lg sm:text-xl text-neutral-300 mb-8 max-w-2xl mx-auto">
              Join thousands of enterprises scaling their content operations with our AI-powered creator ecosystem.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/contact-sales" className="w-full sm:w-auto group">
                <button className="relative w-full sm:w-auto px-8 py-4 bg-white text-black font-semibold rounded-full overflow-hidden transition-transform hover:scale-105 active:scale-95">
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    Contact Sales
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-500 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                </button>
              </Link>
              <Link href="/products" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto px-8 py-4 bg-neutral-900 text-white border border-neutral-800 font-semibold rounded-full hover:bg-neutral-800 hover:border-neutral-700 transition-all hover:scale-105 active:scale-95">
                  View Products
                </button>
              </Link>
            </div>
            <p className="text-sm text-neutral-500 mt-6">
              Questions? <Link href="/contactus" className="text-indigo-400 hover:text-indigo-300 underline">Contact our team</Link>
            </p>
          </Spotlight>
        </motion.div>
      </div>
    </section>
  );
}

