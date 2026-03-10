/**
 * HackerNews Client
 * 
 * Client for fetching tech news from HackerNews Firebase API
 * Used for: Tech, Signals categories
 * 
 * Rate Limits: No official limit (Firebase API)
 */

import { Injectable } from '@nestjs/common';
import { BaseAPIClient, RateLimitConfig } from './base-api.client.js';

export interface HNStory {
    id: number;
    title: string;
    url?: string;
    text?: string;
    by: string;
    score: number;
    descendants: number; // comment count
    time: number; // unix timestamp
    type: 'story' | 'ask' | 'show' | 'job' | 'poll';
    kids?: number[]; // comment ids
}

export interface HNTransformed {
    id: string;
    hnId: number;
    title: string;
    url: string | null;
    text: string | null;
    author: string;
    score: number;
    commentCount: number;
    publishedAt: Date;
    storyType: string;
}

const HN_RATE_LIMIT: RateLimitConfig = {
    requestsPerMinute: 100,
    requestsPerDay: 100000,
    retryAfterMs: 1000,
};

@Injectable()
export class HackerNewsClient extends BaseAPIClient {
    constructor() {
        super(
            'HackerNewsClient',
            'https://hacker-news.firebaseio.com/v0',
            undefined,
            HN_RATE_LIMIT
        );
    }

    protected getAuthHeaders(): Record<string, string> {
        return {};
    }

    /**
     * Get top story IDs
     */
    private async getTopStoryIds(limit: number = 30): Promise<number[]> {
        const endpoint = '/topstories.json';
        const ids = await this.makeRequest<number[]>(endpoint);
        return ids.slice(0, limit);
    }

    /**
     * Get new story IDs
     */
    private async getNewStoryIds(limit: number = 30): Promise<number[]> {
        const endpoint = '/newstories.json';
        const ids = await this.makeRequest<number[]>(endpoint);
        return ids.slice(0, limit);
    }

    /**
     * Get best story IDs
     */
    private async getBestStoryIds(limit: number = 30): Promise<number[]> {
        const endpoint = '/beststories.json';
        const ids = await this.makeRequest<number[]>(endpoint);
        return ids.slice(0, limit);
    }

    /**
     * Get Ask HN story IDs
     */
    private async getAskStoryIds(limit: number = 20): Promise<number[]> {
        const endpoint = '/askstories.json';
        const ids = await this.makeRequest<number[]>(endpoint);
        return ids.slice(0, limit);
    }

    /**
     * Get Show HN story IDs
     */
    private async getShowStoryIds(limit: number = 20): Promise<number[]> {
        const endpoint = '/showstories.json';
        const ids = await this.makeRequest<number[]>(endpoint);
        return ids.slice(0, limit);
    }

    /**
     * Get story by ID
     */
    private async getStory(id: number): Promise<HNStory | null> {
        const endpoint = `/item/${id}.json`;
        try {
            const story = await this.makeRequest<HNStory>(endpoint);
            return story;
        } catch (error) {
            this.logger.warn(`Failed to fetch story ${id}: ${(error as Error).message}`);
            return null;
        }
    }

    /**
     * Get top stories with details
     */
    async getTopStories(limit: number = 30): Promise<HNTransformed[]> {
        try {
            const ids = await this.getTopStoryIds(limit);
            return this.fetchStoriesById(ids);
        } catch (error) {
            this.logger.error(`Failed to fetch top stories: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get new stories with details
     */
    async getNewStories(limit: number = 30): Promise<HNTransformed[]> {
        try {
            const ids = await this.getNewStoryIds(limit);
            return this.fetchStoriesById(ids);
        } catch (error) {
            this.logger.error(`Failed to fetch new stories: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get best stories with details
     */
    async getBestStories(limit: number = 30): Promise<HNTransformed[]> {
        try {
            const ids = await this.getBestStoryIds(limit);
            return this.fetchStoriesById(ids);
        } catch (error) {
            this.logger.error(`Failed to fetch best stories: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get Ask HN stories
     */
    async getAskStories(limit: number = 20): Promise<HNTransformed[]> {
        try {
            const ids = await this.getAskStoryIds(limit);
            return this.fetchStoriesById(ids);
        } catch (error) {
            this.logger.error(`Failed to fetch Ask HN stories: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get Show HN stories
     */
    async getShowStories(limit: number = 20): Promise<HNTransformed[]> {
        try {
            const ids = await this.getShowStoryIds(limit);
            return this.fetchStoriesById(ids);
        } catch (error) {
            this.logger.error(`Failed to fetch Show HN stories: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Fetch multiple stories by ID with concurrency limit
     */
    private async fetchStoriesById(ids: number[]): Promise<HNTransformed[]> {
        const stories: HNTransformed[] = [];
        const concurrency = 5;

        for (let i = 0; i < ids.length; i += concurrency) {
            const batch = ids.slice(i, i + concurrency);
            const batchPromises = batch.map(id => this.getStory(id));
            const batchResults = await Promise.all(batchPromises);

            for (const story of batchResults) {
                if (story && story.type !== 'job') {
                    stories.push(this.transformStory(story));
                }
            }

            // Small delay between batches
            if (i + concurrency < ids.length) {
                await this.sleep(100);
            }
        }

        return stories;
    }

    /**
     * Transform HN story to unified format
     */
    private transformStory(story: HNStory): HNTransformed {
        return {
            id: `hn_${story.id}`,
            hnId: story.id,
            title: story.title,
            url: story.url || null,
            text: story.text || null,
            author: story.by,
            score: story.score,
            commentCount: story.descendants || 0,
            publishedAt: new Date(story.time * 1000),
            storyType: story.type,
        };
    }

    /**
     * Get all trending tech stories (combined top + best)
     */
    async getTrendingTechStories(limit: number = 30): Promise<HNTransformed[]> {
        const [topStories, bestStories] = await Promise.all([
            this.getTopStories(limit),
            this.getBestStories(limit),
        ]);

        // Deduplicate and sort by score
        const storyMap = new Map<number, HNTransformed>();
        for (const story of [...topStories, ...bestStories]) {
            if (!storyMap.has(story.hnId)) {
                storyMap.set(story.hnId, story);
            }
        }

        return Array.from(storyMap.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
}
