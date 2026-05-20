"use client";

interface NarrativeLabelProps {
  title: string;
  timing: string;
  isActive: boolean;
  id: string;
}

export function NarrativeLabel({ title, timing, isActive, id }: NarrativeLabelProps) {
  return (
    <div id={id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <span
        className="font-jakarta"
        style={{
          fontSize: "0.72rem",
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: isActive ? "#D4A652" : "#7A776E",
          transition: "color 0.25s cubic-bezier(.16,1,.3,1)",
        }}
      >
        {title}
      </span>
      <span
        className="font-jetbrains"
        style={{
          fontSize: 10,
          color: "#5F5E5A",
        }}
      >
        {timing}
      </span>
    </div>
  );
}
