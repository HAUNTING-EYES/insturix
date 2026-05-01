'use client';

import { useState, useEffect, useCallback, useReducer } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Video, Clock, Trash2, FileVideo } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/editron/use-toast';
import { getUserFriendlyErrorMessage } from '@/lib/editron/utils/error-handling';
import { AutoEditDialog, type AutoEditOptions } from '@/components/editron/project/auto-edit-dialog';
import { UploadProgressBar } from '@/components/editron/project/upload-progress-bar';
import { uploadReducer, INITIAL_UPLOAD_STATE } from '@/lib/editron/client/upload-types';
import { shouldCompress, compressToProxy } from '@/lib/editron/client/video-compressor';
import { MultipartUploader } from '@/lib/editron/client/multipart-uploader';

interface Project {
  projectId: string;
  name: string;
  thumbnail?: string;
  updatedAt: string;
  durationInFrames: number;
  aspectRatio: string;
}

export default function ProjectDashboard() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [autoEditing, setAutoEditing] = useState(false);
  const [autoEditProgress, setAutoEditProgress] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadState, dispatchUpload] = useReducer(uploadReducer, INITIAL_UPLOAD_STATE);

  useEffect(() => {
    if (user) {
      loadProjects();
    }
  }, [user]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/services/editron/projects/list');
      
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      } else {
        console.error('Failed to load projects');
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newProjectName.trim()) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter a project name',
      });
      return;
    }

    try {
      setCreating(true);
      const response = await fetch('/api/services/editron/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newProjectName,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Success',
          description: 'Project created successfully',
        });
        
        // Navigate to the new project
        router.push(`/dashboard/editron/project/${data.projectId}`);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create project');
      }
    } catch (error: any) {
      console.error('Error creating project:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setCreating(false);
    }
  };

  // Dialog callback: user confirmed file + options → run the upload + auto-edit flow
  const handleAutoEditConfirm = useCallback((file: File, options: AutoEditOptions) => {
    setPendingFile(null);
    handleAutoEdit(file, options);
  }, []);

  const handleAutoEdit = async (file: File, options: AutoEditOptions = {}) => {
    try {
      setAutoEditing(true);
      dispatchUpload({ type: 'RESET' });

      const useProxy = shouldCompress(file);
      let uploadFile = file;

      // Step 1: Compress to proxy if large file
      if (useProxy) {
        setAutoEditProgress('Compressing preview version...');
        dispatchUpload({ type: 'START_COMPRESS' });
        uploadFile = await compressToProxy(file, (ratio) => {
          dispatchUpload({
            type: 'PROXY_PROGRESS',
            progress: { loaded: ratio * file.size, total: file.size, percent: Math.round(ratio * 100), bytesPerSecond: 0, estimatedSecondsRemaining: 0 },
          });
        });
        dispatchUpload({ type: 'COMPRESS_DONE' });
      }

      // Step 2: Upload proxy (or original if small) via presigned URL
      setAutoEditProgress(`Uploading ${useProxy ? 'preview' : file.name} (${Math.round(uploadFile.size / 1024 / 1024)}MB)...`);
      const urlRes = await fetch('/api/services/editron/media/upload/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadFile.name, contentType: uploadFile.type }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({ error: 'Failed to get upload URL' }));
        throw new Error(err.error || 'Failed to get upload URL');
      }
      const { uploadUrl, assetId, readUrl } = await urlRes.json();

      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': uploadFile.type },
        body: uploadFile,
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed: ${putRes.status}`);
      }

      // Step 3: Register asset
      setAutoEditProgress('Registering asset...');
      const mediaType = file.type.startsWith('video/') ? 'video'
        : file.type.startsWith('audio/') ? 'audio' : 'image';
      const regRes = await fetch('/api/services/editron/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId, gcsPath: null, readUrl,
          readUrlExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          filename: file.name, contentType: file.type, size: file.size, type: mediaType,
          ...(useProxy && { isProxy: true }),
        }),
      });
      if (!regRes.ok) {
        const err = await regRes.json().catch(() => ({ error: 'Registration failed' }));
        throw new Error(err.error || 'Asset registration failed');
      }

      // Step 4: Trigger auto-edit
      setAutoEditProgress('AI is analyzing and editing your video...');
      const editRes = await fetch('/api/services/editron/auto-edit/from-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          title: file.name.replace(/\.[^.]+$/, ''),
          ...(options.platform && { platform: options.platform }),
          ...(options.aspectRatio && { aspectRatio: options.aspectRatio }),
          ...(options.userIntent && { userIntent: options.userIntent }),
          ...(options.script && { script: options.script }),
        }),
      });
      if (!editRes.ok) {
        const err = await editRes.json();
        throw new Error(err.error || 'Auto-edit failed');
      }

      const { projectId } = await editRes.json();

      // Step 5: Start background original upload if using proxy
      if (useProxy) {
        dispatchUpload({ type: 'START_ORIGINAL_UPLOAD', uploadId: '', r2Key: '', assetId });
        const uploader = new MultipartUploader({
          file,
          assetId,
          onProgress: (progress) => dispatchUpload({ type: 'ORIGINAL_PROGRESS', progress }),
          onPartComplete: (part) => dispatchUpload({ type: 'PART_COMPLETED', part }),
          onComplete: async () => {
            dispatchUpload({ type: 'ORIGINAL_DONE' });
            // Swap proxy → original
            const r2Key = uploader.getR2Key();
            try {
              const swapRes = await fetch('/api/services/editron/media/upload/swap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  assetId,
                  originalUrl: `${window.location.origin}/api/services/editron/assets/url/${r2Key || assetId}`,
                  originalR2Key: r2Key,
                }),
              });
              if (swapRes.ok) {
                dispatchUpload({ type: 'SWAP_DONE' });
                toast({ title: 'Full quality ready', description: 'Original video uploaded successfully.' });
              }
            } catch {
              console.warn('[Dashboard] Swap failed — cron will auto-heal');
            }
          },
          onError: (err) => {
            dispatchUpload({ type: 'ERROR', error: err.message });
            console.error('[Dashboard] Background upload failed:', err);
          },
        });
        uploader.start();
      }

      // Step 6: Poll autoEditStatus until complete
      setAutoEditProgress('AI is analyzing your video...');
      const maxPolls = 60;
      for (let i = 0; i < maxPolls; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const statusRes = await fetch(`/api/services/editron/projects/${projectId}`);
          if (statusRes.ok) {
            const proj = await statusRes.json();
            const status = proj.project?.autoEditStatus || proj.autoEditStatus;
            if (status === 'complete') {
              toast({ title: 'Video edited!', description: 'Opening in editor...' });
              router.push(`/dashboard/editron/project/${projectId}`);
              return;
            }
            if (status === 'failed') {
              throw new Error(proj.project?.autoEditError || 'AI editing failed');
            }
            const progressMap: Record<string, string> = {
              queued: 'Queued for processing...',
              analyzing: 'AI is analyzing your video...',
              editing: 'Applying edits, transitions, captions...',
            };
            setAutoEditProgress(progressMap[status] || `Processing (${status})...`);
          }
        } catch (pollErr) {
          if ((pollErr as Error).message?.includes('failed')) throw pollErr;
        }
      }
      toast({ title: 'Processing taking longer than expected', description: 'Opening project — editing may still be in progress.' });
      router.push(`/dashboard/editron/project/${projectId}`);
    } catch (error) {
      console.error('Auto-edit error:', error);
      dispatchUpload({ type: 'ERROR', error: getUserFriendlyErrorMessage(error) });
      toast({
        variant: 'destructive',
        title: 'Auto-edit failed',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setAutoEditing(false);
      setAutoEditProgress('');
    }
  };

  const deleteProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/services/editron/projects/${projectId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Project deleted successfully',
        });
        loadProjects(); // Reload the list
      } else {
        throw new Error('Failed to delete project');
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: getUserFriendlyErrorMessage(error),
      });
    } finally {
      setDeleteProjectId(null);
    }
  };

  const openProject = (projectId: string) => {
    router.push(`/dashboard/editron/project/${projectId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-zinc-100 dark:to-zinc-400 bg-clip-text text-transparent">
            Editron
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Create and manage your video projects
          </p>
        </div>

        {/* Create New Project Card */}
        <Card className="mb-8 border-dashed border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create New Project
            </CardTitle>
            <CardDescription>
              Start a new video editing project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="Enter project name (e.g., My Awesome Video)"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    createProject();
                  }
                }}
                disabled={creating}
              />
              <Button
                onClick={createProject}
                disabled={creating}
                className="whitespace-nowrap"
              >
                {creating ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Edit My Video — Mode 2 */}
        <Card className="mb-8 border-dashed border-2 border-blue-300 dark:border-blue-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileVideo className="w-5 h-5" />
              Edit My Video
            </CardTitle>
            <CardDescription>
              Upload your footage and AI will edit it automatically
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Background upload progress bar */}
            {uploadState.status !== 'idle' && uploadState.status !== 'complete' && (
              <div className="mb-3">
                <UploadProgressBar state={uploadState} />
              </div>
            )}

            {autoEditing ? (
              <div className="flex items-center gap-3 py-4">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{autoEditProgress}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="auto-edit-upload"
                  className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                >
                  <Video className="w-5 h-5 text-zinc-500" />
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Drop a video file or click to upload
                  </span>
                  <input
                    id="auto-edit-upload"
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // OLD: handleAutoEdit(file) — skipped options dialog
                      // NEW: open dialog so user can optionally set platform, intent, script
                      if (file) setPendingFile(file);
                      e.target.value = '';
                    }}
                    disabled={autoEditing}
                  />
                </label>
                <p className="text-xs text-zinc-500 dark:text-zinc-600">
                  AI will analyze your video, detect the best editing style, and apply transitions, captions, color grading, and more.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Projects Grid */}
        <div>
          <h2 className="text-2xl font-semibold mb-4">Your Projects</h2>
          
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-32 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Card className="p-12 text-center">
              <FileVideo className="w-16 h-16 mx-auto mb-4 text-zinc-400" />
              <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
              <p className="text-zinc-600 dark:text-zinc-400 mb-4">
                Create your first project to get started
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Card
                  key={project.projectId}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                >
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Video className="w-4 h-4" />
                      {project.name}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg h-32 flex items-center justify-center">
                      {project.thumbnail ? (
                        <img
                          src={project.thumbnail}
                          alt={project.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <FileVideo className="w-12 h-12 text-zinc-400" />
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
                      <span>{project.aspectRatio}</span>
                      <span>{Math.floor(project.durationInFrames / 30)}s</span>
                    </div>
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => openProject(project.projectId)}
                    >
                      Open
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteProjectId(project.projectId);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteProjectId !== null} onOpenChange={() => setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the project
              and all associated data including checkpoints and chat history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProjectId && deleteProject(deleteProjectId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mode 2 Options Dialog — opens after file pick, before upload */}
      <AutoEditDialog
        file={pendingFile}
        onConfirm={handleAutoEditConfirm}
        onCancel={() => setPendingFile(null)}
      />
    </div>
  );
}
