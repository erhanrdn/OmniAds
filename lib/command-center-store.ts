import { getDb } from "@/lib/db";
import {
  assertDbSchemaReady,
  getDbSchemaReadiness,
} from "@/lib/db-schema-readiness";
import { canEdit, type MembershipRole } from "@/lib/auth";
import { isDemoBusinessId } from "@/lib/demo-business";
import { isReviewerEmail } from "@/lib/reviewer-access";
import type {
  CommandCenterAction,
  CommandCenterActionMutation,
  CommandCenterActionStateRecord,
  CommandCenterActionStatus,
  CommandCenterAssignableUser,
  CommandCenterHandoff,
  CommandCenterJournalEntry,
  CommandCenterPermissions,
  CommandCenterSavedView,
  CommandCenterSavedViewDefinition,
  CommandCenterShift,
  CommandCenterSourceSystem,
  CommandCenterSourceType,
} from "@/lib/command-center";
import {
  buildCommandCenterJournalMessage,
  buildCommandCenterViewKey,
  canTransitionCommandCenterStatus,
  getBuiltInCommandCenterSavedViews,
  isAssignableCommandCenterRole,
  resolveNextCommandCenterStatus,
  sanitizeCommandCenterSavedViewDefinition,
} from "@/lib/command-center";

const COMMAND_CENTER_TABLES = [
  "command_center_action_state",
  "command_center_action_journal",
  "command_center_saved_views",
  "command_center_handoffs",
] as const;

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseJsonArray(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function parseJsonObject(
  value: unknown,
): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseJsonObject(parsed);
    } catch {
      return {};
    }
  }
  return {};
}

export function getCommandCenterReadOnlyReason(input: {
  businessId: string;
  email: string | null | undefined;
}) {
  if (isDemoBusinessId(input.businessId) && isReviewerEmail(input.email)) {
    return "The seeded reviewer remains read-only on the canonical demo business.";
  }
  return null;
}

export function getCommandCenterPermissions(input: {
  businessId: string;
  email: string | null | undefined;
  role: MembershipRole;
}): CommandCenterPermissions {
  const reason = getCommandCenterReadOnlyReason({
    businessId: input.businessId,
    email: input.email,
  });
  return {
    canEdit: !reason && canEdit(input.role),
    reason,
    role: input.role,
  };
}

export async function listAssignableCommandCenterUsers(
  businessId: string,
): Promise<CommandCenterAssignableUser[]> {
  const readiness = await getDbSchemaReadiness({
    tables: ["memberships", "users"],
  }).catch(() => null);
  if (!readiness?.ready) return [];

  const sql = getDb();
  const rows = (await sql`
    SELECT u.id AS user_id, u.name, u.email, m.role
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.business_id = ${businessId}
      AND m.status = 'active'
      AND m.role IN ('admin', 'collaborator')
    ORDER BY
      CASE m.role WHEN 'admin' THEN 0 ELSE 1 END,
      lower(u.name) ASC,
      lower(u.email) ASC
  `) as Array<{
    user_id: string;
    name: string;
    email: string;
    role: MembershipRole;
  }>;

  return rows
    .filter((row) => isAssignableCommandCenterRole(row.role))
    .map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role as "admin" | "collaborator",
    }));
}

export async function listCommandCenterActionStates(
  businessId: string,
): Promise<Map<string, CommandCenterActionStateRecord>> {
  const readiness = await getDbSchemaReadiness({
    tables: ["command_center_action_state", "users"],
  }).catch(() => null);
  if (!readiness?.ready) return new Map();

  const sql = getDb();
  const rows = (await sql`
    SELECT
      state.business_id,
      state.action_fingerprint,
      state.source_system,
      state.source_type,
      state.action_title,
      state.recommended_action,
      state.workflow_status,
      state.assignee_user_id,
      assignee.name AS assignee_name,
      state.snooze_until,
      state.latest_note_excerpt,
      state.note_count,
      state.last_mutation_id,
      state.last_mutated_at,
      state.created_at,
      state.updated_at
    FROM command_center_action_state state
    LEFT JOIN users assignee ON assignee.id = state.assignee_user_id
    WHERE state.business_id = ${businessId}
  `) as Array<{
    business_id: string;
    action_fingerprint: string;
    source_system: CommandCenterSourceSystem;
    source_type: CommandCenterSourceType;
    action_title: string;
    recommended_action: string;
    workflow_status: CommandCenterActionStatus;
    assignee_user_id: string | null;
    assignee_name: string | null;
    snooze_until: string | null;
    latest_note_excerpt: string | null;
    note_count: number | null;
    last_mutation_id: string | null;
    last_mutated_at: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return new Map(
    rows.map((row) => [
      row.action_fingerprint,
      {
        businessId: row.business_id,
        actionFingerprint: row.action_fingerprint,
        sourceSystem: row.source_system,
        sourceType: row.source_type,
        actionTitle: row.action_title,
        recommendedAction: row.recommended_action,
        workflowStatus: row.workflow_status,
        assigneeUserId: row.assignee_user_id,
        assigneeName: row.assignee_name,
        snoozeUntil: row.snooze_until,
        latestNoteExcerpt: row.latest_note_excerpt,
        noteCount: Number(row.note_count ?? 0),
        lastMutationId: row.last_mutation_id,
        lastMutatedAt: row.last_mutated_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    ]),
  );
}

export async function listCommandCenterJournal(input: {
  businessId: string;
  actionFingerprint?: string | null;
  limit?: number;
}): Promise<CommandCenterJournalEntry[]> {
  const readiness = await getDbSchemaReadiness({
    tables: ["command_center_action_journal", "users"],
  }).catch(() => null);
  if (!readiness?.ready) return [];

  const sql = getDb();
  const params: unknown[] = [input.businessId];
  let query = `
    SELECT
      journal.id,
      journal.business_id,
      journal.action_fingerprint,
      journal.action_title,
      journal.source_system,
      journal.source_type,
      journal.event_type,
      journal.actor_user_id,
      actor.name AS actor_name,
      actor.email AS actor_email,
      journal.message,
      journal.note,
      journal.metadata_json,
      journal.created_at
    FROM command_center_action_journal journal
    LEFT JOIN users actor ON actor.id = journal.actor_user_id
    WHERE journal.business_id = $1
  `;

  if (input.actionFingerprint) {
    params.push(input.actionFingerprint);
    query += ` AND journal.action_fingerprint = $${params.length}`;
  }

  params.push(Math.max(1, Math.min(input.limit ?? 50, 200)));
  query += ` ORDER BY journal.created_at DESC LIMIT $${params.length}`;

  const rows = (await sql.query(query, params)) as Array<{
    id: string;
    business_id: string;
    action_fingerprint: string;
    action_title: string;
    source_system: CommandCenterSourceSystem;
    source_type: CommandCenterSourceType;
    event_type: CommandCenterJournalEntry["eventType"];
    actor_user_id: string;
    actor_name: string | null;
    actor_email: string | null;
    message: string;
    note: string | null;
    metadata_json: unknown;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    actionFingerprint: row.action_fingerprint,
    actionTitle: row.action_title,
    sourceSystem: row.source_system,
    sourceType: row.source_type,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    message: row.message,
    note: row.note,
    metadata: parseJsonObject(row.metadata_json),
    createdAt: row.created_at,
  }));
}

export async function listCommandCenterSavedViews(
  businessId: string,
): Promise<CommandCenterSavedView[]> {
  const builtIns = getBuiltInCommandCenterSavedViews(businessId);
  const readiness = await getDbSchemaReadiness({
    tables: ["command_center_saved_views"],
  }).catch(() => null);
  if (!readiness?.ready) return builtIns;

  const sql = getDb();
  const rows = (await sql`
    SELECT id, business_id, view_key, name, definition_json, created_at, updated_at
    FROM command_center_saved_views
    WHERE business_id = ${businessId}
    ORDER BY lower(name) ASC
  `) as Array<{
    id: string;
    business_id: string;
    view_key: string;
    name: string;
    definition_json: unknown;
    created_at: string;
    updated_at: string;
  }>;

  const customViews = rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    viewKey: row.view_key,
    name: row.name,
    definition: sanitizeCommandCenterSavedViewDefinition(row.definition_json),
    isBuiltIn: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return [...builtIns, ...customViews];
}

export async function createCommandCenterSavedView(input: {
  businessId: string;
  name: string;
  definition: CommandCenterSavedViewDefinition;
}): Promise<CommandCenterSavedView> {
  await assertDbSchemaReady({
    tables: ["command_center_saved_views"],
    context: "command_center:create_saved_view",
  });

  const sql = getDb();
  const viewKey = buildCommandCenterViewKey(input.name);
  const sanitizedDefinition = sanitizeCommandCenterSavedViewDefinition(input.definition);
  const rows = (await sql`
    INSERT INTO command_center_saved_views (
      business_id,
      view_key,
      name,
      definition_json
    )
    VALUES (
      ${input.businessId},
      ${viewKey},
      ${input.name.trim()},
      ${JSON.stringify(sanitizedDefinition)}
    )
    ON CONFLICT (business_id, view_key)
    DO UPDATE SET
      name = EXCLUDED.name,
      definition_json = EXCLUDED.definition_json,
      updated_at = now()
    RETURNING id, business_id, view_key, name, definition_json, created_at, updated_at
  `) as Array<{
    id: string;
    business_id: string;
    view_key: string;
    name: string;
    definition_json: unknown;
    created_at: string;
    updated_at: string;
  }>;

  const row = rows[0]!;
  return {
    id: row.id,
    businessId: row.business_id,
    viewKey: row.view_key,
    name: row.name,
    definition: sanitizeCommandCenterSavedViewDefinition(row.definition_json),
    isBuiltIn: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateCommandCenterSavedView(input: {
  businessId: string;
  viewKey: string;
  name: string;
  definition: CommandCenterSavedViewDefinition;
}): Promise<CommandCenterSavedView | null> {
  await assertDbSchemaReady({
    tables: ["command_center_saved_views"],
    context: "command_center:update_saved_view",
  });

  const sql = getDb();
  const rows = (await sql`
    UPDATE command_center_saved_views
    SET
      name = ${input.name.trim()},
      definition_json = ${JSON.stringify(
        sanitizeCommandCenterSavedViewDefinition(input.definition),
      )},
      updated_at = now()
    WHERE business_id = ${input.businessId}
      AND view_key = ${input.viewKey}
    RETURNING id, business_id, view_key, name, definition_json, created_at, updated_at
  `) as Array<{
    id: string;
    business_id: string;
    view_key: string;
    name: string;
    definition_json: unknown;
    created_at: string;
    updated_at: string;
  }>;

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    viewKey: row.view_key,
    name: row.name,
    definition: sanitizeCommandCenterSavedViewDefinition(row.definition_json),
    isBuiltIn: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteCommandCenterSavedView(input: {
  businessId: string;
  viewKey: string;
}) {
  await assertDbSchemaReady({
    tables: ["command_center_saved_views"],
    context: "command_center:delete_saved_view",
  });
  const sql = getDb();
  await sql`
    DELETE FROM command_center_saved_views
    WHERE business_id = ${input.businessId}
      AND view_key = ${input.viewKey}
  `;
}

export async function listCommandCenterHandoffs(input: {
  businessId: string;
  shift?: CommandCenterShift | null;
  limit?: number;
}): Promise<CommandCenterHandoff[]> {
  const readiness = await getDbSchemaReadiness({
    tables: ["command_center_handoffs", "users"],
  }).catch(() => null);
  if (!readiness?.ready) return [];

  const sql = getDb();
  const params: unknown[] = [input.businessId];
  let query = `
    SELECT
      handoff.id,
      handoff.business_id,
      handoff.shift,
      handoff.summary,
      handoff.blockers_json,
      handoff.watchouts_json,
      handoff.linked_action_fingerprints,
      handoff.from_user_id,
      from_user.name AS from_user_name,
      handoff.to_user_id,
      to_user.name AS to_user_name,
      handoff.acknowledged_at,
      handoff.acknowledged_by_user_id,
      ack_user.name AS acknowledged_by_user_name,
      handoff.created_at,
      handoff.updated_at
    FROM command_center_handoffs handoff
    LEFT JOIN users from_user ON from_user.id = handoff.from_user_id
    LEFT JOIN users to_user ON to_user.id = handoff.to_user_id
    LEFT JOIN users ack_user ON ack_user.id = handoff.acknowledged_by_user_id
    WHERE handoff.business_id = $1
  `;
  if (input.shift) {
    params.push(input.shift);
    query += ` AND handoff.shift = $${params.length}`;
  }
  params.push(Math.max(1, Math.min(input.limit ?? 20, 100)));
  query += ` ORDER BY handoff.updated_at DESC LIMIT $${params.length}`;

  const rows = (await sql.query(query, params)) as Array<{
    id: string;
    business_id: string;
    shift: CommandCenterShift;
    summary: string;
    blockers_json: unknown;
    watchouts_json: unknown;
    linked_action_fingerprints: unknown;
    from_user_id: string;
    from_user_name: string | null;
    to_user_id: string | null;
    to_user_name: string | null;
    acknowledged_at: string | null;
    acknowledged_by_user_id: string | null;
    acknowledged_by_user_name: string | null;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    shift: row.shift,
    summary: row.summary,
    blockers: parseJsonArray(row.blockers_json),
    watchouts: parseJsonArray(row.watchouts_json),
    linkedActionFingerprints: parseJsonArray(row.linked_action_fingerprints),
    fromUserId: row.from_user_id,
    fromUserName: row.from_user_name,
    toUserId: row.to_user_id,
    toUserName: row.to_user_name,
    acknowledgedAt: row.acknowledged_at,
    acknowledgedByUserId: row.acknowledged_by_user_id,
    acknowledgedByUserName: row.acknowledged_by_user_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createCommandCenterHandoff(input: {
  businessId: string;
  shift: CommandCenterShift;
  summary: string;
  blockers: string[];
  watchouts: string[];
  linkedActionFingerprints: string[];
  fromUserId: string;
  toUserId?: string | null;
}) {
  await assertDbSchemaReady({
    tables: ["command_center_handoffs"],
    context: "command_center:create_handoff",
  });

  const sql = getDb();
  const rows = (await sql`
    INSERT INTO command_center_handoffs (
      business_id,
      shift,
      summary,
      blockers_json,
      watchouts_json,
      linked_action_fingerprints,
      from_user_id,
      to_user_id
    )
    VALUES (
      ${input.businessId},
      ${input.shift},
      ${input.summary.trim()},
      ${JSON.stringify(input.blockers.filter(Boolean))},
      ${JSON.stringify(input.watchouts.filter(Boolean))},
      ${input.linkedActionFingerprints.filter(Boolean)},
      ${input.fromUserId},
      ${input.toUserId ?? null}
    )
    RETURNING id
  `) as Array<{ id: string }>;

  const handoffs = await listCommandCenterHandoffs({
    businessId: input.businessId,
    limit: 50,
  });
  return handoffs.find((handoff) => handoff.id === rows[0]?.id) ?? null;
}

export async function updateCommandCenterHandoff(input: {
  businessId: string;
  handoffId: string;
  summary: string;
  blockers: string[];
  watchouts: string[];
  linkedActionFingerprints: string[];
  toUserId?: string | null;
}) {
  await assertDbSchemaReady({
    tables: ["command_center_handoffs"],
    context: "command_center:update_handoff",
  });

  const sql = getDb();
  await sql`
    UPDATE command_center_handoffs
    SET
      summary = ${input.summary.trim()},
      blockers_json = ${JSON.stringify(input.blockers.filter(Boolean))},
      watchouts_json = ${JSON.stringify(input.watchouts.filter(Boolean))},
      linked_action_fingerprints = ${input.linkedActionFingerprints.filter(Boolean)},
      to_user_id = ${input.toUserId ?? null},
      updated_at = now()
    WHERE id = ${input.handoffId}
      AND business_id = ${input.businessId}
  `;

  const handoffs = await listCommandCenterHandoffs({
    businessId: input.businessId,
    limit: 50,
  });
  return handoffs.find((handoff) => handoff.id === input.handoffId) ?? null;
}

export async function acknowledgeCommandCenterHandoff(input: {
  businessId: string;
  handoffId: string;
  userId: string;
}) {
  await assertDbSchemaReady({
    tables: ["command_center_handoffs"],
    context: "command_center:ack_handoff",
  });

  const sql = getDb();
  await sql`
    UPDATE command_center_handoffs
    SET
      acknowledged_at = now(),
      acknowledged_by_user_id = ${input.userId},
      updated_at = now()
    WHERE id = ${input.handoffId}
      AND business_id = ${input.businessId}
  `;

  const handoffs = await listCommandCenterHandoffs({
    businessId: input.businessId,
    limit: 50,
  });
  return handoffs.find((handoff) => handoff.id === input.handoffId) ?? null;
}

async function getCommandCenterStateRecord(input: {
  businessId: string;
  actionFingerprint: string;
}) {
  const stateMap = await listCommandCenterActionStates(input.businessId);
  return stateMap.get(input.actionFingerprint) ?? null;
}

async function writeCommandCenterJournal(input: {
  businessId: string;
  clientMutationId: string;
  action: CommandCenterAction;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  eventType: CommandCenterJournalEntry["eventType"];
  message: string;
  note: string | null;
  metadata: Record<string, unknown>;
}) {
  await assertDbSchemaReady({
    tables: ["command_center_action_journal"],
    context: "command_center:write_journal",
  });
  const sql = getDb();
  await sql`
    INSERT INTO command_center_action_journal (
      business_id,
      action_fingerprint,
      action_title,
      source_system,
      source_type,
      event_type,
      actor_user_id,
      client_mutation_id,
      message,
      note,
      metadata_json
    )
    VALUES (
      ${input.businessId},
      ${input.action.actionFingerprint},
      ${input.action.title},
      ${input.action.sourceSystem},
      ${input.action.sourceType},
      ${input.eventType},
      ${input.actorUserId},
      ${input.clientMutationId},
      ${input.message},
      ${input.note},
      ${JSON.stringify(input.metadata)}
    )
    ON CONFLICT (business_id, client_mutation_id) DO NOTHING
  `;
}

async function upsertCommandCenterActionState(input: {
  action: CommandCenterAction;
  businessId: string;
  nextStatus: CommandCenterActionStatus;
  assigneeUserId: string | null;
  assigneeName: string | null;
  snoozeUntil: string | null;
  latestNoteExcerpt: string | null;
  noteCount: number;
  clientMutationId: string;
}) {
  await assertDbSchemaReady({
    tables: ["command_center_action_state"],
    context: "command_center:upsert_action_state",
  });
  const sql = getDb();
  const rows = (await sql`
    INSERT INTO command_center_action_state (
      business_id,
      action_fingerprint,
      source_system,
      source_type,
      action_title,
      recommended_action,
      workflow_status,
      assignee_user_id,
      snooze_until,
      latest_note_excerpt,
      note_count,
      last_mutation_id,
      last_mutated_at
    )
    VALUES (
      ${input.businessId},
      ${input.action.actionFingerprint},
      ${input.action.sourceSystem},
      ${input.action.sourceType},
      ${input.action.title},
      ${input.action.recommendedAction},
      ${input.nextStatus},
      ${input.assigneeUserId},
      ${input.snoozeUntil},
      ${input.latestNoteExcerpt},
      ${input.noteCount},
      ${input.clientMutationId},
      now()
    )
    ON CONFLICT (business_id, action_fingerprint)
    DO UPDATE SET
      source_system = EXCLUDED.source_system,
      source_type = EXCLUDED.source_type,
      action_title = EXCLUDED.action_title,
      recommended_action = EXCLUDED.recommended_action,
      workflow_status = EXCLUDED.workflow_status,
      assignee_user_id = EXCLUDED.assignee_user_id,
      snooze_until = EXCLUDED.snooze_until,
      latest_note_excerpt = EXCLUDED.latest_note_excerpt,
      note_count = EXCLUDED.note_count,
      last_mutation_id = EXCLUDED.last_mutation_id,
      last_mutated_at = EXCLUDED.last_mutated_at,
      updated_at = now()
    RETURNING business_id, action_fingerprint
  `) as Array<{
    business_id: string;
    action_fingerprint: string;
  }>;

  const state = await getCommandCenterStateRecord({
    businessId: rows[0]!.business_id,
    actionFingerprint: rows[0]!.action_fingerprint,
  });
  return state;
}

export async function applyCommandCenterActionMutation(input: {
  businessId: string;
  action: CommandCenterAction;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  clientMutationId: string;
  mutation: CommandCenterActionMutation;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  snoozeUntil?: string | null;
}) {
  await assertDbSchemaReady({
    tables: [...COMMAND_CENTER_TABLES],
    context: "command_center:apply_action_mutation",
  });

  const current =
    (await getCommandCenterStateRecord({
      businessId: input.businessId,
      actionFingerprint: input.action.actionFingerprint,
    })) ?? null;

  if (current?.lastMutationId === input.clientMutationId) {
    return current;
  }

  const currentStatus = current?.workflowStatus ?? "pending";
  const nextStatus = resolveNextCommandCenterStatus({
    currentStatus,
    mutation: input.mutation,
  });

  if (
    input.mutation !== "assign" &&
    nextStatus !== currentStatus &&
    !canTransitionCommandCenterStatus(currentStatus, nextStatus)
  ) {
    throw new Error(
      `Invalid workflow transition from ${currentStatus} to ${nextStatus}.`,
    );
  }

  const nextAssigneeUserId =
    input.mutation === "assign"
      ? input.assigneeUserId ?? null
      : current?.assigneeUserId ?? input.action.assigneeUserId ?? null;
  const nextAssigneeName =
    input.mutation === "assign"
      ? input.assigneeName ?? null
      : current?.assigneeName ?? input.action.assigneeName ?? null;
  const nextSnoozeUntil =
    input.mutation === "snooze"
      ? input.snoozeUntil ?? null
      : input.mutation === "reopen"
        ? null
        : current?.snoozeUntil ?? input.action.snoozeUntil ?? null;

  await writeCommandCenterJournal({
    businessId: input.businessId,
    clientMutationId: input.clientMutationId,
    action: input.action,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    eventType:
      input.mutation === "assign" ? "assignee_changed" : "status_changed",
    message: buildCommandCenterJournalMessage({
      mutation: input.mutation,
      actionTitle: input.action.title,
      nextStatus,
      assigneeName: nextAssigneeName,
      snoozeUntil: nextSnoozeUntil,
    }),
    note: null,
    metadata: {
      mutation: input.mutation,
      currentStatus,
      nextStatus,
      assigneeUserId: nextAssigneeUserId,
      snoozeUntil: nextSnoozeUntil,
    },
  });

  return upsertCommandCenterActionState({
    action: input.action,
    businessId: input.businessId,
    nextStatus,
    assigneeUserId: nextAssigneeUserId,
    assigneeName: nextAssigneeName,
    snoozeUntil: nextSnoozeUntil,
    latestNoteExcerpt:
      current?.latestNoteExcerpt ?? input.action.latestNoteExcerpt ?? null,
    noteCount: current?.noteCount ?? input.action.noteCount ?? 0,
    clientMutationId: input.clientMutationId,
  });
}

export async function addCommandCenterNote(input: {
  businessId: string;
  action: CommandCenterAction;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  clientMutationId: string;
  note: string;
}) {
  await assertDbSchemaReady({
    tables: [...COMMAND_CENTER_TABLES],
    context: "command_center:add_note",
  });

  const current =
    (await getCommandCenterStateRecord({
      businessId: input.businessId,
      actionFingerprint: input.action.actionFingerprint,
    })) ?? null;

  if (current?.lastMutationId === input.clientMutationId) {
    return current;
  }

  const note = input.note.trim();
  const excerpt = note.slice(0, 280);
  await writeCommandCenterJournal({
    businessId: input.businessId,
    clientMutationId: input.clientMutationId,
    action: input.action,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    eventType: "note_added",
    message: buildCommandCenterJournalMessage({
      mutation: "note",
      actionTitle: input.action.title,
    }),
    note,
    metadata: {},
  });

  return upsertCommandCenterActionState({
    action: input.action,
    businessId: input.businessId,
    nextStatus: current?.workflowStatus ?? input.action.status ?? "pending",
    assigneeUserId: current?.assigneeUserId ?? input.action.assigneeUserId ?? null,
    assigneeName: current?.assigneeName ?? input.action.assigneeName ?? null,
    snoozeUntil: current?.snoozeUntil ?? input.action.snoozeUntil ?? null,
    latestNoteExcerpt: excerpt,
    noteCount: (current?.noteCount ?? input.action.noteCount ?? 0) + 1,
    clientMutationId: input.clientMutationId,
  });
}

export async function syncCommandCenterActionWorkflowStatus(input: {
  businessId: string;
  action: CommandCenterAction;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  clientMutationId: string;
  nextStatus: Extract<CommandCenterActionStatus, "approved" | "executed" | "failed">;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  await assertDbSchemaReady({
    tables: [...COMMAND_CENTER_TABLES],
    context: "command_center:sync_execution_status",
  });

  const current =
    (await getCommandCenterStateRecord({
      businessId: input.businessId,
      actionFingerprint: input.action.actionFingerprint,
    })) ?? null;

  if (current?.lastMutationId === input.clientMutationId) {
    return current;
  }

  await writeCommandCenterJournal({
    businessId: input.businessId,
    clientMutationId: input.clientMutationId,
    action: input.action,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorEmail: input.actorEmail,
    eventType: "status_changed",
    message: input.message,
    note: null,
    metadata: {
      currentStatus: current?.workflowStatus ?? input.action.status ?? "pending",
      nextStatus: input.nextStatus,
      ...(input.metadata ?? {}),
    },
  });

  return upsertCommandCenterActionState({
    action: input.action,
    businessId: input.businessId,
    nextStatus: input.nextStatus,
    assigneeUserId: current?.assigneeUserId ?? input.action.assigneeUserId ?? null,
    assigneeName: current?.assigneeName ?? input.action.assigneeName ?? null,
    snoozeUntil: current?.snoozeUntil ?? input.action.snoozeUntil ?? null,
    latestNoteExcerpt:
      current?.latestNoteExcerpt ?? input.action.latestNoteExcerpt ?? null,
    noteCount: current?.noteCount ?? input.action.noteCount ?? 0,
    clientMutationId: input.clientMutationId,
  });
}
