
const https = require('https');

const API_KEY = process.env.APIFOOTBALL_API_KEY;

const CONFIGS = {
    // Probing for ANY valid basketball data
    basket_12_2024: { host: 'v1.basketball.api-sports.io', path: '/games?season=2024-2025&league=12' },
    basket_12_2023: { host: 'v1.basketball.api-sports.io', path: '/games?season=2023-2024&league=12' },
    basket_other_2024: { host: 'v1.basketball.api-sports.io', path: '/games?season=2024-2025&league=194' }, // Euroleague?
    basket_usa_2024: { host: 'v1.basketball.api-sports.io', path: '/games?season=2024-2025&league=12' },
};

function testSport(sport) {
    const config = CONFIGS[sport];
    const options = {
        hostname: config.host,
        path: config.path,
        method: 'GET',
        headers: {
            'x-apisports-key': API_KEY
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            console.log(`[${sport}] Status: ${res.statusCode}`);
            try {
                const json = JSON.parse(data);
                // FULL DUMP FOR NBA
                if (sport === 'nba') {
                    console.log(`[${sport}] Full Response:`, JSON.stringify(json, null, 2));
                } else {
                    const preview = json.response && json.response.length > 0 ? json.response[0] : (json.errors || "No data");
                    console.log(`[${sport}] Preview:`, JSON.stringify(preview, null, 2));
                }
            } catch (e) {
                console.log(`[${sport}] Raw: ${data.substring(0, 100)}`);
            }
        });
    });

    req.on('error', (e) => {
        console.error(`[${sport}] Error: ${e.message}`);
    });

    req.end();
}

console.log('Testing API connectivity...');
Object.keys(CONFIGS).forEach(testSport);
