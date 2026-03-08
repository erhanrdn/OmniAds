import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicCreativeSharePage } from "@/components/creatives/PublicCreativeSharePage";
import { MOCK_SHARE_PAYLOAD } from "@/components/creatives/shareCreativeMock";
import { getCreativeShareSnapshot } from "@/lib/creative-share-store";

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
  const { token } = await params;
  const payload = token === MOCK_SHARE_PAYLOAD.token
    ? MOCK_SHARE_PAYLOAD
    : await getCreativeShareSnapshot(token);
  if (!payload) notFound();

  return <PublicCreativeSharePage payload={payload} />;
}
