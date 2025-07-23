import MusicGenerator from "./MusicGenerator";
import { MusitronTaskHistory } from "./MusitronTaskHistory";

interface ClientWrapperProps {}

export function ClientWrapper({}: ClientWrapperProps) {
  return (
    <div className="space-y-8">
      <MusicGenerator />
      <MusitronTaskHistory />
    </div>
  );
}