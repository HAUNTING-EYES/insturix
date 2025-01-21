import Header from "@/components/Techie/Header";
import InteractiveDemo from "@/components/Techie/InteractiveDemo";
import Features from "@/components/Techie/Features";
import UseCases from "@/components/Techie/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CursorEffect from "@/components/ui/CursorEffect";

export default function TechieTewari() {
  return (
    <>
      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.15)" size={500} blur={100} />
      <Navbar />
      <main className="min-h-screen">
        <Header />
        <InteractiveDemo />
        <Features />
        <UseCases />
      </main>
      <Footer />
    </>
  );
}
