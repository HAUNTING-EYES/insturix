import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Header() {
  return (
    <header className="relative bg-white dark:bg-black pt-16 flex items-center">
      {/* Enhanced Gradient Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-blue-900/5 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] mix-blend-overlay" />
        <div className="absolute top-0 left-1/4 w-1/2 h-1/2 bg-blue-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-zinc-50 dark:from-black to-transparent" />
      </div>

      <div className="container relative mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-10">
          <div className="w-full lg:w-1/2 text-center lg:text-left lg:py-12">
            <div className="relative space-y-8">
              {/* Enhanced glow effect */}
              <div className="absolute -inset-4 bg-blue-500/20 blur-2xl rounded-full opacity-30 animate-pulse-slow" />

              <h1 className="relative text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-black dark:text-white [&_span]:mb-1 [&_span]:inline-block">
                <span>Revolutionize Your</span>{" "}
                <span>Content Safety with{" "}
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-blue-600 whitespace-nowrap">
                    Techie Tiwari
                  </span>
                </span>
              </h1>

              <p className="relative text-base sm:text-lg text-neutral-700 dark:text-neutral-300/90 max-w-xl mx-auto lg:mx-0 [&:not(:first-child)]:mt-4">
                Harness the power of AI to moderate your content and keep your users
                safe. Intelligent, efficient, and reliable content moderation.
              </p>

              <div className="relative flex items-center justify-center lg:justify-start gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="bg-blue-50 dark:bg-white/10 backdrop-blur-sm border-blue-200 dark:border-white/20 text-blue-600 dark:text-white hover:bg-blue-100 dark:hover:bg-white/20 hover:border-blue-300 dark:hover:border-white/30 group"
                >
                  <Link href="/signup" passHref className="flex items-center">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10"
                >
                  Learn More
                </Button>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-1/2 lg:py-12">
            <div className="relative">
              {/* Video frame with enhanced glow */}
              <div className="absolute -inset-2 bg-gradient-to-r from-blue-500/30 to-purple-500/30 blur-2xl rounded-lg opacity-50" />
              <div className="relative aspect-video rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/FieYiEcMJow"
                  title='Nirmala Sitharaman Left Speechless To "Govt My Sleeping Partner" Question'
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
