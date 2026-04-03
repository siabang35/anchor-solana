import { NestFactory } from '@nestjs/core';
import { AppModule } from './dist/app.module.js';
import { AgentRunnerService } from './dist/modules/agents/services/agent-runner.service.js';

async function bootstrap() {
  console.log("Loading module context...");
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log', 'debug'] });
  console.log("Context loaded! Getting service...");
  const runner = app.get(AgentRunnerService);
  console.log("Running agent loop manually...");
  
  // Force reset isRunning in case it's true
  runner.isRunning = false;
  await runner.runAgentLoop();
  console.log("Loop finished.");
  process.exit(0);
}
bootstrap().catch(console.error);
