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
    offset: ["start end", "center center"],
  });

  return (
    <motion.div
      ref={ref}
      className="mb-12 flex items-center group"
      style={{
        opacity: useTransform(scrollYProgress, [0, 1], [0.3, 1]),
        scale: useTransform(scrollYProgress, [0, 1], [0.8, 1]),
      }}
    >
      <div className="w-40 flex-shrink-0 text-blue-300 font-bold pr-8 text-right relative text-lg">
        {date}
        <div className="absolute top-3 -right-4 w-8 h-8 bg-blue-500 rounded-full transform group-hover:scale-150 transition-transform duration-300 z-10"></div>
      </div>
      <div className="flex-grow pl-8 py-4 bg-gray-800 rounded-lg shadow-lg hover:shadow-blue-500/20 transition-all duration-300 border-l-4 border-blue-500">
        <p className="text-gray-200 group-hover:text-white transition-colors duration-300 text-lg">
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
    offset: ["start end", "center center"],
  });

  return (
    <motion.div
      ref={ref}
      className="mb-32 relative"
      style={{
        opacity: useTransform(scrollYProgress, [0, 0.5], [0.3, 1]),
        scale: useTransform(scrollYProgress, [0, 0.5], [0.9, 1]),
      }}
    >
      <div className="mb-16 relative">
        <div className="absolute top-0 left-0 w-40 h-40 bg-blue-500 opacity-10 rounded-full -z-10 blur-3xl"></div>
        <motion.h3
          className="text-7xl font-black text-blue-500 mb-4"
          initial={{ x: -100, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          {year}
        </motion.h3>
        <motion.h4
          className="text-4xl font-bold text-white mb-4"
          initial={{ x: 100, opacity: 0 }}
          whileInView={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
        >
          {title}
        </motion.h4>
        <motion.p
          className="text-2xl text-gray-400 max-w-3xl"
          initial={{ y: 50, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
        >
          {description}
        </motion.p>
      </div>
      <div className="pl-20 relative">
        <div className="absolute top-0 left-40 w-1 h-full bg-blue-500/30 rounded-full"></div>
        {events.map((event, index) => (
          <TimelineEvent key={index} {...event} />
        ))}
      </div>
    </motion.div>
  );
};

export default function TimeLine() {
  return (
    <section className="py-32 px-4 md:px-12 lg:px-24 bg-gray-900 min-h-screen overflow-hidden">
      <motion.h2
        className="text-6xl font-black mb-24 text-white text-center bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        Journey of Insturance
      </motion.h2>
      <div className="max-w-6xl mx-auto">
        {timelineData.map((yearData, index) => (
          <TimelineYear key={index} {...yearData} />
        ))}
      </div>
    </section>
  );
}
