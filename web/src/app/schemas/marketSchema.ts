import { z } from "zod";

// "Best Practices" Strict Validation Schema for Anti-Hack

export const MarketOutcomeSchema = z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().nonnegative(),
});

export const MarketSchema = z.object({
    id: z.string(),
    question: z.string(),
    outcomes: z.array(z.union([z.string(), MarketOutcomeSchema])),
    category: z.string().optional(),
    subCategory: z.string().optional(),
    endDate: z.string().datetime().optional().or(z.string()), // Accept ISO or generic string, or undefined
    volume: z.number().nonnegative().optional(),
    liquidity: z.number().nonnegative().optional(),
    // Derived/Frontend specific fields can be optional or transformed
    chance: z.number().min(0).max(100).optional(),
});

// Response schema for lists
export const MarketListSchema = z.array(MarketSchema);

export type Market = z.infer<typeof MarketSchema>;
export type MarketOutcome = z.infer<typeof MarketOutcomeSchema>;
