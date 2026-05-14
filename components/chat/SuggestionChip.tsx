import { Button } from "@/components/ui/button";
import { DynamicSuggestion } from "@/app/dashboard/thinkforge/types";

interface Props {
  suggestion: DynamicSuggestion;
  onClick: (s: DynamicSuggestion) => void;
}

const colorMap: Record<string, string> = {
  question: "bg-blue-600 hover:bg-blue-700",
  action: "bg-green-600 hover:bg-green-700",
  improvement: "bg-purple-600 hover:bg-purple-700"
};

export default function SuggestionChip({ suggestion, onClick }: Props) {
  const colorClass = colorMap[suggestion.type] ?? "bg-purple-600 hover:bg-purple-700";
  return (
    <Button
      onClick={() => onClick(suggestion)}
      size="sm"
      aria-label={suggestion.description}
      className={`rounded-full px-4 py-1 text-[11px] font-medium text-white whitespace-nowrap ${colorClass}`}
    >
      {suggestion.title}
    </Button>
  );
} 