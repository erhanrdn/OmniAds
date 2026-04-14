export interface GlobalOperatorReviewWorkflow {
  decisionModel: "global";
  adminSurface: "/admin/sync-health";
  executionReviewCommand: "npm run ops:execution-readiness-review";
  googleStatus: "/api/google-ads/status?businessId=<businessId>";
  metaStatus: "/api/meta/status?businessId=<businessId>";
  providerDrilldownRole: "explanatory_only";
  readyMeans: "evidence_only";
  automaticEnablement: false;
  summary: string;
}

export const GLOBAL_OPERATOR_REVIEW_WORKFLOW: GlobalOperatorReviewWorkflow = {
  decisionModel: "global",
  adminSurface: "/admin/sync-health",
  executionReviewCommand: "npm run ops:execution-readiness-review",
  googleStatus: "/api/google-ads/status?businessId=<businessId>",
  metaStatus: "/api/meta/status?businessId=<businessId>",
  providerDrilldownRole: "explanatory_only",
  readyMeans: "evidence_only",
  automaticEnablement: false,
  summary:
    "Use /admin/sync-health or npm run ops:execution-readiness-review as the global operator decision surface. Provider status endpoints explain business-scoped evidence only. Ready means evidence only and never auto-enables execution.",
};
