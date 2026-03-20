import { PlatformTablePage } from "@/components/platform-table-page";
import { Platform } from "@/src/types";
import { PlanGate } from "@/components/pricing/PlanGate";

export default function PinterestPage() {
  return (
    <PlanGate requiredPlan="pro">
      <PlatformTablePage
        platform={Platform.PINTEREST}
        title="Pinterest Ads"
        description="Analyze Pinterest campaign metrics and outcomes."
      />
    </PlanGate>
  );
}
