
const API_URL = 'http://localhost:3001/api/v1';

async function main() {
    console.log('Triggering event sync for Football...');
    try {
        const eventsRes = await fetch(`${API_URL}/sports/sync/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sport: 'football' })
        });

        if (!eventsRes.ok) throw new Error(`${eventsRes.status} ${eventsRes.statusText}`);
        const eventsData = await eventsRes.json();
        console.log('Events Sync Result:', eventsData);
    } catch (err: any) {
        console.error('Events sync failed:', err.message);
    }

    console.log('Triggering odds sync...');
    try {
        const oddsRes = await fetch(`${API_URL}/sports/sync/odds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}) // Default date
        });

        if (!oddsRes.ok) throw new Error(`${oddsRes.status} ${oddsRes.statusText}`);
        const oddsData = await oddsRes.json();
        console.log('Odds Sync Result:', oddsData);
    } catch (err: any) {
        console.error('Odds sync failed:', err.message);
    }
}

main();
