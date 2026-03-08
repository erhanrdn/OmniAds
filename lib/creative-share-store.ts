import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { SharePayload } from "@/components/creatives/shareCreativeTypes";

type ShareStore = Record<string, SharePayload>;

const STORE_PATH = path.join("/tmp", "omniads-creative-share-store.json");

async function readStore(): Promise<ShareStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as ShareStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeStore(store: ShareStore): Promise<void> {
  await fs.writeFile(STORE_PATH, JSON.stringify(store), "utf8");
}

export async function createCreativeShareSnapshot(
  payload: Omit<SharePayload, "token" | "createdAt">
): Promise<{ token: string; payload: SharePayload }> {
  const token = randomUUID().replace(/-/g, "");
  const snapshot: SharePayload = {
    ...payload,
    token,
    createdAt: new Date().toISOString(),
  };

  const store = await readStore();
  store[token] = snapshot;
  await writeStore(store);

  return { token, payload: snapshot };
}

export async function getCreativeShareSnapshot(token: string): Promise<SharePayload | null> {
  const store = await readStore();
  return store[token] ?? null;
}
