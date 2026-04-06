export function getCurrentRuntimeBuildId() {
  return (
    process.env.APP_BUILD_ID?.trim() ||
    process.env.NEXT_BUILD_ID?.trim() ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.RENDER_GIT_COMMIT?.trim() ||
    "dev-build"
  );
}
