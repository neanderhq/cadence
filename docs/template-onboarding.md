# Content Board template

## Source and publication

Private source: `neanderhq/content-board-template`. Template ID: `content-board`.
The imported baseline is the exact deployed source of Neander project
`proj_2c624900b95c` at `8aac2ab6b2f22987fa5a6150ee60afcc0d8cbe34`.
Application UI and ownership behavior are preserved. Only fictional sample data
is included; live user accounts and production databases remain in place.

`.github/workflows/template.yml` calls the shared contract at
`f27c8a52b2c6c2242e8b3981e8c0c72f74be4b1f`. Pull requests verify the committed source;
main pushes publish the verified Linux/amd64 image, upload its thumbnail and
immutable release record, and register the completed release in the shared GCS
catalog. Source stays in GitHub at the recorded commit; no source archive is
published. The six organization `TEMPLATE_*` variables and the repository's
publisher identity must be configured before main-branch publication.

## Initial data

`.neander/sample-data.json` contains the fictional Marketing Content Calendar:
five lists, eight cards, five labels, checklists and a comment. Normal signup
initializes the same data in a private board for the new account.

`pnpm db:seed` runs after the committed Drizzle migrations and creates the fictional
demo owner `maya.chen@example.invalid` with a uniquely generated
`DEMO_OWNER_PASSWORD` from the normal publishing recipe. No hard-coded password
is shipped. Use normal project secret management to retrieve that credential, or
sign up with your own account. Passwords are hashed using Better Auth's own
implementation. A PostgreSQL transaction and advisory lock make retries safe;
the existing demo account marks completed initialization, so retries do not
reset passwords, edit dates or recreate deleted boards/cards.

## Verification

Use a disposable PostgreSQL database and the pinned Node/pnpm versions:

```sh
neander-template check . --json
NEANDER_TEMPLATE_TEST_DATABASE_URL=postgresql://.../disposable \
  neander-template verify . --json
```

The shared checker installs locked dependencies, checks TypeScript, runs fixture
unit tests, builds Linux/amd64, applies the same migrations as Publish, seeds the
database and invokes `pnpm test:template` against the resulting image. The smoke
script mounts the recipe's literal environment bundle and tests browser login,
the populated board, real pointer drag, card editing and movement, normal signup,
cross-account isolation, concurrent seed retries, preserved edits/deletions and
sessions across container restart. It also runs the existing auth, public-route
and secret-entrypoint checks. All app containers and temporary secret files are
removed; only verifier-owned fixture users are removed from the test database.

The optional `NEANDER_TEMPLATE_SCREENSHOT=/absolute/path/thumbnail.png` saves a
real browser screenshot before verification edits. The committed thumbnail uses
only fictional data. Local ARM verification is distinct from the native Linux/amd64
GitHub release job; neither alone proves managed production deployment.
