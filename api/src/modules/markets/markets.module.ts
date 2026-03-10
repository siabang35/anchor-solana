import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CompetitionsModule } from '../competitions/competitions.module.js';
import { MarketsController } from './markets.controller.js';
import { MarketsService } from './markets.service.js';
import { SignalsController } from './signals.controller.js';
import { SignalsService } from './signals.service.js';
import { MarketDataController } from './market-data.controller.js';
import { MarketDataService } from './market-data.service.js';
import { MarketDataGateway } from './market-data.gateway.js';
import { MarketMessagingService } from './market-messaging.service.js';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsService } from './recommendations.service.js';
import { ProbabilityEngineService } from './probability-engine.service.js';
import { CurveEngineService } from './curve-engine.service.js';
import { MultiSourceFusionService } from './multi-source-fusion.service.js';
import { CompetitionClusteringService } from './competition-clustering.service.js';
import { LiveFeedController } from './live-feed.controller.js';

// API Clients
import {
    NewsAPIClient,
    GDELTClient,
    AlphaVantageClient,
    CoinGeckoClient,
    CoinMarketCapClient,
    CryptoPanicClient,
    CryptoClient,
    HackerNewsClient,
    SemanticScholarClient,
    ArxivClient,
    ScienceClient,
    WorldBankClient,
    IMFClient,
    OECDClient,
    RSSClient,
} from './clients/index.js';

// ETL Orchestrators
import {
    CryptoETLOrchestrator,
    TechETLOrchestrator,
    PoliticsETLOrchestrator,
    FinanceETLOrchestrator,
    ScienceETLOrchestrator,
    EconomyETLOrchestrator,
    SignalsETLOrchestrator,
} from './etl/index.js';

@Module({
    imports: [
        ConfigModule,
        ScheduleModule.forRoot(),
        CompetitionsModule,
    ],
    controllers: [MarketsController, MarketDataController, SignalsController, RecommendationsController, LiveFeedController],
    providers: [
        // Services
        MarketsService,
        SignalsService,
        MarketDataService,
        MarketMessagingService,
        RecommendationsService,
        ProbabilityEngineService,
        CurveEngineService,
        MultiSourceFusionService,
        CompetitionClusteringService,

        // Gateway
        MarketDataGateway,

        // API Clients
        NewsAPIClient,
        GDELTClient,
        AlphaVantageClient,
        CoinGeckoClient,
        CoinMarketCapClient,
        CryptoPanicClient,
        CryptoClient,
        HackerNewsClient,
        SemanticScholarClient,
        ArxivClient,
        ScienceClient,
        WorldBankClient,
        IMFClient,
        WorldBankClient,
        IMFClient,
        OECDClient,
        RSSClient, // Added RSSClient

        // ETL Orchestrators
        CryptoETLOrchestrator,
        TechETLOrchestrator,
        PoliticsETLOrchestrator,
        FinanceETLOrchestrator,
        ScienceETLOrchestrator,
        EconomyETLOrchestrator,
        SignalsETLOrchestrator,
    ],
    exports: [
        MarketsService,
        SignalsService,
        MarketDataService,
        MarketDataGateway,
        MarketMessagingService,
        ProbabilityEngineService,
        CurveEngineService,
        MultiSourceFusionService,
        CompetitionClusteringService,
        CryptoClient,
    ],
})
export class MarketsModule { }

