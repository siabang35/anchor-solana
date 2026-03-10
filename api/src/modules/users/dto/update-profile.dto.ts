import { IsOptional, IsString, IsObject } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    fullName?: string;

    @IsOptional()
    @IsString()
    bio?: string;

    @IsOptional()
    @IsObject()
    preferences?: Record<string, any>;
}
