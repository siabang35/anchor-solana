-- Migration to adding bio column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
