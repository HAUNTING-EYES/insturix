import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";
import EditronHero from "@/components/products/editron/EditronHero";
import EditronFeatures from "@/components/products/editron/EditronFeatures";

export default function EditronPage() {
  return (
    <>
      <CursorEffect variant="glow" color="rgba(20, 184, 166, 0.15)" size={400} blur={80} opacity={0.15} />
      <div className="min-h-screen bg-[rgb(var(--surface-0))] overflow-hidden">
        <Navbar />
        <main className="relative pt-20">
          <EditronHero />
          <EditronFeatures />
        </main>
        <Footer />
      </div>
    </>
  );
}
