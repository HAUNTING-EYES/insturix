"use client";

import { motion } from "framer-motion";
import { Calendar, Clock, MapPin } from "lucide-react";
import { DTV } from "@/components/ics25/data/schedule";

const SCHEDULE_ITEMS = [
  { time: "09:00 - 10:00", period: "AM", title: "Opening Ceremony", desc: "Introduction to Insturix" },
  { time: "10:15 - 12:30", period: "PM", title: "Panel Talks", desc: "Industry expert discussions and insights" },
  { time: "12:45 - 01:45", period: "PM", title: "Editron Launch", desc: "Unveiling the future of editing" },
  { time: "02:00 - 03:30", period: "PM", title: "Dezhub Talks", desc: "Design and creativity sessions" },
  { time: "02:00 - 04:00", period: "PM", title: "Interactive Zones", desc: "Workshops, Reel competition, Gaming zone, Product demos" },
  { time: "04:00 - 05:00", period: "PM", title: "Awards", desc: "Honoring standout creators" },
  { time: "05:00 - 06:00", period: "PM", title: "Closing Ceremony", desc: "Song release & Fillers" },
];

export default function SchedulePreview() {
  return (
    <div className="max-w-5xl mx-auto relative">
      {/* Bright ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#3A9EFF]/5 blur-[100px] -z-10 pointer-events-none" />

      <div className="text-center mb-12">
        <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Event Schedule</h3>
        <p className="mt-3 text-zinc-400 max-w-2xl mx-auto text-lg">
          A packed day of innovation, creativity, and celebration.
        </p>
      </div>

      <div className="relative space-y-4">
        {/* Vertical Line for Desktop */}
        <div className="absolute left-[100px] top-6 bottom-6 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent hidden sm:block" />

        {SCHEDULE_ITEMS.map((item, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
            className="group relative flex flex-col sm:flex-row gap-6 items-center sm:items-start"
          >
            {/* Time Column */}
            <div className="sm:w-[100px] flex-shrink-0 flex flex-col items-center sm:items-end text-center sm:text-right pt-1 z-10">
              <div className="text-lg font-bold text-white tabular-nums tracking-tight group-hover:text-[#FF2EE6] transition-colors">
                {item.time}
              </div>
              <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider bg-zinc-900/50 px-2 py-0.5 rounded-full border border-white/5">
                {item.period}
              </div>
            </div>

            {/* Timeline Dot */}
            <div className="hidden sm:block absolute left-[100px] top-4 -translate-x-1/2 w-3 h-3 rounded-full bg-zinc-900 border-2 border-zinc-700 group-hover:border-[#FF2EE6] group-hover:scale-125 group-hover:shadow-[0_0_20px_rgba(255,46,230,0.6),0_0_40px_rgba(255,46,230,0.3)] transition-all duration-300 z-10 shadow-[0_0_0_4px_rgba(0,0,0,0.5)]" />

            {/* Content Card */}
            <div className={`flex-1 w-full p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/10 transition-all duration-300 backdrop-blur-sm ${
              item.title === 'Editron Launch' 
                ? 'hover:border-teal-400/50 hover:bg-gradient-to-br hover:from-teal-400/5 hover:to-blue-500/5 group-hover:shadow-[0_0_40px_rgba(20,184,166,0.15),0_0_80px_rgba(58,158,255,0.1)]'
                : item.title === 'Dezhub Talks'
                ? 'hover:border-white/50 hover:bg-gradient-to-br hover:from-white/5 hover:to-white/5 group-hover:shadow-[0_0_40px_rgba(255,255,255,0.15),0_0_80px_rgba(255,255,255,0.1)]'
                : item.title === 'Awards'
                ? 'hover:border-red-400/50 hover:bg-gradient-to-br hover:from-red-400/5 hover:to-red-500/5 group-hover:shadow-[0_0_40px_rgba(248,113,113,0.15),0_0_80px_rgba(239,68,68,0.1)]'
                : 'hover:border-[#FF2EE6]/50 hover:bg-gradient-to-br hover:from-[#FF2EE6]/5 hover:to-[#3A9EFF]/5 group-hover:shadow-[0_0_40px_rgba(255,46,230,0.15),0_0_80px_rgba(58,158,255,0.1)]'
            }`}>
              <h4 className={`text-xl font-bold text-white mb-2 transition-colors ${
                item.title === 'Editron Launch' 
                  ? 'group-hover:text-teal-400'
                  : item.title === 'Dezhub Talks'
                  ? 'group-hover:text-white'
                  : item.title === 'Awards'
                  ? 'group-hover:text-red-400'
                  : 'group-hover:text-[#FF2EE6]'
              }`}>
                {item.title}
              </h4>
              <p className="text-zinc-400 text-sm leading-relaxed">
                {item.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* DTV mini-panel */}
      <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InfoPill icon={<Calendar className="w-5 h-5 text-[#3A9EFF]" />} label="Date" value={DTV.dates} />
        <InfoPill icon={<Clock className="w-5 h-5 text-[#FF2EE6]" />} label="Time" value={DTV.hours} />
        <InfoPill icon={<MapPin className="w-5 h-5 text-[#3A9EFF]" />} label="Venue" value={DTV.venueShort} />
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
