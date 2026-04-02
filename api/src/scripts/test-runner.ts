import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AgentRunnerService } from '../modules/agents/services/agent-runner.service';

/**
 * Temporarily tests running agent 4e4fe8be-2b6d-4986-a64a-aec6f38914d3 
 * which user pointed out earlier, or just any active agent.
 */
async function test() {
    console.log("Starting test run...");
    const app = await NestFactory.createApplicationContext(AppModule);
    const runner = app.get(AgentRunnerService);
    
    console.log("Triggering explicit run...");
    await runner.runAgentLoop();

    console.log("Run completed.");
    await app.close();
}

test().catch(console.error);
