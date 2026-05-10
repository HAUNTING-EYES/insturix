"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Terminal,
  FileJson,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Info,
  Play,
} from "lucide-react";
import { useEditorContext } from "../../contexts/editor-context";
// import { serializeProject } from "../../ai-tools";
import { useAIDebugStore, LogType } from "@/lib/editron/stores/ai-debug-store";

type DebugPage = "logs" | "project-data";

// Live Logs Page Component
function LiveLogsPage() {
  const { logs, clearLogs } = useAIDebugStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const getLogIcon = (type: LogType) => {
    switch (type) {
      case 'info': return <Info className="h-3 w-3 text-blue-500" />;
      case 'token': return <Terminal className="h-3 w-3 text-muted-foreground" />;
      case 'tool_start': return <Play className="h-3 w-3 text-orange-500" />;
      case 'tool_end': return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'error': return <AlertCircle className="h-3 w-3 text-red-500" />;
      case 'client_action': return <Play className="h-3 w-3 text-purple-500" />;
      default: return <Info className="h-3 w-3" />;
    }
  };

  const getLogColor = (type: LogType) => {
    switch (type) {
      case 'info': return 'bg-blue-500/10 border-blue-500/20';
      case 'token': return 'bg-muted/50 border-border/50';
      case 'tool_start': return 'bg-orange-500/10 border-orange-500/20';
      case 'tool_end': return 'bg-green-500/10 border-green-500/20';
      case 'error': return 'bg-red-500/10 border-red-500/20';
      case 'client_action': return 'bg-purple-500/10 border-purple-500/20';
      default: return 'bg-muted border-border';
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b bg-muted/30 shrink-0 flex justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold">Live AI Logs</h3>
          <p className="text-[11px] text-muted-foreground">Real-time events from the AI Chat</p>
        </div>
        <Button variant="ghost" size="sm" onClick={clearLogs} className="h-8 w-8 p-0">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {logs.length === 0 ? (
            <div className="text-center text-muted-foreground text-[11px] py-12">
              No logs yet. Start chatting to see events.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className={`rounded-md border p-2 text-[11px] ${getLogColor(log.type)}`}
              >
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{getLogIcon(log.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium opacity-90">{log.message}</span>
                      <span className="text-[10px] opacity-50 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {log.data && (
                      <div className="mt-1.5">
                        <details className="group">
                          <summary className="cursor-pointer opacity-60 hover:opacity-100 transition-opacity">
                            Show Data
                          </summary>
                          <pre className="mt-1 p-2 bg-black/5 dark:bg-white/5 rounded overflow-x-auto font-mono text-[10px]">
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

// Project Data Page Component
function ProjectDataPage({
  currentSessionId,
  getProjectState,
}: {
  currentSessionId: string;
  getProjectState: () => any;
}) {
  const getProjectData = () => {
    const state = getProjectState();
    return {
      raw: state,
      // serialized: null // Legacy serialization removed
    };
  };

  const data = getProjectData();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-3 border-b bg-muted/30 shrink-0">
        <h3 className="text-sm font-semibold">Raw Project Data</h3>
        <p className="text-[11px] text-muted-foreground mt-1">
          Full project state including raw overlays and serialized format
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-6">
          <pre className="bg-muted rounded-lg p-4 text-[11px] overflow-x-auto">
            <code>{JSON.stringify(data, null, 2)}</code>
          </pre>
        </div>
      </ScrollArea>
    </div>
  );
}

export function AIToolsDebugPanel() {
  const { overlays, getProjectState } = useEditorContext();
  
  // We can get the current session ID from the URL or context if available
  const projectId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() || 'default' : 'default';
  const currentSessionId = "debug-session"; // Placeholder

  // Page navigation
  const [currentPage, setCurrentPage] = useState<DebugPage>("logs");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="fixed bottom-20 right-4 z-50">
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-full shadow-lg bg-background border-primary/20 hover:border-primary">
            <Terminal className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[400px] sm:w-[540px] p-0 flex flex-col gap-0">
          <SheetTitle className="sr-only">AI Debugger</SheetTitle>
          {/* Header */}
          <div className="border-b p-4 shrink-0 bg-muted/10">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              AI Debugger
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Inspect internal state and events
            </p>
          </div>

          {/* Navigation */}
          <div className="flex p-2 gap-1 border-b shrink-0 overflow-x-auto bg-muted/10">
            <Button
              variant={currentPage === "logs" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCurrentPage("logs")}
              className="text-[11px] h-7"
            >
              <Terminal className="h-3 w-3 mr-2" />
              Live Logs
            </Button>
            <Button
              variant={currentPage === "project-data" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setCurrentPage("project-data")}
              className="text-[11px] h-7"
            >
              <FileJson className="h-3 w-3 mr-2" />
              Project Data
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden bg-background">
            {currentPage === "logs" && <LiveLogsPage />}
            {currentPage === "project-data" && (
              <ProjectDataPage
                currentSessionId={currentSessionId}
                getProjectState={getProjectState}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
