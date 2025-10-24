import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Metadata } from "next";
import { SectionHeader, SectionWrapper } from "@/components/ics25/Section";
import EsportsHero from "@/components/ics25/gameon/EsportsHero";
import TournamentGrid from "@/components/ics25/gameon/TournamentGrid";
import ScheduleTimeline from "@/components/ics25/gameon/ScheduleTimeline";
import PrizePoolBreakdown from "@/components/ics25/gameon/PrizePoolBreakdown";
import RulesEligibility from "@/components/ics25/gameon/RulesEligibility";
import SponsorsStrip from "@/components/ics25/gameon/SponsorsStrip";
import CastersLineup from "@/components/ics25/gameon/CastersLineup";
import GameOnFaq from "@/components/ics25/GameOnFaq";
import ScrollProgressBar from "@/components/ScrollProgressBar";
import Marquee from "@/components/ics25/Marquee";
import RailNav from "@/components/ics25/RailNav";

export const metadata: Metadata = {
  title: "GameOn Esports @ ICS’25",
  description: "Valorant & BGMI tournament at Insturix Creators Summit 2025. ₹25,000 prize pool. Register your team.",
  alternates: { canonical: "/ics25/gameon" },
};

export default function GameOnPage() {
  return (
    <div className="theme-gameon relative min-h-screen bg-[#0A0A0C] text-white">
      <ScrollProgressBar />
      <Navbar />
      <RailNav
        sections={[
          { id: "hero", label: "Top" },
          { id: "tournaments", label: "Tournaments" },
          { id: "schedule", label: "Schedule" },
          { id: "rules", label: "Rules" },
          { id: "sponsors", label: "Sponsors" },
          { id: "faqs", label: "FAQs" },
        ]}
      />
      <main>
        <SectionWrapper id="hero" className="section-angled-top">
          <EsportsHero />
        </SectionWrapper>
  <Marquee className="py-4 text-white/80" items={["Valorant", "BGMI", "GameOn", "ICS’25", "Esports", "Arena", "Finals"]} speed={70} />
        <SectionWrapper id="tournaments" className="section-angled-bottom">
          <SectionHeader eyebrow="Tournaments" title="Choose Your Title" subtitle="can participate in one per registration" />
          <TournamentGrid />
        </SectionWrapper>
        <SectionWrapper id="schedule" className="section-angled-top">
          <div className="grid lg:grid-cols-2 gap-10">
            <ScheduleTimeline />
            <PrizePoolBreakdown />
          </div>
        </SectionWrapper>
  <Marquee className="py-4 text-white/80" items={["Fair Play", "Anti‑Cheat", "Eligibility", "Device Policy", "Arena", "Spectator"]} speed={60} />
        <SectionWrapper id="rules" className="section-angled-bottom">
          <RulesEligibility />
        </SectionWrapper>
        <SectionWrapper>
          <SectionHeader eyebrow="Broadcast" title="On‑site Broadcast Team" subtitle="Host, Play-by-Play and Analyst at the arena" />
          <CastersLineup />
        </SectionWrapper>
        <SectionWrapper id="sponsors" className="section-angled-top">
          <SponsorsStrip />
        </SectionWrapper>
        <SectionWrapper id="faqs" className="section-angled-bottom">
          <SectionHeader title="Rules & Esports FAQs" subtitle="Eligibility, formats, anti‑cheat, devices and schedule." />
          <GameOnFaq />
        </SectionWrapper>
      </main>
      <Footer />
    </div>
  );
}
