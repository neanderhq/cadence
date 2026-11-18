# Content Board

Use Node 24.22.2 and pnpm 11.18.0. Install dependencies with `pnpm install --frozen-lockfile`. The app uses PostgreSQL and Better Auth email/password accounts. `pnpm check` checks types and `pnpm build` prepares the production standalone output without requiring credentials.

## Application

Better Auth handles email/password signup, login and logout with database-backed sessions. New accounts receive a private `Marketing Content Calendar` with persisted sample lists, labels, cards, checklists and comments; deleting it does not recreate it. The dashboard supports private board creation, renaming and deletion; board pages support persistent card creation and list management, including transactional list reordering. Signed-out visits to private app pages go to `/login`; every workspace API requires a valid session and scopes records through the owner → board → list → card relationship. A foreign or missing resource returns the same `404` response; malformed IDs return `400`. Validation errors use `400` with a readable `error` message; expired API sessions return `401` and the browser client sends the user back to login.

Private data endpoints are under `/api/boards`, `/api/lists`, `/api/cards`, `/api/labels`, `/api/checklist-items` and `/api/comments`. See the route handlers in `app/api/` for supported methods and fields.

## Neander template

This is the Content Board application from Neander production project
`proj_2c624900b95c`, deployed source commit
`8aac2ab6b2f22987fa5a6150ee60afcc0d8cbe34`. The initial GitHub commit preserves
that source; subsequent changes prepare its template contract. No production
accounts, submissions, databases or credentials are copied.

The template includes five marketing lists, eight fictional cards, labels,
checklists and a comment. After migrations, `pnpm db:seed` initializes a private
workspace for `maya.chen@example.invalid` using the deployment-generated
`DEMO_OWNER_PASSWORD`. Retrieve that value through the project's normal secret
management, or create your own account using the existing signup flow. There is
no shared default password. Each new account gets its own private sample board.
Seed retries preserve edited/deleted content and credentials; they do not reset
the demo account. See [template onboarding](docs/template-onboarding.md).

## Local development

Use Node 24.22.2 and pnpm 11.18.0. If they are installed under `~/.neander-tools`, add them to the current shell with `export PATH="$HOME/.neander-tools/bin:$PATH"`. Install dependencies with `pnpm install --frozen-lockfile`.

Copy `.env.example` to gitignored `.env.local` without overwriting an existing file, and set `BETTER_AUTH_SECRET` to a new random 32-byte secret. To seed the optional local demo owner, also set `DEMO_OWNER_PASSWORD` to a unique password of at least 12 characters and run `node --env-file=.env.local .neander/seed.mjs` after migrations. Start the embedded development database with `pnpm db:dev`; it listens only on `127.0.0.1:55432` and keeps its data in `.dev-db/`. Leave it running in that terminal. In another terminal, apply the committed schema with `node --env-file=.env.local .neander/migrate.mjs`, then launch the app with `pnpm dev` at `http://127.0.0.1:3000` (development also trusts `http://localhost:3000`). Sign up at `/signup`; the private sample board is created for the account. Keep `.dev-db/` to preserve local database data between runs.

Publish uses `.neander/compose.yaml`; it provisions managed Neon for `DATABASE_URL`, the public origin for `BETTER_AUTH_URL`, and generated `BETTER_AUTH_SECRET` and `DEMO_OWNER_PASSWORD` values. Production migrations run from the committed Drizzle history before rollout, not at build or startup. Configure the production database before publishing; never use local database credentials in production. `/api/health` remains public. For local production verification, build with `docker build -f .neander/Dockerfile -t my-next-app .` and run with `docker run --rm -p 8080:8080 --env-file .env.local my-next-app`. `public/` and `.next/static` are copied explicitly into the runtime image.

Use server-side runtime environment variables for backend origins and credentials; `NEXT_PUBLIC_*` values are frozen during the build. Keep browser calls relative to `/api`. Never commit `.env` files with credentials. Stack provenance is in `docs/architecture/stack-decision.md`.

For local PostgreSQL, follow the [Drizzle development database setup](.neander/blocks/drizzle/README.md#local-development-database): use local Docker PostgreSQL, an existing development PostgreSQL instance, or optional managed development Neon. The opt-in local Compose file is separate from the production recipe; the app does not start the database itself.


## Maintenance and verification

This private Neander template repository owns the application, pinned lockfiles, deployment recipe, and [incremental building blocks](add-ons.md). Changes are reviewed here independently of the Neander application. New projects take a one-time copy of a selected commit; starter updates never overwrite existing projects.

Run from this repository root:

```sh
docker build -f .neander/Dockerfile -t neander-starter-nextjs:local .
python3 scripts/test_entrypoint.py
docker run --detach --name starter-check --publish 127.0.0.1:8080:8080 neander-starter-nextjs:local
python3 scripts/smoke.py http://127.0.0.1:8080
docker rm --force starter-check
```

The base container build and public health check require no cloud credentials or database. After applying migrations to an isolated development database and starting the app, run `node --env-file=.env.local .neander/check-auth.mjs http://localhost:3000` to verify anonymous access, persisted sessions, CSRF rejection and logout. This script is not a board CRUD or cross-account API test; local database execution is needed to verify those runtime behaviors.

Pinned dependencies, production recipes, and building blocks were preserved during extraction from Neander. Repeat production certification when dependencies or base-image tags change; local checks do not establish managed Neon connectivity or Cloud Run behavior. No open-source license is granted by this private repository.

## Keeping Publish ready

This app's database and authentication recipe is maintained in `.neander/compose.yaml`. Follow [the deployment contract](docs/deployment-contract.md) when changing database or authentication features; keep its environment requirements and migration profile in sync with the code.

## License

[MIT](LICENSE). Third-party components retain their respective licenses and
existing attribution notices.

## Public CI and Neander releases

Public CI installs locked dependencies, checks types/syntax, runs app tests and
builds the application. It requires no Neander publishing credentials or private
tools. Neander's private release workflow separately verifies the committed
application image with a disposable database, then publishes it to the template
catalog. Existing projects continue through normal editing and Publish.
