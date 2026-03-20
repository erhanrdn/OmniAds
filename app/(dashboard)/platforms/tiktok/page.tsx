import { PlatformTablePage } from "@/components/platform-table-page";
import { Platform } from "@/src/types";
import { PlanGate } from "@/components/pricing/PlanGate";

export default function TikTokPage() {
  return (
    <PlanGate requiredPlan="pro">
      <PlatformTablePage
        platform={Platform.TIKTOK}
        title="TikTok Ads"
        description="Track TikTok ad campaign performance in one table."
      />
    </PlanGate>
  );
}
