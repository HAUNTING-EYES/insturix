import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import ThinkForgeHero from "@/components/products/thinkforge/ThinkForgeHero";
import ThinkForgeFeatures from "@/components/products/thinkforge/ThinkForgeFeatures";

export default function ThinkForgePage() {
  return (
    <>
      <CursorEffect variant="glow" color="#ef4444" size={400} blur={80} opacity={0.15} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] overflow-hidden">
      <Navbar />
        <main className="relative pt-20">
          <ThinkForgeHero />
          <ThinkForgeFeatures />
      </main>
      <Footer />
      </div>
    </>
  );
}
