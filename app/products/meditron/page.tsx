import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import MeditronHero from "@/components/products/meditron/MeditronHero";
import MeditronFeatures from "@/components/products/meditron/MeditronFeatures";

export default function MeditronPage() {
  return (
    <>
      <CursorEffect variant="glow" color="rgba(34, 197, 94, 0.15)" size={400} blur={80} opacity={0.15} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] overflow-hidden">
        <Navbar />
        <main className="relative pt-20">
          <MeditronHero />
          <MeditronFeatures />
        </main>
        <Footer />
      </div>
    </>
  );
}
