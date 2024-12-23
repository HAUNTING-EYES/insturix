import { AnimatedTestimonialsDemo } from "@/components/bdd";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import RetroGrid from "@/components/ui/RetroGrid";
import TypingAnimation from "@/components/ui/TypingAnimation";
import WhoWeAre from "@/components/WhoWeAre";
import { WhyUs } from "@/components/WhyUs";

export default function Home() {
  return (
    <>
      <Navbar />
      <div className="relative flex h-[500px] w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-background md:shadow-xl">
        <span className="pointer-events-none z-10 whitespace-pre-wrap bg-clip-text text-center text-7xl font-bold leading-none tracking-tighter text-transparent">
          <TypingAnimation />
        </span>
        <RetroGrid />
      </div>
      <WhoWeAre />
      <WhyUs />
      <AnimatedTestimonialsDemo />
      <Footer />
    </>
  );
}
