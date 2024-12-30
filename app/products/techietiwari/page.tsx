import Header from "@/components/Techie/Header";
import InteractiveDemo from "@/components/Techie/InteractiveDemo";
import Features from "@/components/Techie/Features";
import UseCases from "@/components/Techie/UseCases";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function TechieTewari() {
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
