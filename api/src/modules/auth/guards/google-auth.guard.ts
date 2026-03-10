import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Google OAuth Guard
 * Initiates Google OAuth flow
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        const activate = (await super.canActivate(context)) as boolean;
        const request = context.switchToHttp().getRequest();
        return activate;
    }
}
