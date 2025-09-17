"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { UploadCloud, Image as ImageIcon, Youtube, Instagram, Facebook } from "lucide-react";

type Platform = { key: string; label: string };

interface UploadFormProps {
  platforms: Platform[];
}

export function UploadForm({ platforms }: UploadFormProps) {
  const { toast } = useToast();
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({
    youtube: true,
    instagram: true,
    facebook: false,
  });
  const [activeType, setActiveType] = useState<string>("short");

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [defaultTitle, setDefaultTitle] = useState("");
  const [defaultDescription, setDefaultDescription] = useState("");
  const [defaultTags, setDefaultTags] = useState("");

  const isReady = useMemo(() => !!videoFile && Object.values(selectedPlatforms).some(Boolean), [videoFile, selectedPlatforms]);

  const handleSubmit = () => {
    toast({
      title: "Simulated upload",
      description: `Queued for ${Object.entries(selectedPlatforms).filter(([_, v]) => v).length} platform(s).`
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="bg-zinc-950/60 border-zinc-800">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-zinc-200">Select content type</Label>
            <Tabs value={activeType} onValueChange={setActiveType} className="mt-2">
              <TabsList className="bg-zinc-900/60 border border-zinc-800">
                <TabsTrigger value="short">Shorts/Reels</TabsTrigger>
                <TabsTrigger value="long">Long form</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-zinc-200">Video</Label>
              <label className="mt-2 flex flex-col items-center justify-center gap-3 h-40 border-2 border-dashed border-zinc-800 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/60 transition cursor-pointer">
                <UploadCloud className="h-6 w-6 text-emerald-400" />
                <div className="text-center">
                  <div className="text-zinc-200 text-sm font-medium">Drag & drop your video</div>
                  <div className="text-zinc-400 text-xs">or click to choose a file</div>
                </div>
                <Input type="file" accept="video/*" className="hidden" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} />
              </label>
              {videoFile && <div className="mt-2 text-xs text-zinc-400">Selected: {videoFile.name}</div>}
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-200">Thumbnail</Label>
                <span className="text-xs text-zinc-400">Optional</span>
              </div>
              <label className="mt-2 flex flex-col items-center justify-center gap-3 h-40 border-2 border-dashed border-zinc-800 rounded-lg bg-zinc-900/40 hover:bg-zinc-900/60 transition cursor-pointer">
                <ImageIcon className="h-6 w-6 text-blue-400" />
                <div className="text-center">
                  <div className="text-zinc-200 text-sm font-medium">Drag & drop an image</div>
                  <div className="text-zinc-400 text-xs">PNG, JPG</div>
                </div>
                <Input type="file" accept="image/*" className="hidden" onChange={(e) => setThumbnailFile(e.target.files?.[0] || null)} />
              </label>
              {thumbnailFile && <div className="mt-2 text-xs text-zinc-400">Selected: {thumbnailFile.name}</div>}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          <div className="grid gap-4">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-200">Default title</Label>
                <span className="text-xs text-zinc-400">Used if platform title is empty</span>
              </div>
              <Input value={defaultTitle} onChange={(e) => setDefaultTitle(e.target.value)} placeholder="Enter a title" className="mt-2" />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-200">Default description</Label>
                <span className="text-xs text-zinc-400">You can override per platform</span>
              </div>
              <Textarea value={defaultDescription} onChange={(e) => setDefaultDescription(e.target.value)} placeholder="Write a description" className="mt-2" rows={5} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-zinc-200">Default tags</Label>
                <span className="text-xs text-zinc-400">Separate with commas</span>
              </div>
              <Input value={defaultTags} onChange={(e) => setDefaultTags(e.target.value)} placeholder="ai, tech, tutorial" className="mt-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-950/60 border-zinc-800">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-zinc-200">Select platforms</Label>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {platforms.map((p) => {
                const isActive = !!selectedPlatforms[p.key];
                const color = p.key === 'youtube' ? 'red' : p.key === 'instagram' ? 'pink' : 'blue';
                const icon = p.key === 'youtube' ? Youtube : p.key === 'instagram' ? Instagram : Facebook;
                const Icon = icon;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSelectedPlatforms(s => ({ ...s, [p.key]: !s[p.key] }))}
                    className={`h-20 rounded-lg border transition flex flex-col items-center justify-center gap-2 ${isActive ? 'border-white/20 bg-white/5' : 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/60'}`}
                  >
                    <Icon className={`h-5 w-5 ${p.key === 'youtube' ? 'text-red-500' : p.key === 'instagram' ? 'text-pink-500' : 'text-blue-500'}`} />
                    <span className="text-sm text-zinc-200">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          <div className="flex items-center justify-between">
            <div className="text-sm text-zinc-400">
              {videoFile ? videoFile.name : "No video selected"}
            </div>
            <Button disabled={!isReady} onClick={handleSubmit} className="bg-emerald-600 hover:bg-emerald-500">
              Simulate Upload
            </Button>
          </div>

          <p className="text-xs text-zinc-500">Frontend only: no files are uploaded. This simulates the flow.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default UploadForm;


