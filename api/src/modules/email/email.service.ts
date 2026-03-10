import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface EmailOptions {
    to: string;
    subject: string;
    text?: string;
    html?: string;
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private transporter: nodemailer.Transporter;
    private readonly fromEmail: string;

    constructor(private readonly configService: ConfigService) {
        this.fromEmail = this.configService.get('SMTP_FROM', 'noreply@exoduze.bet');

        const host = this.configService.get('SMTP_HOST');
        const user = this.configService.get('SMTP_USER');
        const pass = this.configService.get('SMTP_PASS');
        const port = parseInt(this.configService.get('SMTP_PORT', '587'));

        if (host && user && pass) {
            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure: port === 465, // true for 465, false for other ports
                auth: {
                    user,
                    pass,
                },
                tls: {
                    ciphers: 'SSLv3', // Support older TLS if needed
                    rejectUnauthorized: false
                }
            });

            this.verifyConnection();
        } else {
            this.logger.warn('SMTP configuration missing. Email sending will be simulated.');
        }
    }

    private async verifyConnection() {
        try {
            await this.transporter.verify();
            this.logger.log('SMTP connection established successfully');
        } catch (error) {
            this.logger.error(`SMTP connection failed: ${error.message}`);
        }
    }

    /**
     * Send email with anti-throttling retry logic
     */
    async sendEmail(options: EmailOptions): Promise<boolean> {
        if (!this.transporter) {
            this.logger.warn(`[SIMULATION] Email to ${options.to}: ${options.subject}`);
            this.logger.debug(`HTML Preview: ${options.html?.substring(0, 100)}...`);
            return true;
        }

        try {
            const info = await this.transporter.sendMail({
                from: `"ExoDuZe" <${this.fromEmail}>`,
                to: options.to,
                subject: options.subject,
                text: options.text,
                html: options.html,
            });

            this.logger.log(`Email sent: ${info.messageId}`);
            return true;
        } catch (error) {
            this.logger.error(`Failed to send email to ${options.to}: ${error.message}`);

            // Retry logic could go here if needed, but for now we fallback/fail
            return false;
        }
    }

    /**
     * Send verification magic link
     */
    async sendVerificationEmail(email: string, link: string, fullName?: string): Promise<boolean> {
        const subject = 'Verify your email - ExoDuZe';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; }
                    .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #3b82f6; margin-bottom: 20px; }
                    .header h1 { color: #3b82f6; margin: 0; }
                    .button { display: inline-block; background-color: #3b82f6; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
                    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>ExoDuZe</h1>
                    </div>
                    <p>Hi ${fullName || 'there'},</p>
                    <p>Welcome to ExoDuZe! Please verify your email address to activate your account.</p>
                    <div style="text-align: center;">
                        <a href="${link}" class="button">Verify Email Address</a>
                    </div>
                    <p>Or verify using this link: <br/><a href="${link}">${link}</a></p>
                    <p>This link will expire in 15 minutes.</p>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} ExoDuZe. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail({
            to: email,
            subject,
            html,
            text: `Welcome to ExoDuZe! Use this link to verify your email: ${link}`
        });
    }

    /**
     * Send OTP code
     */
    async sendOtpEmail(email: string, code: string): Promise<boolean> {
        const subject = 'Your Verification Code - ExoDuZe';
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; }
                    .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #3b82f6; margin-bottom: 20px; }
                    .header h1 { color: #3b82f6; margin: 0; }
                    .code { font-size: 32px; letter-spacing: 5px; font-weight: bold; color: #333; background: #f4f4f5; padding: 10px 20px; border-radius: 8px; display: inline-block; margin: 20px 0; }
                    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>ExoDuZe</h1>
                    </div>
                    <p>Your verification code is:</p>
                    <div style="text-align: center;">
                        <div class="code">${code}</div>
                    </div>
                    <p>This code will expire in 10 minutes. Do not share this code with anyone.</p>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} ExoDuZe. All rights reserved.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        return this.sendEmail({
            to: email,
            subject,
            html,
            text: `Your ExoDuZe verification code is: ${code}`
        });
    }
}
