import { IsString, IsNotEmpty, IsUUID, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * ClaimPrizeDto — Strict input validation for prize claims.
 *
 * Security:
 * - UUID format enforcement prevents SQL injection / NoSQL injection
 * - @IsNotEmpty prevents empty-string bypass attacks
 * - No extra fields accepted (whitelist mode via ValidationPipe)
 */
export class ClaimPrizeDto {
    @ApiProperty({
        description: 'The UUID of the winner record to claim',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    })
    @IsString({ message: 'winner_id must be a string' })
    @IsNotEmpty({ message: 'winner_id is required' })
    @IsUUID('4', { message: 'winner_id must be a valid UUID v4' })
    winner_id: string;
}

/**
 * SettlePoolDto — Strict input validation for pool settlement.
 */
export class SettlePoolDto {
    @ApiProperty({
        description: 'The UUID of the competition to settle',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    })
    @IsString({ message: 'competition_id must be a string' })
    @IsNotEmpty({ message: 'competition_id is required' })
    @IsUUID('4', { message: 'competition_id must be a valid UUID v4' })
    competition_id: string;
}
