import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { SupabaseService } from '../src/database/supabase.service.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const supabaseService = app.get(SupabaseService);
  const supabase = supabaseService.getAdminClient();

  const { data: comps } = await supabase.from('competitions').select('id, image_url');
  let updated = 0;
  for (const comp of comps || []) {
    if (!comp.image_url) {
      const { data: clusters } = await supabase.from('news_clusters').select('signals').eq('competition_id', comp.id);
      if (clusters && clusters.length > 0) {
        let imageUrl = null;
        for (const cluster of clusters) {
           if (cluster.signals && cluster.signals.length > 0) {
             for (const sig of cluster.signals) {
               if (sig.image_url) {
                 imageUrl = sig.image_url;
                 break;
               }
             }
           }
           if (imageUrl) break;
        }
        
        if (imageUrl) {
          await supabase.from('competitions').update({ image_url: imageUrl }).eq('id', comp.id);
          updated++;
          console.log(`Updated ${comp.id} with image ${imageUrl}`);
        }
      }
    }
  }
  console.log(`Updated ${updated} competitions.`);
  await app.close();
}

bootstrap();
