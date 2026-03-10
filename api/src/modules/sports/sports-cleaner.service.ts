/**
 * Sports Data Cleaner Service
 * 
 * Validates, normalizes, and deduplicates sports data before storage.
 * Ensures data quality and consistency across multiple sources.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
    SportsLeague,
    SportsTeam,
    SportsEvent,
    SportsMarket,
    SportType,
    EventStatus,
    DataSource,
} from './types/sports.types.js';

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

export interface CleaningResult<T> {
    original: T;
    cleaned: T;
    changes: string[];
}

@Injectable()
export class SportsCleanerService {
    private readonly logger = new Logger(SportsCleanerService.name);

    // Team name normalization mappings
    private readonly teamNameMappings: Map<string, string> = new Map([
        ['man utd', 'Manchester United'],
        ['man united', 'Manchester United'],
        ['man city', 'Manchester City'],
        ['spurs', 'Tottenham Hotspur'],
        ['wolves', 'Wolverhampton Wanderers'],
        ['brighton', 'Brighton & Hove Albion'],
        ['west ham', 'West Ham United'],
        ['crystal palace', 'Crystal Palace FC'],
    ]);

    // ========================
    // Team Name Normalization
    // ========================

    /**
     * Normalize team name for consistent matching
     */
    normalizeTeamName(name: string): string {
        if (!name) return '';

        let normalized = name.trim();

        // Check mappings first
        const lowerName = normalized.toLowerCase();
        if (this.teamNameMappings.has(lowerName)) {
            return this.teamNameMappings.get(lowerName)!;
        }

        // Standard normalizations
        normalized = normalized
            // Fix common abbreviations
            .replace(/\bFC\b/gi, 'FC')
            .replace(/\bSC\b/gi, 'SC')
            .replace(/\bCF\b/gi, 'CF')
            .replace(/\bAFC\b/gi, 'AFC')
            .replace(/\bUnited\b/gi, 'United')
            .replace(/\bCity\b/gi, 'City')
            .replace(/\bRovers\b/gi, 'Rovers')
            // Fix spacing
            .replace(/  +/g, ' ')
            .trim();

        return normalized;
    }

    /**
     * Generate a canonical team key for deduplication
     */
    generateTeamKey(name: string, sport: SportType, country?: string): string {
        const normalized = this.normalizeTeamName(name).toLowerCase();
        const parts = [normalized.replace(/[^a-z0-9]/g, ''), sport];
        if (country) parts.push(country.toLowerCase());
        return parts.join(':');
    }

    // ========================
    // Event Validation
    // ========================

    /**
     * Validate event data before storage
     */
    validateEvent(event: Partial<SportsEvent>): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!event.externalId) {
            errors.push('Missing external ID');
        }

        if (!event.sport || !Object.values(SportType).includes(event.sport)) {
            errors.push(`Invalid sport type: ${event.sport}`);
        }

        if (!event.startTime) {
            errors.push('Missing start time');
        } else if (isNaN(new Date(event.startTime).getTime())) {
            errors.push('Invalid start time format');
        }

        if (!event.status || !Object.values(EventStatus).includes(event.status)) {
            warnings.push(`Unknown status: ${event.status}, defaulting to scheduled`);
        }

        // Logical validations
        if (event.homeScore !== undefined && event.homeScore < 0) {
            errors.push('Home score cannot be negative');
        }

        if (event.awayScore !== undefined && event.awayScore < 0) {
            errors.push('Away score cannot be negative');
        }

        // Cross-field validations
        if (event.status === EventStatus.SCHEDULED &&
            (event.homeScore !== undefined || event.awayScore !== undefined)) {
            warnings.push('Scheduled event has scores set');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Validate league data
     */
    validateLeague(league: Partial<SportsLeague>): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!league.externalId) {
            errors.push('Missing external ID');
        }

        if (!league.name || league.name.trim().length === 0) {
            errors.push('Missing league name');
        }

        if (!league.sport || !Object.values(SportType).includes(league.sport)) {
            errors.push(`Invalid sport type: ${league.sport}`);
        }

        if (league.logoUrl && !this.isValidUrl(league.logoUrl)) {
            warnings.push('Invalid logo URL format');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Validate team data
     */
    validateTeam(team: Partial<SportsTeam>): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!team.externalId) {
            errors.push('Missing external ID');
        }

        if (!team.name || team.name.trim().length === 0) {
            errors.push('Missing team name');
        }

        if (!team.sport || !Object.values(SportType).includes(team.sport)) {
            errors.push(`Invalid sport type: ${team.sport}`);
        }

        if (team.stadiumCapacity !== undefined && team.stadiumCapacity < 0) {
            errors.push('Stadium capacity cannot be negative');
        }

        if (team.foundedYear !== undefined &&
            (team.foundedYear < 1800 || team.foundedYear > new Date().getFullYear())) {
            warnings.push(`Suspicious founded year: ${team.foundedYear}`);
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }

    // ========================
    // Data Cleaning
    // ========================

    /**
     * Clean and normalize event data
     */
    cleanEvent(event: SportsEvent): CleaningResult<SportsEvent> {
        const changes: string[] = [];
        const cleaned = { ...event };

        // Normalize names in metadata
        if (cleaned.metadata?.homeTeamName) {
            const normalized = this.normalizeTeamName(cleaned.metadata.homeTeamName as string);
            if (normalized !== cleaned.metadata.homeTeamName) {
                changes.push(`Normalized home team: ${cleaned.metadata.homeTeamName} → ${normalized}`);
                cleaned.metadata.homeTeamName = normalized;
            }
        }

        if (cleaned.metadata?.awayTeamName) {
            const normalized = this.normalizeTeamName(cleaned.metadata.awayTeamName as string);
            if (normalized !== cleaned.metadata.awayTeamName) {
                changes.push(`Normalized away team: ${cleaned.metadata.awayTeamName} → ${normalized}`);
                cleaned.metadata.awayTeamName = normalized;
            }
        }

        // Ensure consistent status
        if (!cleaned.status) {
            cleaned.status = EventStatus.SCHEDULED;
            changes.push('Set default status to SCHEDULED');
        }

        // Ensure timezone
        if (!cleaned.timezone) {
            cleaned.timezone = 'UTC';
            changes.push('Set default timezone to UTC');
        }

        // Initialize scores for live/finished events
        if (cleaned.status === EventStatus.LIVE || cleaned.status === EventStatus.FINISHED) {
            if (cleaned.homeScore === undefined) {
                cleaned.homeScore = 0;
                changes.push('Initialized home score to 0');
            }
            if (cleaned.awayScore === undefined) {
                cleaned.awayScore = 0;
                changes.push('Initialized away score to 0');
            }
        }

        return { original: event, cleaned, changes };
    }

    /**
     * Clean team data
     */
    cleanTeam(team: SportsTeam): CleaningResult<SportsTeam> {
        const changes: string[] = [];
        const cleaned = { ...team };

        // Normalize team name
        const normalizedName = this.normalizeTeamName(team.name);
        if (normalizedName !== team.name) {
            changes.push(`Normalized name: ${team.name} → ${normalizedName}`);
            cleaned.name = normalizedName;
        }

        // Normalize short name
        if (team.nameShort) {
            const normalizedShort = team.nameShort.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
            if (normalizedShort !== team.nameShort) {
                changes.push(`Normalized short name: ${team.nameShort} → ${normalizedShort}`);
                cleaned.nameShort = normalizedShort;
            }
        }

        // Normalize colors to hex
        if (team.primaryColor && !team.primaryColor.startsWith('#')) {
            cleaned.primaryColor = `#${team.primaryColor}`;
            changes.push('Added # prefix to primary color');
        }

        if (team.secondaryColor && !team.secondaryColor.startsWith('#')) {
            cleaned.secondaryColor = `#${team.secondaryColor}`;
            changes.push('Added # prefix to secondary color');
        }

        return { original: team, cleaned, changes };
    }

    // ========================
    // Deduplication
    // ========================

    /**
     * Deduplicate events from multiple sources
     */
    deduplicateEvents(events: SportsEvent[]): SportsEvent[] {
        const seen = new Map<string, SportsEvent>();

        for (const event of events) {
            // Create unique key based on teams and date
            const dateStr = new Date(event.startTime).toISOString().split('T')[0];
            const homeTeam = event.homeTeamId || event.metadata?.homeTeamName || '';
            const awayTeam = event.awayTeamId || event.metadata?.awayTeamName || '';

            const key = `${event.sport}:${homeTeam}:${awayTeam}:${dateStr}`;
            const existing = seen.get(key);

            if (!existing) {
                seen.set(key, event);
            } else if (this.isMoreReliable(event, existing)) {
                seen.set(key, event);
                this.logger.debug(`Replaced duplicate event: ${key}`);
            }
        }

        return Array.from(seen.values());
    }

    /**
     * Deduplicate teams
     */
    deduplicateTeams(teams: SportsTeam[]): SportsTeam[] {
        const seen = new Map<string, SportsTeam>();

        for (const team of teams) {
            const key = this.generateTeamKey(team.name, team.sport, team.country);
            const existing = seen.get(key);

            if (!existing) {
                seen.set(key, team);
            } else if (this.isMoreReliable(team, existing)) {
                seen.set(key, team);
            }
        }

        return Array.from(seen.values());
    }

    // ========================
    // Utility Methods
    // ========================

    /**
     * Check if entity A is more reliable than entity B
     */
    private isMoreReliable<T extends { source: DataSource }>(a: T, b: T): boolean {
        // Priority: API-Sports > TheSportsDB > Manual
        const priority: Record<DataSource, number> = {
            [DataSource.APIFOOTBALL]: 100,
            [DataSource.APIBASKETBALL]: 100,
            [DataSource.APIAFL]: 100,
            [DataSource.APIFORMULA1]: 100,
            [DataSource.APIHANDBALL]: 100,
            [DataSource.APIHOCKEY]: 100,
            [DataSource.APIMMA]: 100,
            [DataSource.APINBA]: 100,
            [DataSource.APINFL]: 100,
            [DataSource.APIRUGBY]: 100,
            [DataSource.APIVOLLEYBALL]: 100,
            [DataSource.THESPORTSDB]: 50,
            [DataSource.MANUAL]: 25,
        };

        return priority[a.source] > priority[b.source];
    }

    /**
     * Validate URL format
     */
    private isValidUrl(url: string): boolean {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Batch validate events
     */
    batchValidate(events: Partial<SportsEvent>[]): {
        valid: Partial<SportsEvent>[];
        invalid: { event: Partial<SportsEvent>; errors: string[] }[];
    } {
        const valid: Partial<SportsEvent>[] = [];
        const invalid: { event: Partial<SportsEvent>; errors: string[] }[] = [];

        for (const event of events) {
            const result = this.validateEvent(event);
            if (result.valid) {
                valid.push(event);
            } else {
                invalid.push({ event, errors: result.errors });
            }
        }

        this.logger.log(`Batch validation: ${valid.length} valid, ${invalid.length} invalid`);
        return { valid, invalid };
    }
}
