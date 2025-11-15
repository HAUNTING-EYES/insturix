"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Lightbulb, FileText, MessageSquare, Sparkles, History, Settings, FolderOpen, Calendar, Brain, Library } from "lucide-react";
import clsx from "clsx";
import { PromptPanel } from "@/components/dashboard/ThinkForge/PromptPanel";
import { toast } from '@/hooks/use-toast';
import { IdeaGrid, IdeaCardData } from "@/components/dashboard/ThinkForge/IdeaGrid";
import { LibraryPanel, SessionMeta } from "@/components/dashboard/ThinkForge/LibraryPanel";
import { BackgroundDecor } from "@/components/dashboard/ThinkForge/BackgroundDecor";
import SelectedIdeaDisplay from "@/components/dashboard/ThinkForge/SelectedIdeaDisplay";
import { ChatPanel } from "@/components/dashboard/ThinkForge/ChatPanel";
import { ScriptPanel } from "@/components/dashboard/ThinkForge/ScriptPanel";
import { Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeClient, ScriptModel } from "./hooks/useThinkForgeClient";
import Dock from "@/components/dashboard/ThinkForge/Dock";
import PlanningPanel from "@/components/dashboard/ThinkForge/PlanningPanel";

const hats = ["white", "red", "black", "yellow", "green", "blue"] as const;
const skeletonIdeas = (prompt: string): IdeaCardData[] => {
	const base = (prompt.trim() || "Idea").replace(/\.$/, "");
	const intents = ["awareness", "conversion", "engagement", "retention", "education", "community"];
	const styles = ["fast-paced, energetic cuts", "story-driven narrative", "data-backed explainer", "emotionally resonant micro-story", "humorous pattern-interrupt", "structured how-to walkthrough"];
	const formats = ["30s short-form video", "carousel thread", "scripted reel", "teaser snippet", "interactive Q&A", "split-screen reaction"];
	const platforms = ["TikTok", "YouTube Shorts", "Instagram Reels", "LinkedIn", "X / Twitter", "Multi-platform"];
	return Array.from({ length: 4 }).map((_, i) => ({
		id: `${Date.now()}-${i}`,
		idea: `${base} – ${intents[i % intents.length]} angle`.slice(0, 80),
		purpose: `Drive ${intents[i % intents.length]} around the core theme via differentiated framing.`,
		style: styles[(i * 2 + base.length) % styles.length],
		format: formats[(i * 3 + base.length) % formats.length],
		platform: platforms[(i + base.length) % platforms.length],
		tone: hats[i % hats.length]
	}));
};

export default function ThinkForgeLanding() {
	const [prompt, setPrompt] = useState("");
	const [ideas, setIdeas] = useState<IdeaCardData[]>([]);
	const [loading, setLoading] = useState(false);
	// Overlay while opening an existing session from Library
	const [openingSession, setOpeningSession] = useState(false);
	// Bridge potential hydrate->state race by retaining the just-opened session id locally
	const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [planningOpen, setPlanningOpen] = useState(false);
	const [selectedIdea, setSelectedIdea] = useState<IdeaCardData | null>(null);
	const [phase, setPhase] = useState<'PROMPT' | 'IDEAS' | 'SELECTED' | 'SCRIPT'>('PROMPT');
	// Session is now created upon idea selection; no explicit new-session gating needed here
	// Deprecated local script; rely on hook's script instead (scriptFromHook)
	// const [script, setScript] = useState<Script | null>(null);
	const [sessions, setSessions] = useState<SessionMeta[]>([]);

	// Hook: hydration, autosave, persistence
	const tf = useThinkForgeClient();

	const panelRef = useRef<HTMLElement | null>(null);
	const edgeHoverTimeout = useRef<NodeJS.Timeout | null>(null);

	// use top-level skeletonIdeas constant

	const generateIdeas = useCallback(async () => {
		if (!prompt.trim()) return;
		setLoading(true);
		setHasSubmitted(true);
		try {
			const res = await fetch('/api/services/thinkforge/ideas', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt })
			});
			if (res.status === 429) {
				toast({ title: 'Idea limit reached', description: 'Please wait until the limit resets or upgrade your plan.' });
				return; // do not proceed to IDEAS phase
			}
			if (!res.ok) throw new Error('bad');
			const data = await res.json();
			const list: IdeaCardData[] = Array.isArray(data?.ideas) ? data.ideas : (Array.isArray(data) ? data : []);
			setIdeas(list.length === 4 ? list : skeletonIdeas(prompt));
			setPhase('IDEAS');
		} catch {
			// generic failure: show skeletons and allow progression
			setIdeas(skeletonIdeas(prompt));
			setPhase('IDEAS');
		} finally {
			setLoading(false);
		}
	}, [prompt, skeletonIdeas]);

	const onSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		generateIdeas();
	};

	const regenerate = () => {
		if (loading) return;
		generateIdeas();
	};

	useEffect(() => {
		const handleMouseMove = (e: MouseEvent) => {
			const threshold = 12;
			if (window.innerWidth - e.clientX < threshold) {
				if (!libraryOpen) {
					if (edgeHoverTimeout.current) clearTimeout(edgeHoverTimeout.current);
					edgeHoverTimeout.current = setTimeout(() => setLibraryOpen(true), 120);
				}
			}
		};
		window.addEventListener('mousemove', handleMouseMove);
		return () => window.removeEventListener('mousemove', handleMouseMove);
	}, [libraryOpen]);

	const handleSelectIdea = async (idea: IdeaCardData) => {
		setSelectedIdea(idea);
		setPhase('SELECTED');
		// Do NOT create backend session here; session creation will occur on entering SCRIPT phase
	};
			const handleProceedToScript = async () => {
			// Ensure any previous session is fully closed before entering SCRIPT
			try { await tf.closeSession(); } catch {}
			setPendingSessionId(null);
			setPhase('SCRIPT');
		};
	const handleUpdateIdea = (updated: any) => {
		setSelectedIdea(updated);
		setIdeas((prev: IdeaCardData[]) => prev.map(i => i.id === updated.id ? updated : i));
	};

	// Create a session when entering SCRIPT phase first time for selected idea
	useEffect(() => {
		if (phase === 'SCRIPT' && selectedIdea) {
			setSessions(prev => {
				const existing = prev.find(s => s.id === selectedIdea.id);
				if (existing) return prev.map(s => s.id === existing.id ? { ...s, lastEdited: Date.now() } : s);
				// AI-generate a placeholder name (simple heuristic)
				const base = selectedIdea.idea.split('–')[0].trim();
				const name = base.length > 40 ? base.slice(0, 40) + '…' : base || 'New Session';
				return [...prev, { id: selectedIdea.id, name, tone: selectedIdea.tone, lastEdited: Date.now() }];
			});
		}
	}, [phase, selectedIdea]);

	// Hydrate backend session when entering SCRIPT phase
	const hasHydratedRef = useRef(false);
	const creationTimerRef = useRef<NodeJS.Timeout | null>(null);
	useEffect(() => {
		if (phase !== 'SCRIPT' || !selectedIdea) return;
		// If opening an existing session from Library, or a session already exists, do not create a new one
		if (tf.sessionId || pendingSessionId) return;
		// Only hydrate once per entry into script phase until idea changes
		if (hasHydratedRef.current) return;
		// Debounce creation slightly and cancel if user navigates away
		if (creationTimerRef.current) clearTimeout(creationTimerRef.current);
		creationTimerRef.current = setTimeout(async () => {
			// Re-check conditions at execution time
			if (phase !== 'SCRIPT' || !selectedIdea) return;
			if (tf.sessionId || pendingSessionId) return;
			if (hasHydratedRef.current) return;
			hasHydratedRef.current = true;
			try {
				setOpeningSession(true);
				await tf.closeSession();
				const created = await tf.hydrate({
					projectMeta: {
						idea: selectedIdea.idea,
						purpose: (selectedIdea as any)?.purpose,
						style: (selectedIdea as any)?.style,
						format: (selectedIdea as any)?.format,
						platform: (selectedIdea as any)?.platform,
						tone: selectedIdea.tone
					}
				});
				if (created?.sessionId) setPendingSessionId(created.sessionId);
				if (created?.script) (tf.setScriptAndQueueSave as any)(created.script);
			} catch {}
			finally {
				setTimeout(() => setOpeningSession(false), 250);
			}
		}, 220);
	}, [phase, selectedIdea, tf.sessionId, pendingSessionId]);

	// Clear temporary pendingSessionId once the hook has the active sessionId
	useEffect(() => {
		if (!openingSession && pendingSessionId && tf.sessionId === pendingSessionId) {
			setPendingSessionId(null);
		}
	}, [openingSession, pendingSessionId, tf.sessionId]);

	// Reset hydrate flag when idea changes
	useEffect(() => { hasHydratedRef.current = false; }, [selectedIdea?.id]);
	// Reset hydrate flag when leaving SCRIPT
	useEffect(() => { if (phase !== 'SCRIPT') { hasHydratedRef.current = false; if (creationTimerRef.current) { clearTimeout(creationTimerRef.current); creationTimerRef.current = null; } } }, [phase]);

	// No allowNewSession resets required

	// Map between hook ScriptModel and UI Script
	const modelToScript = useCallback((m: ScriptModel | null): Script | null => {
		if (!m) return null;
		const title = m.title || 'Untitled Script';
		const content = m.content || '';
		const paras = content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
		const htmlBody = [`<h1>${title}</h1>`, ...paras.map(p => `<p>${p}</p>`)].join('\n');
		const script: Script = {
			title,
			content,
			body: htmlBody,
			blocks: Array.isArray(m.blocks) && m.blocks.length > 0 ? (m.blocks as any) : undefined,
			metadata: m.metadata || undefined,
			sections: [], tips: [], duration: undefined, targetAudience: undefined, tone: undefined
		} as Script;
		console.log('page.tsx: modelToScript conversion:', {
			inputBlocks: m.blocks,
			inputBlocksType: typeof m.blocks,
			inputBlocksIsArray: Array.isArray(m.blocks),
			inputBlocksLength: Array.isArray(m.blocks) ? m.blocks.length : 0,
			outputBlocks: script.blocks,
			outputBlocksType: typeof script.blocks,
			outputBlocksIsArray: Array.isArray(script.blocks),
			outputBlocksLength: Array.isArray(script.blocks) ? script.blocks.length : 0
		});
		return script;
	}, []);

	const scriptFromHook: Script | null = useMemo(() => modelToScript(tf.script), [tf.script, modelToScript]);

	const scriptToModel = useCallback((s: Script): ScriptModel => {
		const model: ScriptModel = {
			title: s.title,
			content: s.content || '',
			blocks: Array.isArray((s as any).blocks) && (s as any).blocks.length > 0 ? (s as any).blocks : null,
			metadata: s.metadata || null,
		};
		console.log('page.tsx: scriptToModel conversion:', {
			inputBlocks: (s as any).blocks,
			inputBlocksType: typeof (s as any).blocks,
			inputBlocksIsArray: Array.isArray((s as any).blocks),
			inputBlocksLength: Array.isArray((s as any).blocks) ? (s as any).blocks.length : 0,
			outputBlocks: model.blocks,
			outputBlocksType: typeof model.blocks,
			outputBlocksIsArray: Array.isArray(model.blocks),
			outputBlocksLength: Array.isArray(model.blocks) ? model.blocks.length : 0
		});
		return model;
	}, []);

	// Handlers using autosave hook
	const handleApplyEdit = useCallback((updated: Script) => {
		console.log('page.tsx: handleApplyEdit called with:', {
			title: updated.title,
			hasContent: !!updated.content,
			contentLength: updated.content?.length || 0,
			hasBlocks: !!(updated.blocks && Array.isArray(updated.blocks)),
			blocksCount: updated.blocks?.length || 0
		});
		const model = scriptToModel(updated);
		console.log('page.tsx: Converted to model:', {
			title: model.title,
			hasContent: !!model.content,
			contentLength: model.content?.length || 0,
			hasBlocks: !!(model.blocks && Array.isArray(model.blocks)),
			blocksCount: model.blocks?.length || 0
		});
		tf.setScriptAndQueueSave(model);
	}, [tf, scriptToModel]);

	const handleUpdateScript = useCallback((updated: Script | null) => {
		if (!updated) return;
		tf.setScriptAndQueueSave(scriptToModel(updated));
	}, [tf, scriptToModel]);

		const handleRunEdit = useCallback(async (instruction: string, selection?: string) => {
		// Prefer block-targeted edits with optional selection mapping
		const res = await tf.runEditBlocks(instruction, selection);
		return res;
	}, [tf]);
	const handleRenameSession = (id: string, name: string) => {
		setSessions(prev => prev.map(s => s.id === id ? { ...s, name, lastEdited: Date.now() } : s));
	};
	const handleDeleteSession = (id: string) => {
		setSessions(prev => prev.filter(s => s.id !== id));
		if (selectedIdea && selectedIdea.id === id) {
			setSelectedIdea(null);
			setPhase('IDEAS');
		}
	};

	// Dock items for ThinkForge features
	const dockItems = [
		{
			icon: <FolderOpen size={20} />,
			label: 'Projects',
			onClick: () => {
				toast({ title: 'Projects', description: 'Project management coming soon!' });
			}
		},
		{
			icon: <Lightbulb size={20} />,
			label: 'Ideation',
			onClick: () => {
				// Close planning if open
				setPlanningOpen(false);
				// Reset to ideation view
				setSelectedIdea(null);
				setIdeas([]);
				setHasSubmitted(false);
				setPrompt("");
				setPhase('PROMPT');
			}
		},
		{
			icon: <Calendar size={20} />,
			label: 'Planning',
			onClick: () => {
				setPlanningOpen(true);
			},
			active: planningOpen
		},
		{
			icon: <FileText size={20} />,
			label: 'Scripting',
			onClick: () => {
				if (phase === 'SCRIPT') {
					toast({ title: 'Already in Scripting', description: 'You are viewing the script editor.' });
				} else {
					toast({ title: 'Scripting', description: 'Select an idea to create a script.' });
				}
			}
		},
		{
			icon: <Brain size={20} />,
			label: 'Whiteboard',
			onClick: () => {
				toast({ title: 'Whiteboard', description: 'Visual thinking tools coming soon!' });
			}
		},
		{
			icon: <Library size={20} />,
			label: 'Library',
			onClick: () => setLibraryOpen(true)
		}
	];

	return (
		<div className="relative min-h-dvh w-full overflow-hidden bg-neutral-950 text-white">
			<BackgroundDecor />
			<LibraryPanel
				open={libraryOpen}
				onClose={() => setLibraryOpen(false)}
				panelRef={panelRef}
				activeSessionId={phase === 'SCRIPT' ? (pendingSessionId || tf.sessionId) : null}
				onDeleteSession={async (id) => {
					const active = (pendingSessionId || tf.sessionId);
					if (active && id === active) {
						// If the deleted session is currently active, close it and reset UI
						await tf.closeSession();
						setPendingSessionId(null);
						setSelectedIdea(null);
						setIdeas([]);
						setHasSubmitted(false);
						setPrompt("");
						setPhase('PROMPT');
					}
				}}
				// When sessions prop is omitted, component fetches via hook
				onOpenSession={async (id) => {
					try {
						setLibraryOpen(false);
						setOpeningSession(true);
						// Hydrate backend with target session and immediately use returned data
						const data = await tf.hydrate({ sessionId: id });
						if (!data) { setOpeningSession(false); return; }
						const sid = data.sessionId;
						setPendingSessionId(sid);
						// Ensure hook script state is set promptly to avoid UI race
						if (data.script) {
							// Apply script model directly to hook state and queue persistence
							// Note: setScriptAndQueueSave accepts ScriptModel
							(tf.setScriptAndQueueSave as any)(data.script);
						}
						// Reconstruct selected idea from project meta
						const pm = data.projectMeta || {};
						// Derive a stable numeric id from the session id to keep UI keys stable
						const stableId = (() => {
							let h = 0;
							for (let i = 0; i < String(id).length; i++) {
								h = (h * 31 + String(id).charCodeAt(i)) >>> 0;
							}
							return h || Date.now();
						})();
						const ideaObj = {
							id: stableId,
							idea: pm.idea || 'Untitled',
							purpose: pm.purpose || '',
							style: pm.style || '',
							format: pm.format || '',
							platform: pm.platform || '',
							tone: (pm.tone || 'blue') as any,
						} as any;
						setSelectedIdea(ideaObj);
						// Switch to Script phase so ChatPanel mounts and loads recent chats
						setPhase('SCRIPT');
					} catch {
						// leave overlay to close below
					} finally {
						// Slight delay to let initial ChatPanel fetch complete before removing overlay
						setTimeout(() => setOpeningSession(false), 250);
					}
				}}
			/>
			<AnimatePresence>
				{libraryOpen && (
					<motion.div
						className="fixed inset-0 z-30 bg-black/30 backdrop-blur-[1px]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={() => setLibraryOpen(false)}
					/>
				)}
			</AnimatePresence>

			{(phase === 'PROMPT' || phase === 'IDEAS') && (
				<div
					className={clsx(
						'relative mx-auto flex w-full max-w-7xl flex-col items-center px-4 sm:px-8',
						hasSubmitted ? 'min-h-dvh pb-32 pt-28' : 'min-h-dvh justify-center pb-20 pt-12'
					)}
				>
					<PromptPanel
						prompt={prompt}
						setPrompt={setPrompt}
						loading={loading}
						hasSubmitted={hasSubmitted}
						onSubmit={onSubmit}
						onRegenerate={regenerate}
					/>
					<IdeaGrid ideas={ideas} loading={loading} hasSubmitted={hasSubmitted} prompt={prompt} onSelect={handleSelectIdea} />
				</div>
			)}

			{phase === 'SELECTED' && selectedIdea && (
				<div className="relative mx-auto w-full max-w-5xl px-4 pb-32 pt-20">
					<SelectedIdeaDisplay
						idea={{
							id: Number(selectedIdea.id),
							idea: selectedIdea.idea,
							purpose: selectedIdea.purpose,
							style: selectedIdea.style,
							format: selectedIdea.format,
							platform: selectedIdea.platform,
							tone: selectedIdea.tone as any
						}}
						onProceedToChat={handleProceedToScript}
						onGoBack={() => setPhase('IDEAS')}
						onUpdateIdea={(upd) => handleUpdateIdea({ ...upd, id: String(upd.id) })}
					/>
				</div>
			)}

			{phase === 'SCRIPT' && selectedIdea && (
				<div className="relative mx-auto w-full max-w-[1600px] px-4 pb-10 pt-10">
					<div className="flex flex-col gap-6 lg:flex-row">
														<ChatPanel key={(pendingSessionId || tf.sessionId || 'no-session')} selectedIdea={{
							id: Number(selectedIdea.id),
							idea: selectedIdea.idea,
							purpose: selectedIdea.purpose,
							style: selectedIdea.style,
							format: selectedIdea.format,
							platform: selectedIdea.platform,
							tone: selectedIdea.tone as any
						}}
													script={scriptFromHook}
							onApplyEdit={handleApplyEdit}
							// Prefer running edits via backend + persistence
							onRunEdit={handleRunEdit}
													sessionId={pendingSessionId || tf.sessionId}
													initialMessages={Array.isArray(tf.chat) ? tf.chat : undefined}
						/>
												<ScriptPanel
							selectedIdea={{
								id: Number(selectedIdea.id),
								idea: selectedIdea.idea,
								purpose: selectedIdea.purpose,
								style: selectedIdea.style,
								format: selectedIdea.format,
								platform: selectedIdea.platform,
								tone: selectedIdea.tone as any
							}}
							script={scriptFromHook}
													sessionId={pendingSessionId || tf.sessionId}
																			isSaving={tf.isSaving}
							onUpdate={handleUpdateScript}
							onBack={async () => {
								// Close the active session and return to ThinkForge home (prompt)
								await tf.closeSession();
								// Clear local pending/session id bridge
								setPendingSessionId(null);
								setSelectedIdea(null);
								setIdeas([]);
								// Reset prompt state so it appears in its initial position
								setHasSubmitted(false);
								setPrompt("");
								setPhase('PROMPT');
							}}
								onImportScript={async (data) => {
									try {
										const res = await (tf.importScript as any)(data);
										return res;
									} catch (e: any) {
										return { ok: false, error: e?.message || 'Import failed' };
									}
								}}
						/>
					</div>
				</div>
			)}

			{/* Full-screen loading overlay while opening a session from Library */}
			{openingSession && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
					<div className="flex flex-col items-center gap-4 text-white">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
						<p className="text-sm tracking-wide text-white/80">ThinkForge is loading...</p>
					</div>
				</div>
			)}

			{/* ThinkForge Dock */}
			<Dock
				items={dockItems}
				panelHeight={68}
				baseItemSize={50}
				magnification={70}
				distance={180}
			/>

			{/* Planning Panel */}
			<PlanningPanel
				isOpen={planningOpen}
				onClose={() => setPlanningOpen(false)}
				onOpenScript={async (sessionId) => {
					try {
						setPlanningOpen(false);
						// Close any existing session
						await tf.closeSession();
						setPendingSessionId(null);
						
						// Hydrate the session from content card
						const data = await tf.hydrate({ sessionId });
						if (data?.sessionId) {
							setPendingSessionId(data.sessionId);
							if (data.script) {
								(tf.setScriptAndQueueSave as any)(data.script);
							}
							
							// Reconstruct idea from project meta if available
							const pm = data.projectMeta || {};
							if (pm.idea) {
								const stableId = (() => {
									let h = 0;
									for (let i = 0; i < String(sessionId).length; i++) {
										h = (h * 31 + String(sessionId).charCodeAt(i)) >>> 0;
									}
									return h || Date.now();
								})();
								const ideaObj = {
									id: stableId,
									idea: pm.idea || 'Untitled',
									purpose: pm.purpose || '',
									style: pm.style || '',
									format: pm.format || '',
									platform: pm.platform || '',
									tone: (pm.tone || 'blue') as any,
								} as any;
								setSelectedIdea(ideaObj);
							}
							
							// Switch to SCRIPT phase
							setPhase('SCRIPT');
						}
					} catch (err) {
						toast({
							title: 'Failed to open script',
							description: 'Could not load the script session.',
							variant: 'destructive',
						});
					}
				}}
			/>
		</div>
	);
}

