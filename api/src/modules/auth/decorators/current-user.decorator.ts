import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Get current authenticated user from request
 * Usage: @CurrentUser() user: UserPayload
 */
export const CurrentUser = createParamDecorator(
    (data: string | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user;

        // If a specific property is requested
        if (data) {
            return user?.[data];
        }

        return user;
    },
);
