import { PlatformTablePage } from "@/components/platform-table-page";
import { Platform } from "@/src/types";

export default function TikTokPage() {
  return (
    <PlatformTablePage
      platform={Platform.TIKTOK}
      title="TikTok Ads"
      description="Track TikTok ad campaign performance in one table."
    />
  );
}
