// recipes/storage/garage-storage/2.4.1/storage-backend.cjs
'use strict';

const { StorageCore } = require('./storage-core.cjs');
const { S3Store } = require('./s3-store.cjs');

module.exports = new StorageCore(new S3Store({
	endpoint: process.env.GARAGE_S3_ENDPOINT || 'http://127.0.0.1:3900',
	region: process.env.GARAGE_S3_REGION || 'garage',
	bucket: process.env.GARAGE_BUCKET || 'texlyre-storage',
	accessKeyId: process.env.GARAGE_ACCESS_KEY,
	secretAccessKey: process.env.GARAGE_SECRET_KEY,
}), { prefixSecret: process.env.STORAGE_PREFIX_SECRET });
