import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
      region: 'auto',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY ?? 'minioadmin',
        secretAccessKey: process.env.R2_SECRET_KEY ?? 'minioadmin',
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
}

const BUCKET = process.env.R2_BUCKET ?? 'aipulse';

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
  const endpoint = process.env.R2_ENDPOINT ?? 'http://localhost:9000';
  return `${endpoint}/${BUCKET}/${key}`;
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getS3Client();
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}
