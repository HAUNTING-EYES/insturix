"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Zap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface InteractiveDemoProps {
  title?: string;
  subtitle?: string;
  defaultInput?: string;
  inputPlaceholder?: string;
  outputPlaceholder?: string;
  processingText?: string;
  buttonText?: string;
  processingDelay?: number;
  simulatedResponse?: string;
}

export default function InteractiveDemo({
  title = "Interactive AI Demo",
  subtitle = "Try out our AI-powered content moderation in real-time",
  defaultInput = "Describe an innovative AI application",
  inputPlaceholder = "Enter your prompt here...",
  outputPlaceholder = "AI-generated output will appear here...",
  processingText = "Processing...",
  buttonText = "Process with AI",
  processingDelay = 6000,
  simulatedResponse = "Here's a simulated AI-generated response based on your input. In a real application, this would be where the AI processes the input and returns a result."
}: InteractiveDemoProps) {
  const [input, setInput] = useState(defaultInput);
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, processingDelay));
    setOutput(simulatedResponse);
    setIsLoading(false);
  };

  return (
    <div className="relative bg-white dark:bg-black py-16 sm:py-20">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-50 dark:from-black via-transparent to-zinc-50/50 dark:to-black" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.015] mix-blend-overlay" />
      </div>

      <section className="container relative mx-auto px-4">
        <div className="text-center space-y-4 mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold">
            {title}
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-4">
            {subtitle}
          </p>
        </div>
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-5 lg:gap-6">
          <Card variant="interactive" className="backdrop-blur-sm bg-white/80 dark:bg-zinc-900/80 hover:translate-y-[-2px] transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5">
            <CardHeader>
              <h3 className="text-xl font-semibold">Input</h3>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="min-h-[150px] sm:min-h-[200px] bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-md resize-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600"
                  placeholder={inputPlaceholder}
                  wrap="soft"
                />
                <Button
                  type="submit"
                  className="w-full group bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-black text-white"
                  disabled={isLoading}
                >
                  {isLoading ? processingText : buttonText}
                  <Zap className={`ml-2 h-4 w-4 ${isLoading ? "animate-pulse" : "group-hover:scale-110"}`} />
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card variant="interactive" className="backdrop-blur-sm bg-white/80 dark:bg-zinc-900/80 hover:translate-y-[-2px] transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5">
            <CardHeader>
              <h3 className="text-xl font-semibold">Output</h3>
            </CardHeader>
            <CardContent>
              <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-6 min-h-[200px] overflow-auto">
                {output || (
                  <span className="text-muted-foreground">
                    {outputPlaceholder}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
