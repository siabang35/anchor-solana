import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { CompetitionClusteringService } from '../src/modules/markets/competition-clustering.service.js';

async function run() {
    console.log('Initializing Application Context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    
    console.log('Getting CompetitionClusteringService...');
    const clusteringService = app.get(CompetitionClusteringService);
    
    console.log('Executing clustering...');
    await clusteringService.handleDailyClustering();
    
    console.log('Clustering completed. Closing app context.');
    await app.close();
    process.exit(0);
}

run().catch(err => {
    console.error('Error during clustering trigger:', err);
    process.exit(1);
});
