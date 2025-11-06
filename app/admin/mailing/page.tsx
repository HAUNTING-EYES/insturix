'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Mail, Clock, Users, AlertCircle, CheckCircle2, Send, Loader2, TestTube, 
  ArrowLeft, Shield, AlertTriangle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CooldownStatus {
  canSend: boolean;
  lastSent: string | null;
  nextAvailable: string | null;
  totalUsers: number;
  cooldownDays: number;
}

interface SendResult {
  ok: boolean;
  message: string;
  stats?: {
    total: number;
    successful: number;
    failed: number;
  };
  failedEmails?: Array<{ email: string; error?: string }>;
}

export default function MailingDashboard() {
  const [cooldownStatus, setCooldownStatus] = useState<CooldownStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [selectedEmailType, setSelectedEmailType] = useState<string>('promotional');
  const [testEmail, setTestEmail] = useState<string>('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showFinalConfirmDialog, setShowFinalConfirmDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useUser();

  // Fetch cooldown status
  const fetchCooldownStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/mailing/promotional');
      const data = await response.json();

      if (data.ok) {
        setCooldownStatus(data);
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to fetch cooldown status',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to fetch cooldown status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCooldownStatus();
    // Pre-fill admin's email
    if (user?.primaryEmailAddress?.emailAddress) {
      setTestEmail(user.primaryEmailAddress.emailAddress);
    }
  }, [user]);

  // Send test email
  const handleSendTestEmail = async () => {
    if (!testEmail) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedEmailType) {
      toast({
        title: 'Error',
        description: 'Please select an email type',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSendingTest(true);
      const response = await fetch('/api/admin/mailing/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: selectedEmailType,
          recipientEmail: testEmail,
          testData: {
            name: user?.fullName || 'Admin User',
            ticketId: 'TEST-12345',
            eventDetails: "Insturix Creator's Summit 2025",
          },
        }),
      });

      const data = await response.json();

      if (data.ok) {
        toast({
          title: 'Test Email Sent! 📧',
          description: data.message,
        });
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to send test email',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to send test email',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Step 1: Open first confirmation dialog
  const handleInitiateSend = () => {
    if (!cooldownStatus?.canSend) {
      toast({
        title: 'Cooldown Active',
        description: 'Please wait until the cooldown period expires',
        variant: 'destructive',
      });
      return;
    }
    setShowConfirmDialog(true);
  };

  // Step 2: Open final confirmation dialog
  const handleProceedToFinalConfirm = () => {
    setShowConfirmDialog(false);
    setShowFinalConfirmDialog(true);
  };

  // Step 3: Actually send emails
  const handleConfirmSend = async () => {
    setShowFinalConfirmDialog(false);

    try {
      setSending(true);
      const response = await fetch('/api/admin/mailing/promotional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data: SendResult = await response.json();

      if (data.ok) {
        toast({
          title: 'Success! 🎉',
          description: data.message,
        });

        // Show detailed stats if available
        if (data.stats) {
          console.log('Email send stats:', data.stats);
          if (data.stats.failed > 0 && data.failedEmails) {
            console.error('Failed emails:', data.failedEmails);
          }
        }

        // Refresh cooldown status
        await fetchCooldownStatus();
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to send emails',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to send emails',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  // Calculate time until next available
  const getTimeUntilAvailable = (nextAvailable: string | null) => {
    if (!nextAvailable) return null;

    const now = new Date();
    const next = new Date(nextAvailable);
    const diff = next.getTime() - now.getTime();

    if (diff <= 0) return 'Available now';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        <div className="space-y-6">
          {/* Header with Back Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/dashboard">
                <Button variant="outline" size="sm" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Email Marketing Center
                </h1>
                <p className="text-muted-foreground mt-1">
                  Send promotional emails and manage campaigns
                </p>
              </div>
            </div>
          </div>

        {/* Test Email Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              <CardTitle>Test Email Templates</CardTitle>
            </div>
            <CardDescription>
              Preview and test email templates before sending to all users
            </CardDescription>
          </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email-type">Email Template</Label>
                  <Select value={selectedEmailType} onValueChange={setSelectedEmailType}>
                    <SelectTrigger id="email-type">
                      <SelectValue placeholder="Select email type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="promotional">
                        Promotional Email (ICS'25 Invitation)
                      </SelectItem>
                      <SelectItem value="ticket-confirmation">
                        Ticket Confirmation Email
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="test-email">Recipient Email</Label>
                  <Input
                    id="test-email"
                    type="email"
                    placeholder="admin@insturix.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    <li><strong>Promotional:</strong> ICS'25 event invitation with registration CTA</li>
                    <li><strong>Ticket Confirmation:</strong> Event confirmation with ticket details</li>
                    <li>Subject will be prefixed with <code className="bg-muted px-1 rounded">[TEST]</code></li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleSendTestEmail}
                disabled={sendingTest || !testEmail || !selectedEmailType}
                className="w-full"
                size="lg"
              >
                {sendingTest ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Test Email...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Test Email
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

        {/* Cooldown Status Alert */}
        {cooldownStatus && !cooldownStatus.canSend && (
          <Alert variant="destructive">
            <Clock className="h-4 w-4" />
            <AlertTitle>Cooldown Active</AlertTitle>
            <AlertDescription>
              Next email can be sent in{' '}
              <strong>{getTimeUntilAvailable(cooldownStatus.nextAvailable)}</strong>
              <br />
              Available on: {formatDate(cooldownStatus.nextAvailable)}
            </AlertDescription>
          </Alert>
        )}

        {cooldownStatus && cooldownStatus.canSend && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Ready to Send</AlertTitle>
            <AlertDescription>
              You can now send promotional emails to all users
            </AlertDescription>
          </Alert>
        )}

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {cooldownStatus?.totalUsers.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground">Registered users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Sent</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {cooldownStatus?.lastSent
                  ? formatDate(cooldownStatus.lastSent).split(',')[0]
                  : 'Never'}
              </div>
              <p className="text-xs text-muted-foreground">
                {cooldownStatus?.lastSent
                  ? formatDate(cooldownStatus.lastSent).split(',')[1]
                  : 'No emails sent yet'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cooldown Period</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {cooldownStatus?.cooldownDays || 3} days
              </div>
              <p className="text-xs text-muted-foreground">Between email sends</p>
            </CardContent>
          </Card>
        </div>

        {/* Send Email Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              <CardTitle>Bulk Email Campaign</CardTitle>
            </div>
            <CardDescription>
              Send ICS'25 promotional emails to {cooldownStatus?.totalUsers.toLocaleString() || 0} registered users
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important Notice</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                  <li>Emails will be sent to all {cooldownStatus?.totalUsers.toLocaleString()} registered users</li>
                  <li>This action cannot be undone once started</li>
                  <li>After sending, you must wait {cooldownStatus?.cooldownDays || 3} days before sending again</li>
                  <li>Failed sends will be logged for review</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleInitiateSend}
              disabled={!cooldownStatus?.canSend || sending}
              className="w-full"
              size="lg"
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Emails...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Promotional Emails to All Users
                </>
              )}
            </Button>

            {!cooldownStatus?.canSend && (
              <p className="text-sm text-center text-muted-foreground">
                Button will be enabled in{' '}
                <strong>{getTimeUntilAvailable(cooldownStatus?.nextAvailable || null)}</strong>
              </p>
            )}
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Step 1: Initial Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Confirm Email Send
            </DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <p>You are about to send promotional emails to:</p>
              <div className="bg-muted p-4 rounded-lg border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Recipients:</span>
                  <span className="text-2xl font-bold">
                    {cooldownStatus?.totalUsers.toLocaleString()}
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                This will send the ICS'25 promotional email to all registered users on the platform.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProceedToFinalConfirm}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2: Final Confirmation Dialog */}
      <Dialog open={showFinalConfirmDialog} onOpenChange={setShowFinalConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Final Confirmation Required
            </DialogTitle>
            <DialogDescription className="pt-4 space-y-3">
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  <strong>This action cannot be undone!</strong>
                  <br />
                  Are you absolutely sure you want to proceed?
                </AlertDescription>
              </Alert>
              <div className="space-y-2 text-sm">
                <p className="font-medium">This will:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>Send emails to {cooldownStatus?.totalUsers.toLocaleString()} users</li>
                  <li>Activate a {cooldownStatus?.cooldownDays}-day cooldown period</li>
                  <li>Cannot be stopped once started</li>
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowFinalConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSend}
              variant="destructive"
            >
              <Send className="mr-2 h-4 w-4" />
              Yes, Send Emails Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
