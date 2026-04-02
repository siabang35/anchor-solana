import * as dotenv from 'dotenv';
import * as path from 'path';
import { QwenInferenceService } from '../modules/agents/services/qwen-inference.service';

dotenv.config({ path: path.join(process.cwd(), '.env') });

class MockConfig {
    get(k: string) { return process.env[k]; }
}

async function run() {
    console.log("Testing Qwen Inference directly...");
    const qwen = new QwenInferenceService(new MockConfig() as any);
    
    const res = await qwen.generateForecast({
        eventTitle: 'Test Event: Will Solana hit $200 by end of year?',
        description: 'Test prediction for Solana price',
        horizon: '7d',
        newsCluster: [
            { title: 'Solana surges past $150', content: 'Huge momentum for SOL' }
        ]
    });
    
    console.log("Final Output:");
    console.log(JSON.stringify(res, null, 2));
}

run().catch(console.error);
