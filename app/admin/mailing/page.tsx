'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import {
  ArrowLeft,
  Clock3,
  Eye,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface CampaignStatus {
  ok: boolean;
  canSend: boolean;
  lastSent: string | null;
  nextAvailable: string | null;
  recipientCount: number;
  cooldownDays: number;
  message?: string;
}

interface MailingResponse {
  ok: boolean;
  message: string;
  campaignId?: string;
}

const formatDate = (value: string | null) => {
  if (!value) return 'Never';

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
};

export default function AdminMailingPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const adminEmail = user?.primaryEmailAddress?.emailAddress ?? '';

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);

    try {
      const response = await fetch('/api/admin/mailing/custom', {
        cache: 'no-store',
      });
      const data = (await response.json()) as CampaignStatus;

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Failed to load campaign status');
      }

      setStatus(data);
    } catch (error) {
      toast({
        title: 'Could not load campaign status',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingStatus(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const sendPreview = async () => {
    if (!subject.trim() || !message.trim() || !adminEmail) return;

    setPreviewing(true);

    try {
      const response = await fetch('/api/admin/mailing/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: `[TEST] ${subject.trim()}`,
          message: message.trim(),
          testMode: true,
          testEmail: adminEmail,
        }),
      });
      const data = (await response.json()) as MailingResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Failed to send preview');
      }

      toast({
        title: 'Preview sent',
        description: `Check ${adminEmail}.`,
      });
    } catch (error) {
      toast({
        title: 'Preview failed',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setPreviewing(false);
    }
  };

  const queueCampaign = async () => {
    if (!subject.trim() || !message.trim()) return;

    setQueueing(true);

    try {
      const response = await fetch('/api/admin/mailing/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const data = (await response.json()) as MailingResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Failed to queue campaign');
      }

      toast({
        title: 'Campaign queued',
        description: data.campaignId
          ? `${data.message} Campaign: ${data.campaignId}`
          : data.message,
      });
      setSubject('');
      setMessage('');
      setConfirmOpen(false);
      await loadStatus();
    } catch (error) {
      toast({
        title: 'Campaign was not queued',
        description:
          error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setQueueing(false);
    }
  };

  const isDraftValid = Boolean(subject.trim() && message.trim());
  const canQueue = Boolean(status?.canSend && isDraftValid && !queueing);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <div className="space-y-4">
          <Button asChild variant="ghost" className="-ml-3">
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to admin
            </Link>
          </Button>

          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              Email operations
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Product update campaigns
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Compose a plain-text update, preview it on your admin address,
              then queue it for consent-aware delivery through Amazon SES.
            </p>
          </div>
        </div>

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Recipient safety is enforced at delivery time</AlertTitle>
          <AlertDescription>
            The count below is the registered-user candidate pool. The worker
            sends only to active <code>product_updates</code> subscribers and
            skips globally unsubscribed, bounced, complained, or otherwise
            suppressed addresses. Every marketing message includes unsubscribe
            controls.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Registered candidates
              </CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">
              {loadingStatus
                ? '—'
                : (status?.recipientCount ?? 0).toLocaleString()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" />
                Last campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm font-medium">
              {loadingStatus ? 'Loading…' : formatDate(status?.lastSent ?? null)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Queue status
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm font-medium">
              {loadingStatus
                ? 'Checking…'
                : status?.canSend
                  ? 'Ready to queue'
                  : `Available ${formatDate(status?.nextAvailable ?? null)}`}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Compose update</CardTitle>
            <CardDescription>
              This console creates <code>product_updates</code> campaigns only.
              Preview delivery from this screen goes to your signed-in admin
              address.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="campaign-subject">Subject</Label>
              <Input
                id="campaign-subject"
                maxLength={200}
                placeholder="What changed for Insturix users?"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
              <p className="text-right text-xs text-muted-foreground">
                {subject.length}/200
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="campaign-message">Message</Label>
              <Textarea
                id="campaign-message"
                className="min-h-64 resize-y"
                maxLength={50000}
                placeholder="Write the update in plain text. Line breaks are preserved."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <p className="text-right text-xs text-muted-foreground">
                {message.length.toLocaleString()}/50,000
              </p>
            </div>

            {!loadingStatus && status && !status.canSend && (
              <Alert>
                <Clock3 className="h-4 w-4" />
                <AlertTitle>Campaign cooldown is active</AlertTitle>
                <AlertDescription>
                  The {status.cooldownDays}-day cooldown ends{' '}
                  {formatDate(status.nextAvailable)}. Preview sends remain
                  available.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={!isDraftValid || !adminEmail || previewing}
                onClick={sendPreview}
              >
                {previewing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="mr-2 h-4 w-4" />
                )}
                Send preview to admin
              </Button>
              <Button
                type="button"
                disabled={!canQueue}
                onClick={() => setConfirmOpen(true)}
              >
                <Send className="mr-2 h-4 w-4" />
                Queue campaign
              </Button>
            </div>
          </CardContent>
        </Card>

        <Alert>
          <Mail className="h-4 w-4" />
          <AlertTitle>Production dependency</AlertTitle>
          <AlertDescription>
            Queue workers require a verified SES marketing sender and SES
            configuration set in the production environment. A queued campaign
            is processed asynchronously; this screen does not claim immediate
            delivery.
          </AlertDescription>
        </Alert>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Queue this product update?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Subject
              </p>
              <p className="mt-1 font-medium">{subject}</p>
            </div>
            <p className="text-muted-foreground">
              Up to {(status?.recipientCount ?? 0).toLocaleString()} registered
              candidates will be evaluated. Consent and suppression checks
              determine the final recipients, so this number is not a delivery
              promise.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={queueing}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!canQueue}
              onClick={queueCampaign}
            >
              {queueing && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Queue campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
