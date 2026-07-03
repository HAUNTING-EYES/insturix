"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Palette,
  Sparkles,
  Type,
  Video,
} from "lucide-react";
import Link from "next/link";

import { useActiveBrand } from "@/components/dashboard/ActiveBrand/ActiveBrandProvider";
import {
  useAcceptedBrandVaultBrands,
  useBrandVaultProfile,
} from "@/components/dashboard/BrandVault/useBrandVault";
import type {
  BrandVaultAcceptedBrandSummary,
  BrandVaultApiSuccess,
} from "@/components/dashboard/BrandVault/brand-vault-types";
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
import type { BrandSignalProfile } from "@/lib/shared/brand-signal-profile";

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
  brandContext?: {
    source?: string;
    acceptedProfile?: boolean;
    missingInputs?: string[];
  };
  generationReadiness?: {
    ok: boolean;
    issues?: Array<{ code?: string; message?: string }>;
  };
  referenceVideoAnalysis?: {
    status: string;
    confidence?: number;
    cacheStatus?: string;
  };
  warnings?: string[];
}

type BrandPrefillField = "productName" | "productUrl" | "outcome" | "audience";

type SignalLike<T> = {
  value: T;
  trustLevel?: string;
};

interface BrandColorPreview {
  label: string;
  value: string;
}

interface BrandFontPreview {
  id: string;
  family: string;
  role?: string;
  cssFontFamily?: string;
}

interface BrandAssetPreview {
  id: string;
  url: string;
  label: string;
  kind: string;
}

interface BrandDefaults {
  productName: string;
  productUrl: string;
  outcome: string;
  audience: string;
  productServices: string[];
  proofStyle?: string;
  colors: BrandColorPreview[];
  fonts: BrandFontPreview[];
  logoAssets: BrandAssetPreview[];
  mediaAssets: BrandAssetPreview[];
  killList: string[];
  hookArchetypes: string[];
  evidenceCount: number;
  candidateCount: number;
  sourceStatuses: Array<{ label: string; value: string }>;
}

const DURATION_OPTIONS = ["30", "45", "60", "90", "120"] as const;
const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "1:1", label: "1:1" },
] as const;

const GENERATION_STEPS = [
  { label: "Resolving Brand Vault", detail: "Loading accepted profile, assets, voice, and visual defaults." },
  { label: "Checking reference", detail: "Validating any SaaS reference before style transfer." },
  { label: "Drafting script", detail: "Building the explainer structure and narration." },
  { label: "Building timeline", detail: "Parsing scenes and preparing Editron overlays." },
  { label: "Saving project", detail: "Persisting the project and handoff metadata." },
] as const;

const EMPTY_FIELD_DIRTY: Record<BrandPrefillField, boolean> = {
  productName: false,
  productUrl: false,
  outcome: false,
  audience: false,
};

export function SaasExplainerIntake() {
  const { activeBrand, activeBrandId, setActiveBrandId, isLoading: activeBrandLoading } = useActiveBrand();
  const acceptedBrands = useAcceptedBrandVaultBrands();
  const acceptedBrandOptions = acceptedBrands.data ?? [];
  const selectedAcceptedBrand = useMemo(
    () => acceptedBrandOptions.find((brand) => brand.brandId === activeBrandId) ?? null,
    [acceptedBrandOptions, activeBrandId],
  );
  const selectedRecordId = selectedAcceptedBrand?.recordId ?? null;
  const profileQuery = useBrandVaultProfile(selectedRecordId);
  const brandDefaults = useMemo(
    () => deriveBrandDefaults(profileQuery.data, selectedAcceptedBrand),
    [profileQuery.data, selectedAcceptedBrand],
  );

  const [productName, setProductName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [outcome, setOutcome] = useState("");
  const [audience, setAudience] = useState("");
  const [script, setScript] = useState("");
  const [referenceVideoUrl, setReferenceVideoUrl] = useState("");
  const [durationSec, setDurationSec] = useState("60");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [fieldDirty, setFieldDirty] = useState<Record<BrandPrefillField, boolean>>(EMPTY_FIELD_DIRTY);
  const [appliedRecordId, setAppliedRecordId] = useState<string | null>(null);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const hasBrandVaultSource = Boolean(selectedAcceptedBrand?.brandId);
  const hasManualCreativeSource = Boolean(outcome.trim() || script.trim());
  const canSubmit = hasBrandVaultSource || hasManualCreativeSource;
  const activeStep = GENERATION_STEPS[activeStepIndex] ?? GENERATION_STEPS[0];
  const progressPercent = Math.round(((activeStepIndex + 1) / GENERATION_STEPS.length) * 100);
  const brandProfileReady = profileQuery.data?.record?.status === "accepted";
  const profileIssue = errorMessage(acceptedBrands.error) || errorMessage(profileQuery.error);
  const activeBrandIsNotAccepted = Boolean(activeBrand && !activeBrandLoading && !selectedAcceptedBrand && !acceptedBrands.isLoading);
  const readinessIssueCount = result?.generationReadiness?.issues?.length ?? 0;

  useEffect(() => {
    if (activeBrandId || acceptedBrands.isLoading || acceptedBrandOptions.length === 0) return;
    setActiveBrandId(acceptedBrandOptions[0].brandId);
  }, [acceptedBrandOptions, acceptedBrands.isLoading, activeBrandId, setActiveBrandId]);

  useEffect(() => {
    const recordKey = selectedRecordId ?? selectedAcceptedBrand?.brandId ?? null;
    if (!recordKey) return;

    if (appliedRecordId !== recordKey) {
      setFieldDirty(EMPTY_FIELD_DIRTY);
      setProductName(brandDefaults.productName);
      setProductUrl(brandDefaults.productUrl);
      setOutcome(brandDefaults.outcome);
      setAudience(brandDefaults.audience);
      setAppliedRecordId(recordKey);
      return;
    }

    if (!fieldDirty.productName && brandDefaults.productName) setProductName(brandDefaults.productName);
    if (!fieldDirty.productUrl && brandDefaults.productUrl) setProductUrl(brandDefaults.productUrl);
    if (!fieldDirty.outcome && brandDefaults.outcome) setOutcome(brandDefaults.outcome);
    if (!fieldDirty.audience && brandDefaults.audience) setAudience(brandDefaults.audience);
  }, [
    appliedRecordId,
    brandDefaults.audience,
    brandDefaults.outcome,
    brandDefaults.productName,
    brandDefaults.productUrl,
    fieldDirty.audience,
    fieldDirty.outcome,
    fieldDirty.productName,
    fieldDirty.productUrl,
    selectedAcceptedBrand?.brandId,
    selectedRecordId,
  ]);

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

  function setPrefilledField(field: BrandPrefillField, value: string) {
    setFieldDirty((current) => ({ ...current, [field]: true }));
    if (field === "productName") setProductName(value);
    if (field === "productUrl") setProductUrl(value);
    if (field === "outcome") setOutcome(value);
    if (field === "audience") setAudience(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError("");
    setActiveStepIndex(0);
    setElapsedSeconds(0);
    if (!canSubmit) {
      setError("Select an accepted Brand Vault brand, or add a goal or script.");
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
          brandId: selectedAcceptedBrand?.brandId ?? activeBrandId ?? undefined,
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
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-md border border-[#2e2b25] bg-[#171614] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#D4A652] text-[#12110f]">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal text-[#fff8e8]">SaaS Explainer</h1>
              <p className="text-sm text-[#a9a095]">Brand Vault first. Script, URL, and reference video stay optional.</p>
            </div>
          </div>

          <form className="grid gap-5" onSubmit={handleSubmit}>
            <div className="grid gap-3 rounded-md border border-[#353128] bg-[#10100f] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label htmlFor="brandVaultBrand">Brand Vault brand</Label>
                  <p className="mt-1 text-xs text-[#8f877c]">Accepted profile becomes the default brief, visuals, voice, and assets.</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs ${hasBrandVaultSource ? "bg-[#173321] text-[#8fe0a3]" : "bg-[#2a2214] text-[#e4c782]"}`}>
                  {acceptedBrands.isLoading ? "Loading" : hasBrandVaultSource ? "Accepted" : "Needed"}
                </span>
              </div>

              <Select
                value={selectedAcceptedBrand?.brandId ?? ""}
                onValueChange={(brandId) => {
                  setActiveBrandId(brandId);
                  setAppliedRecordId(null);
                  setResult(null);
                  setError("");
                }}
                disabled={acceptedBrands.isLoading || acceptedBrandOptions.length === 0}
              >
                <SelectTrigger id="brandVaultBrand" className="rounded-md border-[#34312b] bg-[#171614]">
                  <SelectValue placeholder={acceptedBrands.isLoading ? "Loading accepted brands" : "Choose an accepted Brand Vault profile"} />
                </SelectTrigger>
                <SelectContent>
                  {acceptedBrandOptions.map((brand) => (
                    <SelectItem key={brand.brandId} value={brand.brandId}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {acceptedBrandOptions.length === 0 && !acceptedBrands.isLoading ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#6d5423] bg-[#211a0d] px-3 py-2 text-sm text-[#e4c782]">
                  <span>No accepted Brand Vault profile is available.</span>
                  <Button asChild variant="outline" size="sm" className="rounded-md border-[#6d5423] bg-transparent text-[#f2d48b]">
                    <Link href="/dashboard/brand-vault">Open Brand Vault</Link>
                  </Button>
                </div>
              ) : null}

              {activeBrandIsNotAccepted ? (
                <div className="flex items-start gap-2 rounded-md border border-[#6d5423] bg-[#211a0d] px-3 py-2 text-sm text-[#e4c782]">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>{activeBrand?.name} is active, but it has no accepted Brand Vault profile yet.</span>
                </div>
              ) : null}

              {profileIssue ? (
                <div className="rounded-md border border-[#8b3434] bg-[#2a1212] px-3 py-2 text-sm text-[#ffb4a8]">
                  {profileIssue}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="productName">Product name</Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(event) => setPrefilledField("productName", event.target.value)}
                  placeholder="Pulled from Brand Vault"
                  className="rounded-md border-[#34312b] bg-[#10100f]"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="productUrl">Product URL</Label>
                <Input
                  id="productUrl"
                  value={productUrl}
                  onChange={(event) => setPrefilledField("productUrl", event.target.value)}
                  placeholder="Optional product page"
                  className="rounded-md border-[#34312b] bg-[#10100f]"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="outcome">Goal</Label>
              <Textarea
                id="outcome"
                value={outcome}
                onChange={(event) => setPrefilledField("outcome", event.target.value)}
                placeholder="Brand Vault can supply the default. Add a specific launch goal only if needed."
                className="min-h-[96px] rounded-md border-[#34312b] bg-[#10100f]"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="audience">Audience</Label>
                <Input
                  id="audience"
                  value={audience}
                  onChange={(event) => setPrefilledField("audience", event.target.value)}
                  placeholder="Pulled from Brand Vault"
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
              <Label htmlFor="script">Script override</Label>
              <Textarea
                id="script"
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Optional narration, bullets, or launch script."
                className="min-h-[130px] rounded-md border-[#34312b] bg-[#10100f]"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="referenceVideoUrl">Optional reference SaaS video</Label>
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
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                {isSubmitting ? "Creating..." : hasBrandVaultSource ? "Generate From Brand Vault" : "Create Explainer"}
              </Button>
              <Button asChild variant="outline" className="gap-2 rounded-md border-[#34312b] bg-transparent">
                <Link href="/dashboard/editron">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Editron Home
                </Link>
              </Button>
            </div>
          </form>
        </section>

        <aside className="rounded-md border border-[#2e2b25] bg-[#151412] p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-[#D4A652]">Brand Context</h2>
          {isSubmitting ? (
            <GenerationProgress
              activeStepIndex={activeStepIndex}
              activeStep={activeStep}
              elapsedSeconds={elapsedSeconds}
              progressPercent={progressPercent}
            />
          ) : result?.success ? (
            <ResultSummary result={result} readinessIssueCount={readinessIssueCount} />
          ) : selectedAcceptedBrand ? (
            <BrandContextSummary
              brand={selectedAcceptedBrand}
              defaults={brandDefaults}
              isLoading={profileQuery.isLoading}
              ready={brandProfileReady}
            />
          ) : (
            <div className="grid gap-3 text-sm text-[#a9a095]">
              <p>Select an accepted Brand Vault profile to fill the explainer brief and visual system.</p>
              <p>Manual goal or script still works when Brand Vault is not ready.</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function GenerationProgress({
  activeStepIndex,
  activeStep,
  elapsedSeconds,
  progressPercent,
}: {
  activeStepIndex: number;
  activeStep: typeof GENERATION_STEPS[number];
  elapsedSeconds: number;
  progressPercent: number;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3">
        <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-[#D4A652]" aria-hidden />
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
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-[#75d28b]" aria-hidden />
              ) : isActive ? (
                <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-[#D4A652]" aria-hidden />
              ) : (
                <span className="mt-1.5 h-2 w-2 rounded-full bg-[#3c372f]" />
              )}
              <span className={isActive ? "text-[#fff8e8]" : undefined}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResultSummary({ result, readinessIssueCount }: { result: IntakeResponse; readinessIssueCount: number }) {
  const complete = result.autoEditStatus === "complete" || result.status === "project_ready";
  return (
    <div className="grid gap-4">
      <div className={`flex items-start gap-3 rounded-md border p-3 ${complete ? "border-[#31533a] bg-[#112018]" : "border-[#6d5423] bg-[#211a0d]"}`}>
        {complete ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-[#75d28b]" aria-hidden />
        ) : (
          <AlertTriangle className="mt-0.5 h-5 w-5 text-[#e4c782]" aria-hidden />
        )}
        <div>
          <p className={complete ? "font-medium text-[#e8ffe9]" : "font-medium text-[#ffe3a3]"}>
            {complete ? "Project ready" : "Draft needs generation"}
          </p>
          <p className="text-xs text-[#9bb7a1]">{result.projectId}</p>
        </div>
      </div>
      <dl className="grid gap-3 text-sm text-[#d5cec0]">
        <StatusRow label="Status" value={result.autoEditStatus ?? result.status ?? "complete"} />
        <StatusRow label="Brand" value={result.brandContext?.acceptedProfile ? "accepted_profile" : result.brandContext?.source ?? "not_provided"} />
        <StatusRow label="Scenes" value={String(result.sceneCount ?? 0)} />
        <StatusRow label="Overlays" value={String(result.overlayCount ?? 0)} />
        <StatusRow label="Readiness" value={readinessIssueCount ? `${readinessIssueCount} issue${readinessIssueCount === 1 ? "" : "s"}` : "passed"} />
        <StatusRow label="Reference" value={result.referenceVideoAnalysis?.status ?? "not_provided"} />
      </dl>
      {result.warnings?.length ? (
        <div className="rounded-md border border-[#6d5423] bg-[#211a0d] px-3 py-2 text-xs text-[#e4c782]">
          {result.warnings[0]}
        </div>
      ) : null}
      {result.brandContext?.missingInputs?.length ? (
        <div className="rounded-md border border-[#8b3434] bg-[#2a1212] px-3 py-2 text-xs text-[#ffb4a8]">
          Missing Brand Vault inputs: {result.brandContext.missingInputs.join(", ")}
        </div>
      ) : null}
      {result.projectUrl ? (
        <Button asChild className="gap-2 rounded-md bg-[#D4A652] text-[#11100e] hover:bg-[#e4bb70]">
          <Link href={result.projectUrl}>
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open Project
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function BrandContextSummary({
  brand,
  defaults,
  isLoading,
  ready,
}: {
  brand: BrandVaultAcceptedBrandSummary;
  defaults: BrandDefaults;
  isLoading: boolean;
  ready: boolean;
}) {
  return (
    <div className="grid gap-4">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-lg font-semibold text-[#fff8e8]">{brand.name}</p>
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#D4A652]" aria-hidden />
          ) : ready ? (
            <CheckCircle2 className="h-4 w-4 text-[#75d28b]" aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 text-[#e4c782]" aria-hidden />
          )}
        </div>
        <p className="mt-1 text-xs text-[#8f877c]">Accepted {formatDate(brand.acceptedAt ?? brand.updatedAt)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <ContextMetric icon={<FileText className="h-4 w-4" aria-hidden />} label="Evidence" value={String(defaults.evidenceCount)} />
        <ContextMetric icon={<Palette className="h-4 w-4" aria-hidden />} label="Colors" value={String(defaults.colors.length)} />
        <ContextMetric icon={<ImageIcon className="h-4 w-4" aria-hidden />} label="Assets" value={String(defaults.logoAssets.length + defaults.mediaAssets.length)} />
      </div>

      {defaults.productServices.length ? (
        <TokenGroup label="Product" values={defaults.productServices.slice(0, 4)} />
      ) : null}
      {defaults.hookArchetypes.length ? (
        <TokenGroup label="Hooks" values={defaults.hookArchetypes.slice(0, 3)} />
      ) : null}
      {defaults.killList.length ? (
        <TokenGroup label="Avoid" values={defaults.killList.slice(0, 3)} tone="warn" />
      ) : null}

      <BrandSwatches colors={defaults.colors} />
      <BrandFonts fonts={defaults.fonts} />
      <BrandAssets logos={defaults.logoAssets} media={defaults.mediaAssets} />

      {defaults.sourceStatuses.length ? (
        <dl className="grid gap-2 border-t border-[#2e2b25] pt-3 text-xs text-[#bdb5a8]">
          {defaults.sourceStatuses.map((item) => (
            <StatusRow key={item.label} label={item.label} value={item.value} />
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function ContextMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="grid min-h-20 place-items-center gap-1 rounded-md border border-[#2e2b25] bg-[#10100f] px-2 py-3">
      <span className="text-[#D4A652]">{icon}</span>
      <span className="text-base font-semibold text-[#fff8e8]">{value}</span>
      <span className="text-[#8f877c]">{label}</span>
    </div>
  );
}

function TokenGroup({ label, values, tone = "neutral" }: { label: string; values: string[]; tone?: "neutral" | "warn" }) {
  const color = tone === "warn" ? "border-[#6d5423] bg-[#211a0d] text-[#e4c782]" : "border-[#2e2b25] bg-[#10100f] text-[#d5cec0]";
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#8f877c]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className={`rounded-full border px-2.5 py-1 text-xs ${color}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function BrandSwatches({ colors }: { colors: BrandColorPreview[] }) {
  if (!colors.length) return null;
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#8f877c]">
        <Palette className="h-3.5 w-3.5" aria-hidden />
        Palette
      </p>
      <div className="grid grid-cols-5 gap-2">
        {colors.slice(0, 5).map((color) => (
          <div key={`${color.label}-${color.value}`} className="grid gap-1">
            <span className="h-8 rounded-md border border-white/10" style={{ backgroundColor: color.value }} />
            <span className="truncate text-[10px] text-[#8f877c]">{color.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandFonts({ fonts }: { fonts: BrandFontPreview[] }) {
  if (!fonts.length) return null;
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#8f877c]">
        <Type className="h-3.5 w-3.5" aria-hidden />
        Fonts
      </p>
      <div className="grid gap-2">
        {fonts.slice(0, 3).map((font) => (
          <div key={font.id} className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-[#2e2b25] bg-[#10100f] px-3 py-2">
            <span className="truncate text-sm text-[#fff8e8]" style={{ fontFamily: font.cssFontFamily }}>
              {font.family}
            </span>
            {font.role ? <span className="text-xs text-[#8f877c]">{font.role}</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function BrandAssets({ logos, media }: { logos: BrandAssetPreview[]; media: BrandAssetPreview[] }) {
  const assets = [...logos.slice(0, 2), ...media.slice(0, 4)];
  if (!assets.length) return null;
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[#8f877c]">
        <Video className="h-3.5 w-3.5" aria-hidden />
        Assets
      </p>
      <div className="grid grid-cols-3 gap-2">
        {assets.map((asset) => (
          <div key={asset.id} className="aspect-video overflow-hidden rounded-md border border-[#2e2b25] bg-[#10100f]">
            <img src={asset.url} alt={asset.label} className="h-full w-full object-cover" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#8f877c]">{label}</dt>
      <dd className="min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

function deriveBrandDefaults(
  payload: BrandVaultApiSuccess | undefined,
  brand: BrandVaultAcceptedBrandSummary | null,
): BrandDefaults {
  const profile = payload?.record?.profile;
  const reviewPayload = payload?.reviewPayload;
  const productName = signalText(profile?.identity.brandName) || brand?.name || "";
  const productServices = signalList(profile?.identity.productServices);
  const proofStyle = signalText(profile?.identity.proofStyle);
  const audience = uniqueStrings([
    ...signalList(profile?.identity.audience),
    ...signalList(profile?.identity.audiencePsychographics?.jobsToBeDone),
    ...signalList(profile?.identity.audiencePsychographics?.valueDrivers),
  ]).slice(0, 6);
  const hookArchetypes = signalList(profile?.voice.hookArchetypes).slice(0, 4);
  const killList = signalList(profile?.voice.killList).slice(0, 5);

  return {
    productName,
    productUrl: findProductUrl(payload, profile),
    outcome: deriveOutcome({ productName, productServices, proofStyle, audience, hookArchetypes }),
    audience: audience.join(", "),
    productServices,
    proofStyle,
    colors: deriveColors(payload, profile),
    fonts: deriveFonts(payload, profile),
    logoAssets: deriveAssets(reviewPayload?.visualIdentity.logos, "logo"),
    mediaAssets: deriveAssets(reviewPayload?.visualIdentity.images, "media"),
    killList,
    hookArchetypes,
    evidenceCount: reviewPayload?.evidenceCount ?? profile?.evidence.length ?? 0,
    candidateCount: reviewPayload?.candidateCount ?? payload?.candidates?.length ?? 0,
    sourceStatuses: reviewPayload
      ? [
          { label: "Website", value: reviewPayload.intake.website.status },
          { label: "Social", value: reviewPayload.intake.social.status },
          { label: "Uploads", value: reviewPayload.intake.uploads.status },
        ]
      : [],
  };
}

function deriveOutcome(input: {
  productName: string;
  productServices: string[];
  proofStyle?: string;
  audience: string[];
  hookArchetypes: string[];
}): string {
  if (!input.productName && !input.productServices.length && !input.audience.length) return "";
  const subject = input.productServices.length
    ? `${input.productName || "This product"} for ${input.productServices.slice(0, 2).join(" and ")}`
    : input.productName || "This product";
  const audience = input.audience.length ? ` for ${input.audience.slice(0, 2).join(" and ")}` : "";
  const proof = input.proofStyle && input.proofStyle !== "unknown" ? ` Use ${input.proofStyle} proof moments.` : "";
  const hook = input.hookArchetypes[0] ? ` Open with ${input.hookArchetypes[0].toLowerCase()}.` : "";
  return `Create a product-led SaaS explainer for ${subject}${audience}. Show the core workflow and close with a clear CTA.${proof}${hook}`;
}

function deriveColors(
  payload: BrandVaultApiSuccess | undefined,
  profile: BrandSignalProfile | undefined,
): BrandColorPreview[] {
  const visualColors = payload?.reviewPayload?.visualIdentity.colors ?? [];
  if (visualColors.length) {
    return visualColors
      .map((color) => ({ label: color.label, value: color.value }))
      .filter((color) => isHexColor(color.value))
      .slice(0, 8);
  }

  return uniqueStrings([
    signalText(profile?.palette.primary),
    signalText(profile?.palette.accent),
    ...signalList(profile?.palette.neutrals),
    ...signalList(profile?.palette.supporting),
  ])
    .filter(isHexColor)
    .slice(0, 8)
    .map((value, index) => ({ label: index === 0 ? "primary" : "brand", value }));
}

function deriveFonts(
  payload: BrandVaultApiSuccess | undefined,
  profile: BrandSignalProfile | undefined,
): BrandFontPreview[] {
  const visualFonts = payload?.reviewPayload?.visualIdentity.fonts ?? [];
  if (visualFonts.length) {
    return visualFonts.slice(0, 5).map((font) => ({
      id: font.id,
      family: font.family,
      role: font.role,
      cssFontFamily: font.cssFontFamily,
    }));
  }

  const raw = signalText(profile?.typography.raw) || signalText(profile?.typography.category);
  return raw ? [{ id: raw, family: raw, role: "profile" }] : [];
}

function deriveAssets(assets: unknown, fallbackKind: string): BrandAssetPreview[] {
  if (!Array.isArray(assets)) return [];
  return assets
    .map((raw) => {
      const asset = raw as { id?: unknown; url?: unknown; label?: unknown; kind?: unknown };
      const url = typeof asset.url === "string" ? asset.url : "";
      const label = typeof asset.label === "string" ? asset.label : typeof asset.kind === "string" ? asset.kind : fallbackKind;
      const kind = typeof asset.kind === "string" ? asset.kind : fallbackKind;
      const id = typeof asset.id === "string" ? asset.id : url;
      return { id, url, label, kind };
    })
    .filter((asset) => asset.url.startsWith("http://") || asset.url.startsWith("https://"))
    .slice(0, 6);
}

function findProductUrl(payload: BrandVaultApiSuccess | undefined, profile: BrandSignalProfile | undefined): string {
  const jobUrl = sanitizeUrl(payload?.job?.inputs.websiteUrl);
  if (jobUrl) return jobUrl;

  const evidenceUrl = profile?.evidence
    .map((item) => sanitizeUrl(item.sourceUrl))
    .find(Boolean);
  return evidenceUrl ?? "";
}

function signalText(signal: SignalLike<string> | undefined): string;
function signalText<T extends string>(signal: SignalLike<T> | undefined): string;
function signalText(signal: SignalLike<string> | undefined): string {
  if (!signal || signal.trustLevel === "fallback_default") return "";
  return typeof signal.value === "string" ? signal.value.trim() : "";
}

function signalList(signal: SignalLike<string[]> | undefined): string[] {
  if (!signal || signal.trustLevel === "fallback_default" || !Array.isArray(signal.value)) return [];
  return uniqueStrings(signal.value);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function sanitizeUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.origin}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return "";
  }
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value.trim());
}

function formatDate(value: string | undefined): string {
  if (!value) return "recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}
