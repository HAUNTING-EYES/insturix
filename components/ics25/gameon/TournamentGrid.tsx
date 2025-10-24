"use client";

import { motion } from "framer-motion";
import { useCallback, useState, useEffect } from "react";
import ModalOverlay from "@/components/ModalOverlay";
import { getTournamentDetail, type TournamentKey } from "@/components/ics25/gameon/tournamentDetails";
import Image from "next/image";

type TournamentEntry = {
  id: string;
  title: string;
  desc: string;
  details: string[];
  image?: string; // relative path under /ics25/
  cta?: { label: string; href: string };
};

const tournaments: TournamentEntry[] = [
  {
    id: "valorant",
    title: "Valorant (5v5)",
    desc: "Fully online tournament. Nov 1 qualifiers, Nov 8 finals.",
    details: ["Own PC Required", "Standard Map Pool", "Anti‑Cheat Enforced"],
    image: "gameon4.png",
    cta: { label: "View Details", href: "#faqs" },
  },
  {
    id: "bgmi",
    title: "BGMI (4v4)",
    desc: "Fully online tournament. Nov 1 qualifiers, Nov 8 finals.",
    details: ["Own Mobile Device", "Classic ERANGEL+", "Spectator Mode"],
    image: "gameon5.png",
    cta: { label: "View Details", href: "#faqs" },
  },
];

export default function TournamentGrid() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<React.ReactNode>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const delay = performance.now() < 1000 ? 600 : 0;
    const timer = setTimeout(() => setMounted(true), delay);
    return () => clearTimeout(timer);
  }, []);

  const openDetails = useCallback((key: TournamentKey, heading: string) => {
    setTitle(heading);
    setContent(getTournamentDetail(key));
    setOpen(true);
  }, []);

  return (
    <section id="tournaments" className="relative">
      <div className="grid md:grid-cols-2 gap-6">
        {tournaments.map((entry, i) => (
          <motion.div
            key={entry.id}
            onClick={() => openDetails(entry.id as TournamentKey, entry.title)}
            initial={{ opacity: 0, y: 16 }}
            animate={mounted ? { opacity: 1, y: 0 } : {}}
            style={{ willChange: 'transform, opacity' }}
            transition={{ delay: i * 0.06 }}
            className="text-left rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur p-6 hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 cursor-pointer"
          >
            {/* Top media banner using the same arena image, darkened for consistency */}
            <div className="relative mb-4 -mx-6 -mt-6 h-28 overflow-hidden rounded-t-2xl border-b border-white/10">
              <Image
                src={`/ics25/${entry.image}`}
                alt={`${entry.title} banner`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority={i === 0}
              />
              <div className="absolute inset-0 bg-black/45" />
              <div className="absolute inset-0 bg-[radial-gradient(400px_circle_at_20%_20%,rgba(255,59,59,0.15),transparent_55%),radial-gradient(500px_circle_at_80%_80%,rgba(75,83,32,0.15),transparent_55%)]" />
            </div>
              <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-bold">{entry.title}</h3>
                <p className="text-white/70 mt-1">{entry.desc}</p>
              </div>
            </div>
              <ul className="mt-4 grid gap-2 text-sm text-white/80 list-disc list-inside">
                {entry.details.map((d: string) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
              <div className="mt-5">
              <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-white text-black hover:bg-zinc-200 h-10 px-4 py-2">View Details</span>
            </div>
          </motion.div>
        ))}
      </div>
      <ModalOverlay open={open} onClose={() => setOpen(false)} title={title}>
        {content}
      </ModalOverlay>
    </section>
  );
}

