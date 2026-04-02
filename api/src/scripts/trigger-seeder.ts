import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { RealtimeCompetitionSeederService } from '../modules/competitions/services/realtime-competition-seeder.service.js';

async function bootstrap() {
    console.log('Bootstrapping application context...');
    const app = await NestFactory.createApplicationContext(AppModule);
    
    console.log('Resolving RealtimeCompetitionSeederService...');
    const seederService = app.get(RealtimeCompetitionSeederService);

    console.log('Triggering global seeder manually for all categories...');
    await seederService.seedAllCategories();
    
    console.log('Seeding complete.');
    await app.close();
}

bootstrap().catch(console.error);
