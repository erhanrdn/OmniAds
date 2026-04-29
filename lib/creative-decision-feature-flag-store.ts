import { getDb, type DbClient } from "@/lib/db";
import type {
  CreativeCanonicalCohort,
  CreativeCanonicalCohortAssignment,
  CreativeCanonicalCohortAssignmentSource,
  CreativeCanonicalResolverFlag,
  CreativeCanonicalResolverServerFlagRecord,
} from "@/lib/creative-decision-feature-flag";
import { resolveCanonicalCohortAssignment } from "@/lib/creative-decision-feature-flag";

function db(client?: DbClient) {
  return client ?? getDb();
}

export async function loadCreativeCanonicalResolverFlagAssignment(
  businessId: string,
  client?: DbClient,
): Promise<CreativeCanonicalResolverServerFlagRecord | null> {
  const rows = await db(client).query<{
    business_id: string;
    assignment: CreativeCanonicalResolverFlag;
    assigned_at: string | Date;
    source: CreativeCanonicalResolverServerFlagRecord["source"];
  }>(
    `
      SELECT business_id, assignment, assigned_at, source
      FROM creative_canonical_resolver_flags
      WHERE business_id = $1
      LIMIT 1
    `,
    [businessId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    businessId: row.business_id,
    assignment: row.assignment,
    assignedAt: new Date(row.assigned_at).toISOString(),
    source: row.source,
  };
}

export async function persistCreativeCanonicalResolverFlagAssignment(
  record: CreativeCanonicalResolverServerFlagRecord,
  client?: DbClient,
) {
  await db(client).query(
    `
      INSERT INTO creative_canonical_resolver_flags (
        business_id,
        assignment,
        source,
        assigned_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (business_id)
      DO UPDATE SET
        assignment = EXCLUDED.assignment,
        source = EXCLUDED.source,
        updated_at = now()
    `,
    [record.businessId, record.assignment, record.source, record.assignedAt],
  );
}

export async function loadCreativeCanonicalCohortAssignment(
  businessId: string,
  client?: DbClient,
): Promise<CreativeCanonicalCohortAssignment | null> {
  const rows = await db(client).query<{
    business_id: string;
    cohort: CreativeCanonicalCohort;
    source: CreativeCanonicalCohortAssignmentSource;
    assigned_at: string | Date;
    kill_switch_active_at: string | Date | null;
  }>(
    `
      SELECT business_id, cohort, source, assigned_at, kill_switch_active_at
      FROM creative_canonical_cohort_assignments
      WHERE business_id = $1
      LIMIT 1
    `,
    [businessId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    businessId: row.business_id,
    cohort: row.cohort,
    source: row.source,
    assignedAt: new Date(row.assigned_at).toISOString(),
    killSwitchActiveAt: row.kill_switch_active_at ? new Date(row.kill_switch_active_at).toISOString() : null,
  };
}

export async function persistCreativeCanonicalCohortAssignment(
  record: CreativeCanonicalCohortAssignment,
  client?: DbClient,
) {
  await db(client).query(
    `
      INSERT INTO creative_canonical_cohort_assignments (
        business_id,
        cohort,
        source,
        assigned_at,
        kill_switch_active_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (business_id)
      DO UPDATE SET
        cohort = EXCLUDED.cohort,
        source = EXCLUDED.source,
        kill_switch_active_at = EXCLUDED.kill_switch_active_at,
        updated_at = now()
    `,
    [
      record.businessId,
      record.cohort,
      record.source,
      record.assignedAt ?? new Date().toISOString(),
      record.killSwitchActiveAt ?? null,
    ],
  );
}

export async function loadCanonicalResolverAdminControls(client?: DbClient) {
  const [controlRows, killSwitchRows] = await Promise.all([
    db(client).query<{ control_type: string; business_id: string | null }>(
      `
        SELECT control_type, business_id
        FROM creative_canonical_resolver_admin_controls
        WHERE enabled = TRUE
      `,
    ),
    db(client).query<{ active: boolean; activated_at: string | Date | null }>(
      `
        SELECT active, activated_at
        FROM admin_feature_flag_kill_switches
        WHERE key = 'canonical-resolver-v1'
        LIMIT 1
      `,
    ),
  ]);
  const allowlist = controlRows
    .filter((row) => row.control_type === "allowlist" && row.business_id)
    .map((row) => row.business_id as string);
  const blocklist = controlRows
    .filter((row) => row.control_type === "blocklist" && row.business_id)
    .map((row) => row.business_id as string);
  const killSwitch = killSwitchRows[0]?.active === true;
  return {
    allowlist,
    blocklist,
    killSwitch,
    killSwitchActiveAt: killSwitchRows[0]?.activated_at
      ? new Date(killSwitchRows[0].activated_at).toISOString()
      : null,
  };
}

export async function resolvePersistedCanonicalCohortAssignment(input: {
  businessId: string;
  rolloutPercent?: number | null;
}, client?: DbClient) {
  const [existing, controls] = await Promise.all([
    loadCreativeCanonicalCohortAssignment(input.businessId, client),
    loadCanonicalResolverAdminControls(client),
  ]);
  const assignment = resolveCanonicalCohortAssignment({
    businessId: input.businessId,
    rolloutPercent: input.rolloutPercent ?? 0,
    existingAssignment: existing?.cohort ?? null,
    existingAssignedAt: existing?.assignedAt ?? null,
    killSwitch: controls.killSwitch,
    killSwitchActiveAt: controls.killSwitchActiveAt,
    adminAllowlist: controls.allowlist,
    adminBlocklist: controls.blocklist,
  });
  if (
    assignment.source === "rollout_percent_assigned" ||
    assignment.source === "allowlist" ||
    assignment.source === "blocklist" ||
    assignment.source === "kill_switch"
  ) {
    await persistCreativeCanonicalCohortAssignment(assignment, client);
  }
  return assignment;
}
