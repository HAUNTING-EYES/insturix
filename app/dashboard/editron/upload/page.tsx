import ProjectDashboard from "@/components/editron/project/project-dashboard";
import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";

// Footage uploader + existing project list (the previous Editron dashboard console).
// The new "New project" landing (/dashboard/editron) hands off here for footage upload and to
// reopen existing projects. Phase 2b will inline the auto-edit uploader into NewProjectFlow.
export default function EditronUploadPage() {
  return (
    <>
      <PipelineBreadcrumb currentStep="edit" />
      <ProjectDashboard />
    </>
  );
}
