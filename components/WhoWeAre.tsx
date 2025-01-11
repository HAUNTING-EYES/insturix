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
    <div className="relative mt-[-150px]">
      <div className="h-[150px] bg-gradient-to-b from-transparent via-white/80 to-white dark:via-neutral-900/40 dark:to-neutral-900" />
      <div className="bg-neutral-50 dark:bg-neutral-900">
        <div className="container mx-auto px-6 py-20 space-y-24 pt-[150px]">
          <Header />
          <MissionVision />
          <Story />
          <Values />
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
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="text-center space-y-6"
    >
      <h1 className="text-5xl font-bold tracking-tight">
        Who We Are
      </h1>
      <motion.p
        className="text-xl text-muted-foreground max-w-2xl mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.2 }}
      >
        {companyData.name} is building the future of technology
      </motion.p>
    </motion.div>
  );
}

function MissionVision() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1 }}
      viewport={{ once: true }}
      className="grid md:grid-cols-2 gap-6"
    >
      {[
        { title: "Our Mission", content: companyData.mission },
        { title: "Our Vision", content: companyData.vision }
      ].map((item) => (
        <motion.div
          key={item.title}
          className="section-card card-hover"
        >
          <h2 className="text-2xl font-semibold mb-4">{item.title}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {item.content}
          </p>
        </motion.div>
      ))}
    </motion.div>
  );
}

function Story() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1 }}
      viewport={{ once: true }}
      className="section-card space-y-6"
    >
      <h2 className="text-2xl font-semibold">Our Story</h2>
      <p className="text-muted-foreground leading-relaxed">
        {companyData.story}
      </p>
    </motion.div>
  );
}

function Values() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1 }}
      viewport={{ once: true }}
      className="space-y-12"
    >
      <h2 className="text-2xl font-semibold text-center">Our Values</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {companyData.values.map((value, index) => {
          const IconComponent = iconComponents[value.icon as keyof typeof iconComponents];
          return (
            <motion.div
              key={value.name}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="section-card card-hover flex flex-col items-center py-12"
            >
              <motion.div
                className="mb-6"
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.3 }}
              >
                <IconComponent className="w-10 h-10 text-neutral-900 dark:text-neutral-50" />
              </motion.div>
              <h3 className="text-xl font-medium text-center">
                {value.name}
              </h3>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
