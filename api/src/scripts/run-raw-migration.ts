import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

async function runMigration() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        throw new Error('DATABASE_URL not found in .env');
    }

    // Connect directly to Postgres
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    console.log('Connected to PostgreSQL');

    try {
        const sqlPath = path.join(__dirname, '../supabase/migrations/063_enforce_unique_competitions.sql');
        const sqlFile = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running 063_enforce_unique_competitions.sql...');
        await client.query(sqlFile);

        console.log('Migration successfully applied and duplicate active competitions canceled.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
        console.log('Disconnected.');
    }
}

runMigration().catch(console.error);
