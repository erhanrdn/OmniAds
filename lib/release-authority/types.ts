export const RELEASE_AUTHORITY_SCHEMA_VERSION = "release-authority.v1" as const;
export const RELEASE_AUTHORITY_REPOSITORY = {
  owner: "erhanrdn",
  name: "OmniAds",
  fullName: "erhanrdn/OmniAds",
  branch: "main",
} as const;

export type ReleaseAuthorityRepositoryState = "merged";
export type ReleaseAuthorityRuntimeState =
  | "live"
  | "flagged"
  | "legacy"
  | "hidden";
export type ReleaseAuthorityDocsState = "current" | "legacy" | "missing";
export type ReleaseAuthorityDriftState = "aligned" | "drifted" | "unknown";
export type ReleaseAuthorityFlagMode = "enabled" | "disabled" | "allowlist";
export type ReleaseAuthorityReferenceKind =
  | "page"
  | "api"
  | "component"
  | "doc"
  | "alias";

export interface ReleaseAuthorityFlagPosture {
  mode: ReleaseAuthorityFlagMode;
  flagKeys: string[];
  summary: string;
}

export interface ReleaseAuthorityReference {
  kind: ReleaseAuthorityReferenceKind;
  path: string;
  label: string;
}

export interface ReleaseAuthoritySurfaceDefinition {
  id: string;
  label: string;
  area:
    | "commercial"
    | "meta"
    | "creative"
    | "workflow"
    | "execution"
    | "copy"
    | "legacy";
  repositoryState: ReleaseAuthorityRepositoryState;
  runtimeState:
    | ReleaseAuthorityRuntimeState
    | ((input: {
        flagPosture: ReleaseAuthorityFlagPosture | null;
      }) => ReleaseAuthorityRuntimeState);
  docsState: ReleaseAuthorityDocsState;
  flagResolver?: () => ReleaseAuthorityFlagPosture | null;
  references: ReleaseAuthorityReference[];
  notes: string[];
}

export interface ReleaseAuthoritySurface {
  id: string;
  label: string;
  area: ReleaseAuthoritySurfaceDefinition["area"];
  repositoryState: ReleaseAuthorityRepositoryState;
  runtimeState: ReleaseAuthorityRuntimeState;
  docsState: ReleaseAuthorityDocsState;
  flagPosture: ReleaseAuthorityFlagPosture | null;
  driftState: ReleaseAuthorityDriftState;
  driftReasons: string[];
  references: ReleaseAuthorityReference[];
  notes: string[];
}

export interface ReleaseAuthorityVerdict {
  status: ReleaseAuthorityDriftState;
  summary: string;
  blocking: boolean;
}

export interface ReleaseAuthorityDriftItem {
  id: string;
  scope: "release" | "surface" | "docs" | "flags";
  status: Exclude<ReleaseAuthorityDriftState, "aligned">;
  surfaceId?: string;
  detail: string;
}

export interface ReleaseAuthorityCarryForwardItem {
  id: string;
  surfaceId: string;
  label: string;
  status: "accepted_gap" | "complete";
  proofLevel: string | null;
  detail: string;
  nextRequirement: string;
}

export interface ReleaseAuthorityReport {
  schemaVersion: typeof RELEASE_AUTHORITY_SCHEMA_VERSION;
  generatedAt: string;
  runtime: {
    nodeEnv: string;
    currentLiveSha: string;
    currentLiveShaSource: "build_runtime";
    currentMainSha: string | null;
    currentMainShaSource:
      | "github_branch_head"
      | "env_override"
      | "git_remote"
      | "unresolved";
  };
  release: {
    repository: typeof RELEASE_AUTHORITY_REPOSITORY;
    deployUrl: string;
    buildInfoUrl: string;
    releaseAuthorityUrl: string;
    previousKnownGoodSha: string;
    previousKnownGoodSource: string;
    featureAuthoritySource: {
      manifestModule: string;
      apiRoute: string;
      adminRoute: string;
      canonicalDoc: string;
    };
  };
  verdicts: {
    liveVsMain: ReleaseAuthorityVerdict;
    docsVsRuntime: ReleaseAuthorityVerdict;
    flagsVsRuntime: ReleaseAuthorityVerdict;
    liveMainDocs: ReleaseAuthorityVerdict;
    overall: ReleaseAuthorityVerdict;
  };
  surfaces: ReleaseAuthoritySurface[];
  unresolvedDriftItems: ReleaseAuthorityDriftItem[];
  carryForward: {
    summary: string;
    acceptanceGaps: ReleaseAuthorityCarryForwardItem[];
  };
  reviewOrder: string[];
}
