import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2Service implements OnModuleInit {
    private readonly logger = new Logger(R2Service.name);
    private s3Client: S3Client | null = null;
    private accountId = '';
    private publicUrl = '';
    private isConfigured = false;

    // Configured buckets
    public bucketArchives = 'exoduze-archives';
    public bucketMedia = 'exoduze-media';
    public bucketEtlRaw = 'exoduze-etl-raw';

    constructor(private readonly configService: ConfigService) {}

    onModuleInit() {
        this.accountId = this.configService.get<string>('CLOUDFLARE_R2_ACCOUNT_ID') || '';
        const accessKeyId = this.configService.get<string>('CLOUDFLARE_R2_ACCESS_KEY_ID') || '';
        const secretAccessKey = this.configService.get<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY') || '';
        this.publicUrl = this.configService.get<string>('CLOUDFLARE_R2_PUBLIC_URL') || '';

        // Override default bucket names if specified in env
        this.bucketArchives = this.configService.get<string>('CLOUDFLARE_R2_BUCKET_ARCHIVES') || this.bucketArchives;
        this.bucketMedia = this.configService.get<string>('CLOUDFLARE_R2_BUCKET_MEDIA') || this.bucketMedia;
        this.bucketEtlRaw = this.configService.get<string>('CLOUDFLARE_R2_BUCKET_ETL_RAW') || this.bucketEtlRaw;

        if (!this.accountId || !accessKeyId || !secretAccessKey) {
            this.logger.warn(
                '⚠️ Cloudflare R2 configurations are incomplete in env. R2 upload/download functions will be unavailable.'
            );
            return;
        }

        try {
            this.s3Client = new S3Client({
                endpoint: `https://${this.accountId}.r2.cloudflarestorage.com`,
                credentials: {
                    accessKeyId,
                    secretAccessKey,
                },
                region: 'auto',
            });
            this.isConfigured = true;
            this.logger.log('✅ Cloudflare R2 client initialized successfully');
        } catch (err: any) {
            this.logger.error(`Failed to initialize R2 S3 Client: ${err.message}`);
        }
    }

    /**
     * Check if R2 is configured and active
     */
    isActive(): boolean {
        return this.isConfigured && this.s3Client !== null;
    }

    /**
     * Upload buffer or string data directly to R2 bucket
     */
    async uploadObject(
        bucket: string,
        key: string,
        body: Buffer | string,
        contentType: string
    ): Promise<string> {
        if (!this.isActive()) {
            throw new Error('R2 storage service is not configured');
        }

        try {
            const command = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: contentType,
            });

            await this.s3Client!.send(command);

            // Return the full public URL or a key-based reference URL
            return this.getPublicUrl(bucket, key);
        } catch (err: any) {
            this.logger.error(`Error uploading object to R2 (${bucket}/${key}): ${err.message}`);
            throw err;
        }
    }

    /**
     * Get object from R2 bucket
     */
    async getObject(bucket: string, key: string): Promise<string> {
        if (!this.isActive()) {
            throw new Error('R2 storage service is not configured');
        }

        try {
            const command = new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            });

            const response = await this.s3Client!.send(command);
            const bodyStr = await response.Body?.transformToString();
            return bodyStr || '';
        } catch (err: any) {
            this.logger.error(`Error retrieving object from R2 (${bucket}/${key}): ${err.message}`);
            throw err;
        }
    }

    /**
     * Delete object from R2 bucket
     */
    async deleteObject(bucket: string, key: string): Promise<void> {
        if (!this.isActive()) {
            throw new Error('R2 storage service is not configured');
        }

        try {
            const command = new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            });

            await this.s3Client!.send(command);
        } catch (err: any) {
            this.logger.error(`Error deleting object from R2 (${bucket}/${key}): ${err.message}`);
            throw err;
        }
    }

    /**
     * Generate Public CDN URL for an item in the public media bucket
     */
    getPublicUrl(bucket: string, key: string): string {
        if (bucket === this.bucketMedia && this.publicUrl) {
            // Remove trailing slash if exists in publicUrl
            const base = this.publicUrl.endsWith('/') ? this.publicUrl.slice(0, -1) : this.publicUrl;
            return `${base}/${key}`;
        }
        // Fallback or private bucket url structure
        return `https://${bucket}.${this.accountId}.r2.cloudflarestorage.com/${key}`;
    }

    /**
     * Generate presigned URL for secure direct uploads from Client (Next.js frontend)
     * This avoids proxying large files through NestJS and overloading the server.
     */
    async generatePresignedUploadUrl(
        bucket: string,
        key: string,
        contentType: string,
        expiresInSeconds = 3600
    ): Promise<string> {
        if (!this.isActive()) {
            throw new Error('R2 storage service is not configured');
        }

        try {
            const command = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
            });

            const url = await getSignedUrl(this.s3Client!, command, { expiresIn: expiresInSeconds });
            return url;
        } catch (err: any) {
            this.logger.error(`Error generating presigned upload URL: ${err.message}`);
            throw err;
        }
    }

    /**
     * Generate presigned URL for private downloads
     */
    async generatePresignedDownloadUrl(
        bucket: string,
        key: string,
        expiresInSeconds = 3600
    ): Promise<string> {
        if (!this.isActive()) {
            throw new Error('R2 storage service is not configured');
        }

        try {
            const command = new GetObjectCommand({
                Bucket: bucket,
                Key: key,
            });

            const url = await getSignedUrl(this.s3Client!, command, { expiresIn: expiresInSeconds });
            return url;
        } catch (err: any) {
            this.logger.error(`Error generating presigned download URL: ${err.message}`);
            throw err;
        }
    }
}
