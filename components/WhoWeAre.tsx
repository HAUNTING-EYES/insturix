"use client";

import { motion } from "framer-motion";
import { companyData } from "@/components/data/Company-Data";
import { Zap, BrainCircuit, Blocks, Users } from "lucide-react";

const iconComponents = {
  Zap,
  BrainCircuit,
  Blocks,
  Users,
};

export default function WhoWeAre() {
  return (
    <div className="bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <div className="container mx-auto px-4 py-24 space-y-32">
        <Header />
        <MissionVision />
        <Story />
        <Values />
      </div>
    </div>
  );
}

function Header() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="text-center space-y-8"
    >
      <h1 className="text-6xl font-bold bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
        Who We Are
      </h1>
      <motion.p
        className="text-2xl font-light max-w-3xl mx-auto leading-relaxed"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        Discover the passion and innovation behind{" "}
        <span className="text-2xl sm:text-2xl font-bold mb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
          {companyData.name}
        </span>
      </motion.p>
    </motion.div>
  );
}

function MissionVision() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.2 }}
      className="grid md:grid-cols-2 gap-16"
    >
      <motion.div
        className="bg-gray-50 dark:bg-black p-12 rounded-3xl shadow-2xl"
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-6xl font-bold border-b-2 border-black dark:border-white pb-4 mb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
          Our Mission
        </h2>
        <p className="text-xl leading-relaxed">{companyData.mission}</p>
      </motion.div>
      <motion.div
        className="bg-gray-50 dark:bg-black p-12 rounded-3xl shadow-2xl"
        whileHover={{ scale: 1.02 }}
        transition={{ duration: 0.3 }}
      >
        <h2 className="text-6xl font-bold border-b-2 border-black dark:border-white pb-4 mb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
          Our Vision
        </h2>
        <p className="text-xl leading-relaxed">{companyData.vision}</p>
      </motion.div>
    </motion.div>
  );
}

function Story() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.4 }}
      className="bg-gray-50 dark:bg-black p-16 rounded-3xl shadow-2xl"
    >
      <h2 className="text-6xl font-bold mb-12 inline-block border-b-2 border-black dark:border-white pb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
        Our Story
      </h2>
      <p className="text-2xl leading-loose">{companyData.story}</p>
    </motion.div>
  );
}

function Values() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.6 }}
    >
      <h2 className="text-6xl font-bold mb-16 text-center bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">Our Values</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
        {companyData.values.map((value, index) => {
          const IconComponent =
            iconComponents[value.icon as keyof typeof iconComponents];
          return (
            <motion.div
              key={value.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 * index }}
              className="flex flex-col items-center"
              whileHover={{ scale: 1.05 }}
            >
              <motion.div
                className="bg-black dark:bg-white p-8 rounded-full mb-8 shadow-xl"
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.6 }}
              >
                <IconComponent className="w-16 h-16 text-white dark:text-black" />
              </motion.div>
              <h3 className="text-3xl font-bold text-center mb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
                {value.name}
              </h3>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
