"use client";

import { useState, useCallback, lazy, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const ClientWrapper = lazy(() =>
  import("@/components/dashboard/Musitron/ClientWrapper").then((mod) => ({
    default: mod.ClientWrapper,
  }))
);

type MusitronTab = "studio" | "jukebox";

export function MusitronLayout() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab =
    (searchParams.get("tab") as MusitronTab) === "jukebox"
      ? "jukebox"
      : "studio";
  const [activeTab, setActiveTab] = useState<MusitronTab>(initialTab);

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
    <div style={{ background: "#0B0B0A", minHeight: "100vh" }}>
      {/* Breadcrumb + Tab Navigation */}
      <nav
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 32px",
          borderBottom: "1px solid #1C1B19",
          background: "#0F0F0E",
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
        <span style={{ fontSize: 13, color: "#7A776E", cursor: "pointer" }}>
          Dashboard
        </span>
        <span
          style={{ color: "#5F5E5A", fontSize: 11, cursor: "default" }}
        >
          &#8250;
        </span>
        <span style={{ fontSize: 13, color: "#D4A652" }}>
          {activeTab === "studio" ? "Studio" : "Jukebox"}
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
            label="JUKEBOX"
            isActive={activeTab === "jukebox"}
            onClick={() => switchTab("jukebox")}
            position="right"
          />
        </div>
      </nav>

      {/* Tab Content */}
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
        <ClientWrapper activeTab={activeTab} />
      </Suspense>
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
  position: "left" | "right";
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
          position === "left" ? "6px 0 0 6px" : "0 6px 6px 0",
        cursor: "pointer",
        transition: "all .2s cubic-bezier(.16,1,.3,1)",
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {label}
    </button>
  );
}
