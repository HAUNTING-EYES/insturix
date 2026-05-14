import MusicGenerator from "./MusicGenerator";
import { RecordingStudio } from "./RecordingStudio";
import { JukeboxCollections } from "./JukeboxCollections";

interface ClientWrapperProps {
  activeTab: "studio" | "jukebox";
}

export function ClientWrapper({ activeTab }: ClientWrapperProps) {
  if (activeTab === "jukebox") {
    return <JukeboxCollections />;
  }

  return (
    <RecordingStudio>
      <MusicGenerator />
    </RecordingStudio>
  );
}
