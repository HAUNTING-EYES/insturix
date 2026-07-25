'use client';

import { useCallback, useId, useState } from 'react';
import { Loader2, Music2, ShieldCheck } from 'lucide-react';

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

import { useEditorContext } from '../../../contexts/editor-context';
import {
  assignBackgroundMusicAsset,
  BackgroundMusicAssignmentClientError,
  createBackgroundMusicIdempotencyKey,
} from '../../../utils/background-music-assignment';

interface PendingAudioAsset {
  assetId: string;
  name: string;
  idempotencyKey: string;
}

export interface BackgroundMusicAssignmentController {
  pendingAsset: PendingAudioAsset | null;
  rightsAttested: boolean;
  isSubmitting: boolean;
  error: string | null;
  requestAssignment: (asset: { assetId?: string | null; name?: string | null }) => boolean;
  setRightsAttested: (attested: boolean) => void;
  dismiss: () => void;
  confirm: () => Promise<void>;
}

export function useBackgroundMusicAssignment(): BackgroundMusicAssignmentController {
  const { projectId, setOverlays } = useEditorContext();
  const { toast } = useToast();
  const [pendingAsset, setPendingAsset] = useState<PendingAudioAsset | null>(null);
  const [rightsAttested, setRightsAttestedState] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestAssignment = useCallback(
    (asset: { assetId?: string | null; name?: string | null }): boolean => {
      const assetId = asset.assetId?.trim();
      if (!projectId?.trim() || !assetId) {
        toast({
          title: 'Background music unavailable',
          description: !projectId
            ? 'Open a saved project before assigning background music.'
            : 'This audio has not finished uploading to controlled storage.',
          variant: 'destructive',
        });
        return false;
      }

      let idempotencyKey: string;
      try {
        idempotencyKey = createBackgroundMusicIdempotencyKey();
      } catch (assignmentError) {
        toast({
          title: 'Background music unavailable',
          description: assignmentError instanceof Error
            ? assignmentError.message
            : 'A safe request identity could not be created.',
          variant: 'destructive',
        });
        return false;
      }

      setPendingAsset({
        assetId,
        name: asset.name?.trim() || 'Uploaded audio',
        idempotencyKey,
      });
      setRightsAttestedState(false);
      setError(null);
      return true;
    },
    [projectId, toast],
  );

  const dismiss = useCallback(() => {
    if (isSubmitting) return;
    setPendingAsset(null);
    setRightsAttestedState(false);
    setError(null);
  }, [isSubmitting]);

  const setRightsAttested = useCallback((attested: boolean) => {
    setRightsAttestedState(attested);
    if (attested) setError(null);
  }, []);

  const confirm = useCallback(async () => {
    if (!pendingAsset || !projectId || !rightsAttested || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await assignBackgroundMusicAsset({
        projectId,
        assetId: pendingAsset.assetId,
        idempotencyKey: pendingAsset.idempotencyKey,
      });
      setOverlays(result.overlays);
      setPendingAsset(null);
      setRightsAttestedState(false);
      toast({
        title: 'Background music ready',
        description: result.snappedCutCount > 0
          ? `Music replaced safely and ${result.snappedCutCount} nearby cut${result.snappedCutCount === 1 ? '' : 's'} aligned.`
          : 'Music replaced safely. Your previous bed stayed active until the new track was ready.',
      });
    } catch (assignmentError) {
      const message = assignmentError instanceof BackgroundMusicAssignmentClientError
        ? assignmentError.message
        : 'Background music could not be assigned. Your existing music was kept.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    pendingAsset,
    projectId,
    rightsAttested,
    setOverlays,
    toast,
  ]);

  return {
    pendingAsset,
    rightsAttested,
    isSubmitting,
    error,
    requestAssignment,
    setRightsAttested,
    dismiss,
    confirm,
  };
}

export function BackgroundMusicAssignmentDialog({
  controller,
}: {
  controller: BackgroundMusicAssignmentController;
}) {
  const checkboxId = useId();
  const {
    pendingAsset,
    rightsAttested,
    isSubmitting,
    error,
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
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md border border-amber-400/30 bg-amber-400/10 text-amber-300">
              <Music2 className="h-4 w-4" />
            </div>
            <DialogTitle className="text-base">
              Use {pendingAsset?.name ?? 'this audio'} as background music?
            </DialogTitle>
            <DialogDescription className="text-xs leading-5 text-neutral-400">
              Your current music stays in place until the replacement is normalized, analyzed,
              and committed to the complete timeline.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-5 py-4">
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
            className="rounded-md bg-amber-400 text-neutral-950 hover:bg-amber-300"
          >
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Music2 className="mr-2 h-4 w-4" />
            )}
            {isSubmitting ? 'Preparing music...' : 'Set background music'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
