"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen } from "lucide-react";
import clsx from "clsx";
import { PromptPanel } from "@/components/dashboard/ThinkForge/PromptPanel";
import { IdeaGrid, IdeaCardData } from "@/components/dashboard/ThinkForge/IdeaGrid";
import { LibraryPanel, SessionMeta } from "@/components/dashboard/ThinkForge/LibraryPanel";
import { BackgroundDecor } from "@/components/dashboard/ThinkForge/BackgroundDecor";
import SelectedIdeaDisplay from "@/components/dashboard/ThinkForge/SelectedIdeaDisplay";
import { ChatPanel } from "@/components/dashboard/ThinkForge/ChatPanel";
import { ScriptPanel } from "@/components/dashboard/ThinkForge/ScriptPanel";
import { Script } from "@/app/dashboard/thinkforge/types";
import { useThinkForgeClient, ScriptModel } from "./hooks/useThinkForgeClient";

const hats = ["white","red","black","yellow","green","blue"] as const;
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
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const [libraryOpen, setLibraryOpen] = useState(false);
	const [selectedIdea, setSelectedIdea] = useState<IdeaCardData | null>(null);
	const [phase, setPhase] = useState<'PROMPT' | 'IDEAS' | 'SELECTED' | 'SCRIPT'>('PROMPT');
	const [script, setScript] = useState<Script | null>(null);
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
		setPhase('IDEAS');
			try {
				const res = await fetch('/api/services/thinkforge/ideas', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ prompt })
				});
				if (!res.ok) throw new Error('bad');
				const data = await res.json();
				const list: IdeaCardData[] = Array.isArray(data?.ideas) ? data.ideas : (Array.isArray(data) ? data : []);
				setIdeas(list.length === 4 ? list : skeletonIdeas(prompt));
			} catch {
				setIdeas(skeletonIdeas(prompt));
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

	const handleSelectIdea = (idea: IdeaCardData) => {
		setSelectedIdea(idea);
		setPhase('SELECTED');
	};
	const handleProceedToScript = () => setPhase('SCRIPT');
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
				const name = base.length > 40 ? base.slice(0,40) + '…' : base || 'New Session';
				return [...prev, { id: selectedIdea.id, name, tone: selectedIdea.tone, lastEdited: Date.now() }];
			});
		}
	}, [phase, selectedIdea]);

	// Hydrate backend session when entering SCRIPT phase
	const hasHydratedRef = useRef(false);
	useEffect(() => {
		if (phase !== 'SCRIPT' || !selectedIdea) return;
		// Only hydrate once per entry into script phase until idea changes
		if (hasHydratedRef.current) return;
		hasHydratedRef.current = true;
		void tf.hydrate({ projectMeta: {
			idea: selectedIdea.idea,
			purpose: (selectedIdea as any)?.purpose,
			style: (selectedIdea as any)?.style,
			format: (selectedIdea as any)?.format,
			platform: (selectedIdea as any)?.platform,
			tone: selectedIdea.tone
		}});
	}, [phase, selectedIdea]);

	// Reset hydrate flag if idea changes or we exit script
	useEffect(() => { hasHydratedRef.current = false; }, [selectedIdea?.id, phase !== 'SCRIPT']);

	// Map between hook ScriptModel and UI Script
	const modelToScript = useCallback((m: ScriptModel | null): Script | null => {
		if (!m) return null;
		const title = m.title || 'Untitled Script';
		const content = m.content || '';
		const paras = content.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
		const htmlBody = [`<h1>${title}</h1>`, ...paras.map(p => `<p>${p}</p>`)].join('\n');
		return {
			title,
			content,
			body: htmlBody,
			blocks: (m.blocks as any) || undefined,
			sections: [], tips: [], duration: undefined, targetAudience: undefined, tone: undefined
		} as Script;
	}, []);

	const scriptFromHook: Script | null = useMemo(() => modelToScript(tf.script), [tf.script, modelToScript]);

	const scriptToModel = useCallback((s: Script): ScriptModel => ({
		title: s.title,
		content: s.content || '',
		blocks: (s as any).blocks || null,
	}), []);

	// Handlers using autosave hook
	const handleApplyEdit = useCallback((updated: Script) => {
		tf.setScriptAndQueueSave(scriptToModel(updated));
	}, [tf, scriptToModel]);

	const handleUpdateScript = useCallback((updated: Script | null) => {
		if (!updated) return;
		tf.setScriptAndQueueSave(scriptToModel(updated));
	}, [tf, scriptToModel]);

	const handleRunEdit = useCallback(async (instruction: string) => {
		const res = await tf.runEdit(instruction);
		// tf.runEdit already updates the script via setScriptAndQueueSave internally
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

	return (
		<div className="relative min-h-dvh w-full overflow-hidden bg-neutral-950 text-white">
			<BackgroundDecor />
			<LibraryPanel
				open={libraryOpen}
				onClose={() => setLibraryOpen(false)}
				panelRef={panelRef}
				// When sessions prop is omitted, component fetches via hook
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
			<AnimatePresence>
				{!libraryOpen && (
					<motion.button
						onClick={() => setLibraryOpen(true)}
						className="group fixed right-3 top-4 z-30 flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md transition hover:bg-white/10"
						initial={{ opacity: 0, y: -8, scale: 0.85 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: -6 }}
					>
						<BookOpen className="h-3.5 w-3.5 text-red-300" /> Library
					</motion.button>
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
												<ChatPanel selectedIdea={{
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
												sessionId={tf.sessionId}
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
								onUpdate={handleUpdateScript}
							onBack={() => setPhase('SELECTED')}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

