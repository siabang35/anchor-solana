const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL
    });
    console.log('Connecting to Postgres...');
    await client.connect();
    console.log('Connected! Reloading PostgREST schema cache...');
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log('Successfully notified PostgREST to reload schema cache.');
    await client.end();
    process.exit(0);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
