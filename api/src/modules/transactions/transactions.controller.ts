import {
    Controller,
    Get,
    Query,
    Res,
    UseGuards,
    Req,
    Header,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiQuery,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { TransactionsService } from './transactions.service.js';
import {
    TransactionDto,
    TransactionsQueryDto,
    TransactionSummaryDto,
    PnLDataDto,
} from './dto/index.js';

interface AuthenticatedRequest extends Request {
    user: { sub: string };
}

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) { }

    @Get()
    @ApiOperation({ summary: 'Get transaction history' })
    @ApiResponse({ status: 200, type: [TransactionDto] })
    async getTransactions(
        @Query() query: TransactionsQueryDto,
        @Req() req: AuthenticatedRequest,
    ) {
        return this.transactionsService.getTransactions(req.user.sub, query);
    }

    @Get('summary')
    @ApiOperation({ summary: 'Get transaction summary' })
    @ApiQuery({ name: 'startDate', required: false })
    @ApiQuery({ name: 'endDate', required: false })
    @ApiResponse({ status: 200, type: TransactionSummaryDto })
    async getSummary(
        @Query('startDate') startDate: string,
        @Query('endDate') endDate: string,
        @Req() req: AuthenticatedRequest,
    ): Promise<TransactionSummaryDto> {
        return this.transactionsService.getSummary(req.user.sub, startDate, endDate);
    }

    @Get('pnl')
    @ApiOperation({ summary: 'Get PnL data for charts' })
    @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'all'], required: false })
    @ApiResponse({ status: 200, type: [PnLDataDto] })
    async getPnL(
        @Query('period') period: 'day' | 'week' | 'month' | 'all',
        @Req() req: AuthenticatedRequest,
    ): Promise<PnLDataDto[]> {
        return this.transactionsService.getPnLData(req.user.sub, period);
    }

    @Get('export')
    @ApiOperation({ summary: 'Export transactions as CSV' })
    @Header('Content-Type', 'text/csv')
    @Header('Content-Disposition', 'attachment; filename=transactions.csv')
    async exportTransactions(
        @Query() query: TransactionsQueryDto,
        @Req() req: AuthenticatedRequest,
        @Res() res: Response,
    ) {
        const csv = await this.transactionsService.exportTransactions(req.user.sub, query);
        res.send(csv);
    }
}
