"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { timelineData } from "@/components/data/timeline";

interface TimelineEventProps {
  date: string;
  description: string;
}

const TimelineEvent = ({ date, description }: TimelineEventProps) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"]
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [0.3, 1]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.8, 1]);
  const x = useTransform(scrollYProgress, [0, 0.5], [-20, 0]);

  return (
    <motion.div
      ref={ref}
      className="mb-6 sm:mb-12 flex flex-col sm:flex-row items-start sm:items-center group"
      style={{ opacity, scale, x }}
    >
      <div className="w-full sm:w-40 flex-shrink-0 text-zinc-600 dark:text-zinc-400 font-bold pb-1 sm:pb-0 sm:pr-8 text-left sm:text-right relative text-sm sm:text-lg">
        {date}
      </div>
      <div className="flex-grow pl-4 sm:pl-8 py-3 sm:py-4 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 border-l-4 border-l-zinc-300 dark:border-l-zinc-700">
        <p className="text-zinc-800 dark:text-zinc-200 group-hover:text-black dark:group-hover:text-white transition-colors duration-300 text-sm sm:text-lg">
          {description}
        </p>
      </div>
    </motion.div>
  );
};

interface TimelineYearProps {
  year: string;
  title: string;
  description: string;
  events: TimelineEventProps[];
}

const TimelineYear = ({
  year,
  title,
  description,
  events,
}: TimelineYearProps) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"]
  });

  const opacity = useTransform(scrollYProgress, [0, 0.3], [0.3, 1]);
  const scale = useTransform(scrollYProgress, [0, 0.3], [0.95, 1]);
  const y = useTransform(scrollYProgress, [0, 0.3], [50, 0]);

  return (
    <motion.div
      ref={ref}
      className="mb-12 sm:mb-32 relative"
      style={{ opacity, scale }}
    >
      <motion.div className="mb-6 sm:mb-16 relative" style={{ y }}>
        <h3 className="text-3xl sm:text-7xl font-black text-zinc-800 dark:text-zinc-200 mb-2 sm:mb-4">
          {year}
        </h3>
        <h4 className="text-xl sm:text-4xl font-bold text-zinc-700 dark:text-zinc-300 mb-2 sm:mb-4">
          {title}
        </h4>
        <p className="text-base sm:text-2xl text-zinc-600 dark:text-zinc-400 max-w-3xl">
          {description}
        </p>
      </motion.div>
      <div className="pl-2 sm:pl-20 relative">
        {events.map((event, index) => (
          <TimelineEvent key={index} {...event} />
        ))}
      </div>
    </motion.div>
  );
};

export default function TimeLine() {
  return (
    <section className="sm:pt-16 px-3 md:px-12 lg:px-24 py-0 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 min-h-screen overflow-hidden">
      <motion.h2
        className="text-3xl sm:text-6xl font-black mb-8 sm:mb-24 text-zinc-800 dark:text-zinc-200 text-center bg-clip-text"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        Journey of Insturance ✨
      </motion.h2>
      <div className="max-w-6xl mx-auto">
        {timelineData.map((yearData, index) => (
          <TimelineYear key={index} {...yearData} />
        ))}
      </div>
    </section>
  );
}
