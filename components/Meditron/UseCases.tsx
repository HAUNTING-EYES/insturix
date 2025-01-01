"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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
];

export default function UseCases() {
  return (
    <section className="py-16 md:py-24 bg-background text-foreground bg-black text-white dark:bg-white dark:text-black">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          Industry Use Cases
        </h2>
        <div className="relative">
          <div className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-6">
            {useCases.map((useCase, index) => (
              <Card
                key={index}
                className="flex-shrink-0 w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] snap-center"
              >
                <CardHeader>
                  <CardTitle className="text-xl font-semibold">
                    {useCase.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
