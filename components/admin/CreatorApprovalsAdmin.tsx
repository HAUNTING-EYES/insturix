"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, ExternalLink, Youtube, Instagram, Linkedin, Clock, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CreatorApplication {
  _id: string;
  clerkUserId: string;
  name: string;
  email: string;
  phone: string;
  instagram: string;
  linkedin: string;
  organization?: string;
  profession: string;
  ageGroup: string;
  city: string;
  state: string;
  socialLinks: {
    youtube?: string;
    instagram?: string;
    linkedin?: string;
  };
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export default function CreatorApprovalsAdmin() {
  const [expandedStatus, setExpandedStatus] = useState<'pending' | 'approved' | 'rejected' | null>('pending');
  const [applications, setApplications] = useState<CreatorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [displayLimit, setDisplayLimit] = useState<Record<string, number>>({
    'pending': 10,
    'approved': 10,
    'rejected': 10,
  });
  const { toast } = useToast();

  const fetchApplications = async (status: string) => {
    try {
      const res = await fetch(`/api/ics25/admin/creator-approvals?status=${status}`);
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data?.message || "Failed to fetch applications");
      }
      
      return data.creators || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load applications",
        variant: "destructive",
      });
      return [];
    }
  };

  const loadAllApplications = async () => {
    setLoading(true);
    const [pending, approved, rejected] = await Promise.all([
      fetchApplications('pending'),
      fetchApplications('approved'),
      fetchApplications('rejected'),
    ]);
    
    const allApps = [...pending, ...approved, ...rejected];
    setApplications(allApps);
    setLoading(false);
  };

  useEffect(() => {
    loadAllApplications();
  }, []);

  const handleApprove = async (app: CreatorApplication) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId: app._id,
          action: "approve",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to approve");
      }

      toast({
        title: "Approved!",
        description: `Creator Pass application for ${app.name} has been approved.`,
      });

      // Update state dynamically
      const updatedApps = applications.map(a => 
        a._id === app._id ? { ...a, status: 'approved' as const } : a
      );
      setApplications(updatedApps);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to approve application",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (app: CreatorApplication) => {
    try {
      setProcessing(true);

      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId: app._id,
          action: "reject",
          rejectionReason: "Application rejected by admin",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to reject");
      }

      toast({
        title: "Rejected",
        description: `Creator Pass application for ${app.name} has been rejected.`,
      });

      // Update state dynamically
      const updatedApps = applications.map(a => 
        a._id === app._id ? { ...a, status: 'rejected' as const } : a
      );
      setApplications(updatedApps);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to reject application",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleRevert = async (app: CreatorApplication) => {
    try {
      setProcessing(true);
      const res = await fetch("/api/ics25/admin/creator-approvals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorId: app._id,
          action: "revert",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || "Failed to revert");
      }

      toast({
        title: "Reverted",
        description: `Application for ${app.name} has been reverted to pending.`,
      });

      // Update state dynamically
      const updatedApps = applications.map(a => 
        a._id === app._id ? { ...a, status: 'pending' as const } : a
      );
      setApplications(updatedApps);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to revert application",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-sky-500" />
      </div>
    );
  }

  const pending = applications.filter(a => a.status === 'pending').length;
  const approved = applications.filter(a => a.status === 'approved').length;
  const rejected = applications.filter(a => a.status === 'rejected').length;

  const ApplicationTable = ({ apps, status }: { apps: CreatorApplication[]; status: 'pending' | 'approved' | 'rejected' }) => {
    const filteredApps = apps.filter(a => a.status === status);
    const key = status;
    const currentLimit = displayLimit[key] || 10;
    const displayedApps = filteredApps.slice(0, currentLimit);
    const hasMore = filteredApps.length > currentLimit;
    
    if (filteredApps.length === 0) {
      return (
        <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
          No {status} applications
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-4">
          {displayedApps.map((app) => (
            <Card key={app._id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{app.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {app.email} • {app.phone}
                    </CardDescription>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">
                        {app.profession}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {app.city}, {app.state}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {app.ageGroup}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm text-zinc-500">
                    {new Date(app.submittedAt).toLocaleDateString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Organization */}
                  {app.organization && (
                    <div>
                      <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                        Organization
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {app.organization}
                      </p>
                    </div>
                  )}

                  {/* Social Links */}
                  <div>
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                      Social Media Profiles
                    </p>
                    <div className="space-y-2">
                      {app.socialLinks.youtube && (
                        <a
                          href={app.socialLinks.youtube}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <Youtube className="w-4 h-4 text-red-500" />
                          <span className="truncate">{app.socialLinks.youtube}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {app.socialLinks.instagram && (
                        <a
                          href={app.socialLinks.instagram}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <Instagram className="w-4 h-4 text-pink-500" />
                          <span className="truncate">{app.socialLinks.instagram}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      {app.socialLinks.linkedin && (
                        <a
                          href={app.socialLinks.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-blue-600 hover:underline dark:text-blue-400"
                        >
                          <Linkedin className="w-4 h-4 text-blue-500" />
                          <span className="truncate">{app.socialLinks.linkedin}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div>
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                      Contact Information
                    </p>
                    <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                      <p>Instagram: {app.instagram}</p>
                      <p>LinkedIn: {app.linkedin}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    {status === 'pending' && (
                      <>
                        <Button
                          onClick={() => handleApprove(app)}
                          disabled={processing}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 h-8"
                        >
                          {processing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          Approve
                        </Button>
                        <Button
                          onClick={() => handleReject(app)}
                          disabled={processing}
                          variant="destructive"
                          size="sm"
                          className="h-8"
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </Button>
                      </>
                    )}
                    {status === 'approved' && (
                      <div className="flex gap-2">
                        <Badge className="bg-green-600 text-white">Approved</Badge>
                        <Button
                          onClick={() => handleRevert(app)}
                          disabled={processing}
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                        >
                          Revert
                        </Button>
                      </div>
                    )}
                    {status === 'rejected' && (
                      <div className="flex gap-2">
                        <Badge className="bg-red-600 text-white">Rejected</Badge>
                        <Button
                          onClick={() => handleRevert(app)}
                          disabled={processing}
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                        >
                          Revert
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button 
              variant="outline" 
              onClick={() => setDisplayLimit({
                ...displayLimit,
                [key]: currentLimit + 10
              })}
            >
              Load 10 More ({currentLimit} of {filteredApps.length})
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
          Creator Pass Applications
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mt-2">
          Review and approve Creator Pass applications (10k+ followers required)
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card 
          className="border-l-4 border-l-yellow-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setExpandedStatus(expandedStatus === 'pending' ? null : 'pending')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Pending</p>
            <p className="text-2xl font-bold mt-1">{pending}</p>
            <p className="text-xs text-zinc-400 mt-2">Click to {expandedStatus === 'pending' ? 'collapse' : 'expand'}</p>
          </CardContent>
        </Card>
        <Card 
          className="border-l-4 border-l-green-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setExpandedStatus(expandedStatus === 'approved' ? null : 'approved')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Approved</p>
            <p className="text-2xl font-bold mt-1">{approved}</p>
            <p className="text-xs text-zinc-400 mt-2">Click to {expandedStatus === 'approved' ? 'collapse' : 'expand'}</p>
          </CardContent>
        </Card>
        <Card 
          className="border-l-4 border-l-red-500 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setExpandedStatus(expandedStatus === 'rejected' ? null : 'rejected')}
        >
          <CardContent className="p-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Rejected</p>
            <p className="text-2xl font-bold mt-1">{rejected}</p>
            <p className="text-xs text-zinc-400 mt-2">Click to {expandedStatus === 'rejected' ? 'collapse' : 'expand'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Expanded Section */}
      {expandedStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {expandedStatus === 'pending' && <Clock className="w-5 h-5 text-yellow-500" />}
              {expandedStatus === 'approved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              {expandedStatus === 'rejected' && <Ban className="w-5 h-5 text-red-500" />}
              <span>{expandedStatus.charAt(0).toUpperCase() + expandedStatus.slice(1)} Applications</span>
            </CardTitle>
            <CardDescription>
              {expandedStatus === 'pending' && `Approve or reject ${pending} pending creator applications`}
              {expandedStatus === 'approved' && `${approved} approved creator applications`}
              {expandedStatus === 'rejected' && `${rejected} rejected creator applications`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApplicationTable apps={applications} status={expandedStatus} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
