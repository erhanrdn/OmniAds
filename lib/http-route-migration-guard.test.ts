import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const appRoot = path.join(repoRoot, "app");

function walkDir(currentPath: string, found: string[] = []) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      walkDir(absolutePath, found);
      continue;
    }
    if (entry.isFile() && absolutePath.endsWith(`${path.sep}route.ts`)) {
      found.push(absolutePath);
    }
  }
  return found;
}

const guardedRoutes = walkDir(appRoot)
  .map((filePath) => path.relative(repoRoot, filePath))
  .sort((left, right) => left.localeCompare(right));

describe("http route migration guard", () => {
  for (const relativePath of guardedRoutes) {
    it(`${relativePath} does not import or call runMigrations`, () => {
      const absolutePath = path.join(repoRoot, relativePath);
      const content = fs.readFileSync(absolutePath, "utf8");
      expect(content).not.toMatch(/@\/lib\/migrations/);
      expect(content).not.toMatch(/\brunMigrations\s*\(/);
    });
  }
});
