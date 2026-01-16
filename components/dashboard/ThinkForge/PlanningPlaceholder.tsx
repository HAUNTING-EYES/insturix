"use client";

import React from "react";
import { CalendarClock, Construction } from "lucide-react";
import { motion } from "framer-motion";

export default function PlanningPlaceholder() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center h-full bg-neutral-900/20 backdrop-blur-sm rounded-2xl border border-white/5 m-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center gap-6 max-w-md"
      >
        <div className="relative">
            <div className="absolute inset-0 bg-red-500/20 blur-xl rounded-full" />
            <div className="relative h-20 w-20 bg-neutral-800/80 rounded-2xl flex items-center justify-center border border-white/10 shadow-2xl">
                <CalendarClock className="h-10 w-10 text-red-400" />
            </div>
            <div className="absolute -bottom-2 -right-2 h-8 w-8 bg-neutral-900 rounded-lg flex items-center justify-center border border-white/10">
                <Construction className="h-4 w-4 text-yellow-500" />
            </div>
        </div>
        
        <div className="space-y-2">
            <h2 className="text-2xl font-semibold text-zinc-100">Planning Calendar Coming Soon</h2>
            <p className="text-zinc-400 leading-relaxed">
                We're building a streamlined planner to map publish dates and content timelines. Stay tuned—this feature will arrive in the next update.
            </p>
        </div>
        
        <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/50">
            Expected in next update
        </div>
      </motion.div>
    </div>
  );
}
