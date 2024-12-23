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
          <TypingAnimation />
        <RetroGrid />
      </div>
      <WhoWeAre />
      <WhyUs />
      <AnimatedTestimonialsDemo />
      <Footer />
    </>
  );
}
