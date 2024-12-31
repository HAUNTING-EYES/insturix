import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Header from "@/components/kundli/Header";
import InteractiveDemo from "@/components/kundli/InteractiveDemo";
import Features from "@/components/kundli/Features";
import UseCases from "@/components/kundli/UseCases";

export default function Kundli() {
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
