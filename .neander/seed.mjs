// Fictional template data. The deployment supplies a unique generated password.
import { pathToFileURL } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import { Client } from 'pg';
import sampleData from './sample-data.json' with { type: 'json' };

export const DEMO_OWNER_ID = 'template-content-board-maya';
export const DEMO_EMAIL = 'maya.chen@example.invalid';
export { sampleData };
export function sampleDueDate(days, now = new Date()) {
  if (days === null) return null;
  const value = new Date(now);
  value.setUTCDate(value.getUTCDate() + days);
  value.setUTCHours(12, 0, 0, 0);
  return value;
}

export async function seed({ databaseUrl, password }) {
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!password || password.length < 12) throw new Error('DEMO_OWNER_PASSWORD must contain at least 12 characters');
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('template-content-board-seed-v1'))");
    if ((await client.query('SELECT id FROM "user" WHERE id=$1', [DEMO_OWNER_ID])).rowCount) {
      // The account is the initialization marker. Deleted boards/cards remain
      // deleted; retries never reset user edits, passwords or relative dates.
      await client.query('COMMIT');
      return { created: false };
    }
    const passwordHash = await hashPassword(password);
    await client.query('INSERT INTO "user" (id,name,email,email_verified) VALUES ($1,$2,$3,true)', [DEMO_OWNER_ID, 'Maya Chen', DEMO_EMAIL]);
    await client.query('INSERT INTO account (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ($1,$2,$3,$2,$4,NOW(),NOW())', ['template-content-board-credential', DEMO_OWNER_ID, 'credential', passwordHash]);
    const boardId = (await client.query('INSERT INTO boards (owner_id,name,position) VALUES ($1,$2,0) RETURNING id', [DEMO_OWNER_ID, 'Marketing Content Calendar'])).rows[0].id;
    const listIds = new Map();
    for (const [position, name] of sampleData.lists.entries()) {
      listIds.set(name, (await client.query('INSERT INTO lists (board_id,name,position) VALUES ($1,$2,$3) RETURNING id', [boardId, name, position])).rows[0].id);
    }
    const labelIds = new Map();
    for (const label of sampleData.labels) {
      labelIds.set(label.name, (await client.query('INSERT INTO labels (board_id,name,color) VALUES ($1,$2,$3) RETURNING id', [boardId, label.name, label.color])).rows[0].id);
    }
    const positions = new Map(sampleData.lists.map(name => [name, 0]));
    for (const sample of sampleData.cards) {
      const cardId = (await client.query('INSERT INTO cards (list_id,title,description,position,due_date) VALUES ($1,$2,$3,$4,$5) RETURNING id', [listIds.get(sample.list), sample.title, '', positions.get(sample.list), sampleDueDate(sample.dueIn)])).rows[0].id;
      positions.set(sample.list, positions.get(sample.list) + 1);
      for (const name of sample.labels) await client.query('INSERT INTO card_labels (card_id,label_id) VALUES ($1,$2)', [cardId, labelIds.get(name)]);
      for (const [position, item] of (sample.checklist ?? []).entries()) {
        await client.query('INSERT INTO checklist_items (card_id,text,done,position) VALUES ($1,$2,$3,$4)', [cardId, item.text, item.done, position]);
      }
      if (sample.comment) await client.query('INSERT INTO comments (card_id,author_id,text) VALUES ($1,$2,$3)', [cardId, DEMO_OWNER_ID, sample.comment]);
    }
    await client.query('COMMIT');
    return { created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await seed({ databaseUrl: process.env.DATABASE_URL, password: process.env.DEMO_OWNER_PASSWORD });
  console.log(result.created ? 'Fictional content board initialized.' : 'Content board already initialized; existing data preserved.');
}
