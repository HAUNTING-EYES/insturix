import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function EditronDashboard() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Aurora Animated Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 20% 30%, rgba(0,200,255,0.18) 0%, transparent 70%)," +
            "radial-gradient(ellipse 60% 40% at 80% 70%, rgba(255,0,200,0.14) 0%, transparent 70%)," +
            "radial-gradient(ellipse 60% 60% at 60% 20%, rgba(0,255,180,0.12) 0%, transparent 70%)",
          animation: "auroraMove 12s ease-in-out infinite alternate"
        }}
      />
      <style>
        {`
          @keyframes auroraMove {
            0% {
              filter: blur(0px) brightness(1);
              opacity: 1;
            }
            50% {
              filter: blur(8px) brightness(1.2);
              opacity: 0.85;
            }
            100% {
              filter: blur(16px) brightness(1.1);
              opacity: 1;
            }
          }
        `}
      </style>
      <div className="relative max-w-xl w-full mx-auto space-y-12 z-10">
        <div>
          <h1 className="text-4xl font-semibold text-zinc-100">Editron v0.1</h1>
          <p className="mt-4 text-lg text-zinc-400 font-light">
            Generate YouTube Shorts instantly from your favorite podcasts. Enter the link below:
          </p>
        </div>
        <div className="bg-black/40 border border-zinc-800 rounded-xl p-6 flex items-center gap-4 backdrop-blur-xl">
          <Input
            type="text"
            placeholder="Paste YouTube podcast link here"
            className="bg-black/30 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-blue-500"
          />
          <Button
            variant="default"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
        </div>
        <p className="text-sm text-zinc-500">
          Editron v0.1 (Beta): Currently supports YouTube Short generation from podcasts. Stay tuned for advanced editing features!
        </p>
      </div>
    </div>
  );
}
