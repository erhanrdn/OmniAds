import { PlatformTablePage } from "@/components/platform-table-page";
import { Platform } from "@/src/types";
import { PlanGate } from "@/components/pricing/PlanGate";

export default function SnapchatPage() {
  return (
    <PlanGate requiredPlan="pro">
      <PlatformTablePage
        platform={Platform.SNAPCHAT}
        title="Snapchat Ads"
        description="Monitor Snapchat campaign-level spend and conversion data."
      />
    </PlanGate>
  );
}
