"use client";
import { motion, useScroll, useSpring } from "framer-motion";
import Testimo from "@/components/Testimo";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import WhoWeAre from "@/components/WhoWeAre";
import { WhyUs } from "@/components/WhyUs";
import HeroSection from "@/components/Home/HeroSection";

export default function Home() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="relative overflow-x-hidden w-full">
      <motion.div
        className="fixed top-0 left-0 right-0 h-[3px] origin-left z-[60]"
        style={{
          scaleX,
          background: "linear-gradient(to right, rgb(99 102 241) 0%, rgb(236 72 153) 100%)"
        }}
      />
      <Navbar />
      <HeroSection />
      <WhoWeAre />
      <WhyUs />
      <Testimo />
      <Footer />
    </div>
  );
}
