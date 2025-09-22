"use client";
import React from "react";
import clsx from "clsx";

type Block = any;

function extractText(node: any): string {
	if (!node) return "";
	if (typeof node === "string") return node;
	if (Array.isArray(node)) return node.map(extractText).join("");
	if (typeof node === "object") {
		const direct = node.text ?? node.content;
		if (typeof direct === "string") return direct;
		if (Array.isArray(direct)) return direct.map(extractText).join("");
		const children = node.children ?? node.content;
		return extractText(children);
	}
	return String(node);
}

function renderInline(text: string): React.ReactNode {
	// Minimal inline formatting: code, bold, italic
	if (!text) return null;
	const parts: React.ReactNode[] = [];
	const codeSplit = text.split(/`([^`]+)`/g);
	for (let i = 0; i < codeSplit.length; i++) {
		if (i % 2 === 1) {
			parts.push(
				<code key={"c" + i} className="px-1 py-0.5 rounded bg-black/40 border border-white/10 text-[11px] font-mono text-white/90">
					{codeSplit[i]}
				</code>
			);
		} else {
			// bold then italic
			const boldRe = /\*\*(.+?)\*\*/g;
			const italicRe = /(^|[^*])\*(?!\*)([^*]+)\*(?!\*)/g;
			let seg = codeSplit[i];
			let lastIndex = 0; let m: RegExpExecArray | null;
			const boldParts: React.ReactNode[] = [];
			while ((m = boldRe.exec(seg)) !== null) {
				boldParts.push(seg.slice(lastIndex, m.index));
				boldParts.push(<strong key={"b" + i + m.index} className="font-semibold">{m[1]}</strong>);
				lastIndex = m.index + m[0].length;
			}
			boldParts.push(seg.slice(lastIndex));
			const italicParts: React.ReactNode[] = [];
			boldParts.forEach((bp, j) => {
				if (typeof bp !== "string") { italicParts.push(bp); return; }
				let str = bp; let im: RegExpExecArray | null; let last = 0; const temp: React.ReactNode[] = [];
				while ((im = italicRe.exec(str)) !== null) {
					temp.push(str.slice(last, im.index + 1));
					temp.push(<em key={"i" + i + j + im.index} className="italic">{im[2]}</em>);
					last = im.index + im[0].length;
				}
				temp.push(str.slice(last));
				italicParts.push(...temp);
			});
			parts.push(<React.Fragment key={"t" + i}>{italicParts}</React.Fragment>);
		}
	}
	return <>{parts}</>;
}

function RenderBlock({ block }: { block: Block }) {
	const type = String(block?.type || block?.kind || "paragraph").toLowerCase();
	const content = block?.content ?? block?.children ?? block?.text ?? "";
	const text = extractText(content);

	if (type === "heading" || /^h[1-6]$/.test(type)) {
		const lvl = Math.min(6, Math.max(1, Number(block?.props?.level) || Number((type.startsWith("h") ? type.slice(1) : 2)) || 2));
		const H: any = ("h" + String(lvl)) as any;
		return <H className={clsx("font-semibold mt-4 mb-2", {
			"text-2xl": lvl === 1,
			"text-xl": lvl === 2,
			"text-lg": lvl === 3,
			"text-base": lvl >= 4,
		})}>{renderInline(text)}</H>;
	}
	if (type === "numberedlistitem") {
		return <li className="list-decimal ml-6"><span>{renderInline(text)}</span></li>;
	}
	if (type === "bulletlistitem") {
		return <li className="list-disc ml-6"><span>{renderInline(text)}</span></li>;
	}
	if (type === "code" || type === "codeblock" || type === "pre") {
		return (
			<pre className="mt-2 mb-3 rounded-lg bg-black/50 border border-white/10 p-3 overflow-x-auto text-[12px] leading-snug">
				<code>{text}</code>
			</pre>
		);
	}
	if (type === "quote" || type === "blockquote") {
		return (
			<blockquote className="border-l-2 border-white/20 pl-3 italic text-white/80 my-2">
				{renderInline(text)}
			</blockquote>
		);
	}
	// default paragraph
	return <p className="mb-2 text-white/90">{renderInline(text)}</p>;
}

export default function ScriptRenderer({
	title,
	blocks,
	className,
}: { title?: string | null; blocks?: Block[] | null; className?: string }) {
	const safeBlocks: Block[] = Array.isArray(blocks) ? blocks : [];
	// Group consecutive list items into proper lists
	const rendered: React.ReactNode[] = [];
	let listBuf: Block[] = [];
	let ordered = false;
	const flushList = () => {
		if (listBuf.length === 0) return;
		const items = listBuf.map((b, idx) => <RenderBlock key={"li-" + idx + Math.random()} block={b} />);
		rendered.push(ordered ? <ol key={"ol-" + rendered.length} className="my-2 space-y-1">{items}</ol>
													: <ul key={"ul-" + rendered.length} className="my-2 space-y-1">{items}</ul>);
		listBuf = []; ordered = false;
	};
	for (const b of safeBlocks) {
		const t = String(b?.type || "paragraph").toLowerCase();
		if (t === "numberedlistitem") {
			if (listBuf.length === 0) ordered = true;
			listBuf.push(b); continue;
		}
		if (t === "bulletlistitem") {
			if (listBuf.length === 0) ordered = false;
			listBuf.push(b); continue;
		}
		flushList();
		rendered.push(<RenderBlock key={"b-" + rendered.length} block={b} />);
	}
	flushList();

	return (
		<div className={clsx("ScriptRenderer", className)}>
			{title ? <h1 className="text-2xl font-bold mb-3">{title}</h1> : null}
			<div>{rendered}</div>
		</div>
	);
}
