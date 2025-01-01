"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Zap } from "lucide-react";

export default function InteractiveDemo() {
  const [input, setInput] = useState("Describe an innovative AI application");
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate AI processing
    await new Promise((resolve) => setTimeout(resolve, 6000));
    setOutput(
      "Here's a simulated AI-generated response based on your input. In a real application, this would be where the AI processes the input and returns a result."
    );
    setIsLoading(false);
  };

  return (
    <section className="py-16 md:py-24 bg-gradient-to-b from-gray-900 to-black text-white dark:from-gray-100 dark:to-white dark:text-gray-900">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-8 bg-clip-text text-transparent bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff]">
          Interactive AI Demo
        </h2>
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-8">
          <div className="bg-gray-800 dark:bg-white text-white dark:text-gray-900 p-6 rounded-lg shadow-lg transition-all duration-300 hover:shadow-xl">
            <h3 className="text-xl font-semibold mb-4">Input</h3>
            <form onSubmit={handleSubmit}>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full mb-4 bg-gray-700 dark:bg-gray-100 border-gray-600 dark:border-gray-300 text-white dark:text-gray-900 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 dark:focus:border-blue-600 focus:ring-blue-500 dark:focus:ring-blue-600"
                rows={7}
                placeholder="Enter your prompt here..."
                wrap="soft"
              />
              <Button
                type="submit"
                className="w-full group bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white transition-all duration-300"
                disabled={isLoading}
              >
                {isLoading ? "Processing..." : "Process with AI"}
                <Zap
                  className={`ml-2 h-4 w-4 transition-all duration-300 ${
                    isLoading ? "animate-pulse" : "group-hover:scale-110"
                  }`}
                />
              </Button>
            </form>
          </div>
          <div className="bg-gray-700 dark:bg-gray-200 p-6 rounded-lg shadow-lg transition-all duration-300 hover:shadow-xl">
            <h3 className="text-xl font-semibold mb-4 text-white dark:text-gray-900">
              Output
            </h3>
            <div className="bg-gray-800 dark:bg-white border border-gray-600 dark:border-gray-300 rounded-lg p-4 h-[200px] overflow-auto text-white dark:text-gray-900 transition-all duration-300">
              {output || "AI-generated output will appear here..."}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
