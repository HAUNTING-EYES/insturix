"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FolderOpen, Lightbulb, FileText, Calendar, Brain, Library } from "lucide-react";
import { toast } from '@/hooks/use-toast';
import { IdeaCardData } from "@/components/dashboard/ThinkForge/IdeaGrid";
import { LibraryPanel, SessionMeta } from "@/components/dashboard/ThinkForge/LibraryPanel";
import { BackgroundDecor } from "@/components/dashboard/ThinkForge/BackgroundDecor";
import { Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeSession } from "./hooks/useThinkForgeSession";
import { useThinkForgeScript } from "./hooks/useThinkForgeScript";
import { ScriptModel } from "./hooks/useThinkForgeClient";
import Dock from "@/components/dashboard/ThinkForge/Dock";
import { WorkspaceMode } from "@/components/dashboard/ThinkForge/ModeSwitcher";
import IdeationMode from "@/components/dashboard/ThinkForge/IdeationMode";
import StoryboardingMode from "@/components/dashboard/ThinkForge/StoryboardingMode";
import PlanningMode from "@/components/dashboard/ThinkForge/PlanningMode";

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
	// Mode state
	const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('ideation');
	
	const [prompt, setPrompt] = useState("");
	const [ideas, setIdeas] = useState<IdeaCardData[]>([]);
	const [loading, setLoading] = useState(false);
	// Overlay while opening an existing session from Library
	const [openingSession, setOpeningSession] = useState(false);
	// Bridge potential hydrate->state race by retaining the just-opened session id locally
	const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
	const [activeScriptId, setActiveScriptId] = useState<string>('default');
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	
	const [selectedIdea, setSelectedIdea] = useState<IdeaCardData | null>(null);
	// Internal phase for Ideation mode
	const [ideationPhase, setIdeationPhase] = useState<'PROMPT' | 'IDEAS' | 'SELECTED'>('PROMPT');
	
	const [sessions, setSessions] = useState<SessionMeta[]>([]);

	// Modular hooks
	const session = useThinkForgeSession();
	const activeSessionId = pendingSessionId || session.sessionId;
	const scriptHook = useThinkForgeScript(activeSessionId, activeScriptId);

	useEffect(() => {
		if (activeSessionId) {
			setActiveScriptId('default');
		}
	}, [activeSessionId]);

	useEffect(() => {
		if (workspaceMode !== 'scripting' || !selectedIdea) return;
		const pm = session.projectMeta || {};
		const shouldPatch = (
			(!selectedIdea.sessionName && pm.sessionName) ||
			(!selectedIdea.idea && pm.idea) ||
			(!selectedIdea.purpose && pm.purpose) ||
			(!selectedIdea.style && pm.style) ||
			(!selectedIdea.format && pm.format) ||
			(!selectedIdea.platform && pm.platform) ||
			(!selectedIdea.tone && pm.tone)
		);
		if (!shouldPatch) return;
		setSelectedIdea({
			...selectedIdea,
			sessionName: selectedIdea.sessionName || pm.sessionName,
			idea: selectedIdea.idea || pm.idea || '',
			purpose: selectedIdea.purpose || pm.purpose || '',
			style: selectedIdea.style || pm.style || '',
			format: selectedIdea.format || pm.format || '',
			platform: selectedIdea.platform || pm.platform || '',
			tone: (selectedIdea.tone || pm.tone || 'blue') as any,
		});
	}, [workspaceMode, selectedIdea, session.projectMeta]);

	const panelRef = useRef<HTMLElement | null>(null);
	const edgeHoverTimeout = useRef<NodeJS.Timeout | null>(null);

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
			setIdeationPhase('IDEAS');
		} catch {
			// generic failure: show skeletons and allow progression
			setIdeas(skeletonIdeas(prompt));
			setIdeationPhase('IDEAS');
		} finally {
			setLoading(false);
		}
	}, [prompt]);

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
		setIdeationPhase('SELECTED');
		// Do NOT create backend session here; session creation will occur on entering SCRIPT phase (Scripting Mode)
	};

	const handleProceedToScript = async () => {
		const name = (selectedIdea?.sessionName || '').trim();
		if (!name || name.length > 100) {
			toast({
				title: 'Session name required',
				description: 'Please enter a Session name (max 100 chars) before continuing.',
				variant: 'destructive',
			});
			return;
		}
		// Ensure any previous session is fully closed before entering SCRIPT
		try { await session.closeSession(); } catch {}
		// Clear any stale script immediately before creating a new session
		scriptHook.resetSessionState();
		setPendingSessionId(null);
		setWorkspaceMode('scripting');
		// Reset ideation phase back to start so user can generate new ideas when returning
		setIdeationPhase('PROMPT');
		setIdeas([]);
		setHasSubmitted(false);
		setPrompt("");
	};

	const handleJumpToSettings = () => {
		// Initialize empty idea
		const emptyIdea: IdeaCardData = {
			id: Date.now().toString(),
			idea: "",
			purpose: "",
			style: "",
			format: "",
			platform: "",
			tone: "white" // Default to neutral/white tone
		};
		setSelectedIdea(emptyIdea);
		setIdeationPhase('SELECTED');
		// Clear prompt/ideas if they exist to avoid confusion
		setPrompt("");
		setHasSubmitted(false);
	};

	const handleUpdateIdea = async (updated: any) => {
		try {
			const trimmedName = (updated.sessionName || '').trim().slice(0, 100);
			updated = { ...updated, sessionName: trimmedName };
			if (!trimmedName) {
				toast({ title: 'Session name required', description: 'Please enter a Session name (max 100 chars).' });
				return;
			}
			// Update local state immediately for optimistic UI
			setSelectedIdea(updated);
			setIdeas((prev: IdeaCardData[]) => prev.map(i => i.id === updated.id ? updated : i));
			setSessions((prev) => prev.map((s) => s.id === updated.id ? { ...s, name: updated.sessionName || updated.idea || s.name, tone: updated.tone as any, lastEdited: Date.now() } : s));
			
			// Persist to localStorage for client-side persistence
			try {
				const stored = localStorage.getItem('thinkforge_ideas') || '[]';
				const parsed = JSON.parse(stored);
				const idx = parsed.findIndex((i: any) => i.id === updated.id);
				if (idx >= 0) {
					parsed[idx] = updated;
				} else {
					parsed.push(updated);
				}
				localStorage.setItem('thinkforge_ideas', JSON.stringify(parsed));
			} catch (e) {
				console.error('Failed to persist idea to localStorage:', e);
			}

			// Persist project meta (including sessionName) to the active session when available
			// Skip if we're still in ideation phase (no active session yet)
			const activeSessionId = session.sessionId || pendingSessionId;
			if (activeSessionId && workspaceMode === 'scripting') {
				const projectMetaPayload = {
					idea: updated.idea || '',
					purpose: updated.purpose || '',
					style: updated.style || '',
					format: updated.format || '',
					platform: updated.platform || '',
					tone: updated.tone || 'blue',
					sessionName: updated.sessionName || ''
				};

				try {
					const res = await fetch('/api/services/thinkforge/session/update', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							sessionId: activeSessionId,
							projectMeta: projectMetaPayload
						})
					});
					if (!res.ok) {
						console.error('Failed to persist session meta:', res.status, res.statusText);
					}

					// Update local session cache so subsequent hydrations reflect the change
					try {
						const key = `thinkforge_session_${activeSessionId}`;
						const cached = JSON.parse(localStorage.getItem(key) || '{}');
						localStorage.setItem(key, JSON.stringify({ ...cached, projectMeta: projectMetaPayload }));
					} catch {}
				} catch (err) {
					console.error('Error saving session meta:', err);
				}
			}
		} catch (error) {
			console.error('Error updating idea:', error);
			// Optionally show error toast here
		}
	};

	// Create a session when entering SCRIPTING mode first time for selected idea
	useEffect(() => {
		if (workspaceMode === 'scripting' && selectedIdea) {
			setSessions(prev => {
				const existing = prev.find(s => s.id === selectedIdea.id);
				if (existing) return prev.map(s => s.id === existing.id ? { ...s, lastEdited: Date.now() } : s);
				// Prefer explicit Session name; fall back to idea text
				const base = (selectedIdea.sessionName || selectedIdea.idea || 'New Session').split('–')[0].trim();
				const name = base.length > 40 ? base.slice(0, 40) + '…' : base || 'New Session';
				return [...prev, { id: selectedIdea.id, name, tone: selectedIdea.tone, lastEdited: Date.now() }];
			});
		}
	}, [workspaceMode, selectedIdea]);

	// Hydrate backend session when entering SCRIPTING mode
	const hasHydratedRef = useRef(false);
	const creationTimerRef = useRef<NodeJS.Timeout | null>(null);
	useEffect(() => {
		if (workspaceMode !== 'scripting' || !selectedIdea) return;
		// If opening an existing session from Library, or a session already exists, do not create a new one
		if (session.sessionId || pendingSessionId) return;
		// Only hydrate once per entry into script phase until idea changes
		if (hasHydratedRef.current) return;
		// Debounce creation slightly and cancel if user navigates away
		if (creationTimerRef.current) clearTimeout(creationTimerRef.current);
		creationTimerRef.current = setTimeout(async () => {
			// Re-check conditions at execution time
			if (workspaceMode !== 'scripting' || !selectedIdea) return;
			if (session.sessionId || pendingSessionId) return;
			if (hasHydratedRef.current) return;
			hasHydratedRef.current = true;
			try {
				setOpeningSession(true);
				await session.closeSession();
				// Ensure UI is cleared before creating a fresh session
				scriptHook.resetSessionState();
				const created = await session.hydrate({
					projectMeta: {
						idea: selectedIdea.idea,
						purpose: (selectedIdea as any)?.purpose,
						style: (selectedIdea as any)?.style,
						format: (selectedIdea as any)?.format,
						platform: (selectedIdea as any)?.platform,
						tone: selectedIdea.tone,
						sessionName: (selectedIdea as any)?.sessionName
					}
				});
				if (created?.sessionId) {
					setPendingSessionId(created.sessionId);
					scriptHook.resetSessionState();
				}
			} catch {}
			finally {
				setTimeout(() => setOpeningSession(false), 250);
			}
		}, 220);
	}, [workspaceMode, selectedIdea, session.sessionId, pendingSessionId, session, scriptHook]);

	// Clear temporary pendingSessionId once the hook has the active sessionId
	useEffect(() => {
		if (!openingSession && pendingSessionId && session.sessionId === pendingSessionId) {
			setPendingSessionId(null);
		}
	}, [openingSession, pendingSessionId, session.sessionId]);

	// Reset hydrate flag when idea changes
	useEffect(() => { hasHydratedRef.current = false; }, [selectedIdea?.id]);
	// Reset hydrate flag when leaving SCRIPTING
	useEffect(() => { if (workspaceMode !== 'scripting') { hasHydratedRef.current = false; if (creationTimerRef.current) { clearTimeout(creationTimerRef.current); creationTimerRef.current = null; } } }, [workspaceMode]);

	// Map between hook ScriptModel and UI Script
	const modelToScript = useCallback((m: ScriptModel | null): Script | null => {
		if (!m) return null;
		const title = m.title || 'Untitled Script';
		const content = m.content || '';
		const paras = content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
		const htmlBody = [`<h1>${title}</h1>`, ...paras.map(p => `<p>${p}</p>`)].join('\n');
		const script: Script = {
			title,
			version: m.version,
			content,
			body: htmlBody,
			blocks: Array.isArray(m.blocks) && m.blocks.length > 0 ? (m.blocks as any) : undefined,
			metadata: m.metadata || undefined,
			sections: [], tips: [], duration: undefined, targetAudience: undefined, tone: undefined
		} as Script;
		return script;
	}, []);

	const scriptFromHook: Script | null = useMemo(() => modelToScript(scriptHook.script), [scriptHook.script, modelToScript]);

	const scriptToModel = useCallback((s: Script): ScriptModel => {
		const model: ScriptModel = {
			title: s.title,
			content: s.content || '',
			blocks: Array.isArray((s as any).blocks) && (s as any).blocks.length > 0 ? (s as any).blocks : null,
			version: (s as any).version,
			metadata: s.metadata || null,
		};
		return model;
	}, []);

	// Handlers using autosave hook
	const handleApplyEdit = useCallback((updated: Script) => {
		const model = scriptToModel(updated);
		scriptHook.setScriptAndQueueSave(model);
	}, [scriptHook, scriptToModel]);

	// Handle script updates from ScriptEditor
	// NOTE: ScriptEditor already saves to backend via /script/blocks endpoint
	// We only update local state here - NO server save (to avoid double-saving)
	const handleUpdateScript = useCallback((updated: Script | null) => {
		if (!updated) return;
		// Use setScriptWithoutSave to update state without triggering another save
		// ScriptEditor handles all persistence directly
		scriptHook.setScriptWithoutSave(scriptToModel(updated));
	}, [scriptHook, scriptToModel]);

	const handleRunEdit = useCallback(async (instruction: string, selection?: string) => {
		// Prefer block-targeted edits with optional selection mapping
		const res = await scriptHook.runEditBlocks(instruction, selection);
		return res;
	}, [scriptHook]);

	// Dock items for ThinkForge features
	const dockItems = [
		{
			icon: FolderOpen,
			label: 'Projects',
			onClick: () => {
				toast({ title: 'Projects', description: 'Project management coming soon!' });
			}
		},
		{
			icon: Lightbulb,
			label: 'Ideation',
			onClick: () => {
				setWorkspaceMode('ideation');
			},
			active: workspaceMode === 'ideation'
		},
		{
			icon: FileText,
			label: 'Storyboarding',
			onClick: () => {
				if (!selectedIdea && workspaceMode !== 'scripting') {
					toast({ title: 'Storyboarding', description: 'Select an idea from Ideation to create a storyboard, or open one from Library.' });
				}
				setWorkspaceMode('scripting');
			},
			active: workspaceMode === 'scripting'
		},
		{
			icon: Calendar,
			label: 'Planning',
			onClick: () => {
				setWorkspaceMode('planning');
			},
			active: workspaceMode === 'planning'
		},
		{
			icon: Library,
			label: 'Library',
			onClick: () => setLibraryOpen(true)
		}
	];

	return (
		<div className="relative h-screen w-full overflow-hidden bg-neutral-950 text-white">
			<BackgroundDecor />
			
			<LibraryPanel
				open={libraryOpen}
				onClose={() => setLibraryOpen(false)}
				panelRef={panelRef}
				activeSessionId={workspaceMode === 'scripting' ? (pendingSessionId || session.sessionId) : null}
				onDeleteSession={async (id) => {
					const active = (pendingSessionId || session.sessionId);
					if (active && id === active) {
						// If the deleted session is currently active, close it and reset UI
						await session.closeSession();
						setPendingSessionId(null);
						scriptHook.resetSessionState();
						setSelectedIdea(null);
						setIdeas([]);
						setHasSubmitted(false);
						setPrompt("");
						setIdeationPhase('PROMPT');
						setWorkspaceMode('ideation');
					}
				}}
				// When sessions prop is omitted, component fetches via hook
				onOpenSession={async (id) => {
					try {
						// Ensure current script is saved before switching sessions
						if (scriptHook.script) {
							await scriptHook.autosave(scriptHook.script);
						}
						// Clear UI while switching to prevent stale hydration
						scriptHook.resetSessionState();
						setLibraryOpen(false);
						setOpeningSession(true);
						// Hydrate backend with target session and immediately use returned data
						const data = await session.hydrate({ sessionId: id });
						if (!data) { setOpeningSession(false); return; }
						const sid = data.sessionId;
						setPendingSessionId(sid);
						scriptHook.resetSessionState();
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
							sessionName: pm.sessionName || undefined,
						} as any;
						setSelectedIdea(ideaObj);
						// Switch to Script mode so ChatPanel mounts and loads recent chats
						setWorkspaceMode('scripting');
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

			<IdeationMode 
				phase={ideationPhase}
				prompt={prompt}
				setPrompt={setPrompt}
				loading={loading}
				hasSubmitted={hasSubmitted}
				ideas={ideas}
				selectedIdea={selectedIdea}
				onSubmit={onSubmit}
				onRegenerate={regenerate}
				onSelectIdea={handleSelectIdea}
				onProceedToChat={handleProceedToScript}
				onGoBackToIdeas={() => setIdeationPhase('IDEAS')}
				onUpdateIdea={handleUpdateIdea}
				onManualSetup={handleJumpToSettings}
				isVisible={workspaceMode === 'ideation'}
				sessionCount={sessions.length}
			/>

			<StoryboardingMode
				isVisible={workspaceMode === 'scripting'}
				selectedIdea={selectedIdea}
				sessionId={pendingSessionId || session.sessionId}
				scriptId={activeScriptId}
				script={scriptFromHook}
				isSaving={scriptHook.isSaving}
				onApplyEdit={handleApplyEdit}
				onRunEdit={handleRunEdit}
				onUpdateScript={handleUpdateScript}
				onBack={async () => {
					// Close the active session and return to ThinkForge home (prompt)
					await session.closeSession();
					setPendingSessionId(null);
					scriptHook.resetSessionState();
					setSelectedIdea(null);
					setIdeas([]);
					setHasSubmitted(false);
					setPrompt("");
					setIdeationPhase('PROMPT');
					setWorkspaceMode('ideation');
				}}
				onScriptCreated={(scriptId) => {
					setActiveScriptId(scriptId);
					scriptHook.resetSessionState();
					scriptHook.setScriptWithoutSave({
						title: 'New Script',
						content: '',
						blocks: null,
						metadata: null,
					});
				}}
				onSwitchScript={async (scriptId) => {
					if (!activeSessionId) return;
					try {
						setOpeningSession(true);
						if (scriptHook.script) {
							await scriptHook.autosave(scriptHook.script);
						}
						setActiveScriptId(scriptId);
						scriptHook.resetSessionState();
					} finally {
						setTimeout(() => setOpeningSession(false), 200);
					}
				}}
				onImportScript={async (data) => {
					try {
						const res = scriptHook.importScript(data);
						return res;
					} catch (e: any) {
						return { ok: false, error: e?.message || 'Import failed' };
					}
				}}
				onGoToIdeation={() => setWorkspaceMode('ideation')}
				onSwitchSession={async (id) => {
					try {
						// Ensure current script is saved before switching sessions
						if (scriptHook.script) {
							await scriptHook.autosave(scriptHook.script);
						}
						// Clear UI while switching to prevent stale hydration
						scriptHook.resetSessionState();
						setOpeningSession(true);
						// Hydrate backend with target session and immediately use returned data
						const data = await session.hydrate({ sessionId: id });
						if (!data) { setOpeningSession(false); return; }
						const sid = data.sessionId;
						setPendingSessionId(sid);
						scriptHook.resetSessionState();
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
							sessionName: pm.sessionName || undefined,
						} as any;
						setSelectedIdea(ideaObj);
						// Switch to Script mode so ChatPanel mounts and loads recent chats
						setWorkspaceMode('scripting');
					} catch {
						// leave overlay to close below
					} finally {
						// Slight delay to let initial ChatPanel fetch complete before removing overlay
						setTimeout(() => setOpeningSession(false), 250);
					}
				}}
				onUpdateIdea={(updatedIdea) => {
					setSelectedIdea(updatedIdea);
					handleUpdateIdea({ ...updatedIdea, id: String(updatedIdea.id) });
				}}
			/>

			<PlanningMode
				isVisible={workspaceMode === 'planning'}
				onOpenScript={async (sessionId) => {
					try {
						// Close any existing session
						await session.closeSession();
						setPendingSessionId(null);
						scriptHook.resetSessionState();
						
						// Hydrate the session from content card
						const data = await session.hydrate({ sessionId });
						if (data?.sessionId) {
							setPendingSessionId(data.sessionId);
							scriptHook.resetSessionState();
							
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
									sessionName: pm.sessionName || undefined,
								} as any;
								setSelectedIdea(ideaObj);
							}
							
							// Switch to SCRIPT mode
							setWorkspaceMode('scripting');
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
			<Dock items={dockItems} />
		</div>
	);
}
