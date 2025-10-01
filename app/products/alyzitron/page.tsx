"use client";

import React from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import AlyzitronHero from "@/components/products/alyzitron/AlyzitronHero";
import AlyzitronFeatures from "@/components/products/alyzitron/AlyzitronFeatures";
import AlyzitronDemo from "@/components/products/alyzitron/AlyzitronDemo";
import AlyzitronAnalytics from "@/components/products/alyzitron/AlyzitronAnalytics";
import AlyzitronCTA from "@/components/products/alyzitron/AlyzitronCTA";

export default function AlyzitronPage() {
  return (
    <>
      <CursorEffect variant="glow" color="#3B81F5" size={400} blur={80} opacity={0.15} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] overflow-hidden">
        <Navbar />
        
        <motion.main
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="relative pt-20"
        >
          <AlyzitronHero />
          <AlyzitronFeatures />
          <AlyzitronDemo />
          <AlyzitronAnalytics />
          <AlyzitronCTA />
        </motion.main>
        
        <Footer />
      </div>
    </>
  );
}
