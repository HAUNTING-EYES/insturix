import SpotlightCard from "@/components/dashboard/ThinkForge/card";
interface SuggestionsCardProps {
    parsedResponse: any;
    error: string;
    cardNo: string;
    onClick: () => void;
}
export default function SuggestionsCard({ onClick, parsedResponse, error, cardNo }: SuggestionsCardProps) {
    const suggestion = parsedResponse?.[cardNo];

    return (
        <SpotlightCard onClick={onClick} className="custom-spotlight-card w-full h-full " spotlightColor="rgba(255, 0, 0, 0.4)">
            <div className="w-full h-full">
                {!parsedResponse && !error && <div>
                    <div className="h-full min-h-40 w-full animate-pulse rounded-xl bg-[radial-gradient(circle_at_30%_20%,rgba(58,41,255,0.25),transparent_30%),radial-gradient(circle_at_70%_45%,rgba(255,148,180,0.2),transparent_35%),radial-gradient(circle_at_45%_80%,rgba(255,50,50,0.18),transparent_30%)]" />
                </div>}
                {suggestion && (
                    <div>
                        <div><strong>Idea:</strong> {suggestion.idea}</div>
                        <div><strong>Purpose:</strong> {suggestion.purpose}</div>
                        <div><strong>Style:</strong> {suggestion.style}</div>
                        <div><strong>Format:</strong> {suggestion.format}</div>
                        <div><strong>Platform:</strong> {suggestion.platform}</div>
                    </div>
                )}
                {error && <div className="text-[#D4A652]">{error}</div>}
            </div>
        </SpotlightCard>
    );
}
