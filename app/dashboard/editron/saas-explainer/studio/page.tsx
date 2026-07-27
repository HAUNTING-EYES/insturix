import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";
import SaasExplainerStudio from "@/components/editron/saas-explainer/saas-explainer-studio";

/**
 * Premium SaaS explainer studio — script → render → result, all in one surface.
 * Mounted alongside the existing draft intake (which stays live) at /dashboard/editron/saas-explainer/studio.
 */
export default function SaasExplainerStudioPage() {
  return (
    <>
      <PipelineBreadcrumb currentStep="edit" />
      <SaasExplainerStudio />
    </>
  );
}
