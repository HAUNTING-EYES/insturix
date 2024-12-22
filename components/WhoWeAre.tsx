"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { companyData } from "@/components/data/Company-Data";
import { Lightbulb, Leaf, Eye, Users, Moon, Sun } from "lucide-react";

const iconComponents = {
  Lightbulb,
  Leaf,
  Eye,
  Users,
};

export default function WhoWeAre() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle("dark");
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? "dark" : ""}`}>
      <div className="bg-white dark:bg-gray-900 transition-colors duration-300">
        <div className="container mx-auto px-4 py-16">
          <Header />
          <MissionVision />
          <Story />
          <Values />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleDarkMode}
            className="fixed top-4 right-4 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white"
            aria-label={
              isDarkMode ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {isDarkMode ? (
              <Sun className="w-6 h-6" />
            ) : (
              <Moon className="w-6 h-6" />
            )}
          </motion.button>
        </div>
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
      className="text-center mb-16"
    >
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
        Who We Are
      </h1>
      <p className="text-xl text-gray-600 dark:text-gray-300">
        Discover the passion and innovation behind {companyData.name}
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
      className="mb-16"
    >
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Our Mission
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            {companyData.mission}
          </p>
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-lg">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Our Vision
          </h2>
          <p className="text-gray-700 dark:text-gray-300">
            {companyData.vision}
          </p>
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
      className="mb-16"
    >
      <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-4">
        Our Story
      </h2>
      <p className="text-gray-700 dark:text-gray-300">{companyData.story}</p>
    </motion.div>
  );
}

function Values() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.6 }}
      className="mb-16"
    >
      <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-8">
        Our Core Values
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
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
              <div className="bg-blue-100 dark:bg-blue-900 p-4 rounded-full mb-4">
                <IconComponent className="w-8 h-8 text-blue-600 dark:text-blue-300" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {value.name}
              </h3>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
