import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { QwenInferenceService } from './services/qwen-inference.service.js';
import { AgentEvaluationService } from './services/agent-evaluation.service.js';
import { AgentRunnerService } from './services/agent-runner.service.js';

@Module({
    controllers: [AgentsController],
    providers: [AgentsService, QwenInferenceService, AgentEvaluationService, AgentRunnerService],
    exports: [AgentsService, QwenInferenceService, AgentEvaluationService, AgentRunnerService],
})
export class AgentsModule { }
