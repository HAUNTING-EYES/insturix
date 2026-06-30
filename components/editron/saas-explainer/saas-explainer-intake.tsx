"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";

import { getActiveBrandIdFromStorage } from "@/components/dashboard/ActiveBrand/ActiveBrandProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface IntakeResponse {
  success: boolean;
  error?: string;
  code?: string;
  status?: string;
  autoEditMode?: string;
  autoEditStatus?: string;
  projectId?: string;
  projectUrl?: string;
  sceneCount?: number;
  overlayCount?: number;
  referenceVideoAnalysis?: {
    status: string;
    confidence?: number;
    cacheStatus?: string;
  };
  warnings?: string[];
}

const DURATION_OPTIONS = ["30", "45", "60", "90", "120"] as const;
const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
] as const;

const GENERATION_STEPS = [
  { label: "Validating brief", detail: "Checking the product context and creative source." },
  { label: "Checking reference", detail: "Validating any SaaS reference before style transfer." },
  { label: "Drafting script", detail: "Building the explainer structure and narration." },
  { label: "Building timeline", detail: "Parsing scenes and preparing Editron overlays." },
  { label: "Saving project", detail: "Persisting the project and handoff metadata." },
] as const;

export function SaasExplainerIntake() {
  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [outcome, setOutcome] = useState("");
  const [audience, setAudience] = useState("");
  const [script, setScript] = useState("");
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [durationSec, setDurationSec] = useState("60");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const canSubmit = useMemo(
    () => Boolean(outcome.trim() || script.trim()),
    [outcome, script],
  );
  const activeStep = GENERATION_STEPS[activeStepIndex] ?? GENERATION_STEPS[0];
  const progressPercent = Math.round(((activeStepIndex + 1) / GENERATION_STEPS.length) * 100);

  useEffect(() => {
    if (!isSubmitting) return;

    const startedAt = Date.now();
    setActiveStepIndex(0);
    setElapsedSeconds(0);
    const interval = window.setInterval(() => {
      const nextElapsed = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(nextElapsed);
      setActiveStepIndex(Math.min(GENERATION_STEPS.length - 1, Math.floor(nextElapsed / 7)));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isSubmitting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError("");
    setActiveStepIndex(0);
    setElapsedSeconds(0);
    if (!canSubmit) {
      setError("Add a goal or script before creating the explainer.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/services/editron/saas-explainer/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productName,
          productUrl,
          outcome,
          audience,
          script,
          referenceVideoUrl,
          durationSec: Number(durationSec),
          aspectRatio,
          brandId: getActiveBrandIdFromStorage(),
        }),
      });
      const payload = await response.json() as IntakeResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.code || "Could not create this explainer.");
      }
      setResult(payload);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#0f0f0e] px-4 py-6 text-[#f5f1e8]">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-md border border-[#2e2b25] bg-[#171614] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#D4A652] text-[#12110f]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-[#fff8e8]">SaaS Explainer</h1>
              <p className="text-sm text-[#a9a095]">Product context first. Reference video optional. No main footage upload.</p>
            </div>
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="productName">Product name</Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(event) => setProductName(event.target.value)}
                  placeholder="Insturix"
                  className="rounded-md border-[#34312b] bg-[#10100f]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="productUrl">Product URL</Label>
                <Input
                  id="productUrl"
                  value={productUrl}
                  onChange={(event) => setProductUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="rounded-md border-[#34312b] bg-[#10100f]"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="outcome">Goal</Label>
              <Textarea
                id="outcome"
                value={outcome}
                onChange={(event) => setOutcome(event.target.value)}
                placeholder="Explain the product, show the dashboard, and end with a launch CTA."
                className="min-h-[96px] rounded-md border-[#34312b] bg-[#10100f]"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="audience">Audience</Label>
                <Input
                  id="audience"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                  placeholder="Founders, marketers, sales teams"
                  className="rounded-md border-[#34312b] bg-[#10100f]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Duration</Label>
                  <Select value={durationSec} onValueChange={setDurationSec}>
                    <SelectTrigger className="rounded-md border-[#34312b] bg-[#10100f]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((value) => (
                        <SelectItem key={value} value={value}>{value}s</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Aspect</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger className="rounded-md border-[#34312b] bg-[#10100f]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ASPECT_RATIO_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="script">Script</Label>
              <Textarea
                id="script"
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Paste a rough script, bullets, or leave this empty."
                className="min-h-[130px] rounded-md border-[#34312b] bg-[#10100f]"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="referenceVideoUrl">Reference SaaS video URL</Label>
              <Input
                id="referenceVideoUrl"
                value={referenceVideoUrl}
                onChange={(event) => setReferenceVideoUrl(event.target.value)}
                placeholder="YouTube link or public .mp4/.mov/.webm URL"
                className="rounded-md border-[#34312b] bg-[#10100f]"
              />
            </div>

            {error ? (
              <div className="rounded-md border border-[#8b3434] bg-[#2a1212] px-3 py-2 text-sm text-[#ffb4a8]">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={isSubmitting || !canSubmit}
                className="gap-2 rounded-md bg-[#D4A652] text-[#11100e] hover:bg-[#e4bb70]"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {isSubmitting ? "Creating..." : "Create Explainer"}
              </Button>
              <Button asChild variant="outline" className="gap-2 rounded-md border-[#34312b] bg-transparent">
                <Link href="/dashboard/editron">
                  <ExternalLink className="h-4 w-4" />
                  Editron Home
                </Link>
              </Button>
            </div>
          </form>
        </section>

        <aside className="rounded-md border border-[#2e2b25] bg-[#151412] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-[#D4A652]">Project Status</h2>
          {isSubmitting ? (
            <div className="grid gap-4">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[#D4A652]" />
                <div>
                  <p className="font-medium text-[#fff8e8]">{activeStep.label}</p>
                  <p className="text-xs text-[#a9a095]">{activeStep.detail}</p>
                </div>
              </div>
              <div className="grid gap-2">
                <div className="flex justify-between text-xs text-[#8f877c]">
                  <span>{elapsedSeconds}s elapsed</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#29251f]">
                  <div
                    className="h-full rounded-full bg-[#D4A652] transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
              <ol className="grid gap-2 text-sm">
                {GENERATION_STEPS.map((step, index) => {
                  const isActive = index === activeStepIndex;
                  const isDone = index < activeStepIndex;
                  return (
                    <li key={step.label} className="flex items-start gap-2 text-[#a9a095]">
                      {isDone ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#75d28b]" />
                      ) : isActive ? (
                        <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[#D4A652]" />
                      ) : (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-[#3c372f]" />
                      )}
                      <span className={isActive ? "text-[#fff8e8]" : undefined}>{step.label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : result?.success ? (
            <div className="grid gap-4">
              <div className="flex items-start gap-3 rounded-md border border-[#31533a] bg-[#112018] p-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#75d28b]" />
                <div>
                  <p className="font-medium text-[#e8ffe9]">Project ready</p>
                  <p className="text-xs text-[#9bb7a1]">{result.projectId}</p>
                </div>
              </div>
              <dl className="grid gap-3 text-sm text-[#d5cec0]">
                <div className="flex justify-between gap-4">
                  <dt className="text-[#8f877c]">Status</dt>
                  <dd>{result.autoEditStatus ?? result.status ?? "complete"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#8f877c]">Scenes</dt>
                  <dd>{result.sceneCount ?? 0}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#8f877c]">Overlays</dt>
                  <dd>{result.overlayCount ?? 0}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[#8f877c]">Reference</dt>
                  <dd>{result.referenceVideoAnalysis?.status ?? "not_provided"}</dd>
                </div>
              </dl>
              {result.warnings?.length ? (
                <div className="rounded-md border border-[#6d5423] bg-[#211a0d] px-3 py-2 text-xs text-[#e4c782]">
                  {result.warnings[0]}
                </div>
              ) : null}
              {result.projectUrl ? (
                <Button asChild className="gap-2 rounded-md bg-[#D4A652] text-[#11100e] hover:bg-[#e4bb70]">
                  <Link href={result.projectUrl}>
                    <ExternalLink className="h-4 w-4" />
                    Open Project
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-3 text-sm text-[#a9a095]">
              <p>Brand Vault selection is attached automatically when one is active.</p>
              <p>Reference videos are validated as SaaS references before style analysis.</p>
              <p>The output lands directly in Editron as a project.</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
