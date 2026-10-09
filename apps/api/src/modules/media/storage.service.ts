import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../config/env';

/** S3-compatible object storage. Objects are private; access is only via short-lived presigned URLs. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /** Presigned URLs must use a host reachable by clients (e.g. LAN IP for a phone). */
  private readonly publicClient: S3Client;
  private readonly bucket = env().S3_BUCKET;

  constructor() {
    const base = {
      // Fail fast: storage problems must not stall emergency reporting.
      requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
      region: env().S3_REGION,
      forcePathStyle: env().S3_FORCE_PATH_STYLE,
      credentials: env().S3_ACCESS_KEY_ID
        ? { accessKeyId: env().S3_ACCESS_KEY_ID, secretAccessKey: env().S3_SECRET_ACCESS_KEY }
        : undefined,
    };
    this.client = new S3Client({ ...base, endpoint: env().S3_ENDPOINT || undefined });
    this.publicClient = new S3Client({ ...base, endpoint: env().S3_PUBLIC_ENDPOINT || env().S3_ENDPOINT || undefined });
  }

  async onModuleInit(): Promise<void> {
    if (!env().S3_AUTO_CREATE_BUCKET) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`created bucket ${this.bucket}`);
      } catch (err) {
        this.logger.warn({ err }, 'object storage unavailable; media uploads will fail until it is reachable');
      }
    }
  }

  presignPut(key: string, contentType: string, contentLength: number, expiresIn = 600): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      { expiresIn, signableHeaders: new Set(['content-type', 'content-length']) },
    );
  }

  presignGet(key: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(this.publicClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  /** Returns object size, or null when missing/unreachable. */
  async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType };
    } catch {
      return null;
    }
  }
}
