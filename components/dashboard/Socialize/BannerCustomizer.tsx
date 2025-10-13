"use client";

import { useState } from "react";
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
    const [selectedTab, setSelectedTab] = useState<"image" | "color">(
        banner.type === "image" ? "image" : "color"
    );

    // Debug banner state
    console.log('BannerCustomizer - Current banner:', banner);

    // No need for proxy URL conversion - using signed URLs directly

    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [localColor, setLocalColor] = useState<string>(
        banner.type === "color" ? banner.value : "#0e6b9c"
    );

    const currentUploading = uploading || !!isUploading;

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
            console.log('Upload response:', data);
            if (!data.gcsPath) {
                throw new Error('No GCS path returned from upload');
            }
            onBannerChange({
                type: "image",
                value: data.signedUrl, // Use signed URL for immediate display
                gcsPath: data.gcsPath, // Store GCS path for on-demand signed URLs
                gradientType: "linear",
                gradientColors: []
            });
            toast({ title: "Banner updated", description: "Image uploaded successfully" });
            setFile(null);
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
            onBannerChange({ type: "color", value: "#0e6b9c", gradientType: "linear", gradientColors: [] });
            toast({ title: "Banner removed", description: "Reverted to default color" });
        } catch (e: any) {
            toast({ title: "Delete failed", description: e?.message || "Try again later", variant: "destructive" });
        } finally {
            setUploading(false);
        }
    }

    function normalizeHex(input: string): string | null {
        if (!input) return null;
        let v = input.trim();
        if (!v.startsWith("#")) v = `#${v}`;
        const hex = v.replace(/^#/, "");
        if (hex.length === 3 && /^[0-9a-fA-F]{3}$/.test(hex)) {
            const exp = hex.split("").map((c) => c + c).join("");
            return `#${exp}`;
        }
        if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
        return null;
    }

    function handleColorInput(next: string) {
        setLocalColor(next);
        const normalized = normalizeHex(next);
        if (normalized) {
            onBannerChange({ type: "color", value: normalized, gradientType: "linear", gradientColors: [] });
        }
    }

    return (
        <div className="rounded-lg border border-[#0e6b9c]/30 p-4 bg-[#0b0b0b]">
            <div className="mb-3">
                <h3 className="text-lg font-medium text-white">Profile Banner</h3>
                <p className="text-sm text-zinc-400">Upload an image or choose a color.</p>
            </div>

            <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)}>
                <TabsList className="bg-[#0f0f0f]">
                    <TabsTrigger value="image">Image</TabsTrigger>
                    <TabsTrigger value="color">Color</TabsTrigger>
                </TabsList>

                <TabsContent value="image" className="pt-4">
                    <div className="flex items-center gap-3">
                        <Input
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                            disabled={currentUploading}
                            className="bg-[#121212] border-[#0e6b9c]/30 text-white"
                        />
                        <Button onClick={handleUpload} disabled={!file || currentUploading}>
                            {currentUploading ? "Uploading..." : "Upload"}
                        </Button>
                        {banner.type === "image" && banner.value ? (
                            <Button variant="outline" onClick={handleDeleteImage} disabled={currentUploading}>
                                Remove Image
                            </Button>
                        ) : null}
                    </div>
                    {banner.type === "image" && banner.value ? (
                        <div className="mt-4">
                            <div className="w-full h-24 bg-[#23232a] rounded-md border border-[#0e6b9c]/30 flex items-center justify-center relative">
                                <img
                                    src={banner.value}
                                    alt="Current banner"
                                    className="w-full h-full object-cover rounded-md"
                                    onError={(e) => {
                                        console.error('Banner image failed to load:', banner.value);
                                        console.error('Banner config:', banner);
                                        console.error('Error event:', e);
                                        const parent = e.currentTarget.parentElement;
                                        if (parent) {
                                            parent.innerHTML = `
                                                <div class="w-full h-full flex items-center justify-center text-zinc-400">
                                                    <div class="text-center">
                                                        <div class="text-2xl mb-2">🖼️</div>
                                                        <div class="text-sm">Image failed to load</div>
                                                        <div class="text-xs mt-1 opacity-75">URL: ${banner.value.substring(0, 50)}...</div>
                                                        <div class="text-xs mt-1 opacity-75">GCS Path: ${banner.gcsPath || 'None'}</div>
                                                        <button onclick="window.location.reload()" class="text-xs mt-2 px-2 py-1 bg-zinc-700 rounded hover:bg-zinc-600">
                                                            Retry
                                                        </button>
                                                    </div>
                                                </div>
                                            `;
                                        }
                                    }}
                                    onLoad={() => {
                                        console.log('Banner image loaded successfully:', banner.value);
                                    }}
                                />
                                <div className="absolute top-2 right-2 text-xs text-zinc-500 bg-black/50 px-2 py-1 rounded">
                                    {banner.value.includes('storage.googleapis.com') ? 'Signed URL' : 'External'}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4">
                            <div className="w-full h-24 bg-[#23232a] rounded-md border border-[#0e6b9c]/30 flex items-center justify-center">
                                <div className="text-center text-zinc-400">
                                    <div className="text-2xl mb-2">🖼️</div>
                                    <div className="text-sm">No banner image</div>
                                    <div className="text-xs mt-1 opacity-75">Upload an image to see it here</div>
                                </div>
                            </div>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="color" className="pt-4">
                    <div className="flex items-center gap-3">
                        <Input
                            type="color"
                            value={normalizeHex(localColor) || "#0e6b9c"}
                            onChange={(e) => handleColorInput(e.target.value)}
                            disabled={currentUploading}
                            className="w-16 h-10 p-0 border-none bg-transparent"
                        />
                        <Input
                            type="text"
                            value={localColor}
                            onChange={(e) => handleColorInput(e.target.value)}
                            disabled={currentUploading}
                            className="bg-[#121212] border-[#0e6b9c]/30 text-white w-32"
                            placeholder="#0e6b9c"
                        />
                        <div
                            className="w-40 h-10 rounded-md border border-[#0e6b9c]/30"
                            style={{ backgroundColor: normalizeHex(localColor) || "#0e6b9c" }}
                        />
                    </div>
                </TabsContent>

                {/* Gradient option removed */}
            </Tabs>
        </div>
    );
}


