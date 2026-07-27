'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Mail, Users, AlertCircle, CheckCircle2, Send, Loader2, TestTube,
  ArrowLeft, Shield, AlertTriangle, MessageSquare, Bold, Italic, List, Underline, Type
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useUser } from '@clerk/nextjs';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CooldownStatus {
  lastSent: string | null;
  totalUsers: number;
  cooldownDays?: number;
}

interface SendResult {
  ok: boolean;
  message: string;
}

export default function MailingDashboard() {
  const [activeTab, setActiveTab] = useState('testing');
  const [cooldownStatus, setCooldownStatus] = useState<CooldownStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingIndividual, setSendingIndividual] = useState(false);
  const [sendingCustom, setSendingCustom] = useState(false);
  const [selectedEmailType, setSelectedEmailType] = useState<string>('promotional');
  const [selectedProdEmailType, setSelectedProdEmailType] = useState<string>('promotional');
  const [testEmail, setTestEmail] = useState<string>('');
  const [individualEmail, setIndividualEmail] = useState<string>('');
  const [eventDetails, setEventDetails] = useState<string>("Insturix Creator's Summit 2025");
  const [prodEventDetails, setProdEventDetails] = useState<string>("Insturix Creator's Summit 2025");
  const [customRecipientType, setCustomRecipientType] = useState<string>('all-users');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [customMessage, setCustomMessage] = useState<string>('');
  const [testCustomEmail, setTestCustomEmail] = useState<string>('');
  const [testCustomSubject, setTestCustomSubject] = useState<string>('');
  const [testCustomMessage, setTestCustomMessage] = useState<string>('');
  const [testCustomRecipientType, setTestCustomRecipientType] = useState<string>('all-users');
  const [sendingTestCustom, setSendingTestCustom] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showFinalConfirmDialog, setShowFinalConfirmDialog] = useState(false);
  const [showCustomConfirmDialog, setShowCustomConfirmDialog] = useState(false);
  const [showCustomFinalConfirmDialog, setShowCustomFinalConfirmDialog] = useState(false);
  const [bulkEmailTemplate, setBulkEmailTemplate] = useState<string>('promotional');
  const { toast } = useToast();
  const { user } = useUser();

  // Fetch cooldown status
  const fetchCooldownStatus = async () => {
    try {
      setLoading(true);
      // Only bulk send for promotional and initial ticket confirmation
      const isBulkSendType = selectedProdEmailType === 'promotional' || 
                             selectedProdEmailType === 'ticket-confirmation' ||
                             selectedProdEmailType === 'ticket-confirmation-initial';
      
      // Skip fetching cooldown for reminder types (they're sent via cron)
      if (!isBulkSendType) {
        setLoading(false);
        return;
      }
      
      // Use the new bulk-template endpoint for cooldown status
      // Pass the current template to get the correct recipient count
      const endpoint = `/api/admin/mailing/bulk-template?template=${bulkEmailTemplate}`;
      const response = await fetch(endpoint);
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
    if (activeTab === 'prod') {
      fetchCooldownStatus();
    } else {
      // If on testing tab, set loading to false immediately
      setLoading(false);
    }
    // Pre-fill admin's email
    if (user?.primaryEmailAddress?.emailAddress) {
      setTestEmail(user.primaryEmailAddress.emailAddress);
      setIndividualEmail(user.primaryEmailAddress.emailAddress);
    }
  }, [user, selectedProdEmailType, activeTab, bulkEmailTemplate]);

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

  // Send test custom mailing email
  const handleSendTestCustomEmail = async () => {
    if (!testCustomEmail) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    if (!testCustomSubject.trim() || !testCustomMessage.trim()) {
      toast({
        title: 'Error',
        description: 'Subject and message are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSendingTestCustom(true);
      
      // Create test email with subject prefix
      const testSubject = `[TEST] ${testCustomSubject}`;
      
      const response = await fetch('/api/admin/mailing/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientType: testCustomRecipientType,
          subject: testSubject,
          message: testCustomMessage,
          // Note: This is a test send to single email, not actual bulk send
          testMode: true,
          testEmail: testCustomEmail,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        toast({
          title: 'Test Email Sent! 📧',
          description: `Test custom email sent to ${testCustomEmail}`,
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
      setSendingTestCustom(false);
    }
  };

  // Send individual production email
  const handleSendIndividualEmail = async () => {
    if (!individualEmail) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedProdEmailType) {
      toast({
        title: 'Error',
        description: 'Please select an email type',
        variant: 'destructive',
      });
      return;
    }

    // Validate event details for ticket confirmation types
    if ((selectedProdEmailType === 'ticket-confirmation' || 
         selectedProdEmailType === 'ticket-confirmation-initial' ||
         selectedProdEmailType?.startsWith('ticket-confirmation-reminder')) && 
        !prodEventDetails) {
      toast({
        title: 'Error',
        description: 'Event details are required for ticket confirmation emails',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSendingIndividual(true);
      const response = await fetch('/api/admin/mailing/send-individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailType: selectedProdEmailType,
          recipientEmail: individualEmail,
          eventDetails: prodEventDetails,
        }),
      });

      const data = await response.json();

      if (data.ok) {
        toast({
          title: 'Email Sent! 📧',
          description: data.message,
        });
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to send email',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to send email',
        variant: 'destructive',
      });
    } finally {
      setSendingIndividual(false);
    }
  };

  // Step 1: Open first confirmation dialog
  const handleInitiateSend = () => {
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
      
      // Use the new bulk-template endpoint
      const endpoint = '/api/admin/mailing/bulk-template';
      
      const bodyData: any = {
        template: bulkEmailTemplate,
      };

      // Add event details if ticket confirmation template is selected
      if (bulkEmailTemplate === 'ticket-confirmation-initial' ||
          bulkEmailTemplate?.startsWith('ticket-confirmation-reminder')) {
        bodyData.eventDetails = prodEventDetails;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData),
      });

      const data: SendResult = await response.json();

      if (data.ok) {
        toast({
          title: 'Success! 🎉',
          description: data.message,
        });

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

  // Handle custom mailing send
  const handleInitiateCustomSend = () => {
    if (!customSubject.trim() || !customMessage.trim()) {
      toast({
        title: 'Error',
        description: 'Subject and message are required',
        variant: 'destructive',
      });
      return;
    }

    setShowCustomConfirmDialog(true);
  };

  const handleProceedToCustomFinalConfirm = () => {
    setShowCustomConfirmDialog(false);
    setShowCustomFinalConfirmDialog(true);
  };

  const handleConfirmCustomSend = async () => {
    setShowCustomFinalConfirmDialog(false);

    try {
      setSendingCustom(true);
      const response = await fetch('/api/admin/mailing/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientType: customRecipientType,
          subject: customSubject,
          message: customMessage,
        }),
      });

      const data: SendResult = await response.json();

      if (data.ok) {
        toast({
          title: 'Success! 🎉',
          description: data.message,
        });

        // Clear form and refresh cooldown status
        setCustomSubject('');
        setCustomMessage('');
        await fetchCooldownStatus();
      } else {
        toast({
          title: 'Error',
          description: data.message || 'Failed to send custom mailing',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.message || 'Failed to send custom mailing',
        variant: 'destructive',
      });
    } finally {
      setSendingCustom(false);
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
                <h1 className="text-[32px] font-bold tracking-tight">
                  Email Marketing Center
                </h1>
                <p className="text-muted-foreground mt-1">
                  Send promotional emails and manage campaigns
                </p>
              </div>
            </div>
          </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="testing">
              <TestTube className="mr-2 h-4 w-4" />
              Testing
            </TabsTrigger>
            <TabsTrigger value="prod">
              <Send className="mr-2 h-4 w-4" />
              Prod
            </TabsTrigger>
          </TabsList>

          {/* Testing Tab */}
          <TabsContent value="testing" className="space-y-6 mt-6">
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
                    <SelectContent className="bg-black border-neutral-800">
                      <SelectItem value="promotional">
                        Promotional Email (ICS'25 Invitation)
                      </SelectItem>
                      <SelectItem value="ticket-confirmation-initial">
                        Ticket Confirmation Email (Initial)
                      </SelectItem>
                      <SelectItem value="ticket-confirmation-reminder-7days">
                        Ticket Confirmation Email (7 Days Reminder)
                      </SelectItem>
                      <SelectItem value="ticket-confirmation-reminder-1day">
                        Ticket Confirmation Email (1 Day Reminder)
                      </SelectItem>
                      <SelectItem value="ticket-confirmation-reminder-30min">
                        Ticket Confirmation Email (30 Minutes Reminder)
                      </SelectItem>
                      {/* Legacy support */}
                      <SelectItem value="ticket-confirmation">
                        Ticket Confirmation Email (Legacy)
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

              {(selectedEmailType === 'ticket-confirmation' || 
                selectedEmailType === 'ticket-confirmation-initial' ||
                selectedEmailType?.startsWith('ticket-confirmation-reminder')) && (
                <div className="space-y-2">
                  <Label htmlFor="event-details">Event Details</Label>
                  <Input
                    id="event-details"
                    type="text"
                    placeholder="Insturix Creator's Summit 2025"
                    value={eventDetails}
                    onChange={(e) => setEventDetails(e.target.value)}
                  />
                  {selectedEmailType?.startsWith('ticket-confirmation-reminder') && (
                    <p className="text-sm text-muted-foreground">
                      {selectedEmailType === 'ticket-confirmation-reminder-7days' && 'Preview: Event starts in 7 days'}
                      {selectedEmailType === 'ticket-confirmation-reminder-1day' && 'Preview: Event starts in 1 day'}
                      {selectedEmailType === 'ticket-confirmation-reminder-30min' && 'Preview: Event starts in 30 minutes'}
                    </p>
                  )}
                </div>
              )}

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

          {/* Test Custom Mailing Section */}
          <Card className="mt-8">
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                <CardTitle>Test Custom Message</CardTitle>
              </div>
              <CardDescription>
                Test custom message templates before sending to all recipients
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="test-custom-recipient">Recipient Type</Label>
                  <Select value={testCustomRecipientType} onValueChange={setTestCustomRecipientType}>
                    <SelectTrigger id="test-custom-recipient">
                      <SelectValue placeholder="Select recipient type" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-neutral-800">
                      <SelectItem value="all-users">
                        All Registered Users Template
                      </SelectItem>
                      <SelectItem value="ics25-attendees">
                        ICS25 Attendees Template
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="test-custom-email">Test Email Address</Label>
                  <Input
                    id="test-custom-email"
                    type="email"
                    placeholder="admin@insturix.com"
                    value={testCustomEmail}
                    onChange={(e) => setTestCustomEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="test-custom-subject">Subject Line</Label>
                <Input
                  id="test-custom-subject"
                  type="text"
                  placeholder="Email subject"
                  value={testCustomSubject}
                  onChange={(e) => setTestCustomSubject(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="test-custom-message">Message</Label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        document.getElementById('test-custom-message')?.focus();
                        document.execCommand('bold', false);
                      }}
                      title="Bold (Ctrl+B)">
                      <Bold className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        document.getElementById('test-custom-message')?.focus();
                        document.execCommand('italic', false);
                      }}
                      title="Italic (Ctrl+I)">
                      <Italic className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        document.getElementById('test-custom-message')?.focus();
                        document.execCommand('underline', false);
                      }}
                      title="Underline (Ctrl+U)">
                      <Underline className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => {
                        document.getElementById('test-custom-message')?.focus();
                        document.execCommand('insertUnorderedList', false);
                      }}
                      title="Bullet List">
                      <List className="h-3 w-3" />
                    </Button>
                    <Select
                      value="normal"
                      onValueChange={(size) => {
                        document.getElementById('test-custom-message')?.focus();
                        if (size === 'large') {
                          document.execCommand('fontSize', false, '5');
                        } else if (size === 'small') {
                          document.execCommand('fontSize', false, '2');
                        } else {
                          document.execCommand('fontSize', false, '3');
                        }
                      }}>
                      <SelectTrigger className="h-7 w-20 text-[11px]">
                        <Type className="h-3 w-3" />
                      </SelectTrigger>
                      <SelectContent className="bg-black border-neutral-800">
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="large">Large</SelectItem>
                        <SelectItem value="small">Small</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div
                  id="test-custom-message"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => {
                    const html = e.currentTarget.innerHTML;
                    setTestCustomMessage(html);
                  }}
                  onKeyDown={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      if (e.key === 'b') {
                        e.preventDefault();
                        document.execCommand('bold', false);
                      } else if (e.key === 'i') {
                        e.preventDefault();
                        document.execCommand('italic', false);
                      } else if (e.key === 'u') {
                        e.preventDefault();
                        document.execCommand('underline', false);
                      }
                    }
                  }}
                  className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                  data-placeholder="Write your message here."
                />
                <style jsx>{`
                  [contenteditable][data-placeholder]:empty:before {
                    content: attr(data-placeholder);
                    color: hsl(var(--muted-foreground));
                    cursor: text;
                  }
                `}</style>
                <p className="text-[11px] text-muted-foreground">
                  {testCustomMessage.length} characters | Rich text formatting enabled
                </p>
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Test Custom Message</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li>Subject will be prefixed with <code className="bg-muted px-1 rounded">[TEST]</code></li>
                    <li>Use Ctrl+B for bold, Ctrl+I for italic, Ctrl+U for underline</li>
                    <li>Add bullet points and adjust text size with toolbar</li>
                    <li>Preview formatting before sending to all recipients</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleSendTestCustomEmail}
                disabled={sendingTestCustom || !testCustomEmail || !testCustomSubject.trim() || !testCustomMessage.trim()}
                className="w-full"
                size="lg"
              >
                {sendingTestCustom ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending Test Message...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Test Custom Message
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
          </TabsContent>

          {/* Prod Tab */}
          <TabsContent value="prod" className="space-y-6 mt-6">
            {/* Individual Mail Send Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  <CardTitle>Individual Mail Send</CardTitle>
                </div>
                <CardDescription>
                  Send production emails to individual registered users
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="prod-email-type">Email Template</Label>
                    <Select value={selectedProdEmailType} onValueChange={setSelectedProdEmailType}>
                      <SelectTrigger id="prod-email-type">
                        <SelectValue placeholder="Select email type" />
                      </SelectTrigger>
                      <SelectContent className="bg-black border-neutral-800">
                        <SelectItem value="promotional">
                          Promotional Email (ICS'25 Invitation)
                        </SelectItem>
                        <SelectItem value="ticket-confirmation-initial">
                          Ticket Confirmation Email (Initial)
                        </SelectItem>
                        <SelectItem value="ticket-confirmation-reminder-7days">
                          Ticket Confirmation Email (7 Days Reminder)
                        </SelectItem>
                        <SelectItem value="ticket-confirmation-reminder-1day">
                          Ticket Confirmation Email (1 Day Reminder)
                        </SelectItem>
                        <SelectItem value="ticket-confirmation-reminder-30min">
                          Ticket Confirmation Email (30 Minutes Reminder)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="individual-email">Recipient Email (Must be registered)</Label>
                    <Input
                      id="individual-email"
                      type="email"
                      placeholder="user@example.com"
                      value={individualEmail}
                      onChange={(e) => setIndividualEmail(e.target.value)}
                    />
                  </div>
                </div>

                {(selectedProdEmailType === 'ticket-confirmation-initial' ||
                  selectedProdEmailType?.startsWith('ticket-confirmation-reminder')) && (
                  <div className="space-y-2">
                    <Label htmlFor="prod-event-details">Event Details</Label>
                    <Input
                      id="prod-event-details"
                      type="text"
                      placeholder="Insturix Creator's Summit 2025"
                      value={prodEventDetails}
                      onChange={(e) => setProdEventDetails(e.target.value)}
                    />
                    {selectedProdEmailType?.startsWith('ticket-confirmation-reminder') && (
                      <p className="text-sm text-muted-foreground">
                        {selectedProdEmailType === 'ticket-confirmation-reminder-7days' && 'Event starts in 7 days'}
                        {selectedProdEmailType === 'ticket-confirmation-reminder-1day' && 'Event starts in 1 day'}
                        {selectedProdEmailType === 'ticket-confirmation-reminder-30min' && 'Event starts in 30 minutes'}
                      </p>
                    )}
                  </div>
                )}

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Recipient must be a registered user</li>
                      <li>This is a production email (no TEST prefix)</li>
                      <li>Email will be sent immediately</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <Button
                  onClick={handleSendIndividualEmail}
                  disabled={sendingIndividual || !individualEmail || !selectedProdEmailType}
                  className="w-full"
                  size="lg"
                >
                  {sendingIndividual ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending Email...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Individual Email
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

        {/* Cooldown Status Alert */}
        {cooldownStatus && cooldownStatus.lastSent && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Last Sent</AlertTitle>
            <AlertDescription>
              Bulk emails were last sent on {formatDate(cooldownStatus.lastSent)}
            </AlertDescription>
          </Alert>
        )}

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-2 mt-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Recipients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {cooldownStatus?.totalUsers.toLocaleString() || 0}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {(bulkEmailTemplate === 'ticket-confirmation-initial' ||
                  bulkEmailTemplate?.startsWith('ticket-confirmation-reminder'))
                  ? 'ICS\'25 Attendees'
                  : 'Registered users'}
              </p>
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
              <p className="text-[11px] text-muted-foreground">
                {cooldownStatus?.lastSent
                  ? formatDate(cooldownStatus.lastSent).split(',')[1]
                  : 'No emails sent yet'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Email Campaign - Only show for bulk send types */}
        {(selectedProdEmailType === 'promotional' || 
          selectedProdEmailType === 'ticket-confirmation' ||
          selectedProdEmailType === 'ticket-confirmation-initial') && (
        <Card className="mt-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              <CardTitle>Bulk Email Campaign</CardTitle>
            </div>
            <CardDescription>
              {(bulkEmailTemplate === 'ticket-confirmation-initial' ||
                bulkEmailTemplate?.startsWith('ticket-confirmation-reminder'))
                ? `Send ticket confirmation emails to ${cooldownStatus?.totalUsers.toLocaleString() || 0} ICS'25 attendees`
                : `Send emails using selected template to ${cooldownStatus?.totalUsers.toLocaleString() || 0} registered users`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template Selection */}
            <div className="space-y-2">
              <Label htmlFor="bulk-template">Select Email Template</Label>
              <Select value={bulkEmailTemplate} onValueChange={setBulkEmailTemplate}>
                <SelectTrigger id="bulk-template">
                  <SelectValue placeholder="Choose template" />
                </SelectTrigger>
                <SelectContent className="bg-black border-neutral-800">
                  <SelectItem value="promotional">
                    Promotional Email (ICS'25 Invitation)
                  </SelectItem>
                  <SelectItem value="ticket-confirmation-initial">
                    Ticket Confirmation Email (Initial)
                  </SelectItem>
                  <SelectItem value="ticket-confirmation-reminder-7days">
                    Ticket Confirmation Email (7 Days Reminder)
                  </SelectItem>
                  <SelectItem value="ticket-confirmation-reminder-1day">
                    Ticket Confirmation Email (1 Day Reminder)
                  </SelectItem>
                  <SelectItem value="ticket-confirmation-reminder-30min">
                    Ticket Confirmation Email (30 Minutes Reminder)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Event Details - Show only for ticket confirmation */}
            {(bulkEmailTemplate === 'ticket-confirmation-initial' ||
              bulkEmailTemplate?.startsWith('ticket-confirmation-reminder')) && (
              <div className="space-y-2">
                <Label htmlFor="bulk-event-details">Event Details</Label>
                <Input
                  id="bulk-event-details"
                  type="text"
                  placeholder="Insturix Creator's Summit 2025"
                  value={prodEventDetails}
                  onChange={(e) => setProdEventDetails(e.target.value)}
                />
                {bulkEmailTemplate?.startsWith('ticket-confirmation-reminder') && (
                  <p className="text-sm text-muted-foreground">
                    {bulkEmailTemplate === 'ticket-confirmation-reminder-7days' && 'Event starts in 7 days'}
                    {bulkEmailTemplate === 'ticket-confirmation-reminder-1day' && 'Event starts in 1 day'}
                    {bulkEmailTemplate === 'ticket-confirmation-reminder-30min' && 'Event starts in 30 minutes'}
                  </p>
                )}
              </div>
            )}

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Important Notice</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                  {(bulkEmailTemplate === 'ticket-confirmation-initial' ||
                    bulkEmailTemplate?.startsWith('ticket-confirmation-reminder')) ? (
                    <>
                      <li>Emails will be sent to all {cooldownStatus?.totalUsers.toLocaleString()} ICS'25 approved attendees only</li>
                      <li>Only attendees with paid or pending payment status will receive emails</li>
                    </>
                  ) : (
                    <li>Emails will be sent to all {cooldownStatus?.totalUsers.toLocaleString()} registered users</li>
                  )}
                  <li>This action cannot be undone once started</li>
                  <li>After sending, you must wait {cooldownStatus?.cooldownDays || 1} day{(cooldownStatus?.cooldownDays || 1) > 1 ? 's' : ''} before sending again</li>
                  <li>Failed sends will be logged for review</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleInitiateSend}
              disabled={sending || 
                ((bulkEmailTemplate === 'ticket-confirmation-initial' ||
                  bulkEmailTemplate?.startsWith('ticket-confirmation-reminder')) && !prodEventDetails)}
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
                  {bulkEmailTemplate === 'promotional' 
                    ? 'Send Promotional Emails to All Users'
                    : (bulkEmailTemplate === 'ticket-confirmation-initial' ||
                       bulkEmailTemplate?.startsWith('ticket-confirmation-reminder'))
                    ? 'Send Ticket Confirmation Emails to ICS\'25 Attendees'
                    : 'Send Emails to All Users'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        )}

        {/* Custom Mailing Campaign Section */}
        <Card className="mt-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <CardTitle>Custom Mailing</CardTitle>
            </div>
            <CardDescription>
              Send custom text-based messages to all users or ICS25 attendees
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recipient-type">Send To</Label>
                <Select value={customRecipientType} onValueChange={setCustomRecipientType}>
                  <SelectTrigger id="recipient-type">
                    <SelectValue placeholder="Select recipients" />
                  </SelectTrigger>
                  <SelectContent className="bg-black border-neutral-800">
                    <SelectItem value="all-users">
                      All Registered Users
                    </SelectItem>
                    <SelectItem value="ics25-attendees">
                      ICS25 Event Attendees
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-subject">Subject Line</Label>
                <Input
                  id="custom-subject"
                  type="text"
                  placeholder="Email subject"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="custom-message">Message</Label>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      document.getElementById('custom-message')?.focus();
                      document.execCommand('bold', false);
                    }}
                    title="Bold (Ctrl+B)">
                    <Bold className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      document.getElementById('custom-message')?.focus();
                      document.execCommand('italic', false);
                    }}
                    title="Italic (Ctrl+I)">
                    <Italic className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      document.getElementById('custom-message')?.focus();
                      document.execCommand('underline', false);
                    }}
                    title="Underline (Ctrl+U)">
                    <Underline className="h-3 w-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => {
                      document.getElementById('custom-message')?.focus();
                      document.execCommand('insertUnorderedList', false);
                    }}
                    title="Bullet List">
                    <List className="h-3 w-3" />
                  </Button>
                  <Select
                    value="normal"
                    onValueChange={(size) => {
                      document.getElementById('custom-message')?.focus();
                      if (size === 'large') {
                        document.execCommand('fontSize', false, '5');
                      } else if (size === 'small') {
                        document.execCommand('fontSize', false, '2');
                      } else {
                        document.execCommand('fontSize', false, '3');
                      }
                    }}>
                    <SelectTrigger className="h-7 w-20 text-[11px]">
                      <Type className="h-3 w-3" />
                    </SelectTrigger>
                    <SelectContent className="bg-black border-neutral-800">
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="large">Large</SelectItem>
                      <SelectItem value="small">Small</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div
                id="custom-message"
                contentEditable
                suppressContentEditableWarning
                onInput={(e) => {
                  const html = e.currentTarget.innerHTML;
                  setCustomMessage(html);
                }}
                onKeyDown={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'b') {
                      e.preventDefault();
                      document.execCommand('bold', false);
                    } else if (e.key === 'i') {
                      e.preventDefault();
                      document.execCommand('italic', false);
                    } else if (e.key === 'u') {
                      e.preventDefault();
                      document.execCommand('underline', false);
                    }
                  }
                }}
                className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                data-placeholder="Write your message here. Use Ctrl+B for bold, Ctrl+I for italic, Ctrl+U for underline."
              />
              <style jsx>{`
                [contenteditable][data-placeholder]:empty:before {
                  content: attr(data-placeholder);
                  color: hsl(var(--muted-foreground));
                  cursor: text;
                }
              `}</style>
              <p className="text-[11px] text-muted-foreground">
                {customMessage.replace(/<[^>]*>/g, '').length} characters | Rich text formatting enabled
              </p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Simple Formatting Supported</AlertTitle>
              <AlertDescription>
                <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                  <li>Use Ctrl+B for bold, Ctrl+I for italic, Ctrl+U for underline</li>
                  <li>Add bullet points and adjust text size with toolbar</li>
                  <li>Each recipient's name will be personalized</li>
                  <li>1-day cooldown period applies</li>
                </ul>
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleInitiateCustomSend}
              disabled={!customSubject.trim() || !customMessage.trim() || sendingCustom}
              className="w-full"
              size="lg"
            >
              {sendingCustom ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending Messages...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send Custom Message to {customRecipientType === 'all-users' ? 'All Users' : 'ICS25 Attendees'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>
        </TabsContent>
        </Tabs>
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
          </DialogHeader>
          <div className="pt-4 space-y-3">
            <p>
              You are about to send{' '}
              <strong>
                {bulkEmailTemplate === 'promotional' 
                  ? 'promotional'
                  : (bulkEmailTemplate === 'ticket-confirmation-initial' ||
                     bulkEmailTemplate?.startsWith('ticket-confirmation-reminder'))
                  ? 'ticket confirmation'
                  : bulkEmailTemplate}{' '}
              </strong>
              emails to:
            </p>
            <div className="bg-muted p-4 rounded-lg border">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Recipients:</span>
                <span className="text-2xl font-bold">
                  {cooldownStatus?.totalUsers.toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {bulkEmailTemplate === 'promotional'
                ? 'This will send the ICS\'25 promotional email to all registered users on the platform.'
                : (bulkEmailTemplate === 'ticket-confirmation-initial' ||
                   bulkEmailTemplate?.startsWith('ticket-confirmation-reminder'))
                ? `This will send the ticket confirmation email to all approved ICS'25 attendees with event details "${prodEventDetails}".`
                : 'This will send emails to the specified recipients.'}
            </p>
          </div>
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
          </DialogHeader>
          <div className="pt-4 space-y-3">
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
                <li>
                  Send{' '}
                  <strong>
                    {bulkEmailTemplate === 'promotional' 
                      ? 'promotional'
                      : (bulkEmailTemplate === 'ticket-confirmation-initial' ||
                         bulkEmailTemplate?.startsWith('ticket-confirmation-reminder'))
                      ? 'ticket confirmation'
                      : bulkEmailTemplate}
                  </strong>{' '}
                  emails to {cooldownStatus?.totalUsers.toLocaleString()} {
                    (bulkEmailTemplate === 'ticket-confirmation-initial' ||
                     bulkEmailTemplate?.startsWith('ticket-confirmation-reminder'))
                    ? 'ICS\'25 attendees' : 'users'}
                </li>
                <li>
                  Activate a {cooldownStatus?.cooldownDays} day{(cooldownStatus?.cooldownDays || 1) > 1 ? 's' : ''} cooldown period
                </li>
                <li>Cannot be stopped once started</li>
              </ul>
            </div>
          </div>
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

      {/* Step 1: Custom Mailing Confirmation Dialog */}
      <Dialog open={showCustomConfirmDialog} onOpenChange={setShowCustomConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Confirm Custom Message Send
            </DialogTitle>
          </DialogHeader>
          <div className="pt-4 space-y-3 max-h-[60vh] overflow-y-auto">
            <p>
              You are about to send a custom message to{' '}
              <strong>
                {customRecipientType === 'all-users' ? 'all registered users' : 'ICS25 attendees'}
              </strong>
            </p>
            <div className="bg-muted p-4 rounded-lg border space-y-2">
              <div>
                <span className="text-[11px] text-muted-foreground">Subject:</span>
                <p className="font-medium text-sm">{customSubject}</p>
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground">Message Preview:</span>
                <div className="text-sm whitespace-pre-wrap max-h-32 overflow-y-auto" dangerouslySetInnerHTML={{ __html: customMessage }} />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCustomConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleProceedToCustomFinalConfirm}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2: Custom Mailing Final Confirmation Dialog */}
      <Dialog open={showCustomFinalConfirmDialog} onOpenChange={setShowCustomFinalConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Final Confirmation Required
            </DialogTitle>
          </DialogHeader>
          <div className="pt-4 space-y-3 max-h-[60vh] overflow-y-auto">
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
                <li>
                  Send custom message to all{' '}
                  <strong>
                    {customRecipientType === 'all-users' ? 'registered users' : 'ICS25 attendees'}
                  </strong>
                </li>
                <li>Activate a 1 day cooldown period</li>
                <li>Cannot be stopped once started</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowCustomFinalConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCustomSend}
              variant="destructive"
            >
              <Send className="mr-2 h-4 w-4" />
              Yes, Send Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

