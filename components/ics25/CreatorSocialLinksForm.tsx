"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Youtube, Instagram, Linkedin, Loader2, CheckCircle2 } from "lucide-react";

export default function CreatorSocialLinksForm() {
  const [youtube, setYoutube] = useState("");
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const canSubmit = youtube.trim() || instagram.trim() || linkedin.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSubmit) {
      toast({
        title: "Missing information",
        description: "Please provide at least one social media link.",
        variant: "destructive" as any,
      });
      return;
    }

    try {
      setSubmitting(true);
      
      const res = await fetch("/api/ics25/creator-approval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ youtube, instagram, linkedin }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || "Failed to submit application");
      }

      toast({
        title: "Application submitted!",
        description: "Your Creator Pass application is now under review. We'll notify you within 24-48 hours.",
      });

      // Redirect to review page
      router.push("/checkout/creator/review");
    } catch (error: any) {
      toast({
        title: "Submission failed",
        description: error?.message || "Could not submit your application. Please try again.",
        variant: "destructive" as any,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none absolute -inset-2 rounded-[32px] bg-gradient-to-br from-[#3A9EFF]/12 via-transparent to-[#FF2EE6]/12 blur-2xl" />
      
      <form onSubmit={handleSubmit} className="relative rounded-3xl border border-white/10 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-xl p-6 md:p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
            Apply for Creator Pass
          </h2>
          <p className="text-zinc-600 dark:text-zinc-400">
            Submit your social media profiles for verification
          </p>
        </div>

        {/* Requirements Banner */}
        <div className="bg-sky-500/10 dark:bg-sky-500/20 border border-sky-500/30 rounded-2xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-sky-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                Eligibility Requirements
              </p>
              <ul className="text-zinc-600 dark:text-zinc-400 space-y-1">
                <li>• 10,000+ followers on at least one platform</li>
                <li>• Active content creation (last 3 months)</li>
                <li>• Verification takes 24-48 hours</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form Fields */}
        <div className="space-y-6">
          {/* YouTube */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Youtube className="w-4 h-4 text-red-500" />
              YouTube Channel URL
            </Label>
            <Input
              type="url"
              placeholder="https://youtube.com/@yourchannel"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              className="bg-white/50 dark:bg-zinc-900/50"
            />
          </div>

          {/* Instagram */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Instagram className="w-4 h-4 text-pink-500" />
              Instagram Profile URL
            </Label>
            <Input
              type="url"
              placeholder="https://instagram.com/yourprofile"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              className="bg-white/50 dark:bg-zinc-900/50"
            />
          </div>

          {/* LinkedIn */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Linkedin className="w-4 h-4 text-blue-500" />
              LinkedIn Profile URL
            </Label>
            <Input
              type="url"
              placeholder="https://linkedin.com/in/yourprofile"
              value={linkedin}
              onChange={(e) => setLinkedin(e.target.value)}
              className="bg-white/50 dark:bg-zinc-900/50"
            />
          </div>
        </div>

        {/* Info Text */}
        <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-4 text-center">
          Provide at least one social media link. Our team will verify your follower count and content activity.
        </p>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={!canSubmit || submitting}
          className="w-full mt-6 bg-gradient-to-r from-sky-500 to-fuchsia-500 hover:from-sky-600 hover:to-fuchsia-600 text-white font-semibold py-6 rounded-xl"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Submitting Application...
            </>
          ) : (
            "Submit for Review"
          )}
        </Button>
      </form>
    </div>
  );
}
