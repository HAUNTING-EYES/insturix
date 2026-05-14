"use client";

import { AnimatePresence, motion } from "framer-motion";
import MusicGenerator from "./MusicGenerator";
import { RecordingStudio } from "./RecordingStudio";
import { JukeboxCollections } from "./JukeboxCollections";

interface ClientWrapperProps {
  activeTab: "studio" | "jukebox";
}

export function ClientWrapper({ activeTab }: ClientWrapperProps) {
  return (
    <AnimatePresence mode="wait">
      {activeTab === "jukebox" ? (
        <motion.div
          key="jukebox"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <JukeboxCollections />
        </motion.div>
      ) : (
        <motion.div
          key="studio"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <RecordingStudio>
            <MusicGenerator />
          </RecordingStudio>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
