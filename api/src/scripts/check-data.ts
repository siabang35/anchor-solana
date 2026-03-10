
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SupabaseService } from '../database/supabase.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);
    const supabaseService = app.get(SupabaseService);
    const supabase = supabaseService.getClient();

    console.log('Checking market_data_items...');
    const { data, error } = await supabase
        .from('market_data_items')
        .select('category, source')
        .limit(100);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log(`Found ${data.length} items.`);
        const categories = new Set(data.map(i => i.category));
        console.log('Categories found:', Array.from(categories));
        console.log('Sample item:', data[0]);
    }

    await app.close();
}

bootstrap();
