import { PipelineBreadcrumb } from "@/components/dashboard/shared/PipelineBreadcrumb";
import { SaasExplainerIntake } from "@/components/editron/saas-explainer/saas-explainer-intake";

export default function SaasExplainerPage() {
  return (
    <>
      <PipelineBreadcrumb currentStep="edit" />
      <SaasExplainerIntake />
    </>
  );
}