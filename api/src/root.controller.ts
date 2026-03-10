import { Controller, Get } from '@nestjs/common';

@Controller()
export class RootController {
    @Get()
    root() {
        return {
            name: 'ExoDuZe API',
            version: '1.0.0',
            status: 'running',
            docs: '/docs',
            health: '/api/v1/health',
            timestamp: new Date().toISOString(),
        };
    }
}
