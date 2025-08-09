import SpotlightCard from "@/components/dashboard/ThinkForge/card";
import Aurora from "@/components/dashboard/ThinkForge/auroraEffect";
interface SuggestionsCardProps {
    parsedResponse: any;
    error: string;
    cardNo: string;
    onClick: () => void;
}
export default function SuggestionsCard({ onClick, parsedResponse, error, cardNo }: SuggestionsCardProps) {
    return (
        <SpotlightCard onClick={onClick} className="custom-spotlight-card w-full h-full " spotlightColor="rgba(255, 0, 0, 0.4)">
            <div className="w-full h-full">
                {!parsedResponse && !error && <div>
                    <Aurora
                        colorStops={["#3A29FF", "#FF94B4", "#FF3232"]}
                        blend={0.5}
                        amplitude={1.0}
                        speed={0.5}
                    />
                </div>}
                {parsedResponse && (
                    <div>
                        <div><strong>Idea:</strong> {parsedResponse[cardNo].idea}</div>
                        <div><strong>Purpose:</strong> {parsedResponse[cardNo].purpose}</div>
                        <div><strong>Style:</strong> {parsedResponse[cardNo].style}</div>
                        <div><strong>Format:</strong> {parsedResponse[cardNo].format}</div>
                        <div><strong>Platform:</strong> {parsedResponse[cardNo].platform}</div>
                    </div>
                )}
                {error && <div className="text-red-500">{error}</div>}
            </div>
        </SpotlightCard>
    );
}
