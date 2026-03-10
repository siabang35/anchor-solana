/**
 * Sports Module
 * 
 * Main NestJS module for sports data scraping and AI agent competitions.
 * Integrates TheSportsDB and API-Sports clients with ETL orchestrator.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SportsController } from './sports.controller.js';
import { SportsService } from './sports.service.js';
import { SportsSyncService } from './sports-sync.service.js';
import { SportsMessagingService } from './sports-messaging.service.js';
import { SportsCleanerService } from './sports-cleaner.service.js';
import { SportsGateway } from './sports.gateway.js';
import { SportsETLOrchestrator } from './sports-etl-orchestrator.service.js';
import { TheSportsDBClient } from './clients/thesportsdb.client.js';
import { APIFootballClient } from './clients/api-football.client.js';
import { APISportsClient } from './clients/api-sports.client.js';

@Module({
    imports: [ConfigModule],
    controllers: [SportsController],
    providers: [
        SportsService,
        SportsSyncService,
        SportsMessagingService,
        SportsCleanerService,
        SportsGateway,
        SportsETLOrchestrator,
        TheSportsDBClient,
        APIFootballClient,
        APISportsClient,
    ],
    exports: [
        SportsService,
        SportsSyncService,
        SportsMessagingService,
        SportsCleanerService,
        SportsGateway,
        SportsETLOrchestrator,
        TheSportsDBClient,
        APIFootballClient,
        APISportsClient,
    ],
})
export class SportsModule { }

