"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Platform = { key: string; label: string };

interface PlatformEditorProps {
  platforms: Platform[];
}

type PlatformMeta = {
  title: string;
  description: string;
  tags: string;
  visibility: "public" | "unlisted" | "private";
};

export function PlatformEditor({ platforms }: PlatformEditorProps) {
  const { toast } = useToast();
  const [active, setActive] = useState<string>(platforms[0]?.key ?? "youtube");
  const [meta, setMeta] = useState<Record<string, PlatformMeta>>(() => {
    const init: Record<string, PlatformMeta> = {};
    for (const p of platforms) {
      init[p.key] = { title: "", description: "", tags: "", visibility: "public" };
    }
    return init;
  });

  const setField = (platformKey: string, field: keyof PlatformMeta, value: string) => {
    setMeta((m) => ({ ...m, [platformKey]: { ...m[platformKey], [field]: value } }));
  };

  const handleApplyAll = () => {
    const source = meta[active];
    setMeta((m) => {
      const next = { ...m };
      for (const p of platforms) next[p.key] = { ...source };
      return next;
    });
    toast({ title: "Applied defaults", description: "Copied current platform metadata to all platforms." });
  };

  return (
    <Card className="bg-zinc-950/60 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <Tabs value={active} onValueChange={setActive} className="w-full">
            <div className="flex items-center justify-between">
              <TabsList className="bg-zinc-900/60 border border-zinc-800">
                {platforms.map((p) => (
                  <TabsTrigger key={p.key} value={p.key}>{p.label}</TabsTrigger>
                ))}
              </TabsList>
              <Button variant="outline" className="border-zinc-800 ml-3" onClick={handleApplyAll}>
                Apply current to all
              </Button>
            </div>

            {platforms.map((p) => (
              <TabsContent key={p.key} value={p.key} className="mt-4">
                <div className="grid gap-4">
                  <div>
                    <Label className="text-zinc-200">{p.label} title</Label>
                    <Input
                      value={meta[p.key].title}
                      onChange={(e) => setField(p.key, "title", e.target.value)}
                      placeholder={`Title for ${p.label}`}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-200">{p.label} description/caption</Label>
                    <Textarea
                      value={meta[p.key].description}
                      onChange={(e) => setField(p.key, "description", e.target.value)}
                      placeholder={`Description for ${p.label}`}
                      className="mt-2"
                      rows={6}
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-200">{p.label} tags/hashtags (comma separated)</Label>
                    <Input
                      value={meta[p.key].tags}
                      onChange={(e) => setField(p.key, "tags", e.target.value)}
                      placeholder="e.g. shorts, tutorial, ai"
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-zinc-200">Visibility</Label>
                    <Select value={meta[p.key].visibility} onValueChange={(v) => setField(p.key, "visibility", v as PlatformMeta["visibility"]) }>
                      <SelectTrigger className="mt-2">
                        <SelectValue placeholder="Select visibility" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="unlisted">Unlisted</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}

export default PlatformEditor;


