import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import Header from "@/components/Meditron/Header";
import InteractiveDemo from "@/components/Meditron/InteractiveDemo";
import Features from "@/components/Meditron/Features";
import UseCases from "@/components/Meditron/UseCases";

export default function Meditron() {
  return (
    <>
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
