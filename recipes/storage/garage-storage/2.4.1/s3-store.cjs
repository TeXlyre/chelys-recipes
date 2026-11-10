// recipes/storage/garage-storage/2.4.1/s3-store.cjs
'use strict';

const {
	CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand,
	ListObjectsV2Command, PutObjectCommand, S3Client,
} = require('@aws-sdk/client-s3');

async function collect(body) {
	const chunks = [];
	for await (const chunk of body) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
}

class S3Store {
	constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey }) {
		this.bucket = bucket;
		this.client = new S3Client({
			endpoint, region, forcePathStyle: true,
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
			const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
			if (!response.Body) throw new Error(`Missing S3 body for ${key}`);
			return { body: response.Body, size: Number(response.ContentLength ?? 0) };
		} catch (error) {
			if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
			throw error;
		}
	}

	put(key, bytes) {
		return this.client.send(new PutObjectCommand({
			Bucket: this.bucket, Key: key, Body: bytes, ContentLength: bytes.length,
		}));
	}

	putStream(key, body, size) {
		return this.client.send(new PutObjectCommand({
			Bucket: this.bucket, Key: key, Body: body, ContentLength: size,
		}));
	}

	async *#pages(prefix, delimiter) {
		let token;
		do {
			const page = await this.client.send(new ListObjectsV2Command({
				Bucket: this.bucket, Prefix: prefix, ...(delimiter ? { Delimiter: delimiter } : {}),
				ContinuationToken: token,
			}));
			yield page;
			token = page.IsTruncated ? page.NextContinuationToken : undefined;
			if (page.IsTruncated && !token) throw new Error('Incomplete S3 listing');
		} while (token);
	}

	async *listKeys(prefix) {
		for await (const page of this.#pages(prefix)) {
			for (const item of page.Contents ?? []) if (item.Key) yield item.Key;
		}
	}

	async listProjectPrefixes() {
		const prefixes = [];
		for await (const page of this.#pages('vault/', '/')) {
			for (const item of page.CommonPrefixes ?? []) {
				if (item.Prefix) prefixes.push(item.Prefix);
			}
		}
		return prefixes;
	}

	async copy(source, destination) {
		const copySource = `${encodeURIComponent(this.bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`;
		await this.client.send(new CopyObjectCommand({
			Bucket: this.bucket, Key: destination, CopySource: copySource,
		}));
	}

	async deletePrefix(prefix) {
		for (;;) {
			const page = await this.client.send(new ListObjectsV2Command({
				Bucket: this.bucket, Prefix: prefix, MaxKeys: 1000,
			}));
			const keys = (page.Contents ?? []).map((item) => item.Key).filter(Boolean);
			if (!keys.length) return;
			const deleted = await this.client.send(new DeleteObjectsCommand({
				Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
			}));
			if (deleted.Errors?.length) {
				throw new Error(`Failed to delete ${deleted.Errors.length} Garage object(s)`);
			}
		}
	}
}

module.exports = { S3Store };
