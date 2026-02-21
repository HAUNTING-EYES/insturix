"use client";

import { motion } from "framer-motion";

export function ScannerDivider() {
  return (
    <div className="w-full py-16 flex items-center justify-center relative overflow-hidden">
      <div className="w-full max-w-6xl flex items-center opacity-60">
        {/* Left Line */}
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-zinc-700 relative overflow-hidden">
          <motion.div
            className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-zinc-400 to-transparent"
            animate={{ left: ["-100%", "100%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </div>
        
        {/* Center Nodes (Stepped/Diagonal abstract) */}
        <div className="px-4 flex items-center gap-2">
           <div className="w-1.5 h-1.5 bg-zinc-800 rotate-45" />
           <div className="w-2 h-2 border border-zinc-700 bg-zinc-950 rotate-45 relative">
              <motion.div 
                 animate={{ opacity: [0, 1, 0] }}
                 transition={{ duration: 3, repeat: Infinity, ease: "linear", times: [0.4, 0.5, 0.6] }}
                 className="absolute inset-0 bg-white/50"
              />
           </div>
           <div className="w-1.5 h-1.5 bg-zinc-800 rotate-45" />
        </div>

        {/* Right Line */}
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-zinc-700 relative overflow-hidden">
          <motion.div
            className="absolute top-0 bottom-0 w-24 bg-gradient-to-r from-transparent via-zinc-400 to-transparent"
            animate={{ left: ["100%", "-100%"] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        </div>
      </div>
    </div>
  );
}
