import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Header from "@/components/Editron/Header";
import InteractiveDemo from "@/components/Editron/InteractiveDemo";
import Features from "@/components/Editron/Features";
import UseCases from "@/components/Editron/UseCases";


export default function Editron() {
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
