import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import ShieldHero from "@/components/products/shield/ShieldHero";
import ShieldFeatures from "@/components/products/shield/ShieldFeatures";

export default function ShieldPage() {
  return (
    <>
      <CursorEffect variant="glow" color="rgba(147, 51, 234, 0.15)" size={400} blur={80} opacity={0.15} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] overflow-hidden">
        <Navbar />
        <main className="relative pt-20">
          <ShieldHero />
          <ShieldFeatures />
        </main>
        <Footer />
      </div>
    </>
  );
}
