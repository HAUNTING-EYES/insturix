"use client";

import { useState, useRef, useEffect } from "react";
import type { BannerConfig } from "@/schemas/Socialize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface BannerCustomizerProps {
    banner: BannerConfig;
    onBannerChange: (banner: BannerConfig) => void;
    isUploading?: boolean;
}

export function BannerCustomizer({ banner, onBannerChange, isUploading }: BannerCustomizerProps) {
    const { toast } = useToast();
    const [expanded, setExpanded] = useState(false);
    const [selectedTab, setSelectedTab] = useState<"image" | "color">(
        banner.type === "image" ? "image" : "color"
    );
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    // Ensure localColor is always a defined string (avoid undefined -> controlled/uncontrolled)
    const [localColor, setLocalColor] = useState<string>(
        banner?.type === "color" && banner?.value ? banner.value : "#D4A652"
    );
    useEffect(() => {
        if (banner?.type === 'color') {
            setLocalColor(banner?.value ?? '#D4A652');
        }
    }, [banner?.type, banner?.value]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Create and cleanup object URL for local preview
    useEffect(() => {
        if (file) {
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
            return () => {
                URL.revokeObjectURL(url);
                setPreviewUrl(null);
            };
        } else {
            setPreviewUrl(null);
        }
    }, [file]);

    const currentUploading = uploading || !!isUploading;

    // Minimal console debug kept intentionally (can be removed later)
    console.debug('BannerCustomizer:', { banner, expanded, selectedTab });

    async function handleUpload() {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            toast({ title: "File too large", description: "Max 5MB allowed", variant: "destructive" });
            return;
        }
        if (!/^image\/(jpeg|jpg|png|webp|svg\+xml)$/.test(file.type)) {
            toast({ title: "Invalid type", description: "Use JPG, PNG, WebP, or SVG", variant: "destructive" });
            return;
        }
        try {
            setUploading(true);
            const form = new FormData();
            form.append("banner", file);
            const res = await fetch("/api/services/socialize/upload/banner", {
                method: "POST",
                body: form,
            });
            if (!res.ok) {
                let message = "Upload failed";
                try { const err = await res.json(); message = err?.error || message; } catch { }
                throw new Error(message);
            }
            const data = await res.json();
            if (!data.gcsPath) {
                throw new Error('No GCS path returned from upload');
            }
            const prevBanner = banner;

            onBannerChange({
                type: "image",
                value: data.signedUrl,
                gcsPath: data.gcsPath,
                gradientType: "linear",
                gradientColors: []
            });
            toast({ title: "Banner updated", description: "Image uploaded successfully" });
            setFile(null);
            // close panel after success for a cleaner interaction
            setExpanded(false);
            // Delete previous image from GCS if it exists and was an image
            try {
                if (prevBanner?.type === 'image' && (prevBanner.gcsPath || prevBanner.value)) {
                    const deleteUrl = new URL(window.location.origin + "/api/services/socialize/upload/banner");
                    // prefer gcsPath if present
                    deleteUrl.searchParams.set('url', prevBanner.gcsPath || prevBanner.value || '');
                    const delRes = await fetch(deleteUrl.toString(), { method: 'DELETE' });
                    if (!delRes.ok) {
                        const err = await delRes.json().catch(() => ({}));
                        console.warn('Failed to delete previous banner image:', err?.error || delRes.statusText);
                        // Non-blocking: inform user
                        toast({ title: 'Warning', description: 'Could not delete previous banner image', variant: 'destructive' });
                    }
                }
            } catch (e) {
                console.warn('Error deleting previous banner image:', e);
            }
        } catch (e: any) {
            toast({ title: "Upload failed", description: e?.message || "Try again later", variant: "destructive" });
        } finally {
            setUploading(false);
        }
    }

    async function handleDeleteImage() {
        if (banner.type !== "image" || !banner.value) return;
        try {
            setUploading(true);
            const url = new URL(window.location.origin + "/api/services/socialize/upload/banner");
            url.searchParams.set("url", banner.value);
            const res = await fetch(url.toString(), { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || "Delete failed");
            }
            onBannerChange({ type: "color", value: "#D4A652", gradientType: "linear", gradientColors: [] });
            toast({ title: "Banner removed", description: "Reverted to default color" });
        } catch (e: any) {
            toast({ title: "Delete failed", description: e?.message || "Try again later", variant: "destructive" });
        } finally {
            setUploading(false);
        }
    }

    // Normalize to a canonical lowercase 6-digit hex string (e.g. #00aabb)
    function normalizeHex(input?: string): string | null {
        if (!input) return null;
        let v = input.trim();
        if (!v.startsWith("#")) v = `#${v}`;
        const hex = v.replace(/^#/, "");
        if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
            const exp = hex.split("").map((c) => (c + c).toLowerCase()).join("");
            return `#${exp}`;
        }
        if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
        return null;
    }

    function handleColorInput(next: string) {
        const normalized = normalizeHex(next);
        // Keep the preview in canonical form when possible
        setLocalColor(normalized ?? next);
        if (normalized) {
            const prevBanner = banner;
            onBannerChange({ type: "color", value: normalized, gradientType: "linear", gradientColors: [] });
            // If previous banner was an uploaded image, delete it from GCS
            (async () => {
                try {
                    if (prevBanner?.type === 'image' && (prevBanner.gcsPath || prevBanner.value)) {
                        const deleteUrl = new URL(window.location.origin + "/api/services/socialize/upload/banner");
                        deleteUrl.searchParams.set('url', prevBanner.gcsPath || prevBanner.value || '');
                        const delRes = await fetch(deleteUrl.toString(), { method: 'DELETE' });
                        if (!delRes.ok) {
                            const err = await delRes.json().catch(() => ({}));
                            console.warn('Failed to delete previous banner image:', err?.error || delRes.statusText);
                            // Optionally show a toast (kept minimal to avoid too many toasts)
                            toast({ title: 'Warning', description: 'Could not delete previous banner image', variant: 'destructive' });
                        }
                    }
                } catch (e) {
                    console.warn('Error deleting previous banner image:', e);
                }
            })();
        }
    }

    async function applyColor() {
        const normalized = normalizeHex(localColor);
        if (!normalized) {
            toast({ title: 'Invalid color', description: 'Please enter a valid hex color like #00aabb', variant: 'destructive' });
            return;
        }
        const prevBanner = banner;
        // If a file is staged (not uploaded), just clear it locally
        if (file) setFile(null);
        // Persist the color change
        onBannerChange({ type: 'color', value: normalized, gradientType: 'linear', gradientColors: [] });
        toast({ title: 'Banner updated', description: 'Color applied to banner' });

        // If previous banner was an uploaded image, delete it from GCS
        try {
            if (prevBanner?.type === 'image' && (prevBanner.gcsPath || prevBanner.value)) {
                const deleteUrl = new URL(window.location.origin + "/api/services/socialize/upload/banner");
                deleteUrl.searchParams.set('url', prevBanner.gcsPath || prevBanner.value || '');
                const delRes = await fetch(deleteUrl.toString(), { method: 'DELETE' });
                if (!delRes.ok) {
                    const err = await delRes.json().catch(() => ({}));
                    console.warn('Failed to delete previous banner image:', err?.error || delRes.statusText);
                    toast({ title: 'Warning', description: 'Could not delete previous banner image', variant: 'destructive' });
                }
            }
        } catch (e) {
            console.warn('Error deleting previous banner image:', e);
        }
    }

    return (
        <div className="rounded-[12px] border-none" style={{ backgroundColor: '#0F0F0E' }}>
            <button
                type="button"
                onClick={() => setExpanded((s) => !s)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-md overflow-hidden bg-zinc-900 flex items-center justify-center">
                        {banner.type === 'image' && banner.value ? (
                            <img src={banner.value} alt="banner" className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full" style={{ backgroundColor: normalizeHex(localColor) || '#D4A652' }} />
                        )}
                    </div>
                    <div>
                        <div className="text-sm font-medium" style={{ color: '#EAE9E5' }}>Profile Banner</div>
                        <div className="text-[11px] text-zinc-400">{banner.type === 'image' ? 'Image' : 'Color'}</div>
                    </div>
                </div>
                <div className="text-[11px] text-zinc-400">{expanded ? 'Close' : 'Edit'}</div>
            </button>

            {expanded ? (
                <div className="px-4 pb-4 pt-2 space-y-3 border-t border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setSelectedTab('image')}
                                className={`px-3 py-2 text-sm rounded-[7px] ${selectedTab === 'image' ? 'bg-[#1B1A18] text-[#EAE9E5]' : 'bg-transparent text-[#B5B2A8]'}`}
                            >
                                Image
                            </button>
                            <button
                                type="button"
                                onClick={() => setSelectedTab('color')}
                                className={`px-3 py-2 text-sm rounded-[7px] ${selectedTab === 'color' ? 'bg-[#1B1A18] text-[#EAE9E5]' : 'bg-transparent text-[#B5B2A8]'}`}
                            >
                                Color
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            {banner.type === 'image' && banner.value ? (
                                <button onClick={handleDeleteImage} disabled={currentUploading} className="text-[11px] text-zinc-300 px-2 py-1 border border-zinc-800 rounded">Remove</button>
                            ) : null}
                        </div>
                    </div>

                    {selectedTab === 'image' ? (
                        <div className="flex flex-col gap-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
                                className="hidden"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                            />

                            <div
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                                }}
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setDragOver(false);
                                    const f = e.dataTransfer?.files?.[0];
                                    if (f) setFile(f);
                                }}
                                className={`w-full h-28 rounded-md border-2 ${dragOver ? 'border-dashed border-[#D4A652]' : 'border-transparent'} flex items-center gap-4 px-4 cursor-pointer`}
                                style={{ backgroundColor: '#1B1A18' }}
                            >
                                <div className="w-16 h-16 bg-gradient-to-br from-[#0b0b0b] to-[#0f1316] rounded overflow-hidden flex items-center justify-center">
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
                                    ) : banner.type === 'image' && banner.value ? (
                                        <img src={banner.value} alt="current banner" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center text-zinc-500">
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6 mb-1 opacity-80">
                                                <rect x="3" y="5" width="18" height="14" rx="2" ry="2" strokeWidth="1.5" />
                                                <circle cx="12" cy="12" r="2.5" strokeWidth="1.5" />
                                            </svg>
                                            <div className="text-[11px]">No image</div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 text-sm text-zinc-300">
                                    <div className="font-medium" style={{ color: '#EAE9E5' }}>{file ? file.name : (banner.type === 'image' && banner.value ? 'Current banner' : 'Upload banner image')}</div>
                                    <div className="text-[11px] text-zinc-400 mt-1">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'JPG, PNG, WebP, SVG — max 5MB'}</div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {file ? (
                                        <button onClick={(e) => { e.stopPropagation(); setFile(null); }} className="text-[11px] text-zinc-300 px-2 py-1 border border-zinc-800 rounded">Clear</button>
                                    ) : null}
                                    <button onClick={(e) => { e.stopPropagation(); handleUpload(); }} disabled={!file || currentUploading} className="px-3 py-2 text-sm rounded-[7px] border-none transition-opacity hover:opacity-90" style={{ backgroundColor: '#D4A652', color: '#0B0B0A' }}>
                                        {currentUploading ? 'Uploading...' : 'Upload'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={normalizeHex(localColor) ?? '#D4A652'}
                                onChange={(e) => setLocalColor(e.target.value)}
                                disabled={currentUploading}
                                className="w-10 h-8 p-0 border-none bg-transparent"
                            />
                            <input
                                type="text"
                                value={localColor ?? ''}
                                onChange={(e) => setLocalColor(e.target.value)}
                                disabled={currentUploading}
                                className="bg-transparent border text-sm px-2 py-1 rounded w-36"
                                style={{ borderColor: '#1B1A18', color: '#EAE9E5' }}
                                placeholder="#D4A652"
                            />
                            <button onClick={applyColor} disabled={currentUploading} className="px-3 py-2 text-sm rounded-[7px] border-none transition-opacity hover:opacity-90" style={{ backgroundColor: '#D4A652', color: '#0B0B0A' }}>
                                Apply color
                            </button>
                        </div>
                    )}

                    <div className="mt-2">
                        <div className="w-full h-24 bg-[#141414] rounded-md border border-zinc-800 overflow-hidden">
                            {selectedTab === 'image' && banner.type === 'image' && banner.value ? (
                                <img src={banner.value} alt="Current banner" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            ) : selectedTab === 'color' ? (
                                <div className="w-full h-full" style={{ backgroundColor: normalizeHex(localColor) || localColor || '#D4A652' }} />
                            ) : banner.type === 'image' && banner.value ? (
                                <img src={banner.value} alt="Current banner" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            ) : banner.type === 'color' && banner.value ? (
                                <div className="w-full h-full" style={{ backgroundColor: normalizeHex(banner.value) || banner.value }} />
                            ) : banner.type === 'gradient' && banner.gradientColors && banner.gradientColors.length > 0 ? (
                                <div className="w-full h-full" style={{ background: banner.gradientColors && banner.gradientColors.length > 0 ? `linear-gradient(135deg, ${banner.gradientColors.map(c => `${c.color} ${c.position}%`).join(', ')})` : undefined }} />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400">
                                    <div className="w-16 h-10 mb-2 rounded-md bg-gradient-to-r from-[#0f1720] to-[#0c1014] flex items-center justify-center">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6 opacity-80">
                                            <rect x="3" y="5" width="18" height="14" rx="2" ry="2" strokeWidth="1.5" />
                                            <circle cx="12" cy="12" r="2.5" strokeWidth="1.5" />
                                        </svg>
                                    </div>
                                    <div className="text-sm">No banner preview</div>
                                    <div className="text-[11px] text-zinc-500 mt-1">Upload an image to show here</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}


