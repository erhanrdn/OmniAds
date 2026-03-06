import type { Metadata } from "next";
import { PublicCreativeSharePage } from "@/components/creatives/PublicCreativeSharePage";
import { MOCK_SHARE_PAYLOAD } from "@/components/creatives/shareCreativeMock";

export const metadata: Metadata = {
  title: "Shared Creatives",
  robots: { index: false, follow: false },
};

/**
 * Public share page — no auth required.
 * In production: fetch share payload from backend using `token`.
 * For now, renders mock data.
 */
export default async function ShareCreativePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await params; // token available for future backend call
  // TODO: const payload = await fetchSharePayload(token);
  const payload = MOCK_SHARE_PAYLOAD;

  return <PublicCreativeSharePage payload={payload} />;
}
