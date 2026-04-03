import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
const match = env.match(/DATABASE_URL="([^"]+)"/);

if (!match) throw new Error("DATABASE_URL missing");

const sql = neon(match[1]);

const pid = Number(process.argv[2]);

if (!Number.isFinite(pid)) {
  throw new Error("Usage: node tmp_terminate_db.mjs <pid>");
}

const result = await sql.query(`select pg_terminate_backend(${pid}) as terminated`);
console.log(JSON.stringify(result, null, 2));
