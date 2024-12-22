import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import RetroGrid from "@/components/ui/RetroGrid";
import TypingAnimation from "@/components/ui/TypingAnimation";
import WhoWeAre from "@/components/WhoWeAre";

export default function Home() {
  return (
    <>
      <Navbar />
      <div className="relative flex h-[500px] w-full flex-col items-center justify-center overflow-hidden rounded-lg bg-background md:shadow-xl">
        <span className="pointer-events-none z-10 whitespace-pre-wrap bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-center text-7xl font-bold leading-none tracking-tighter text-transparent">
          <TypingAnimation>Level Up Your Content Creation Game</TypingAnimation>
        </span>
        <RetroGrid />
      </div>
      <WhoWeAre />
      <Footer />
    </>
  );
}
