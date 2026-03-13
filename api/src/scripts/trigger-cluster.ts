import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { CompetitionClusteringService } from '../modules/markets/competition-clustering.service.js';

async function bootstrap() {
    console.log('Bootstrapping application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    
    console.log('Resolving CompetitionClusteringService...');
    const clusteringService = app.get(CompetitionClusteringService);

    console.log('Triggering daily clustering manually...');
    await clusteringService.handleDailyClustering();
    
    console.log('Clustering complete.');
    await app.close();
}

bootstrap().catch(console.error);
