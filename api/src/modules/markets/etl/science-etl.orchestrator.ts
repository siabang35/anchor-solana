/**
 * Science ETL Orchestrator
 * 
 * ETL pipeline for science data from Semantic Scholar, arXiv.
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BaseETLOrchestrator, ETLResult, MarketDataItem } from './base-etl.orchestrator.js';
import { SemanticScholarClient, ArxivClient } from '../clients/index.js';
import { MarketMessagingService } from '../market-messaging.service.js';

@Injectable()
export class ScienceETLOrchestrator extends BaseETLOrchestrator implements OnModuleInit {
    private semanticScholar: SemanticScholarClient;
    private arxiv: ArxivClient;

    constructor(private readonly messagingService: MarketMessagingService) {
        super('ScienceETLOrchestrator', 'science');
        this.syncInterval = 6 * 60 * 60 * 1000; // 6 hours

        this.semanticScholar = new SemanticScholarClient();
        this.arxiv = new ArxivClient();
    }

    async onModuleInit() {
        this.logger.log('Science ETL Orchestrator initialized');
        setTimeout(() => this.runSync(), 30000);
    }

    @Cron('0 */6 * * *') // Every 6 hours
    async scheduledSync() {
        await this.runSync();
    }

    async sync(): Promise<ETLResult> {
        const startedAt = new Date();
        const errors: string[] = [];
        let recordsFetched = 0;
        let recordsCreated = 0;
        let recordsUpdated = 0;
        let recordsSkipped = 0;
        let recordsFailed = 0;
        let duplicatesFound = 0;

        try {
            // 1. Fetch AI/ML papers from Semantic Scholar
            this.logger.debug('Fetching AI papers...');
            const aiPapers = await this.fetchAIPapers();
            recordsFetched += aiPapers.length;

            await this.storePapers(aiPapers);
            const aiItems = aiPapers.map(p => this.transformPaperToItem(p));

            // Enrich AI papers with scraped images (fallback to topic-based images)
            await this.enrichItemsWithImages(aiItems, (title, desc) => this.getScienceImageUrl(undefined, title, desc));

            const aiStats = await this.upsertItems(aiItems);
            recordsCreated += aiStats.created;
            recordsUpdated += aiStats.updated;
            duplicatesFound += aiStats.duplicates;

            // Stream updates
            await this.messagingService.publishMessage('science', aiItems, 'papers_update');

            // 2. Fetch recent arXiv papers
            this.logger.debug('Fetching arXiv papers...');
            const arxivPapers = await this.fetchArxivPapers();
            recordsFetched += arxivPapers.length;

            await this.storePapers(arxivPapers);
            const arxivItems = arxivPapers.map(p => this.transformPaperToItem(p));

            // arXiv papers don't have og:image, apply topic-based images directly
            // (Scraping arXiv returns the same arXiv logo for all papers)
            for (const item of arxivItems) {
                item.imageUrl = this.getScienceImageUrl(undefined, item.title, item.description);
            }
            this.logger.log(`Applied topic-based images to ${arxivItems.length} arXiv papers`);

            const arxivStats = await this.upsertItems(arxivItems);
            recordsCreated += arxivStats.created;
            recordsUpdated += arxivStats.updated;
            duplicatesFound += arxivStats.duplicates;

            // Stream updates
            await this.messagingService.publishMessage('science', arxivItems, 'papers_update');

        } catch (error) {
            errors.push((error as Error).message);
        }

        const completedAt = new Date();
        return {
            category: this.category,
            source: 'semantic_scholar,arxiv',
            startedAt,
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            recordsFetched,
            recordsCreated,
            recordsUpdated,
            recordsSkipped,
            recordsFailed,
            duplicatesFound,
            errors,
        };
    }

    private async fetchAIPapers() {
        try {
            return await this.semanticScholar.searchPapers('artificial intelligence deep learning', { limit: 20 });
        } catch (error) {
            this.logger.warn(`Failed to fetch AI papers: ${(error as Error).message}`);
            return [];
        }
    }

    private async fetchArxivPapers() {
        try {
            return await this.arxiv.getRecentPapers('cs.AI', 20);
        } catch (error) {
            this.logger.warn(`Failed to fetch arXiv papers: ${(error as Error).message}`);
            return [];
        }
    }

    private async storePapers(papers: any[]) {
        for (const paper of papers) {
            try {
                await this.supabase.from('science_papers').upsert({
                    external_id: paper.externalId,
                    source: paper.source,
                    title: paper.title,
                    abstract: paper.abstract,
                    authors: paper.authors,
                    author_count: paper.authors?.length || 0,
                    first_author: paper.authors?.[0]?.name,
                    venue: paper.venue,
                    published_date: paper.publicationDate?.toISOString()?.split('T')[0],
                    citation_count: paper.citationCount,
                    reference_count: paper.referenceCount,
                    is_open_access: paper.isOpenAccess,
                    pdf_url: paper.pdfUrl,
                    paper_url: paper.paperUrl,
                    fields_of_study: paper.fieldsOfStudy,
                    tldr: paper.tldr,
                }, {
                    onConflict: 'external_id,source',
                });
            } catch (error) {
                this.logger.warn(`Failed to store paper: ${(error as Error).message}`);
            }
        }
    }

    private transformPaperToItem(paper: any): MarketDataItem {
        // Note: imageUrl not set here - enrichItemsWithImages will scrape first, then fallback

        return {
            externalId: paper.id,
            source: paper.source,
            category: 'science',
            contentType: 'research',
            title: paper.title,
            description: paper.tldr || paper.abstract?.substring(0, 300),
            url: paper.paperUrl,
            // imageUrl intentionally not set - let scraper try first
            sourceName: paper.venue || paper.source,
            author: paper.authors?.[0]?.name,
            publishedAt: paper.publicationDate,
            tags: paper.fieldsOfStudy || [],
            impact: paper.citationCount > 100 ? 'high' : paper.citationCount > 10 ? 'medium' : 'low',
            metadata: {
                citationCount: paper.citationCount,
                referenceCount: paper.referenceCount,
            },
        };
    }

    /**
     * Get science-themed image based on field of study, title, and abstract analysis
     * Uses multiple images per category with hash-based selection for variety
     */
    private getScienceImageUrl(
        fieldsOfStudy: string[] | undefined,
        title?: string,
        abstract?: string
    ): string {
        // Combine all text for keyword detection
        const fields = fieldsOfStudy || [];
        const allText = [
            ...fields.map(f => f.toLowerCase()),
            (title || '').toLowerCase(),
            (abstract || '').toLowerCase().substring(0, 500)
        ].join(' ');

        // Generate hash from title for consistent but varied image selection
        const titleStr = title || '';
        const titleHash = titleStr.split('').reduce((acc, char, idx) =>
            acc + char.charCodeAt(0) * (idx + 1), 0);

        // AI/ML/Deep Learning - multiple images for variety
        if (allText.match(/\b(llm|language model|transformer|gpt|bert|diffusion|generative|neural network|deep learning|machine learning|reinforcement|rl|nlp|natural language|chatbot|agent|multimodal|attention)\b/i)) {
            const aiImages = [
                'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=600', // AI brain purple
                'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=600', // AI chip blue
                'https://images.unsplash.com/photo-1555255707-c07966088b7b?auto=format&fit=crop&q=80&w=600', // Neural network
                'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?auto=format&fit=crop&q=80&w=600', // AI robot face
                'https://images.unsplash.com/photo-1593349480506-8433634cdcbe?auto=format&fit=crop&q=80&w=600', // Digital brain
                'https://images.unsplash.com/photo-1535378917042-10a22c95931a?auto=format&fit=crop&q=80&w=600', // AI interface
                'https://images.unsplash.com/photo-1507146153580-69a1fe6d8aa1?auto=format&fit=crop&q=80&w=600', // Human & AI
                'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=600', // Robot
            ];
            return aiImages[titleHash % aiImages.length];
        }

        // Computer Vision / 3D / Graphics
        if (allText.match(/\b(image|vision|visual|video|3d|render|scene|object detection|segmentation|recognition|camera|pixel|vit|figure|autofigure|previsualization)\b/i)) {
            const visionImages = [
                'https://images.unsplash.com/photo-1561736778-92e52a7769ef?auto=format&fit=crop&q=80&w=600', // Vision eye
                'https://images.unsplash.com/photo-1617791160505-6f00504e3519?auto=format&fit=crop&q=80&w=600', // 3D render
                'https://images.unsplash.com/photo-1535223289827-42f1e9919769?auto=format&fit=crop&q=80&w=600', // Digital art
                'https://images.unsplash.com/photo-1633412802994-5c058f151b66?auto=format&fit=crop&q=80&w=600', // VR headset
                'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600', // Tech visual
            ];
            return visionImages[titleHash % visionImages.length];
        }

        // Robotics / Control / Autonomous
        if (allText.match(/\b(robot|robotic|manipulation|navigation|autonomous|drone|embodied|motion planning|control|offline)\b/i)) {
            const robotImages = [
                'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&q=80&w=600', // Robot arm
                'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600', // Circuit
                'https://images.unsplash.com/photo-1561557944-6e7860d1a7eb?auto=format&fit=crop&q=80&w=600', // Drone
                'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600', // Tech hand
            ];
            return robotImages[titleHash % robotImages.length];
        }

        // Math / Optimization / Algorithm / Conformal
        if (allText.match(/\b(math|optimization|algorithm|convergence|stochastic|gradient|convex|theorem|proof|conformal|adaptive|plasticity|tunable|scaling|asynchronous|sgd)\b/i)) {
            const mathImages = [
                'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&q=80&w=600', // Math formulas
                'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&q=80&w=600', // Equations
                'https://images.unsplash.com/photo-1596495577886-d920f1fb7238?auto=format&fit=crop&q=80&w=600', // Graph
                'https://images.unsplash.com/photo-1453733190371-0a9bedd82893?auto=format&fit=crop&q=80&w=600', // Geometry
            ];
            return mathImages[titleHash % mathImages.length];
        }

        // Physics / Quantum / Simulation
        if (allText.match(/\b(physics|quantum|particle|simulation|dynamics|energy|thermodynamic)\b/i)) {
            const physicsImages = [
                'https://images.unsplash.com/photo-1636466497217-26a8cbeaf0aa?auto=format&fit=crop&q=80&w=600', // Quantum
                'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=600', // Space/Physics
                'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=600', // Earth/Science
            ];
            return physicsImages[titleHash % physicsImages.length];
        }

        // Biology / Medicine / Neuro
        if (allText.match(/\b(biology|medical|health|protein|dna|genomic|clinical|drug|cell|brain|neuro)\b/i)) {
            const bioImages = [
                'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=crop&q=80&w=600', // Biology
                'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&q=80&w=600', // DNA
                'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=600', // Medical
            ];
            return bioImages[titleHash % bioImages.length];
        }

        // Data / Graph / Network / Benchmark
        if (allText.match(/\b(graph|network|data|dataset|benchmark|knowledge|reasoning|bridging|node|imbalanced)\b/i)) {
            const dataImages = [
                'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=600', // Data network
                'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&fit=crop&q=80&w=600', // Dashboard
                'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=600', // Analytics
            ];
            return dataImages[titleHash % dataImages.length];
        }

        // Security / Safety / Adversarial
        if (allText.match(/\b(security|privacy|adversarial|attack|defense|robust|safety|fingerprint|antidistillation)\b/i)) {
            const securityImages = [
                'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&fit=crop&q=80&w=600', // Security
                'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=600', // Lock
                'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=600', // Server
            ];
            return securityImages[titleHash % securityImages.length];
        }

        // Audio / Speech / Voice
        if (allText.match(/\b(audio|speech|voice|sound|acoustic|music|weighting|evidence)\b/i)) {
            const audioImages = [
                'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=600', // Audio waves
                'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&q=80&w=600', // Sound wave
                'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=600', // Music
            ];
            return audioImages[titleHash % audioImages.length];
        }

        // Research / Scientific / Accelerating
        if (allText.match(/\b(research|scientific|accelerating|discovery|study)\b/i)) {
            const researchImages = [
                'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=600', // Lab
                'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=600', // Research
                'https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=600', // Microscope
            ];
            return researchImages[titleHash % researchImages.length];
        }

        // Default - large variety based on title hash
        const defaultImages = [
            'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&q=80&w=600', // Lab
            'https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&q=80&w=600', // Research
            'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=600', // Tech circuit
            'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=600', // AI chip
            'https://images.unsplash.com/photo-1635070041409-e63e783ce3c1?auto=format&fit=crop&q=80&w=600', // Neural
            'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=600', // Matrix code
            'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600', // Tech abstract
            'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&q=80&w=600', // Code laptop
        ];

        return defaultImages[titleHash % defaultImages.length];
    }
}
