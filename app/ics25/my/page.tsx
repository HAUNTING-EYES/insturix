"use client";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import PortalManager from "@/components/ics25/PortalManager";

export default function MyPortalPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white dark:bg-zinc-950">
      <div className="relative z-20"><Navbar /></div>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-950" />
      </div>
      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.09)" size={900} blur={180} />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-12">
        <h1 className="text-2xl md:text-4xl font-bold text-zinc-900 dark:text-zinc-100">My ICS’25 Registration</h1>
        <PortalManager />
      </div>
      <div className="relative z-20"><Footer /></div>
    </div>
  );
}
