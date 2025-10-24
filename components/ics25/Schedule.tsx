"use client";

import { motion } from "framer-motion";
import { Calendar, Clock, MapPin } from "lucide-react";
import { AGENDA_HIGHLIGHTS, DTV } from "@/components/ics25/data/schedule";

export default function SchedulePreview() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Agenda Preview */}
      <div>
        <h3 className="text-2xl md:text-3xl font-bold text-zinc-100">Agenda Preview</h3>
        <p className="mt-2 text-zinc-400">
          Dive into a creator's paradise with these can’t-miss experiences
        </p>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          {AGENDA_HIGHLIGHTS.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, x: -14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="relative pl-6"
            >
              <div className="absolute left-0 top-2 size-2 rounded-full bg-[#3A9EFF]" />
              <div className="font-semibold text-zinc-100">{it.title}</div>
              <div className="text-sm text-zinc-400">{it.desc}</div>
            </motion.div>
          ))}
        </div>

        {/* Premium notice card (no chips) */}
        <div className="mt-8 relative p-[1px] rounded-2xl bg-gradient-to-br from-[#3A9EFF]/30 via-transparent to-[#FF2EE6]/30">
          <div className="rounded-[15px] bg-white/5 backdrop-blur-xl border border-white/10 p-5">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-[#7AB8FF] mt-0.5" />
              <div>
                <div className="text-sm text-white/80">Schedule Release</div>
                <div className="text-base font-semibold text-white">November 2, 2025</div>
                <p className="mt-1 text-sm text-white/60">Keep Checking this page for updates.</p>
              </div>
            </div>
          </div>
        </div>

        {/* DTV mini-panel */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InfoPill icon={<Calendar className="w-4 h-4" />} label="Dates" value={DTV.dates} />
          <InfoPill icon={<Clock className="w-4 h-4" />} label="Hours" value={DTV.hours} />
          <InfoPill icon={<MapPin className="w-4 h-4" />} label="Venue" value={DTV.venueShort} />
        </div>
      </div>
    </div>
  );
}

function InfoPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-3">
      <div className="flex items-center gap-2 text-xs text-white/70">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-semibold text-white/90">{value}</div>
    </div>
  );
}
