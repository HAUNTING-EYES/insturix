"use client";

import { motion } from "framer-motion";
import { companyData } from "@/components/data/Company-Data";
import { Lightbulb, Leaf, Eye, Users } from "lucide-react";

const iconComponents = {
  Lightbulb,
  Leaf,
  Eye,
  Users,
};

export default function WhoWeAre() {
  return (
    <div className="bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <div className="container mx-auto px-4 py-16 space-y-24">
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
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="text-center space-y-6"
    >
      <h1 className="text-6xl font-extrabold tracking-tight">Who We Are</h1>
      <p className="text-2xl font-light max-w-2xl mx-auto">
        Discover the passion and innovation behind{" "}
        <span className="font-semibold">{companyData.name}</span>
      </p>
    </motion.div>
  );
}

function MissionVision() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
    >
      <div className="grid md:grid-cols-2 gap-12">
        <div className="bg-gray-100 dark:bg-gray-900 p-8 rounded-2xl shadow-xl">
          <h2 className="text-3xl font-bold mb-6 border-b-2 border-blue-500 dark:border-blue-400 pb-2">
            Our Mission
          </h2>
          <p className="text-lg leading-relaxed">{companyData.mission}</p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-900 p-8 rounded-2xl shadow-xl">
          <h2 className="text-3xl font-bold mb-6 border-b-2 border-green-500 dark:border-green-400 pb-2">
            Our Vision
          </h2>
          <p className="text-lg leading-relaxed">{companyData.vision}</p>
        </div>
      </div>
    </motion.div>
  );
}

function Story() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className="bg-gray-50 dark:bg-gray-950 p-12 rounded-3xl shadow-2xl"
    >
      <h2 className="text-4xl font-bold mb-8 inline-block border-b-4 border-purple-500 dark:border-purple-400 pb-2">
        Our Story
      </h2>
      <p className="text-xl leading-loose">{companyData.story}</p>
    </motion.div>
  );
}

function Values() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.6 }}
    >
      <h2 className="text-4xl font-bold mb-12 text-center">Our Core Values</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
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
            >
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 p-6 rounded-full mb-6 shadow-lg">
                <IconComponent className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-center mb-2">
                {value.name}
              </h3>
              <p className="text-center text-gray-600 dark:text-gray-300">
                {value.name}
              </p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
