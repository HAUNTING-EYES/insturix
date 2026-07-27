'use client';

import { useCallback, useId, useState } from 'react';
import {
  AudioWaveform,
  Languages,
  Loader2,
  Mic2,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/editron/use-toast';
import {
  AUDIO_RIGHTS_ATTESTATION_VERSION,
  getAudioRightsContractIssue,
  type AudioRightsContract,
} from '@/lib/editron/shared/render-request-payload';
import { ROW } from '@/lib/pipeline/scene-to-editron';

import { useEditorContext } from '../../../contexts/editor-context';
import type { Overlay } from '../../../types';

const IDEMPOTENCY_FRAGMENT_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;
const ASSIGNABLE_ROLES = new Set<UploadedAudioMediaRole>([
  'sfx',
  'voiceover',
  'dubbing',
  'other',
]);

export type UploadedAudioMediaRole =
  | 'sfx'
  | 'voiceover'
  | 'dubbing'
  | 'other';

export interface UploadedAudioPlacement {
  from: number;
  durationInFrames: number;
  requestedRow: number;
  startFromSound?: number;
}

interface PendingUploadedAudio {
  sourceAssetId: string;
  displayName: string;
  idempotencyKey: string;
  placement: UploadedAudioPlacement;
}

export interface AssignUploadedAudioAssetInput {
  projectId: string;
  sourceAssetId: string;
  displayName: string;
  mediaRole: UploadedAudioMediaRole;
  idempotencyKey: string;
  placement: UploadedAudioPlacement;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export interface AssignUploadedAudioAssetResult {
  replayed: boolean;
  sourceAssetId: string;
  derivativeAssetId: string;
  overlayId: number;
  mediaRole: UploadedAudioMediaRole;
  audioRights: AudioRightsContract;
  overlays: Overlay[];
}

export class UploadedAudioAssignmentClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number | null = null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'UploadedAudioAssignmentClientError';
  }
}

export function createUploadedAudioIdempotencyKey(
  randomUUID?: () => string,
): string {
  const generator =
    randomUUID ?? globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!generator) {
    throw new UploadedAudioAssignmentClientError(
      'IDEMPOTENCY_UNAVAILABLE',
      'This browser cannot create safe audio assignment requests',
    );
  }
  let fragment: string;
  try {
    fragment = generator().trim();
  } catch (error) {
    throw new UploadedAudioAssignmentClientError(
      'IDEMPOTENCY_UNAVAILABLE',
      'This browser could not create a safe audio request',
      null,
      { cause: error },
    );
  }
  if (!IDEMPOTENCY_FRAGMENT_PATTERN.test(fragment)) {
    throw new UploadedAudioAssignmentClientError(
      'IDEMPOTENCY_UNAVAILABLE',
      'This browser could not create a valid audio request identity',
    );
  }
  return `audio_${fragment}`;
}

export async function assignUploadedAudioAsset({
  projectId,
  sourceAssetId,
  displayName,
  mediaRole,
  idempotencyKey,
  placement,
  signal,
  fetchImpl = fetch,
}: AssignUploadedAudioAssetInput): Promise<AssignUploadedAudioAssetResult> {
  const normalizedProjectId = projectId.trim();
  const normalizedSourceAssetId = sourceAssetId.trim();
  const normalizedDisplayName = displayName.trim();
  if (
    !normalizedProjectId
    || !normalizedSourceAssetId
    || !normalizedDisplayName
    || !IDEMPOTENCY_FRAGMENT_PATTERN.test(idempotencyKey)
    || !ASSIGNABLE_ROLES.has(mediaRole)
    || !isValidPlacement(placement)
  ) {
    throw new UploadedAudioAssignmentClientError(
      'INVALID_REQUEST',
      'Project, uploaded audio, role, and timeline placement are required',
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(
      `/api/services/editron/projects/${encodeURIComponent(normalizedProjectId)}/audio-assets/assign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAssetId: normalizedSourceAssetId,
          displayName: normalizedDisplayName,
          mediaRole,
          idempotencyKey,
          placement,
          rightsAttestation: {
            accepted: true,
            version: AUDIO_RIGHTS_ATTESTATION_VERSION,
          },
        }),
        signal,
      },
    );
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new UploadedAudioAssignmentClientError(
      aborted ? 'REQUEST_ABORTED' : 'NETWORK_ERROR',
      aborted
        ? 'Audio assignment was interrupted'
        : 'Could not reach the audio assignment service',
      null,
      { cause: error },
    );
  }

  const payload = await readJsonRecord(response);
  if (!response.ok || payload.success !== true) {
    throw new UploadedAudioAssignmentClientError(
      stringField(payload.code) ?? `HTTP_${response.status}`,
      stringField(payload.error)
        ?? `Uploaded audio assignment failed (${response.status})`,
      response.status,
    );
  }
  return validateAssignmentResponse(
    payload,
    response.status,
    normalizedSourceAssetId,
    mediaRole,
  );
}

export interface UploadedAudioAssignmentController {
  pendingAsset: PendingUploadedAudio | null;
  mediaRole: UploadedAudioMediaRole;
  rightsAttested: boolean;
  isSubmitting: boolean;
  error: string | null;
  requestAssignment(
    asset: { assetId?: string | null; name?: string | null },
    placement: UploadedAudioPlacement,
  ): boolean;
  setMediaRole(role: UploadedAudioMediaRole): void;
  setRightsAttested(attested: boolean): void;
  dismiss(): void;
  confirm(): Promise<void>;
}

export function useUploadedAudioAssignment(): UploadedAudioAssignmentController {
  const { projectId, setOverlays } = useEditorContext();
  const { toast } = useToast();
  const [pendingAsset, setPendingAsset] =
    useState<PendingUploadedAudio | null>(null);
  const [mediaRole, setMediaRoleState] =
    useState<UploadedAudioMediaRole>('sfx');
  const [rightsAttested, setRightsAttestedState] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestAssignment = useCallback(
    (
      asset: { assetId?: string | null; name?: string | null },
      placement: UploadedAudioPlacement,
    ): boolean => {
      const sourceAssetId = asset.assetId?.trim();
      if (!projectId?.trim() || !sourceAssetId || !isValidPlacement(placement)) {
        toast({
          title: 'Audio unavailable',
          description: !projectId
            ? 'Open a saved project before adding uploaded audio.'
            : 'This audio has not finished uploading to controlled storage.',
          variant: 'destructive',
        });
        return false;
      }

      let idempotencyKey: string;
      try {
        idempotencyKey = createUploadedAudioIdempotencyKey();
      } catch (assignmentError) {
        toast({
          title: 'Audio unavailable',
          description: assignmentError instanceof Error
            ? assignmentError.message
            : 'A safe request identity could not be created.',
          variant: 'destructive',
        });
        return false;
      }

      setPendingAsset({
        sourceAssetId,
        displayName: asset.name?.trim() || 'Uploaded audio',
        idempotencyKey,
        placement,
      });
      setMediaRoleState(
        placement.requestedRow === ROW.VOICEOVER ? 'voiceover' : 'sfx',
      );
      setRightsAttestedState(false);
      setError(null);
      return true;
    },
    [projectId, toast],
  );

  const dismiss = useCallback(() => {
    if (isSubmitting) return;
    setPendingAsset(null);
    setMediaRoleState('sfx');
    setRightsAttestedState(false);
    setError(null);
  }, [isSubmitting]);

  const setMediaRole = useCallback((role: UploadedAudioMediaRole) => {
    setMediaRoleState(role);
    setError(null);
  }, []);

  const setRightsAttested = useCallback((attested: boolean) => {
    setRightsAttestedState(attested);
    if (attested) setError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (
      !pendingAsset
      || !projectId
      || !rightsAttested
      || isSubmitting
    ) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await assignUploadedAudioAsset({
        projectId,
        sourceAssetId: pendingAsset.sourceAssetId,
        displayName: pendingAsset.displayName,
        mediaRole,
        idempotencyKey: pendingAsset.idempotencyKey,
        placement: pendingAsset.placement,
      });
      setOverlays(result.overlays);
      setPendingAsset(null);
      setRightsAttestedState(false);
      toast({
        title: 'Audio added',
        description: `${pendingAsset.displayName} is attached as ${roleLabel(mediaRole)}.`,
      });
    } catch (assignmentError) {
      setError(
        assignmentError instanceof UploadedAudioAssignmentClientError
          ? assignmentError.message
          : 'Uploaded audio could not be attached. The timeline was not changed.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    mediaRole,
    pendingAsset,
    projectId,
    rightsAttested,
    setOverlays,
    toast,
  ]);

  return {
    pendingAsset,
    mediaRole,
    rightsAttested,
    isSubmitting,
    error,
    requestAssignment,
    setMediaRole,
    setRightsAttested,
    dismiss,
    confirm,
  };
}

const ROLE_OPTIONS: Array<{
  role: UploadedAudioMediaRole;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    role: 'sfx',
    label: 'Sound effect',
    description: 'A timed effect, accent, transition, or ambience.',
    icon: Sparkles,
  },
  {
    role: 'voiceover',
    label: 'Voiceover',
    description: 'Primary narration that should lead the mix.',
    icon: Mic2,
  },
  {
    role: 'dubbing',
    label: 'Dubbing',
    description: 'Replacement dialogue synchronized to picture.',
    icon: Languages,
  },
  {
    role: 'other',
    label: 'Other audio',
    description: 'A non-music layer that does not fit another role.',
    icon: AudioWaveform,
  },
];

export function UploadedAudioAssignmentDialog({
  controller,
}: {
  controller: UploadedAudioAssignmentController;
}) {
  const checkboxId = useId();
  const {
    pendingAsset,
    mediaRole,
    rightsAttested,
    isSubmitting,
    error,
    setMediaRole,
    setRightsAttested,
    dismiss,
    confirm,
  } = controller;

  return (
    <Dialog
      open={pendingAsset !== null}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent className="max-w-lg border-neutral-800 bg-neutral-950 text-neutral-100 sm:rounded-md">
        <div className="border-b border-neutral-800 px-5 py-4">
          <DialogHeader className="pr-8">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10 text-emerald-300">
              <AudioWaveform className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base">
              Add {pendingAsset?.displayName ?? 'uploaded audio'}
            </DialogTitle>
            <DialogDescription className="text-xs leading-5 text-neutral-400">
              Choose its editorial role. The server will attach the controlled
              audio asset to the matching timeline lane.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-2" aria-label="Audio role">
            {ROLE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = mediaRole === option.role;
              return (
                <button
                  key={option.role}
                  type="button"
                  aria-pressed={selected}
                  disabled={isSubmitting}
                  onClick={() => setMediaRole(option.role)}
                  className={`flex min-h-20 items-start gap-2 rounded-md border p-3 text-left ${
                    selected
                      ? 'border-emerald-400/60 bg-emerald-400/10'
                      : 'border-neutral-800 bg-neutral-900/70 hover:border-neutral-700'
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>
                    <span className="block text-xs font-semibold text-neutral-100">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-4 text-neutral-400">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <label
            htmlFor={checkboxId}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-800 bg-neutral-900/70 p-3"
          >
            <Checkbox
              id={checkboxId}
              checked={rightsAttested}
              disabled={isSubmitting}
              onCheckedChange={(checked) => setRightsAttested(checked === true)}
              className="mt-0.5 border-neutral-600 data-[state=checked]:border-emerald-400 data-[state=checked]:bg-emerald-500 data-[state=checked]:text-neutral-950"
            />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-100">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Rights confirmed
              </span>
              <span className="mt-1 block text-[11px] leading-4 text-neutral-400">
                I own this audio or have permission to use it in exported videos.
              </span>
            </span>
          </label>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200"
            >
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-neutral-800 px-5 py-4 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={dismiss}
            className="rounded-md text-neutral-300 hover:bg-neutral-800 hover:text-white"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!rightsAttested || isSubmitting}
            onClick={() => void confirm()}
            className="rounded-md bg-emerald-400 text-neutral-950 hover:bg-emerald-300"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <AudioWaveform className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? 'Attaching audio...' : 'Add to timeline'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function validateAssignmentResponse(
  payload: Record<string, unknown>,
  httpStatus: number,
  sourceAssetId: string,
  mediaRole: UploadedAudioMediaRole,
): AssignUploadedAudioAssetResult {
  const derivativeAssetId = stringField(payload.derivativeAssetId);
  const responseSourceAssetId = stringField(payload.sourceAssetId);
  const responseMediaRole = stringField(payload.mediaRole);
  const overlayId = payload.overlayId;
  const rights = recordField(payload.audioRights);
  const overlays = Array.isArray(payload.overlays) ? payload.overlays : null;
  if (
    !derivativeAssetId
    || responseSourceAssetId !== sourceAssetId
    || responseMediaRole !== mediaRole
    || !Number.isSafeInteger(overlayId)
    || !rights
    || getAudioRightsContractIssue(rights)
    || rights.mediaRole !== mediaRole
    || rights.evidence === undefined
    || recordField(rights.evidence)?.sourceAssetId !== sourceAssetId
    || !overlays
  ) {
    throw invalidResponse(httpStatus);
  }
  const attachedOverlay = overlays
    .map(recordField)
    .find((overlay) => overlay?.id === overlayId);
  if (
    !attachedOverlay
    || attachedOverlay.type !== 'sound'
    || attachedOverlay.assetId !== derivativeAssetId
    || JSON.stringify(attachedOverlay.audioRights) !== JSON.stringify(rights)
  ) {
    throw invalidResponse(httpStatus);
  }

  return {
    replayed: payload.replayed === true,
    sourceAssetId,
    derivativeAssetId,
    overlayId: overlayId as number,
    mediaRole,
    audioRights: rights as unknown as AudioRightsContract,
    overlays: overlays as Overlay[],
  };
}

function invalidResponse(httpStatus: number): UploadedAudioAssignmentClientError {
  return new UploadedAudioAssignmentClientError(
    'INVALID_RESPONSE',
    'Audio assignment service returned an unverified project timeline',
    httpStatus,
  );
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  try {
    return recordField(await response.json()) ?? {};
  } catch {
    return {};
  }
}

function isValidPlacement(value: UploadedAudioPlacement): boolean {
  return (
    nonNegativeSafeInteger(value?.from)
    && positiveSafeInteger(value?.durationInFrames)
    && nonNegativeSafeInteger(value?.requestedRow)
    && value.requestedRow <= 63
    && nonNegativeSafeInteger(value?.startFromSound ?? 0)
  );
}

function roleLabel(role: UploadedAudioMediaRole): string {
  return ROLE_OPTIONS.find((option) => option.role === role)?.label.toLowerCase()
    ?? 'audio';
}

function recordField(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}
