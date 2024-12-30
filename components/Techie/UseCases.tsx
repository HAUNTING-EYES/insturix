"use client";

import { useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const useCases = [
  {
    title: "Healthcare",
    description: "AI-powered diagnostics and personalized treatment plans.",
  },
  {
    title: "Finance",
    description:
      "Intelligent fraud detection and automated trading strategies.",
  },
  {
    title: "Education",
    description: "Adaptive learning systems and automated grading.",
  },
  {
    title: "Manufacturing",
    description: "Predictive maintenance and quality control optimization.",
  },
  {
    title: "Retail",
    description: "Personalized recommendations and inventory management.",
  },
];

export default function UseCases() {
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollAmount =
        direction === "left" ? -container.offsetWidth : container.offsetWidth;
      container.scrollBy({ left: scrollAmount, behavior: "smooth" });
      setScrollPosition(container.scrollLeft + scrollAmount);
    }
  };

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Industry Use Cases
        </h2>
        <div className="relative">
          <div
            ref={scrollContainerRef}
            className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          >
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className="flex-shrink-0 w-full md:w-1/2 lg:w-1/3 px-4 snap-center"
              >
                <div className="bg-gray-100 p-6 rounded-lg h-full transition-transform hover:scale-105">
                  <h3 className="text-xl font-semibold mb-2">
                    {useCase.title}
                  </h3>
                  <p>{useCase.description}</p>
                </div>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="absolute left-0 top-1/2 -translate-y-1/2 bg-white"
            onClick={() => scroll("left")}
            disabled={scrollPosition <= 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="absolute right-0 top-1/2 -translate-y-1/2 bg-white"
            onClick={() => scroll("right")}
            disabled={
              scrollPosition >=
              (scrollContainerRef.current?.scrollWidth || 0) -
                (scrollContainerRef.current?.offsetWidth || 0)
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
