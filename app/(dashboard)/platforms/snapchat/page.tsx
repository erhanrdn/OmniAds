import { PlatformTablePage } from "@/components/platform-table-page";
import { Platform } from "@/src/types";

export default function SnapchatPage() {
  return (
    <PlatformTablePage
      platform={Platform.SNAPCHAT}
      title="Snapchat Ads"
      description="Monitor Snapchat campaign-level spend and conversion data."
    />
  );
}
