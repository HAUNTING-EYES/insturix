'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { SourceMediaRightsControl } from '@/components/editron/project/source-media-rights-control';

interface NativeVideoAudioRightsDialogProps {
  open: boolean;
  sourceCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

export function NativeVideoAudioRightsDialog({
  open,
  sourceCount,
  onCancel,
  onConfirm,
}: NativeVideoAudioRightsDialogProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setConfirmed(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    if (!confirmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Source-media rights could not be confirmed.',
      );
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !submitting) onCancel();
      }}
    >
      <AlertDialogContent className="border-[#2C2A25] bg-[#11110F] text-[#ECE9E1]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#D4A652]" />
            Confirm source-media rights
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[#A7A39A]">
            {sourceCount} uploaded audio source{sourceCount === 1 ? '' : 's'} on this
            timeline {sourceCount === 1 ? 'predates' : 'predate'} the current export receipt.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <SourceMediaRightsControl
          checked={confirmed}
          disabled={submitting}
          onCheckedChange={(checked) => {
            setConfirmed(checked);
            if (checked) setError(null);
          }}
        />

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={submitting}
            className="border-[#34322D] bg-[#1B1A18] text-[#C8C4BB] hover:bg-[#24221E]"
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            disabled={!confirmed || submitting}
            onClick={() => void submit()}
            className="bg-[#D4A652] text-[#0B0B0A] hover:bg-[#E0B86A]"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="mr-2 h-4 w-4" />
            )}
            Confirm and render
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
