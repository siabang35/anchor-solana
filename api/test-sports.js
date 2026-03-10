
const API_KEY = process.env.APIFOOTBALL_API_KEY;
const BASE_URL_AFL = 'https://v1.afl.api-sports.io';
const BASE_URL_MMA = 'https://v1.mma.api-sports.io';

const headers = { 'x-apisports-key': API_KEY };

async function testAFL() {
    console.log('Testing AFL 2024...');
    try {
        const url = `${BASE_URL_AFL}/games?league=1&season=2024`;
        console.log(`Fetching ${url}`);
        const res = await fetch(url, { headers });
        const data = await res.json();

        console.log(`AFL League 1 Results: ${data.results}`);
        if (data.errors && Object.keys(data.errors).length > 0) {
            console.log('Errors:', JSON.stringify(data.errors));
        }
        if (data.results > 0) {
            console.log('Sample AFL Game:', JSON.stringify(data.response[0], null, 2));
        } else {
            console.log('No AFL games found for league 1, 2024');
        }
    } catch (e) {
        console.error('AFL Error:', e.message);
    }
}

async function testMMA() {
    console.log('Testing MMA 2024...');
    try {
        // Try without league, just season
        const url = `${BASE_URL_MMA}/fights?season=2024`;
        console.log(`Fetching ${url}`);
        const res = await fetch(url, { headers });
        const data = await res.json();

        console.log(`MMA Season 2024 Results: ${data.results}`);
        if (data.errors && Object.keys(data.errors).length > 0) {
            console.log('Errors:', JSON.stringify(data.errors));
        }
        if (data.results > 0) {
            console.log('Sample MMA Fight:', JSON.stringify(data.response[0], null, 2));
        } else {
            console.log('No MMA fights found for season 2024');
        }
    } catch (e) {
        console.error('MMA Error:', e.message);
    }
}

async function run() {
    await testAFL();
    console.log('---');
    await testMMA();
}

run();
