import MusicGenerator from "./MusicGenerator";
import { MusitronTaskHistory } from "./MusitronTaskHistory";

export function ClientWrapper() {
  return (
    <div className="space-y-8">
      <MusicGenerator />
      <MusitronTaskHistory />
    </div>
  );
}