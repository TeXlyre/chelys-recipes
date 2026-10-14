// recipes/storage/garage/2.4.1/s3-store.cjs
'use strict';

const {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');

function isNotFound(error) {
  return error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404;
}

async function collect(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

class S3Store {
  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey }) {
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async get(key) {
    const result = await this.getStream(key);
    return result === null ? null : collect(result.body);
  }

  async getStream(key) {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) throw new Error(`Missing S3 body for ${key}`);
      return {
        body: response.Body,
        size: Number(response.ContentLength ?? 0),
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  put(key, bytes) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.length,
      }),
    );
  }

  putStream(key, body, size) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentLength: size,
      }),
    );
  }

  async *listKeys(prefix) {
    let token;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: prefix, ContinuationToken: token,
      }));
      for (const object of page.Contents ?? []) {
        if (object.Key) yield object.Key;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token) throw new Error('Incomplete S3 listing');
    } while (token);
  }

  async listProjectPrefixes() {
    const prefixes = [];
    let token;
    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: 'vault/', Delimiter: '/', ContinuationToken: token,
      }));
      for (const item of page.CommonPrefixes ?? []) {
        if (item.Prefix) prefixes.push(item.Prefix);
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token) throw new Error('Incomplete S3 listing');
    } while (token);
    return prefixes;
  }

  async copy(source, destination) {
    // URL-encode components without encoding '/' separators.
    const copySource = `${encodeURIComponent(this.bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`;
    await this.client.send(new CopyObjectCommand({
      Bucket: this.bucket, Key: destination, CopySource: copySource,
    }));
  }

  async deletePrefix(prefix) {
    // Always re-list the first page rather than using continuation tokens while deleting.
    // Every object must be deleted, including orphaned revisions/objects.
    for (;;) {
      const result = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket, Prefix: prefix, MaxKeys: 1000,
      }));
      const keys = (result.Contents ?? []).map((item) => item.Key).filter(Boolean);
      if (!keys.length) return;
      const deleted = await this.client.send(new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }));
      if (deleted.Errors?.length) {
        throw new Error(`Failed to delete ${deleted.Errors.length} Garage object(s)`);
      }
    }
  }
}

module.exports = { S3Store };
