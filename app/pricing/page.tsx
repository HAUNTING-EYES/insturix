import React from "react";
import Green from "@/components/pr/Green";
import Blue from "@/components/pr/Blue";
import Purple from "@/components/pr/Purple";
import Navbar from "@/components/Navbar";
import Red from "@/components/pr/Red";
import Footer from "@/components/Footer";

export default function Pricing() {
  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-6xl font-bold text-center bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent mb-4">
          Pricing We Offer
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="transform hover:scale-105 transition-transform duration-300">
            <Green />
          </div>
          <div className="transform hover:scale-105 transition-transform duration-300">
            <Blue />
          </div>
          <div className="transform hover:scale-105 transition-transform duration-300">
            <Purple />
          </div>
          <div className="transform hover:scale-105 transition-transform duration-300">
            <Red />
          </div>
          <div className="transform hover:scale-105 transition-transform duration-300"></div>
        </div>
      </div>
      <Footer />
    </>
  );
}
