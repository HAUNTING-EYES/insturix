'use client';

import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Database, Brain, Layers, Wand2, CheckCircle2 } from 'lucide-react';

// ─── Script Parser Tab ─────────────────────────────────────────
function ScriptParserTab() {
  const [sessionId, setSessionId] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [script, setScript] = useState('');
  const [artStyle, setArtStyle] = useState('cinematic');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const parseScript = useCallback(async () => {
    if (!sessionId.trim() || !scriptId.trim() || !script.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/services/thinkforge/script/export-for-editron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.trim(),
          scriptId: scriptId.trim(),
          plainText: script,
          artStyle,
          aspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId, scriptId, script, artStyle, aspectRatio]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Script → Scene Parser</CardTitle>
          <CardDescription>Paste a script to see how the LLM parser decomposes it into scenes. No generation, just parsing (~$0.001).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              aria-label="ThinkForge session ID"
              placeholder="Exact ThinkForge session ID"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="font-mono text-[11px]"
            />
            <Input
              aria-label="ThinkForge script ID"
              placeholder="Exact ThinkForge script ID"
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
              className="font-mono text-[11px]"
            />
          </div>
          <Textarea
            placeholder="Paste your full script here..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={12}
            className="font-mono text-[11px]"
          />
          <div className="flex gap-2 items-center">
            <select value={artStyle} onChange={(e) => setArtStyle(e.target.value)} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px]">
              <option value="cinematic">Cinematic</option>
              <option value="anime">Anime</option>
              <option value="corporate">Corporate</option>
              <option value="pixel-art">Pixel Art</option>
              <option value="watercolor">Watercolor</option>
            </select>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[11px]">
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
            </select>
            <Button
              onClick={parseScript}
              disabled={loading || !sessionId.trim() || !scriptId.trim() || !script.trim()}
              size="sm"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <FileText className="w-3 h-3 mr-1" />}
              Parse Script
            </Button>
            <span className="text-[11px] text-zinc-500">{script.length} chars</span>
          </div>
          {error && <div className="text-red-400 text-[11px] p-2 bg-red-950/30 rounded">{error}</div>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Parsed: {result.title}
              <Badge variant="outline">{result.sceneCount} scenes</Badge>
              <Badge variant="outline">{result.totalDurationSeconds}s total</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Global metadata */}
            {result.overallMusicPrompt && (
              <div className="text-[11px] p-2 bg-zinc-800/50 rounded">
                <span className="text-zinc-400">Music:</span> {result.overallMusicPrompt}
              </div>
            )}
            {result.characterDescriptions && Object.keys(result.characterDescriptions).length > 0 && (
              <div className="text-[11px] p-2 bg-zinc-800/50 rounded">
                <span className="text-zinc-400">Characters:</span> {JSON.stringify(result.characterDescriptions)}
              </div>
            )}
            {result.globalEditDirections && (
              <div className="text-[11px] p-2 bg-zinc-800/50 rounded">
                <span className="text-zinc-400">Global Edit Directions:</span>
                <pre className="mt-1 text-[10px] text-zinc-300 overflow-x-auto">{JSON.stringify(result.globalEditDirections, null, 2)}</pre>
              </div>
            )}

            {/* Per-scene breakdown */}
            {result.scenes?.map((scene: any, i: number) => (
              <div key={i} className="border border-zinc-800 rounded p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-600 text-[10px]">Scene {scene.sceneIndex + 1}</Badge>
                  <span className="text-sm font-medium">{scene.title}</span>
                  <Badge variant="outline" className="text-[10px]">{scene.durationSeconds}s</Badge>
                  <Badge variant="outline" className="text-[10px]">{scene.mood}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <div className="text-zinc-500 mb-0.5">Narration:</div>
                    <div className="text-zinc-300 bg-zinc-900 p-1.5 rounded">{scene.narration || '(none)'}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 mb-0.5">Visual Description:</div>
                    <div className="text-zinc-300 bg-zinc-900 p-1.5 rounded max-h-20 overflow-y-auto">{scene.visualDescription || '(none)'}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 mb-0.5">Video Motion:</div>
                    <div className="text-zinc-300 bg-zinc-900 p-1.5 rounded">{scene.videoMotionPrompt || '(none)'}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 mb-0.5">Audio:</div>
                    <div className="text-zinc-300 bg-zinc-900 p-1.5 rounded">{scene.audioDescription || '(none)'}</div>
                  </div>
                </div>

                {scene.editDirections && (
                  <div className="text-[10px] p-1.5 bg-zinc-900 rounded">
                    <span className="text-amber-400">Edit Directions:</span>
                    <pre className="text-zinc-400 mt-0.5 overflow-x-auto">{JSON.stringify(scene.editDirections, null, 2)}</pre>
                  </div>
                )}

                {scene.imageQualityTokens && (
                  <div className="text-[10px] text-zinc-500">
                    <span className="text-zinc-400">Quality:</span> {scene.imageQualityTokens}
                  </div>
                )}
              </div>
            ))}

            {/* Raw JSON toggle */}
            <details className="text-[11px]">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Raw JSON</summary>
              <pre className="mt-2 p-2 bg-zinc-950 rounded text-[10px] max-h-96 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Project Inspector Tab ─────────────────────────────────────
function ProjectInspectorTab() {
  const [projectId, setProjectId] = useState('');
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProject = useCallback(async () => {
    if (!projectId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/services/editron/projects/${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProject(data.project || data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const overlays = project?.overlays || [];
  const overlaysByType = overlays.reduce((acc: Record<string, number>, o: any) => {
    acc[o.type] = (acc[o.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const overlaysByRow = overlays.reduce((acc: Record<string, number>, o: any) => {
    acc[`Row ${o.row}`] = (acc[`Row ${o.row}`] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Project Inspector</CardTitle>
          <CardDescription>Load any project and inspect its raw overlay structure, row assignments, and timing.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Project ID (e.g. proj_abc123)" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="font-mono text-[11px]" />
            <Button onClick={loadProject} disabled={loading} size="sm">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
            </Button>
          </div>
          {error && <div className="text-red-400 text-[11px] mt-2">{error}</div>}
        </CardContent>
      </Card>

      {project && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {project.title || project.projectId}
              <Badge variant="outline">{overlays.length} overlays</Badge>
              <Badge variant="outline">{project.fps || 30} fps</Badge>
              <Badge variant="outline">{project.durationInFrames} frames ({Math.round((project.durationInFrames || 0) / (project.fps || 30))}s)</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary badges */}
            <div className="flex gap-1 flex-wrap">
              {Object.entries(overlaysByType).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-[10px]">{type}: {count as number}</Badge>
              ))}
            </div>
            <div className="flex gap-1 flex-wrap">
              {Object.entries(overlaysByRow).sort().map(([row, count]) => (
                <Badge key={row} variant="outline" className="text-[10px] bg-zinc-800">{row}: {count as number}</Badge>
              ))}
            </div>

            {/* Timeline view — simplified */}
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-400 font-medium">Timeline Layout:</div>
              {Object.keys(overlaysByRow).sort().map(row => {
                const rowNum = parseInt(row.replace('Row ', ''));
                const rowOverlays = overlays.filter((o: any) => o.row === rowNum).sort((a: any, b: any) => a.from - b.from);
                return (
                  <div key={row} className="flex items-center gap-1 text-[10px]">
                    <span className="text-zinc-500 w-12">{row}:</span>
                    <div className="flex gap-0.5 overflow-x-auto">
                      {rowOverlays.map((o: any) => (
                        <div
                          key={o.id}
                          className="px-1.5 py-0.5 rounded text-[9px] whitespace-nowrap border border-zinc-700"
                          style={{
                            backgroundColor: o.type === 'video' ? '#1e3a5f' : o.type === 'image' ? '#3a1e5f' : o.type === 'text' ? '#1e5f3a' : o.type === 'caption' ? '#5f3a1e' : o.type === 'sound' ? '#5f1e3a' : o.type === 'transition' ? '#5f5f1e' : '#333',
                          }}
                        >
                          {o.type} #{o.id} ({o.from}-{o.from + o.durationInFrames})
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Per-overlay detail */}
            <details className="text-[11px]">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">All Overlays ({overlays.length})</summary>
              <div className="mt-2 space-y-1 max-h-96 overflow-y-auto">
                {overlays.sort((a: any, b: any) => a.from - b.from).map((o: any) => (
                  <div key={o.id} className="p-1.5 bg-zinc-900 rounded text-[10px] font-mono group">
                    <div className="flex items-center gap-1">
                      <span className="text-blue-400">#{o.id}</span>{' '}
                      <span className="text-amber-400">{o.type}</span>{' '}
                      row={o.row} from={o.from} dur={o.durationInFrames}{' '}
                      {o.content && typeof o.content === 'string' && <span className="text-zinc-500">&quot;{o.content.substring(0, 50)}&quot;</span>}
                      {o.keyframeTracks?.length > 0 && <span className="text-green-400"> [{o.keyframeTracks.length} kf tracks]</span>}
                      {o.metadata?.isTransition && <span className="text-yellow-400"> [transition: {o.metadata.transitionType}]</span>}
                    </div>
                    {o.src && (
                      <div className="mt-0.5 flex items-center gap-1">
                        <span className="text-zinc-600">src:</span>
                        <span className="text-cyan-600 break-all select-all text-[9px]">{o.src}</span>
                        <button
                          onClick={() => { navigator.clipboard.writeText(o.src); }}
                          className="text-zinc-600 hover:text-white px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Copy URL"
                        >📋</button>
                      </div>
                    )}
                    {o.metadata && Object.keys(o.metadata).length > 0 && (
                      <div className="mt-0.5 text-[9px] text-zinc-600">meta: {JSON.stringify(o.metadata)}</div>
                    )}
                  </div>
                ))}
              </div>
            </details>

            <details className="text-[11px]">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Raw Project JSON</summary>
              <pre className="mt-2 p-2 bg-zinc-950 rounded text-[10px] max-h-96 overflow-auto">{JSON.stringify(project, null, 2)}</pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Asset Analysis Tab ────────────────────────────────────────
function AssetAnalysisTab() {
  const [assetId, setAssetId] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadAnalysis = useCallback(async () => {
    if (!assetId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/services/editron/analysis?assetId=${encodeURIComponent(assetId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setAnalysis(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Asset Analysis Viewer</CardTitle>
          <CardDescription>View 5-Track analysis results for any asset. Enter an asset ID from a project&apos;s overlay.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Asset ID (e.g. asset_xyz123 or sfx_abc)" value={assetId} onChange={(e) => setAssetId(e.target.value)} className="font-mono text-[11px]" />
            <Button onClick={loadAnalysis} disabled={loading} size="sm">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
            </Button>
          </div>
          {error && <div className="text-red-400 text-[11px] mt-2">{error}</div>}
        </CardContent>
      </Card>

      {analysis && (
        <Card>
          <CardContent className="pt-4">
            <pre className="text-[10px] font-mono bg-zinc-950 p-3 rounded max-h-[600px] overflow-auto">{JSON.stringify(analysis, null, 2)}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── EDL Viewer Tab ────────────────────────────────────────────
function EDLViewerTab() {
  const [projectId, setProjectId] = useState('');
  const [edl, setEdl] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runAnalysis = useCallback(async () => {
    if (!projectId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/services/editron/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEdl(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const decisions = edl?.editDecisionList?.decisions || [];
  const decisionsByType = decisions.reduce((acc: Record<string, number>, d: any) => {
    acc[d.type] = (acc[d.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">EDL Viewer (Edit Decision List)</CardTitle>
          <CardDescription>Run 5-Track analysis on a project and see what edit decisions the Reactive Engine generates. Costs ~$0.05-0.20 for Gemini Vision calls.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input placeholder="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="font-mono text-[11px]" />
            <Button onClick={runAnalysis} disabled={loading} size="sm" variant="destructive">
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
              Run Analysis
            </Button>
          </div>
          {error && <div className="text-red-400 text-[11px] mt-2">{error}</div>}
        </CardContent>
      </Card>

      {edl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Analysis Results
              <Badge variant="outline">{decisions.length} decisions</Badge>
              {edl.cinematicMoments?.length > 0 && <Badge variant="outline">{edl.cinematicMoments.length} cinematic moments</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-1 flex-wrap">
              {Object.entries(decisionsByType).map(([type, count]) => (
                <Badge key={type} variant="outline" className="text-[10px]">{type}: {count as number}</Badge>
              ))}
            </div>

            {edl.editDecisionList?.stats && (
              <div className="text-[11px] p-2 bg-zinc-800/50 rounded grid grid-cols-3 gap-2">
                <div>Cuts/min: {edl.editDecisionList.stats.cutsPerMinute?.toFixed(1)}</div>
                <div>Transitions: {edl.editDecisionList.stats.transitionCount}</div>
                <div>Graphics: {edl.editDecisionList.stats.graphicCount}</div>
                <div>Zooms: {edl.editDecisionList.stats.zoomCount}</div>
                <div>Speed changes: {edl.editDecisionList.stats.speedChangeCount}</div>
                <div>Avg confidence: {edl.editDecisionList.stats.averageConfidence?.toFixed(2)}</div>
              </div>
            )}

            {/* Decisions table */}
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="text-zinc-500 border-b border-zinc-800">
                  <tr><th className="text-left p-1">Frame</th><th className="text-left p-1">Time</th><th className="text-left p-1">Type</th><th className="text-left p-1">Confidence</th><th className="text-left p-1">Reason</th></tr>
                </thead>
                <tbody>
                  {decisions.slice(0, 100).map((d: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-900 hover:bg-zinc-800/30">
                      <td className="p-1 font-mono">{d.frame}</td>
                      <td className="p-1 font-mono">{(d.frame / 30).toFixed(1)}s</td>
                      <td className="p-1"><Badge variant="outline" className="text-[9px]">{d.type}</Badge></td>
                      <td className="p-1">{(d.confidence * 100).toFixed(0)}%</td>
                      <td className="p-1 text-zinc-400 max-w-xs truncate">{d.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="text-[11px]">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Raw JSON</summary>
              <pre className="mt-2 p-2 bg-zinc-950 rounded text-[10px] max-h-96 overflow-auto">{JSON.stringify(edl, null, 2)}</pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Video Analysis Test Tab ───────────────────────────────────
function VideoAnalysisTestTab() {
  const [videoUrl, setVideoUrl] = useState('');
  const [durationMs, setDurationMs] = useState('5000');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runTest = useCallback(async () => {
    if (!videoUrl.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/services/editron/analysis/test-single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, durationMs: parseInt(durationMs) || 5000 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [videoUrl, durationMs]);

  const trace = result?.analysisResult?._diagnosticTrace || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-red-400" />
            Video Analysis Diagnostic
          </CardTitle>
          <CardDescription>Test 5-Track analysis on a single video URL. Shows EXACTLY where each step succeeds or fails. Costs ~$0.05-0.10.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Video URL (GCS signed URL or any video URL)" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="font-mono text-[11px]" />
          <div className="flex gap-2 items-center">
            <Input placeholder="Duration (ms)" value={durationMs} onChange={(e) => setDurationMs(e.target.value)} className="font-mono text-[11px] w-32" />
            <Button onClick={runTest} disabled={loading || !videoUrl.trim()} size="sm" variant="destructive">
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Run Diagnostic
            </Button>
          </div>
          {error && <div className="text-red-400 text-[11px] p-2 bg-red-950/30 rounded">{error}</div>}
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Pre-flight checks */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Pre-Flight Checks</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-[11px]">
              <div className="flex items-center gap-2">
                <Badge variant={result.testResults.fetchTest.status === 'ok' ? 'default' : 'destructive'} className="text-[10px]">
                  {result.testResults.fetchTest.status === 'ok' ? '✅' : '❌'} Video Fetch
                </Badge>
                <span className="text-zinc-400">
                  HTTP {result.testResults.fetchTest.statusCode} | {result.testResults.fetchTest.contentType} | {result.testResults.fetchTest.sizeKb}KB
                </span>
                {result.testResults.fetchTest.error && <span className="text-red-400">{result.testResults.fetchTest.error}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={result.testResults.geminiKeyStatus.startsWith('present') ? 'default' : 'destructive'} className="text-[10px]">
                  {result.testResults.geminiKeyStatus.startsWith('present') ? '✅' : '❌'} Gemini API Key
                </Badge>
                <span className="text-zinc-400">{result.testResults.geminiKeyStatus}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">⏱ {result.testResults.analysisDurationMs}ms total</Badge>
                {result.testResults.analysisError && <span className="text-red-400">{result.testResults.analysisError}</span>}
              </div>
            </CardContent>
          </Card>

          {/* Diagnostic trace — THE KEY DEBUG INFO */}
          <Card>
            <CardHeader><CardTitle className="text-sm">Diagnostic Trace (Step by Step)</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-1">
                {trace.length === 0 && <div className="text-zinc-500 text-[11px]">No trace data — analysis may not have run</div>}
                {trace.map((t: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] p-1.5 rounded bg-zinc-900">
                    <Badge
                      variant={t.status === 'ok' || t.status?.startsWith('ok') ? 'default' : t.status === 'FAILED' ? 'destructive' : 'outline'}
                      className="text-[9px] w-16 justify-center"
                    >
                      {t.status === 'FAILED' ? '❌ FAIL' : t.status?.startsWith('ok') ? '✅ OK' : '⏭ SKIP'}
                    </Badge>
                    <span className="text-zinc-300 font-mono w-48">{t.step}</span>
                    <span className="text-zinc-500">{t.durationMs}ms</span>
                    {t.error && <span className="text-red-400 truncate max-w-md">{t.error}</span>}
                    {t.status !== 'FAILED' && t.status !== 'ok' && <span className="text-zinc-400 truncate max-w-md">{t.status}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Analysis summary */}
          {result.analysisResult && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Analysis Output</CardTitle></CardHeader>
              <CardContent className="text-[11px] space-y-2">
                <div className="grid grid-cols-4 gap-2">
                  <div className={result.analysisResult.motionSegments > 0 ? 'text-green-400' : 'text-red-400'}>Motion: {result.analysisResult.motionSegments}</div>
                  <div className={result.analysisResult.keyframes > 1 ? 'text-green-400' : 'text-red-400'}>Keyframes: {result.analysisResult.keyframes}</div>
                  <div className={result.analysisResult.subjects > 0 ? 'text-green-400' : 'text-red-400'}>Subjects: {result.analysisResult.subjects}</div>
                  <div className={result.analysisResult.speechSegments > 0 ? 'text-green-400' : 'text-zinc-500'}>Speech: {result.analysisResult.speechSegments}</div>
                </div>
                {result.sampleKeyframe && (
                  <details>
                    <summary className="cursor-pointer text-zinc-500">Sample Keyframe</summary>
                    <pre className="mt-1 p-2 bg-zinc-950 rounded text-[10px] overflow-x-auto">{JSON.stringify(result.sampleKeyframe, null, 2)}</pre>
                  </details>
                )}
                {result.sampleMotion && (
                  <details>
                    <summary className="cursor-pointer text-zinc-500">Sample Motion Segment</summary>
                    <pre className="mt-1 p-2 bg-zinc-950 rounded text-[10px] overflow-x-auto">{JSON.stringify(result.sampleMotion, null, 2)}</pre>
                  </details>
                )}
              </CardContent>
            </Card>
          )}

          <details className="text-[11px]">
            <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Full Raw Response</summary>
            <pre className="mt-2 p-2 bg-zinc-950 rounded text-[10px] max-h-96 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
          </details>
        </>
      )}
    </div>
  );
}

// ─── Assembly Simulator Tab ─────────────────────────────────────
function AssemblySimulatorTab() {
  const [scenesJson, setScenesJson] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const simulate = useCallback(async () => {
    if (!scenesJson.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      // Handle both formats: raw scenes array OR full parser response { success, scenes }
      const parsed = JSON.parse(scenesJson);
      const scenes = Array.isArray(parsed) ? parsed : (parsed.scenes || [parsed]);
      const res = await fetch('/api/services/editron/debug/simulate-assembly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [scenesJson]);

  const overlays = result?.overlays || [];
  const ROW_NAMES: Record<number, string> = { 0: 'SFX', 1: 'BGM', 2: 'Video', 3: 'Voiceover', 4: 'Captions', 5: 'Transitions', 6: 'Graphics' };
  const ROW_COLORS: Record<number, string> = { 0: '#5f1e3a', 1: '#3a5f1e', 2: '#1e3a5f', 3: '#5f3a1e', 4: '#1e5f3a', 5: '#5f5f1e', 6: '#3a1e5f' };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-400" />
            Assembly Simulator
          </CardTitle>
          <CardDescription>
            Paste the &quot;scenes&quot; array from Script Parser output. Shows exactly what overlays scene-to-editron.ts would create — without generating any media. $0 cost.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder={'Paste scenes JSON array here...\n\nTip: Copy the "scenes" array from the Script Parser tab\'s Raw JSON output.'}
            value={scenesJson}
            onChange={(e) => setScenesJson(e.target.value)}
            rows={8}
            className="font-mono text-[11px]"
          />
          <div className="flex gap-2 items-center">
            <Button onClick={simulate} disabled={loading || !scenesJson.trim()} size="sm">
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Layers className="w-3 h-3 mr-1" />}
              Simulate Assembly
            </Button>
            <span className="text-[11px] text-zinc-500">No media generated — just overlay structure</span>
          </div>
          {error && <div className="text-red-400 text-[11px] p-2 bg-red-950/30 rounded">{error}</div>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Assembly Result
              <Badge variant="outline">{overlays.length} overlays</Badge>
              <Badge variant="outline">{result.totalFrames} frames ({Math.round(result.totalFrames / 30)}s)</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Visual timeline */}
            <div className="text-[11px] text-zinc-400 font-medium mb-1">Timeline Layout (Row → Overlays):</div>
            <div className="space-y-1.5 border border-zinc-800 rounded p-3 bg-zinc-900/50">
              {[0, 1, 2, 3, 4, 5, 6].map(rowNum => {
                const rowOverlays = overlays.filter((o: any) => o.row === rowNum).sort((a: any, b: any) => a.from - b.from);
                if (rowOverlays.length === 0) return null;
                const totalFrames = result.totalFrames || 1;
                return (
                  <div key={rowNum} className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 w-20 shrink-0 font-mono">
                      R{rowNum} {ROW_NAMES[rowNum] || ''}
                    </span>
                    <div className="flex-1 relative h-6 bg-zinc-950 rounded overflow-hidden">
                      {rowOverlays.map((o: any) => {
                        const leftPct = (o.from / totalFrames) * 100;
                        const widthPct = (o.durationInFrames / totalFrames) * 100;
                        return (
                          <div
                            key={o.id}
                            className="absolute top-0 h-full flex items-center px-1 text-[8px] text-white/80 truncate border-r border-zinc-800"
                            style={{
                              left: `${leftPct}%`,
                              width: `${Math.max(widthPct, 1)}%`,
                              backgroundColor: ROW_COLORS[rowNum] || '#333',
                            }}
                            title={`${o.type} #${o.id} | ${o.from}-${o.from + o.durationInFrames} (${(o.durationInFrames / 30).toFixed(1)}s) | ${o.content?.substring(0, 60) || o.src?.substring(0, 40) || ''}`}
                          >
                            {o.type === 'text' || o.type === 'caption' ? o.content?.substring(0, 20) : `${o.type} #${o.id}`}
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[9px] text-zinc-600 w-6 shrink-0">{rowOverlays.length}</span>
                  </div>
                );
              })}
            </div>

            {/* Overlay list */}
            <details className="text-[11px]">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">All Overlays ({overlays.length})</summary>
              <div className="mt-2 space-y-1 max-h-96 overflow-y-auto">
                {overlays.sort((a: any, b: any) => a.row - b.row || a.from - b.from).map((o: any) => (
                  <div key={o.id} className="p-1.5 bg-zinc-900 rounded text-[10px] font-mono">
                    <span className="text-blue-400">#{o.id}</span>{' '}
                    <span className="text-amber-400">{o.type}</span>{' '}
                    <span className="text-zinc-500">R{o.row}({ROW_NAMES[o.row] || '?'})</span>{' '}
                    {o.from}-{o.from + o.durationInFrames} ({(o.durationInFrames / 30).toFixed(1)}s){' '}
                    {o.content && typeof o.content === 'string' && <span className="text-zinc-500">&quot;{o.content.substring(0, 60)}&quot;</span>}
                    {o.metadata && <div className="text-[9px] text-zinc-600 mt-0.5">meta: {JSON.stringify(o.metadata)}</div>}
                  </div>
                ))}
              </div>
            </details>

            <details className="text-[11px]">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Raw JSON</summary>
              <pre className="mt-2 p-2 bg-zinc-950 rounded text-[10px] max-h-96 overflow-auto">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Main Debug Page ───────────────────────────────────────────
export default function EditronDebugClient() {

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[18px] font-bold flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            Editron Debug Panel
          </h1>
          <p className="text-[11px] text-zinc-500 mt-1">Test individual pipeline steps without running the full generation</p>
        </div>
        <Badge variant="outline" className="text-amber-400 border-amber-400/30">DEV ONLY</Badge>
      </div>

      <Tabs defaultValue="parser" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="parser" className="text-[11px] data-[state=active]:bg-zinc-700">
            <FileText className="w-3 h-3 mr-1" /> Script Parser
          </TabsTrigger>
          <TabsTrigger value="assembly" className="text-[11px] data-[state=active]:bg-zinc-700">
            <Layers className="w-3 h-3 mr-1" /> Assembly Sim
          </TabsTrigger>
          <TabsTrigger value="project" className="text-[11px] data-[state=active]:bg-zinc-700">
            <Database className="w-3 h-3 mr-1" /> Project Inspector
          </TabsTrigger>
          <TabsTrigger value="analysis" className="text-[11px] data-[state=active]:bg-zinc-700">
            <Brain className="w-3 h-3 mr-1" /> Asset Analysis
          </TabsTrigger>
          <TabsTrigger value="video-test" className="text-[11px] data-[state=active]:bg-zinc-700 data-[state=active]:text-red-400">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Video Diagnostic
          </TabsTrigger>
          <TabsTrigger value="edl" className="text-[11px] data-[state=active]:bg-zinc-700">
            <Wand2 className="w-3 h-3 mr-1" /> EDL Viewer
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="parser"><ScriptParserTab /></TabsContent>
          <TabsContent value="assembly"><AssemblySimulatorTab /></TabsContent>
          <TabsContent value="project"><ProjectInspectorTab /></TabsContent>
          <TabsContent value="analysis"><AssetAnalysisTab /></TabsContent>
          <TabsContent value="video-test"><VideoAnalysisTestTab /></TabsContent>
          <TabsContent value="edl"><EDLViewerTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
