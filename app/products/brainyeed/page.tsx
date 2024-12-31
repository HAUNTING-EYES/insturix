import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Header from "@/components/Brainyeed/Header";
import InteractiveDemo from "@/components/Brainyeed/InteractiveDemo";
import Features from "@/components/Brainyeed/Features";
import UseCases from "@/components/Brainyeed/UseCases";

export default function Brainyeed() {
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
