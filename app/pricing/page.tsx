import React from "react";
import Green from "@/components/pr/Green";
import Blue from "@/components/pr/Blue";
import Purple from "@/components/pr/Purple";
import Navbar from "@/components/Navbar";
import Red from "@/components/pr/Red";

export default function Pricing() {
  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-4xl font-bold text-center text-white mb-12">
          Choose Your Plan
        </h1>
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
          <div className="transform hover:scale-105 transition-transform duration-300">
            <Red />
          </div>
        </div>
      </div>
    </>
  );
}
