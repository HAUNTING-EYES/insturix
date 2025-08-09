import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import MusitronHero from "@/components/products/musitron/MusitronHero";
import MusitronFeatures from "@/components/products/musitron/MusitronFeatures";

export default function MusitronPage() {
  return (
    <>
      <CursorEffect variant="glow" color="rgba(234, 179, 8, 0.20)" size={400} blur={80} opacity={0.15} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] overflow-hidden">
        <Navbar />
        <main className="relative pt-20">
          <MusitronHero />
          <MusitronFeatures />
        </main>
        <Footer />
      </div>
    </>
  );
}
