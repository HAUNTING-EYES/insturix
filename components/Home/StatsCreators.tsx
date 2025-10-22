"use client";
import CountUp from "@/components/CountUp";

export default function StatsCreators() {
  return (
    <section className="w-full py-10 sm:py-14">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur supports-[backdrop-filter]:bg-white/5">
          <p className="text-sm text-white/60">Creators on Insturix</p>
          <div className="mt-2 text-4xl sm:text-5xl font-semibold tracking-tight">
            <CountUp
              from={0}
              to={6100}
              separator="," 
              direction="up"
              duration={1.8}
              className="count-up-text"
            />
            <span className="ml-1 text-white/70">+</span>
          </div>
          <p className="mt-2 text-xs text-white/50">and counting…</p>
        </div>
      </div>
    </section>
  );
}
