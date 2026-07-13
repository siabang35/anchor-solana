const fs = require('fs');
const path = require('path');
const pg = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const dbUrl = process.env.DATABASE_URL.replace(/^"(.*)"$/, '$1').replace('#', '%23').replace('$', '%24');

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  const sqlPath = path.join(__dirname, 'supabase/full_sql/101_fifa_world_cup_simulation.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  console.log('Running SQL seed...');
  await client.query(sql);
  console.log('Successfully seeded database!');
  await client.end();
}

main().catch(console.error);
