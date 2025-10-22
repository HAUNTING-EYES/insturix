"use client";

import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Calendar, MapPin, Gamepad2, IndianRupee } from "lucide-react";

export default function ICS25GamingPopup({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] p-0 overflow-hidden border-0 bg-transparent">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative bg-white dark:bg-zinc-900 backdrop-blur-xl rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
        >
          <div className="absolute inset-0 opacity-50">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-200/30 via-transparent to-sky-200/30 dark:from-violet-900/20 dark:via-transparent dark:to-sky-900/20" />
          </div>
          <div className="relative z-10 p-6 md:p-8 space-y-4">
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 text-center">ICS’25 Gaming Tournament (Sub-Event)</h2>
            <p className="text-center text-zinc-600 dark:text-zinc-400">Compete in Valorant or BGMI. Qualifiers online, grand finals offline.</p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/10 bg-zinc-50/70 dark:bg-white/5 p-4">
                <div className="text-sm text-zinc-500 dark:text-white/70 flex items-center gap-2"><Calendar className="w-4 h-4" /> Qualifiers</div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">1 Nov (Online) • 8 Nov (Online)</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-50/70 dark:bg-white/5 p-4">
                <div className="text-sm text-zinc-500 dark:text-white/70 flex items-center gap-2"><MapPin className="w-4 h-4" /> Finals</div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">22 Nov • Offline at IIIT Delhi</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-50/70 dark:bg-white/5 p-4">
                <div className="text-sm text-zinc-500 dark:text-white/70 flex items-center gap-2"><IndianRupee className="w-4 h-4" /> Entry Fee</div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">₹500 per player</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-zinc-50/70 dark:bg-white/5 p-4">
                <div className="text-sm text-zinc-500 dark:text-white/70 flex items-center gap-2"><Gamepad2 className="w-4 h-4" /> Games</div>
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">Valorant or BGMI</div>
              </div>
            </div>

            <p className="text-center text-sm text-zinc-700 dark:text-zinc-300">Cashback up to ₹350 on completing creator tasks (details on player portal).</p>

            <div className="text-center">
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
