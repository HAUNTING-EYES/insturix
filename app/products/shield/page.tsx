import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Header from "@/components/Shield/Header";
import InteractiveDemo from "@/components/Shield/InteractiveDemo";
import Features from "@/components/Shield/Features";
import UseCases from "@/components/Shield/UseCases";

export default function Shield() {
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
