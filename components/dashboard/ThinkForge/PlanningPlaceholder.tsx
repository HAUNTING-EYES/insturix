"use client";

import React from "react";
import { CalendarClock, Construction } from "lucide-react";
import { motion } from "framer-motion";

export default function PlanningPlaceholder() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full bg-[#0F0F0E]/20 backdrop-blur-sm rounded-2xl border border-[#1C1B19] m-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6 max-w-md"
      >
        <div className="relative">
            <div className="absolute inset-0 bg-[#D4A652]/20 blur-xl rounded-full" />
            <div className="relative h-20 w-20 bg-[#1C1B19]/80 rounded-2xl flex items-center justify-center border border-[#1C1B19] shadow-2xl">
                <CalendarClock className="h-10 w-10 text-[#D4A652]" />
            </div>
            <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-[#0F0F0E] rounded-lg flex items-center justify-center border border-[#1C1B19]">
                <Construction className="h-4 w-4 text-yellow-500" />
            </div>
        </div>
        
        <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-[#ECE9E1]">Planning Calendar Coming Soon</h2>
            <p className="text-[#7A776E] leading-relaxed">
                We're building a streamlined planner to map publish dates and content timelines. Stay tuned—this feature will arrive in the next update.
            </p>
        </div>
        
        <div className="px-4 py-2 rounded-full bg-[#0F0F0E] border border-[#1C1B19] text-[11px] font-medium text-[#7A776E]">
            Expected in next update
        </div>
      </motion.div>
    </div>
  );
}
