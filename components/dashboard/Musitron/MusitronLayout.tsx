"use client";

import { useState, useCallback, useRef, lazy, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/lib/animation/gsap-config";
import { DURATIONS, STAGGER } from "@/lib/animation/presets";

const ClientWrapper = lazy(() =>
  import("@/components/dashboard/Musitron/ClientWrapper").then((mod) => ({
    default: mod.ClientWrapper,
  }))
);

type MusitronTab = "studio" | "daw" | "jukebox";

export function MusitronLayout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawTab = searchParams.get("tab") as MusitronTab;
  const initialTab: MusitronTab =
    rawTab === "jukebox" ? "jukebox" : rawTab === "daw" ? "daw" : "studio";
  const [activeTab, setActiveTab] = useState<MusitronTab>(initialTab);
  const pageRef = useRef<HTMLDivElement>(null);

  // GSAP entrance — staggered fadeUp for nav + content
  useGSAP(() => {
    gsap.fromTo('[data-animate]',
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: DURATIONS.atmosphere, ease: 'expo.out', stagger: { each: STAGGER.wide.each, from: 'start' } }
    );
  }, { scope: pageRef });

  const switchTab = useCallback(
    (tab: MusitronTab) => {
      setActiveTab(tab);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div ref={pageRef} style={{ background: "#0B0B0A", minHeight: "100vh" }}>
      {/* Breadcrumb + Tab Navigation */}
      <nav
        data-animate=""
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 32px",
          borderBottom: "1px solid #1C1B19",
          background: "#0F0F0E",
          opacity: 0,
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: 15,
            color: "#ECE9E1",
            letterSpacing: "-0.3px",
          }}
        >
          Musitron
        </span>
        <span
          style={{ color: "#5F5E5A", fontSize: 11, cursor: "default" }}
        >
          &#8250;
        </span>
        {/* Was a cursor:pointer span with NO onClick — a fake control. */}
        <span
          role="link"
          tabIndex={0}
          onClick={() => router.push("/dashboard")}
          onKeyDown={(e) => { if (e.key === "Enter") router.push("/dashboard"); }}
          style={{ fontSize: 13, color: "#7A776E", cursor: "pointer" }}
        >
          Dashboard
        </span>
        <span
          style={{ color: "#5F5E5A", fontSize: 11, cursor: "default" }}
        >
          &#8250;
        </span>
        <span style={{ fontSize: 13, color: "#D4A652" }}>
          {activeTab === "studio" ? "Studio" : activeTab === "daw" ? "DAW" : "Jukebox"}
        </span>

        {/* Tab buttons pushed to right */}
        <div
          style={{ display: "flex", gap: 0, marginLeft: "auto" }}
        >
          <TabButton
            label="STUDIO"
            isActive={activeTab === "studio"}
            onClick={() => switchTab("studio")}
            position="left"
          />
          <TabButton
            label="DAW"
            isActive={activeTab === "daw"}
            onClick={() => switchTab("daw")}
            position="center"
          />
          <TabButton
            label="JUKEBOX"
            isActive={activeTab === "jukebox"}
            onClick={() => switchTab("jukebox")}
            position="right"
          />
        </div>
      </nav>

      {/* Tab Content */}
      <div data-animate style={{ opacity: 0 }}>
      <Suspense
        fallback={
          <div
            style={{
              height: "60vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#5F5E5A",
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Loading...
          </div>
        }
      >
        <ClientWrapper activeTab={activeTab} onSwitchTab={switchTab} />
      </Suspense>
      </div>
    </div>
  );
}

function TabButton({
  label,
  isActive,
  onClick,
  position,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  position: "left" | "center" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 16px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.8px",
        textTransform: "uppercase",
        color: isActive ? "#D4A652" : "#5F5E5A",
        background: isActive ? "rgba(212,166,82,0.06)" : "transparent",
        border: `1px solid ${isActive ? "#D4A652" : "#1C1B19"}`,
        borderRadius:
          position === "left" ? "6px 0 0 6px" : position === "right" ? "0 6px 6px 0" : "0",
        cursor: "pointer",
        transition: "all .2s cubic-bezier(.16,1,.3,1)",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {label}
    </button>
  );
}
