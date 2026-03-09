import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { MediaStorageAdapter } from "./types";

interface SidecarMeta {
  contentType: string;
  size: number;
}

/**
 * Local filesystem storage adapter.
 * Stores files under `{baseDir}/{key}` with a `.meta` JSON sidecar for content-type.
 *
 * Replace with S3StorageAdapter or R2StorageAdapter for production cloud deployments.
 */
export class LocalStorageAdapter implements MediaStorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), ".cache", "media");
  }

  async write(key: string, data: Buffer, contentType: string): Promise<void> {
    const filePath = this.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    const meta: SidecarMeta = { contentType, size: data.length };
    await fs.writeFile(`${filePath}.meta`, JSON.stringify(meta));
  }

  async read(
    key: string
  ): Promise<{ data: Buffer; contentType: string } | null> {
    const filePath = this.resolve(key);
    try {
      const [data, metaRaw] = await Promise.all([
        fs.readFile(filePath),
        fs.readFile(`${filePath}.meta`, "utf-8"),
      ]);
      const meta: SidecarMeta = JSON.parse(metaRaw);
      return { data, contentType: meta.contentType };
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolve(key);
    await fs.unlink(filePath).catch(() => {});
    await fs.unlink(`${filePath}.meta`).catch(() => {});
  }

  private resolve(key: string): string {
    return path.join(this.baseDir, key);
  }
}
