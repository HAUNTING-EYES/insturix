"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getToneColorClass } from "@/lib/thinkforge/tone";
import { Input } from "@/components/ui/input";
import { BookOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from '@clerk/nextjs';
import { 
  getRecentSessions, 
  updateSessionMetadata,
  type SessionMetadata 
} from '@/lib/utils/thinkforgeSession';

interface ThinkForgeSidePanelProps {
  loadSession?: ((sessionId: string) => Promise<boolean>) | null;
}

export default function ThinkForgeSidePanel({ loadSession }: ThinkForgeSidePanelProps) {
  const { user } = useUser();
  const router = useRouter();

  const [allSessions, setAllSessions] = useState<SessionMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  // Fetch sessions from backend via react-query
  const { data: remoteSessions, isLoading: isLoadingRemote } = useQuery<{ sessions: any[] }>({
    queryKey: ["thinkforge", "sessions", user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error("No user ID");
      const res = await fetch(`/api/services/thinkforge/sessions/list`);
      if (!res.ok) throw new Error("Failed to fetch sessions");
      return res.json();
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    // Avoid aggressive refetches that can cause loops on focus/reconnect
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // Optional: poll occasionally; can be tuned or disabled entirely
    refetchInterval: 60 * 1000,
  });

  // Merge and sync local and remote sessions
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      // Get local sessions
      const localSessions = getRecentSessions();
      
      // Start with local sessions as the base
      let mergedSessions = [...localSessions];
      
      // Merge with remote sessions if available
      const rs = remoteSessions as unknown as { sessions?: any[] } | undefined;
      if (rs?.sessions) {
        const remoteSessionsMap = new Map<string, SessionMetadata>();
        
        // Convert remote sessions to our format
        rs.sessions.forEach((remoteSession: any) => {
          const prompt = remoteSession.state?.prompt ?? '';
          let tone = remoteSession.state?.selectedIdea?.tone as string | undefined;
          
          // Fallback tone detection
          if (!tone && Array.isArray(remoteSession.state?.ideas) && remoteSession.state.ideas[0]?.tone) {
            tone = remoteSession.state.ideas[0].tone;
          }
          if (!tone) tone = remoteSession.state?.defaultTone ?? '';
          
          const sessionMetadata: SessionMetadata = {
            id: remoteSession.session_id,
            prompt,
            tone,
            createdAt: remoteSession.last_update ? remoteSession.last_update * 1000 : Date.now(),
            lastUsed: remoteSession.last_update ? remoteSession.last_update * 1000 : Date.now(),
            phase: remoteSession.state?.workflowPhase || 'PROMPT',
            isUsed: !!(prompt || remoteSession.state?.selectedIdea || remoteSession.state?.ideas?.length > 0)
          };
          
          remoteSessionsMap.set(remoteSession.session_id, sessionMetadata);
        });
        
        // Update existing local sessions with remote data
        mergedSessions = mergedSessions.map(localSession => {
          const remoteSession = remoteSessionsMap.get(localSession.id);
          if (remoteSession) {
            // Merge local and remote data, preferring remote for most fields
            return {
              ...localSession,
              ...remoteSession,
              // Keep local lastUsed if it's more recent
              lastUsed: Math.max(localSession.lastUsed, remoteSession.lastUsed || 0)
            };
          }
          return localSession;
        });
        
        // Add new remote sessions not in local storage
        const localSessionIds = new Set(mergedSessions.map(s => s.id));
        remoteSessionsMap.forEach((remoteSession, sessionId) => {
          if (!localSessionIds.has(sessionId)) {
            mergedSessions.push(remoteSession);
          }
        });
        
        // Sort by lastUsed (most recent first)
        mergedSessions.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
        
        // Update local storage with the merged data (keep only top 10)
        const topSessions = mergedSessions.slice(0, 10);
        
        // Update metadata for changed sessions
        topSessions.forEach(session => {
          const localSession = localSessions.find(s => s.id === session.id);
          if (!localSession || JSON.stringify(localSession) !== JSON.stringify(session)) {
            updateSessionMetadata(session.id, session);
          }
        });
      }
      
      setAllSessions(mergedSessions);
      
    } catch (error) {
      // Failed to merge sessions - silent failure for security
      // Fallback to local sessions only
      setAllSessions(getRecentSessions());
    }
  }, [remoteSessions]);

  // Filter sessions based on search query
  const searchLower = searchQuery.toLowerCase();
  const filteredSessions = allSessions.filter(session => 
    (session.prompt ?? '').toLowerCase().includes(searchLower) ||
    (session.tone ?? '').toLowerCase().includes(searchLower) ||
    (session.phase ?? '').toLowerCase().includes(searchLower)
  );

  // All sessions in one list (no recent/past split)
  const allFilteredSessions = filteredSessions;

  // Handle session loading
  const handleSessionClick = async (session: SessionMetadata) => {
    if (loadingSessionId === session.id || session.phase === 'ERROR') return;
    
    if (loadSession) {
      try {
        setLoadingSessionId(session.id);
        const success = await loadSession(session.id);
        
        if (success) {
          // Update session metadata to reflect it was accessed
          updateSessionMetadata(session.id, {
            lastUsed: Date.now()
          });
          
          // Update local state
          setAllSessions(prev => prev.map(s => 
            s.id === session.id 
              ? { ...s, lastUsed: Date.now() }
              : s
          ));
        } else {
          // Failed to load session - session may be corrupted or deleted
          // Remove corrupted session from local storage and state
          const updatedSessions = allSessions.filter(s => s.id !== session.id);
          setAllSessions(updatedSessions);
          
          // Clean up from localStorage
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem(`thinkforge_workflow_${session.id}`);
              const recentSessions = getRecentSessions().filter(s => s.id !== session.id);
              localStorage.setItem('thinkforge_recent_sessions', JSON.stringify(recentSessions));
            } catch (cleanupError) {
              // Failed to cleanup corrupted session - silent failure for security
            }
          }
        }
      } catch (error) {
        // Failed to load session - silent failure for security
        // Show user-friendly error message by updating the session state
        setAllSessions(prev => prev.map(s => 
          s.id === session.id 
            ? { ...s, lastUsed: Date.now(), phase: 'ERROR' as any } 
            : s
        ));
      } finally {
        setLoadingSessionId(null);
      }
    } else {
      // Fallback to old behavior (should not happen with new implementation)
      // No loadSession function provided, using fallback - silent for security
      if (typeof window !== 'undefined') {
        localStorage.setItem('thinkforge_current_session', session.id);
        router.refresh();
      }
    }
  };

  // Truncate prompt for display
  const getSessionDisplayName = (session: SessionMetadata): string => {
    if (!session.prompt || session.prompt.trim() === '') {
      return 'Untitled session';
    }
    
    const prompt = session.prompt.trim();
    const maxLength = 60; // Maximum characters to display
    
    if (prompt.length <= maxLength) {
      return prompt;
    }
    
    // Find a good breaking point (word boundary) near the limit
    const truncated = prompt.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    // If we found a space and it's not too close to the beginning, break there
    if (lastSpace > maxLength * 0.7) {
      return truncated.substring(0, lastSpace) + '...';
    }
    
    // Otherwise, just truncate at the character limit
    return truncated + '...';
  };

  // Render session card
  const renderSessionCard = (session: SessionMetadata) => (
    <div
      key={session.id}
      className={`p-3 bg-zinc-900/30 rounded-lg border transition-colors ${
        session.phase === 'ERROR' 
          ? 'border-red-600/30 opacity-60 cursor-not-allowed' 
          : 'border-zinc-700 hover:border-zinc-600 cursor-pointer'
      } ${
        loadingSessionId === session.id ? 'opacity-50 pointer-events-none' : ''
      }`}
      onClick={() => handleSessionClick(session)}
    >
      <div className="flex items-start justify-between mb-1">
        <h4 className="text-sm font-medium text-zinc-100 line-clamp-2 flex-1 pr-2">
          {getSessionDisplayName(session)}
        </h4>
        <div className="flex items-center gap-2 flex-shrink-0">
          {loadingSessionId === session.id && (
            <div className="w-3 h-3 border border-zinc-400 border-t-transparent rounded-full animate-spin" />
          )}
          {session.tone && (
            <div 
              className={`w-3 h-3 rounded-full ${getToneColorClass(session.tone)}`}
              title={`Tone: ${session.tone}`}
            />
          )}
        </div>
      </div>
      
      {/* Session metadata */}
      <div className="flex items-center gap-2 mt-2">
        {session.phase && session.phase !== 'PROMPT' && (
          <Badge 
            variant="outline" 
            className={`text-xs ${
              session.phase === 'ERROR' 
                ? 'text-red-400 border-red-600/30' 
                : 'text-zinc-400 border-zinc-600'
            }`}
          >
            {session.phase === 'ERROR' ? 'failed' : session.phase.toLowerCase()}
          </Badge>
        )}
        {session.isUsed && (
          <Badge variant="outline" className="text-xs text-green-400 border-green-600/30">
            used
          </Badge>
        )}
        <span className="text-xs text-zinc-500 ml-auto">
          {new Date(session.lastUsed || session.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-4rem)] pr-2">
        {/* Library */}
        <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl h-full flex flex-col">
        <CardHeader className="pb-3 flex items-center flex-shrink-0">
          <BookOpen className="h-4 w-4 mr-2 text-red-500" />
          <CardTitle className="text-lg font-medium text-zinc-100">Session Library</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col overflow-hidden p-4">
          <div className="space-y-4 flex-1 flex flex-col min-h-0">
            {/* Search */}
            <Input
              placeholder="Search sessions..."
              className="bg-black/30 border-zinc-700 text-zinc-100 placeholder:text-zinc-500 focus:ring-2 focus:ring-red-500 flex-shrink-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* All Sessions or Loading */}
            {allFilteredSessions.length > 0 || isLoadingRemote ? (
              <>
                <div className="flex items-center justify-between flex-shrink-0">
                  <h3 className="text-sm font-medium text-zinc-300">Sessions</h3>
                  <div className="flex items-center gap-2">
                    {isLoadingRemote && (
                      <div className="w-4 h-4 border border-zinc-500 border-t-red-500 rounded-full animate-spin" />
                    )}
                    <Badge variant="secondary" className="bg-red-500/20 text-red-400 border-red-500/30">
                      {allFilteredSessions.length}
                    </Badge>
                    {/* Debug info for scrolling */}
                    {allFilteredSessions.length > 3 && (
                      <Badge variant="outline" className="text-xs text-green-400 border-green-600/30">
                        scrollable
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Sessions container - Fixed scrolling implementation */}
                <div className="flex-1 min-h-0 relative">
                  {allFilteredSessions.length > 0 ? (
                    <div 
                      className="absolute inset-0 overflow-y-auto overflow-x-hidden library-scrollbar space-y-3 pr-1"
                      style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: '#71717a #27272a',
                        minHeight: '200px'
                      }}
                    >
                      {allFilteredSessions.map((session) => renderSessionCard(session))}
                      {/* Add padding at bottom for better scroll experience */}
                      <div className="h-4 flex-shrink-0" />
                    </div>
                  ) : isLoadingRemote ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-8 h-8 border-2 border-zinc-600 border-t-red-500 rounded-full animate-spin mx-auto mb-3" />
                        <span className="text-zinc-400 text-sm">Loading sessions...</span>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            {/* Empty state */}
            {allFilteredSessions.length === 0 && !isLoadingRemote && (
              <div className="text-center py-8 flex-1 flex items-center justify-center">
                <div>
                  <BookOpen className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-400 text-sm">
                    {searchQuery ? 'No sessions match your search' : 'No sessions yet'}
                  </p>
                  {!searchQuery && (
                    <p className="text-zinc-500 text-xs mt-1">
                      Start creating content to see your sessions here
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 