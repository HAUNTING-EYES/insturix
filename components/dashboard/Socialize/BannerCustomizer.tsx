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
            onBannerChange({ type: "image", value: data.url, gradientType: "linear", gradientColors: [] });
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
                            <img
                                src={banner.value}
                                alt="Current banner"
                                className="w-full h-24 object-cover rounded-md border border-[#0e6b9c]/30"
                            />
                        </div>
                    ) : null}
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


