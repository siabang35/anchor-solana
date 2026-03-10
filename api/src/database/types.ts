/**
 * Database type definitions
 * These types represent the Supabase/PostgreSQL schema
 */

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    email: string | null;
                    full_name: string | null;
                    avatar_url: string | null;
                    wallet_addresses: WalletAddress[];
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    email?: string | null;
                    full_name?: string | null;
                    avatar_url?: string | null;
                    wallet_addresses?: WalletAddress[];
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    email?: string | null;
                    full_name?: string | null;
                    avatar_url?: string | null;
                    wallet_addresses?: WalletAddress[];
                    updated_at?: string;
                };
            };
            wallet_addresses: {
                Row: {
                    id: string;
                    user_id: string;
                    address: string;
                    chain: 'ethereum' | 'solana' | 'sui' | 'base';
                    is_primary: boolean;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    address: string;
                    chain: 'ethereum' | 'solana' | 'sui' | 'base';
                    is_primary?: boolean;
                    created_at?: string;
                };
                Update: {
                    is_primary?: boolean;
                };
            };
            refresh_tokens: {
                Row: {
                    id: string;
                    user_id: string;
                    token_hash: string;
                    expires_at: string;
                    created_at: string;
                    revoked: boolean;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    token_hash: string;
                    expires_at: string;
                    created_at?: string;
                    revoked?: boolean;
                };
                Update: {
                    revoked?: boolean;
                };
            };
        };
        Views: {};
        Functions: {};
        Enums: {};
    };
}

export interface WalletAddress {
    address: string;
    chain: 'ethereum' | 'solana' | 'sui' | 'base';
    isPrimary: boolean;
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
