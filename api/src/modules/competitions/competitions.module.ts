import { Module } from '@nestjs/common';
import { CompetitionsController } from './competitions.controller.js';
import { CompetitionsService } from './competitions.service.js';
import { CurveGeneratorService } from './services/curve-generator.service.js';
import { CompetitionManagerService } from './services/competition-manager.service.js';
import { EtlIngestionService } from './services/etl-ingestion.service.js';
import { RealtimeCompetitionSeederService } from './services/realtime-competition-seeder.service.js';
import { LeaderboardScoringService } from './services/leaderboard-scoring.service.js';

@Module({
    controllers: [CompetitionsController],
    providers: [
        CompetitionsService,
        CurveGeneratorService,
        CompetitionManagerService,
        EtlIngestionService,
        RealtimeCompetitionSeederService,
        LeaderboardScoringService,
    ],
    exports: [
        CompetitionsService,
        CurveGeneratorService,
        CompetitionManagerService,
        EtlIngestionService,
        RealtimeCompetitionSeederService,
        LeaderboardScoringService,
    ],
})
export class CompetitionsModule {}
