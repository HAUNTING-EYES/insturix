'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { Plus, Video, Clock, Trash2, FileVideo, FileText, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
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
  const [showScriptImport, setShowScriptImport] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [importing, setImporting] = useState(false);

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

  const importFromScript = async () => {
    if (!scriptText.trim()) {
      toast({ variant: 'destructive', title: 'Error', description: 'Please paste a script' });
      return;
    }
    try {
      setImporting(true);

      // Step 1: Convert plain text to scenes
      const exportRes = await fetch('/api/services/thinkforge/script/export-for-editron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plainText: scriptText }),
      });
      if (!exportRes.ok) throw new Error('Failed to parse script');
      const exportData = await exportRes.json();

      // Step 2: Import scenes into Editron
      const importRes = await fetch('/api/services/editron/projects/import-from-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: exportData.scenes,
          title: exportData.title,
          aspectRatio: '16:9',
        }),
      });
      if (!importRes.ok) throw new Error('Failed to create project');
      const importData = await importRes.json();

      toast({ title: 'Success', description: `Created project with ${exportData.sceneCount} scenes` });
      router.push(`/dashboard/editron/project/${importData.projectId}`);
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: getUserFriendlyErrorMessage(error) });
    } finally {
      setImporting(false);
    }
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
              <Button
                variant="outline"
                onClick={() => setShowScriptImport(!showScriptImport)}
                className="whitespace-nowrap border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/10"
              >
                <FileText className="h-4 w-4 mr-2" />
                From Script
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Import from Script (collapsible) */}
        {showScriptImport && (
          <Card className="mb-8 border border-green-500/20 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5 text-green-500" />
                Import from Script
              </CardTitle>
              <CardDescription>
                Paste a script or outline — each section becomes a scene on your timeline
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder={'# Scene 1: Opening Hook\nStart with an attention-grabbing question...\n\n# Scene 2: Main Content\nExplain the core idea...'}
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                rows={6}
                className="resize-none"
                disabled={importing}
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setShowScriptImport(false); setScriptText(''); }}
                  disabled={importing}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={importFromScript}
                  disabled={importing || !scriptText.trim()}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    'Create Project from Script'
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

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
    </div>
  );
}
