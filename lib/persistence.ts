import postgres from "postgres";
import type { MigrationPlan, PersistedChallenge } from "@/lib/types";

interface MemoryDatabase {
  plans: Map<string, MigrationPlan>;
  challenges: Map<string, PersistedChallenge>;
}

declare global {
  var __latticeMemoryDatabase: MemoryDatabase | undefined;
}

const memoryDatabase =
  globalThis.__latticeMemoryDatabase ??
  (globalThis.__latticeMemoryDatabase = {
    plans: new Map<string, MigrationPlan>(),
    challenges: new Map<string, PersistedChallenge>(),
  });

const databaseUrl = process.env.DATABASE_URL;
const sql = databaseUrl
  ? postgres(databaseUrl, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
    })
  : null;

let schemaPromise: Promise<void> | null = null;

function assertPersistenceConfigured() {
  if (
    !sql &&
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_IN_MEMORY_PERSISTENCE !== "true"
  ) {
    throw new Error("DATABASE_URL is required for durable migration state in production");
  }
}

async function ensureSchema() {
  if (!sql) return;
  schemaPromise ??= (async () => {
    await sql`
      create table if not exists migration_plans (
        id text primary key,
        data jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;
    await sql`
      create table if not exists ownership_challenges (
        id text primary key,
        data jsonb not null,
        expires_at timestamptz not null,
        used_at timestamptz,
        created_at timestamptz not null default now()
      )
    `;
    await sql`
      create index if not exists ownership_challenges_expires_at_idx
      on ownership_challenges (expires_at)
    `;
  })();
  await schemaPromise;
}

export function usingPersistentDatabase() {
  return Boolean(sql);
}

export async function saveMigrationPlan(plan: MigrationPlan) {
  assertPersistenceConfigured();
  if (!sql) {
    memoryDatabase.plans.set(plan.id, structuredClone(plan));
    return plan;
  }
  await ensureSchema();
  await sql`
    insert into migration_plans (id, data, created_at, updated_at)
    values (${plan.id}, ${sql.json(JSON.parse(JSON.stringify(plan)))}, ${plan.createdAt}, ${plan.updatedAt})
    on conflict (id) do update
    set data = excluded.data, updated_at = excluded.updated_at
  `;
  return plan;
}

export async function getMigrationPlan(id: string) {
  assertPersistenceConfigured();
  if (!sql) return memoryDatabase.plans.get(id) ?? null;
  await ensureSchema();
  const rows = await sql<{ data: MigrationPlan }[]>`
    select data from migration_plans where id = ${id} limit 1
  `;
  return rows[0]?.data ?? null;
}

export async function saveOwnershipChallenge(challenge: PersistedChallenge) {
  assertPersistenceConfigured();
  if (!sql) {
    memoryDatabase.challenges.set(challenge.id, structuredClone(challenge));
    return challenge;
  }
  await ensureSchema();
  await sql`
    insert into ownership_challenges (id, data, expires_at, used_at)
    values (${challenge.id}, ${sql.json(JSON.parse(JSON.stringify(challenge)))}, ${challenge.expiresAt}, ${challenge.usedAt})
  `;
  return challenge;
}

export async function getOwnershipChallenge(id: string) {
  assertPersistenceConfigured();
  if (!sql) return memoryDatabase.challenges.get(id) ?? null;
  await ensureSchema();
  const rows = await sql<{ data: PersistedChallenge }[]>`
    select data from ownership_challenges where id = ${id} limit 1
  `;
  return rows[0]?.data ?? null;
}

export async function consumeOwnershipChallenge(id: string) {
  const challenge = await getOwnershipChallenge(id);
  if (!challenge || challenge.usedAt) return null;
  const consumed = { ...challenge, usedAt: new Date().toISOString() };

  if (!sql) {
    memoryDatabase.challenges.set(id, consumed);
    return consumed;
  }
  await ensureSchema();
  const rows = await sql<{ data: PersistedChallenge }[]>`
    update ownership_challenges
    set data = ${sql.json(JSON.parse(JSON.stringify(consumed)))}, used_at = ${consumed.usedAt}
    where id = ${id} and used_at is null
    returning data
  `;
  return rows.length === 1 ? consumed : null;
}
