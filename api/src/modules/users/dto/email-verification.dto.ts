import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class RequestEmailVerificationDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;
}

export class VerifyEmailDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    @Length(6, 6)
    code: string;
}
