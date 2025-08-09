export type ThinkingHat = "white" | "red" | "black" | "yellow" | "green" | "blue";

export const toneColors: Record<ThinkingHat, string> = {
  white: "bg-white border border-gray-300",
  red: "bg-red-500",
  black: "bg-black",
  yellow: "bg-yellow-400",
  green: "bg-green-500",
  blue: "bg-blue-500",
};

export const DEFAULT_TONE: ThinkingHat = "yellow";

export function getToneColorClass(tone?: string): string {
  const t = (tone ?? DEFAULT_TONE) as ThinkingHat;
  return toneColors[t] || toneColors[DEFAULT_TONE];
} 