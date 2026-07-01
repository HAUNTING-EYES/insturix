import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";
import NewProjectFlow from "@/components/editron/project/new-project-flow";

// Editron dashboard landing = the founder-finalized "New project" start screen.
// The old console (footage uploader + project list) is preserved at /dashboard/editron/upload,
// which the flow's Upload door + Projects link hand off to (Phase 2b will inline the uploader).
export default function EditronDashboard() {
  return (
    <>
      <PipelineBreadcrumb currentStep="edit" />
      <div style={{ padding: "26px 0" }}>
        <NewProjectFlow />
      </div>
    </>
  );
}
