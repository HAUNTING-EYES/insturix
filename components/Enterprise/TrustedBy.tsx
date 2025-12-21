"use client";

import { motion } from "framer-motion";
import Image from "next/image";

const trustedPartners = [
  {
    name: "Google for Startups",
    logo: "/icons/Google_for_Startups_logo.svg",
  },
  {
    name: "Microsoft for Startups",
    logo: "/icons/Microsoft-for-Startups-alpha.png",
  },
];

export default function TrustedBy() {
  return (
    <section className="py-16 bg-neutral-950 text-neutral-50 border-y border-neutral-900">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <p className="text-sm text-neutral-500 uppercase tracking-widest mb-8 font-medium">
            Backed by industry leaders
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-16">
            {trustedPartners.map((partner, index) => (
              <motion.div
                key={partner.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-indigo-500/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <Image
                  src={partner.logo}
                  alt={partner.name}
                  width={160}
                  height={40}
                  className="relative h-8 w-auto object-contain invert opacity-50 group-hover:opacity-100 transition-opacity duration-300"
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

