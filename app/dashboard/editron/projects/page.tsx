import ProjectsView from '@/components/editron/project/projects-view';
import { PipelineBreadcrumb } from '@/components/dashboard/shared/PipelineBreadcrumb';

// Clean "your projects" browser — the New Project flow's Projects / View-all destination.
export default function EditronProjectsPage() {
  return (
    <>
      <PipelineBreadcrumb currentStep="edit" />
      <ProjectsView />
    </>
  );
}
