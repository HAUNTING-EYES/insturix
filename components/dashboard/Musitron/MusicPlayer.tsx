"use client";

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Play, 
  Pause, 
  Download, 
  Music, 
  Calendar, 
  Hash, 
  Mic, 
  FileText,
  Volume2,
  VolumeX 
} from 'lucide-react';

interface MusicPlayerProps {
  title: string;
  style: string;
  instrumentalOnly: boolean;
  lyrics?: string;
  createdDate: string;
  taskId: string;
  audioUrl?: string;
  isLoading?: boolean;
  error?: string | null;
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({
  title,
  style,
  instrumentalOnly,
  lyrics,
  createdDate,
  taskId,
  audioUrl,
  isLoading = false,
  error = null
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleCanPlay = () => {
      if (!audioContext && !sourceNodeRef.current) {
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = context.createMediaElementSource(audio);
        const analyserNode = context.createAnalyser();
        
        analyserNode.fftSize = 256;
        source.connect(analyserNode);
        analyserNode.connect(context.destination);
        
        sourceNodeRef.current = source;
        setAudioContext(context);
        setAnalyser(analyserNode);
      }
    };

    const handleError = (e: ErrorEvent) => {
      console.error('Audio loading error:', e);
      setLocalError('Failed to load audio file. Please try again.');
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('error', handleError);

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  // Include audioContext in deps to satisfy react-hooks/exhaustive-deps
  }, [audioUrl, audioContext]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Resume AudioContext if it's suspended
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = (parseFloat(e.target.value) / 100) * duration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    const newVolume = parseFloat(e.target.value) / 100;
    
    if (audio) {
      audio.volume = newVolume;
    }
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    if (!audioUrl) return;
    link.href = audioUrl;
    link.download = `${title.replace(/\s+/g, '_')}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Disable controls when loading or in error state
  const isControlsDisabled = isLoading || !!error;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-center space-y-6"
        >
          <motion.div
            className="inline-flex items-center gap-2 px-4 py-2 bg-surface-raised backdrop-blur-sm rounded-full border border-ds-emphasis"
            whileHover={{ scale: 1.02 }}
          >
            <Music className="w-5 h-5 text-gold" />
            <span className="text-gold font-medium">Generated Music</span>
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[44px] md:text-[44px] font-bold text-white tracking-tight"
          >
            {title}
          </motion.h1>
        </motion.div>

        {/* Loading State */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex items-center justify-center py-12"
          >
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold mx-auto"></div>
              <p className="text-ds-secondary">Loading audio...</p>
            </div>
          </motion.div>
        )}

        {/* Error State */}
        {error || localError ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card className="bg-red-900/20 border-red-800/50 shadow-elevated overflow-hidden">
              <div className="p-8 text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-red-400">
                  <Music className="w-8 h-8" />
                  <span className="text-lg font-semibold">Audio Loading Error</span>
                </div>
                <p className="text-red-300">{error || localError}</p>
                <p className="text-sm text-red-400/70">Please try refreshing the page or contact support if the issue persists.</p>
              </div>
            </Card>
          </motion.div>
        ) : !audioUrl && !isLoading ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card className="bg-gold/10 border-gold/40 shadow-elevated overflow-hidden">
              <div className="p-8 text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-gold">
                  <Music className="w-8 h-8" />
                  <span className="text-lg font-semibold">Audio Not Available</span>
                </div>
                <p className="text-ds-secondary">Audio file is not ready or could not be loaded.</p>
                <p className="text-sm text-ds-muted">Please check back later or try refreshing the page.</p>
              </div>
            </Card>
          </motion.div>
        ) : null}

        {/* Main Player Card */}
        {!isLoading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Card className="bg-surface-raised backdrop-blur-sm border-ds-emphasis shadow-elevated overflow-hidden">
              <div className="p-8 space-y-8">
                {/* Audio Visualizer */}
                <motion.div
                  className="h-40 bg-surface-well rounded-xl border border-ds-emphasis flex items-center justify-center relative overflow-hidden"
                  animate={{
                    backgroundColor: "hsl(0 0% 15% / 0.5)"
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Music className="w-16 h-16 text-ds-dim" />
                  </div>
                  
                  {/* Minimal animated bars when playing */}
                  <AnimatePresence>
                    {isPlaying && analyser && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex items-center justify-center gap-1"
                      >
                        <AudioVisualizer analyser={analyser} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Progress Bar */}
                <div className="space-y-3">
                  <div className="relative">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={duration ? (currentTime / duration) * 100 : 0}
                      onChange={handleSeek}
                      className="w-full h-1 bg-surface-well rounded-lg appearance-none cursor-pointer premium-slider"
                      disabled={isControlsDisabled}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-ds-secondary font-mono">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Player Controls */}
                <div className="flex items-center justify-center gap-6">
                  <motion.div
                    whileHover={!isControlsDisabled ? { scale: 1.05 } : {}}
                    whileTap={!isControlsDisabled ? { scale: 0.95 } : {}}
                  >
                    <Button
                      variant="gold"
                      size="player"
                      onClick={togglePlay}
                      disabled={isControlsDisabled}
                      className={`shadow-elevated ${isControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isPlaying ? (
                        <Pause className="w-6 h-6" />
                      ) : (
                        <Play className="w-6 h-6 ml-1" />
                      )}
                    </Button>
                  </motion.div>

                  {/* Volume Control */}
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleMute}
                      disabled={isControlsDisabled}
                      className={`text-ds-secondary hover:text-ds-primary ${isControlsDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </Button>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={isMuted ? 0 : volume * 100}
                      onChange={handleVolumeChange}
                      className="w-24 h-1 bg-surface-well rounded-lg appearance-none cursor-pointer premium-slider"
                      disabled={isControlsDisabled}
                    />
                  </div>

                  {/* Download Button */}
                  <motion.div
                    whileHover={!isControlsDisabled ? { scale: 1.02 } : {}}
                    whileTap={!isControlsDisabled ? { scale: 0.98 } : {}}
                  >
                    <Button
                      variant="neutral"
                      onClick={handleDownload}
                      disabled={isControlsDisabled || !audioUrl}
                      className={`gap-2 ${isControlsDisabled || !audioUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>
                  </motion.div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Information Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="grid md:grid-cols-2 gap-6"
        >
          {/* Generation Details */}
          <Card className="bg-surface-raised backdrop-blur-sm border-ds-emphasis shadow-elevated">
            <div className="p-6 space-y-6 relative overflow-hidden">
              {/* Gradient Mesh Background */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  background:
                    "radial-gradient(ellipse 40% 30% at 25% 35%, rgba(212,166,82,0.12) 0%, transparent 70%), radial-gradient(ellipse 30% 20% at 75% 65%, rgba(212,166,82,0.06) 0%, transparent 70%)",
                  filter: "blur(40px)",
                  opacity: 0.45,
                }}
              />
              <h3 className="text-lg font-semibold text-gold flex items-center gap-2">
                <FileText className="w-5 h-5 text-gold" />
                Generation Details
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-ds-secondary">Style:</span>
                  <Badge className="bg-gold text-gold-contrast border-gold">
                    {style}
                  </Badge>
                </div>
                
                <Separator className="bg-ds-emphasis" />
                
                <div className="flex items-center justify-between">
                  <span className="text-ds-secondary flex items-center gap-2">
                    <Mic className="w-4 h-4" />
                    Instrumental Only:
                  </span>
                  <Badge className={instrumentalOnly ? "bg-gold text-gold-contrast" : "bg-surface-well text-ds-secondary border-ds-emphasis"}>
                    {instrumentalOnly ? "Yes" : "No"}
                  </Badge>
                </div>
                
                {lyrics && (
                  <>
                    <Separator className="bg-ds-emphasis" />
                    <div className="space-y-3">
                      <span className="text-ds-secondary">Lyrics:</span>
                      <div className="p-4 bg-surface-well rounded-lg border border-ds-emphasis">
                        <p className="text-sm text-ds-primary whitespace-pre-wrap leading-relaxed">
                          {lyrics}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Metadata */}
          <Card className="bg-surface-raised backdrop-blur-sm border-ds-emphasis shadow-elevated">
            <div className="p-6 space-y-6 relative overflow-hidden">
              {/* Gradient Mesh Background */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0"
                style={{
                  background:
                    "radial-gradient(ellipse 40% 30% at 25% 35%, rgba(212,166,82,0.12) 0%, transparent 70%), radial-gradient(ellipse 30% 20% at 75% 65%, rgba(212,166,82,0.06) 0%, transparent 70%)",
                  filter: "blur(40px)",
                  opacity: 0.45,
                }}
              />
              <h3 className="text-lg font-semibold text-gold flex items-center gap-2">
                <Hash className="w-5 h-5 text-gold" />
                Metadata
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-ds-secondary flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Created:
                  </span>
                  <span className="text-white font-mono text-sm">
                    {new Date(createdDate).toLocaleString()}
                  </span>
                </div>
                
                <Separator className="bg-ds-emphasis" />
                
                <div className="flex items-center justify-between">
                  <span className="text-ds-secondary">Task ID:</span>
                  <div className="flex items-center gap-2">
                    <code className="px-3 py-1 bg-surface-canvas rounded-md text-sm text-ds-primary border border-ds-emphasis font-mono">
                      {taskId}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Hidden Audio Element */}
        <audio
          ref={audioRef}
          src={audioUrl}
          crossOrigin="anonymous"
          preload="metadata"
        />
      </div>

      {/* Custom Slider Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .premium-slider::-webkit-slider-thumb {
            appearance: none;
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: #D4A652;
            cursor: pointer;
            box-shadow: 0 1px 3px hsl(0 0% 0% / 0.5);
          }
          
          .premium-slider::-moz-range-thumb {
            height: 16px;
            width: 16px;
            border-radius: 50%;
            background: #D4A652;
            cursor: pointer;
            border: none;
            box-shadow: 0 1px 3px hsl(0 0% 0% / 0.5);
          }
        `
      }} />
    </motion.div>
  );
};

const AudioVisualizer = ({ analyser }: { analyser: AnalyserNode | null }) => {
  const requestRef = useRef<number | null>(null);
  const [barHeights, setBarHeights] = useState<Uint8Array>(new Uint8Array(0));

  useEffect(() => {
    if (!analyser) return;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    setBarHeights(dataArray);

    const animate = () => {
      analyser.getByteFrequencyData(dataArray);
      setBarHeights(new Uint8Array(dataArray));
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [analyser]);

  return (
    <>
      {Array.from(barHeights).map((height, i) => (
        <motion.div
          key={i}
          className="w-1 bg-gold rounded-full"
          initial={{ height: 0 }}
          animate={{ height: height / 2.5 }}
          transition={{ duration: 0.05 }}
        />
      ))}
    </>
  );
};

export default MusicPlayer;
