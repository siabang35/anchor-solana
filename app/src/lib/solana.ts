import { PublicKey } from '@solana/web3.js';
import idl from './idl/exoduze.json';

// Menggunakan Program ID hasil deploy Devnet Anda
export const PROGRAM_ID = new PublicKey("56Gp8kKmibdvxm7c1r9LJQh7D58YHujmwTSteCgYUTo7");

// Export IDL agar bisa digunakan di Provider/Anchor
export const IDL = idl;
