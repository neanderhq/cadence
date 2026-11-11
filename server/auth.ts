import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, betterAuth } from "better-auth";
import { getDb } from "./db";
import { ensurePrivateWorkspace } from "./workspace";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function createAuth() {
  const baseURL = process.env.BETTER_AUTH_URL || (process.env.NODE_ENV !== "production"
    ? "http://localhost:3000"
    : required("BETTER_AUTH_URL"));

  return betterAuth({
    baseURL,
    trustedOrigins: process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://127.0.0.1:3000"]
      : [new URL(baseURL).origin],
    secret: required("BETTER_AUTH_SECRET"),
    database: drizzleAdapter(getDb(), { provider: "pg" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            if (newUser.name.includes("\0")) {
              throw new APIError("BAD_REQUEST", { message: "Name cannot contain NUL characters." });
            }
            if (newUser.name.length > 120) {
              throw new APIError("BAD_REQUEST", { message: "Name must be 120 characters or fewer." });
            }
          },
          after: async (newUser) => {
            await ensurePrivateWorkspace(newUser.id);
          },
        },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  return auth ??= createAuth();
}
