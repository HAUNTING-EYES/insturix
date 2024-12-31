import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-white text-black dark:text-white dark:bg-black">
      <div className="container mx-auto px-4 py-16 md:py-24 lg:py-32 flex flex-col lg:flex-row items-center">
        <div className="lg:w-1/2 text-center lg:text-left mb-8 lg:mb-0">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 bg-gradient-to-b from-[#ffd319] via-[#ff2975] to-[#8c1eff] bg-clip-text text-transparent">
            Revolutionize Your Content Safety with <u>Techie Tewari</u>
          </h1>
          <p className="text-lg md:text-xl mb-8">
            Harness the power of AI to moderate your content and keep your users
            safe. and You .....
          </p>
          <Button
            variant="outline"
            size="lg"
            className="bg-black text-white dark:bg-white dark:text-black group"
          >
            <Link href="/signup" passHref className="flex items-center">
              Get Started
            </Link>
            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
        <div className="lg:w-1/2">
          <iframe
            width="750"
            height="420"
            src="https://www.youtube.com/embed/FieYiEcMJow"
            title='Nirmala Sitharaman Left Speechless To "Govt My Sleeping Partner" Question'
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </header>
  );
}
