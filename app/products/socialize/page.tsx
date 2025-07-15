import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import SocializeHero from "@/components/products/socialize/SocializeHero";
import SocializeFeatures from "@/components/products/socialize/SocializeFeatures";

export default function SocializePage() {
  return (
    <>
      <CursorEffect variant="glow" color="rgba(14, 165, 233, 0.15)" size={400} blur={80} opacity={0.15} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] overflow-hidden">
      <Navbar />
        <main className="relative pt-20">
          <SocializeHero />
          <SocializeFeatures />
      </main>
      <Footer />
      </div>
    </>
  );
}
