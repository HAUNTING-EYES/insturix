import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface HeaderProps {
  title: string;
  highlightText: string;
  description: string;
  videoUrl: string;
  videoTitle: string;
  getStartedLink: string;
  getStartedText?: string;
  learnMoreText?: string;
  accentColor?: string; // New prop
  accentGradient?: {
    from: string;
    to: string;
  };
}

export default function Header({
  title,
  highlightText,
  description,
  videoUrl,
  videoTitle,
  getStartedLink,
  getStartedText = "Get Started",
  learnMoreText = "Learn More",
  accentColor = "rgba(255, 255, 255, 0.2)",
  accentGradient = { from: "from-blue-400", to: "to-blue-600" },
}: HeaderProps) {
  const buttonStyle = {
    backgroundColor: `${accentColor.replace("0.15", "0.1")}`,
    borderColor: accentColor.replace("0.15", "0.3"),
    color: accentGradient.from.includes("white")
      ? "white"
      : accentGradient.from.replace("from-", ""),
  };

  return (
    <header className="relative bg-white dark:bg-black pt-16 flex items-center">
      {/* Enhanced Gradient Overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 bg-linear-to-b"
          style={{
            background: `linear-gradient(to bottom, ${accentColor}, rgba(0,0,0,0) 70%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at top, ${accentColor} 0%, transparent 70%)`,
          }}
        />
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] mix-blend-overlay" />
        <div
          className="absolute top-0 left-1/4 w-1/2 h-1/2 blur-[120px] rounded-full"
          style={{
            background: accentColor,
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-linear-to-t from-zinc-50 dark:from-black to-transparent" />
      </div>

      <div className="container relative mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6 lg:gap-10">
          <div className="w-full lg:w-1/2 text-center lg:text-left lg:py-12">
            <div className="relative space-y-8">
              {/* Enhanced glow effect */}
              <div className="absolute -inset-4 bg-blue-500/20 blur-2xl rounded-full opacity-30 animate-pulse-slow" />

              <h1 className="relative text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-black dark:text-white [&_span]:mb-1 [&_span]:inline-block leading-tight opacity-80 ">
                <span>
                  {title}{" "}
                  <span
                    className={`bg-clip-text text-transparent bg-linear-to-r ${accentGradient.from} ${accentGradient.to} whitespace-nowrap`}
                  >
                    {highlightText}
                  </span>
                </span>
              </h1>

              <p className="relative text-base sm:text-lg text-neutral-700 dark:text-neutral-300/90 max-w-xl mx-auto lg:mx-0 not-first:mt-4">
                {description}
              </p>

              <div className="relative flex items-center justify-center lg:justify-start gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="backdrop-blur-xs group"
                  style={buttonStyle}
                >
                  <Link
                    href={getStartedLink}
                    passHref
                    className="flex items-center"
                  >
                    {getStartedText}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="text-neutral-700 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/10"
                >
                  {learnMoreText}
                </Button>
              </div>
            </div>
          </div>

          <div className="w-full lg:w-1/2 lg:py-12">
            <div className="relative">
              {/* Video frame with enhanced glow */}
              <div className="absolute -inset-2 bg-linear-to-r from-blue-500/30 to-purple-500/30 blur-2xl rounded-lg opacity-50" />
              <div className="relative aspect-video rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10">
                <iframe
                  className="w-full h-full"
                  src={videoUrl}
                  title={videoTitle}
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
