"use client";

import { useDAW } from "./DAWContext";
import { useAudioEngine } from "./useAudioEngine";
import MixerChannel, { MasterChannel } from "./MixerChannel";
import EffectsRack from "./EffectsRack";

export default function MixerConsole() {
  const { state, dispatch } = useDAW();
  const engineRef = useAudioEngine();

  if (!state.project) {
    return (
      <div style={{ padding: 16, color: "#5F5E5A", textAlign: "center", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        No project loaded
      </div>
    );
  }

  const handleMasterGain = (gain: number) => {
    dispatch({ type: "SET_MASTER_GAIN", gain });
  };

  return (
    <div style={containerStyle}>
      {/* Track channel strips */}
      <div style={stripsAreaStyle}>
        {state.project.tracks.map((track) => (
          <MixerChannel key={track.id} track={track} engineRef={engineRef} />
        ))}
      </div>

      {/* Master channel */}
      <MasterChannel
        engineRef={engineRef}
        gain={state.project.masterBus.gain}
        onGainChange={handleMasterGain}
      />

      {/* Effects rack for selected track */}
      {state.selectedTrackId && (
        <EffectsRack trackId={state.selectedTrackId} />
      )}

      {/* Fader/pan slider styles */}
      <style>{`
        .daw-fader-v::-webkit-slider-thumb {
          appearance: none;
          width: 14px;
          height: 10px;
          background: linear-gradient(180deg, #666, #333);
          border: 1px solid #282724;
          border-radius: 2px;
          cursor: grab;
        }
        .daw-fader-v::-moz-range-thumb {
          width: 14px;
          height: 10px;
          background: linear-gradient(180deg, #666, #333);
          border: 1px solid #282724;
          border-radius: 2px;
          cursor: grab;
        }
        .daw-pan::-webkit-slider-thumb {
          appearance: none;
          width: 10px;
          height: 10px;
          background: #B5B2A8;
          border: 1px solid #282724;
          border-radius: 50%;
          cursor: grab;
        }
        .daw-pan::-moz-range-thumb {
          width: 10px;
          height: 10px;
          background: #B5B2A8;
          border: 1px solid #282724;
          border-radius: 50%;
          cursor: grab;
        }
        .daw-fx-slider::-webkit-slider-thumb {
          appearance: none;
          width: 10px;
          height: 10px;
          background: #D4A652;
          border: 1px solid #282724;
          border-radius: 50%;
          cursor: grab;
        }
        .daw-fx-slider::-moz-range-thumb {
          width: 10px;
          height: 10px;
          background: #D4A652;
          border: 1px solid #282724;
          border-radius: 50%;
          cursor: grab;
        }
      `}</style>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  height: 260,
  background: "#0B0B0A",
  borderTop: "1px solid #1C1B19",
  userSelect: "none",
};

const stripsAreaStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  overflowX: "auto",
  overflowY: "hidden",
};
