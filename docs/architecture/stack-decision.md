# Stack decision

Cadence uses Next.js and TypeScript with one production container on Cloud
Run, PostgreSQL through Drizzle, and Better Auth email/password accounts.

The canonical `.neander/compose.yaml` declares managed Neon, the public application
origin, generated secrets and the `nextjs-drizzle` migration profile. Build and
startup do not run migrations. All board APIs authorize ownership on the server.

The application was exported from Neander project `proj_2c624900b95c` at deployed
commit `8aac2ab6b2f22987fa5a6150ee60afcc0d8cbe34`. Template publication follows the
shared Neander contract; consuming its artifacts for project provisioning is a
separate product integration.
