import { PlatformTablePage } from "@/components/platform-table-page";
import { Platform } from "@/src/types";

export default function PinterestPage() {
  return (
    <PlatformTablePage
      platform={Platform.PINTEREST}
      title="Pinterest Ads"
      description="Analyze Pinterest campaign metrics and outcomes."
    />
  );
}
