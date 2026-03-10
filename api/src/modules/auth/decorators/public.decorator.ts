import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public (no authentication required)
 * Usage: @Public() on controller or handler
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
