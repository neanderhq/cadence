import { access } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import EmbeddedPostgres from "embedded-postgres";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required in .env.local.");

const connection = new URL(connectionString);
const databaseName = decodeURIComponent(connection.pathname.slice(1));
if (
  connection.protocol !== "postgresql:" ||
  connection.hostname !== "127.0.0.1" ||
  connection.port !== "55432" ||
  databaseName !== "neander_dev"
) {
  throw new Error("DATABASE_URL must target the local development database at 127.0.0.1:55432/neander_dev.");
}

const databaseDir = resolve(process.cwd(), ".dev-db");
const postgres = new EmbeddedPostgres({
  databaseDir,
  user: decodeURIComponent(connection.username),
  password: decodeURIComponent(connection.password),
  port: 55432,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
});

try {
  try {
    await access(resolve(databaseDir, "PG_VERSION"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    await postgres.initialise();
  }

  await postgres.start();
  const client = postgres.getPgClient("postgres", "127.0.0.1");
  let databaseExists;
  try {
    await client.connect();
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
    databaseExists = result.rows.length > 0;
    if (!databaseExists) await client.query(`CREATE DATABASE "${databaseName}"`);
  } finally {
    await client.end();
  }

  console.log("Development PostgreSQL is running at 127.0.0.1:55432/neander_dev. Press Ctrl+C to stop.");
  await new Promise((resolveSignal) => {
    process.once("SIGINT", resolveSignal);
    process.once("SIGTERM", resolveSignal);
  });
} finally {
  await postgres.stop();
}
