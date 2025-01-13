"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { companyData } from "@/components/data/Company-Data";
import { Zap, BrainCircuit, Blocks, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HoverCard } from "./ui/HoverCard";

const iconComponents = {
  Zap,
  BrainCircuit,
  Blocks,
  Users,
};

function MainHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative inline-block">
      <h2 className="text-3xl font-semibold relative z-10">
        {children}
      </h2>
      <div className="absolute -bottom-2 left-0 w-full h-[0.2em] bg-neutral-200 dark:bg-neutral-800 rounded-full" />
      <div className="absolute -bottom-2 left-0 w-1/4 h-[0.2em] bg-neutral-400 dark:bg-neutral-600 rounded-full" />
    </div>
  );
}

function CardHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-2xl font-semibold relative after:content-[''] after:absolute after:-bottom-2 after:left-0 after:w-12 after:h-0.5 after:bg-neutral-300 dark:after:bg-neutral-700">
      {children}
    </h2>
  );
}

function DecorativeHeading({ children, centered = false }: { children: React.ReactNode, centered?: boolean }) {
  return (
    <div className={`flex flex-col ${centered ? 'items-center' : ''} space-y-2`}>
      <h2 className="text-3xl font-semibold">{children}</h2>
      <div className="flex items-center space-x-3">
        <div className="h-[1px] w-8 bg-neutral-300 dark:bg-neutral-700" />
        <div className="h-1 w-1 rounded-full bg-neutral-400 dark:bg-neutral-600" />
        <div className="h-[1px] w-8 bg-neutral-300 dark:bg-neutral-700" />
      </div>
    </div>
  );
}

export default function WhoWeAre() {
  return (
    <div className="relative mt-[calc(-200px-5vh)]">
      <div className="h-[200px] bg-gradient-to-b from-transparent via-[rgb(var(--background))]/40 to-[rgb(var(--background))]" />
      <div className="bg-[rgb(var(--background))]">
        <div className="container mx-auto px-4 py-12 space-y-12 pt-[100px]">
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
      <div className="flex flex-col items-center space-y-2">
        <h1 className="text-5xl font-bold tracking-tight">
          Who We Are
        </h1>
        <div className="flex items-center space-x-4">
          <div className="h-[1px] w-12 bg-neutral-300 dark:bg-neutral-700" />
          <div className="h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-600" />
          <div className="h-[1px] w-12 bg-neutral-300 dark:bg-neutral-700" />
        </div>
      </div>
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
      className="grid md:grid-cols-2 gap-4"
    >
      {[
        { title: "Our Mission", content: companyData.mission },
        { title: "Our Vision", content: companyData.vision }
      ].map((item) => (
        <HoverCard key={item.title}>
          <CardHeading>{item.title}</CardHeading>
          <p className="text-muted-foreground leading-relaxed mt-8">
            {item.content}
          </p>
        </HoverCard>
      ))}
    </motion.div>
  );
}

function Story() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{
        opacity: 1,
        y: 0,
        transition: {
          type: "spring",
          duration: 0.8
        }
      }}
      viewport={{ once: true, amount: 0.3 }}
      className="relative"
    >
      <HoverCard className="overflow-hidden">
        <CardHeading>Our Story</CardHeading>
        <motion.p
          className="text-muted-foreground leading-relaxed mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          {companyData.story}
        </motion.p>
        <motion.div
          className="absolute -bottom-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </HoverCard>
    </motion.div>
  );
}

function Values() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      whileInView={{
        opacity: 1,
        transition: {
          duration: 0.5
        }
      }}
      viewport={{ once: true, amount: 0.3 }}
      className="space-y-8"
    >
      <DecorativeHeading centered>Our Values</DecorativeHeading>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {companyData.values.map((value, index) => {
          const IconComponent = iconComponents[value.icon as keyof typeof iconComponents];
          return (
            <motion.div
              key={value.name}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{
                opacity: 1,
                scale: 1,
                transition: {
                  type: "spring",
                  duration: 0.5,
                  delay: index * 0.1
                }
              }}
              viewport={{ once: true, amount: 0.3 }}
              className="section-card relative overflow-hidden group cursor-pointer"
            >
              <motion.div
                className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent"
                initial={{ x: "-100%" }}
                whileHover={{ x: "0%" }}
                transition={{ duration: 0.3 }}
              />
              <motion.div
                className="relative z-10 flex flex-col items-center py-8"
                whileHover={{ y: -5 }}
                transition={{ duration: 0.2 }}
              >
                <IconComponent className="w-8 h-8 text-primary mb-4" />
                <h3 className="text-lg font-medium text-center">{value.name}</h3>
              </motion.div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
