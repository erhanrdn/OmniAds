import { getCurrentRuntimeBuildId } from "@/lib/build-runtime";

export interface SyncControlPlaneKey {
  buildId: string;
  environment: string;
  providerScope: string;
}

export function resolveSyncControlPlaneKey(input?: {
  buildId?: string;
  environment?: string;
  providerScope?: string;
}): SyncControlPlaneKey {
  return {
    buildId: input?.buildId ?? getCurrentRuntimeBuildId(),
    environment: input?.environment ?? process.env.NODE_ENV ?? "unknown",
    providerScope: input?.providerScope ?? "meta",
  };
}
