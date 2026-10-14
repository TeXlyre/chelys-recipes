// recipes/storage/garage/2.4.1/bridge.cjs
'use strict';

const { once } = require('node:events');
const { randomBytes } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { StorageCore } = require('./storage-core.cjs');
const { S3Store } = require('./s3-store.cjs');

const PORT = Number(process.env.WS_PORT || 7060);
const CHUNK_SIZE = 256 * 1024;
const MAX_SMALL_UPLOAD = 16 * 1024 * 1024;

const store = new S3Store({
  endpoint: process.env.GARAGE_S3_ENDPOINT || 'http://127.0.0.1:3900',
  region: process.env.GARAGE_S3_REGION || 'garage',
  bucket: process.env.GARAGE_BUCKET || 'texlyre-storage',
  accessKeyId: process.env.GARAGE_ACCESS_KEY,
  secretAccessKey: process.env.GARAGE_SECRET_KEY,
});
const storage = new StorageCore(store, {
  prefixSecret: process.env.STORAGE_PREFIX_SECRET,
});

function sendJson(ws, value) {
  ws.send(JSON.stringify(value));
}

function sendBinary(ws, bytes) {
  return new Promise((resolve, reject) => {
    ws.send(bytes, { binary: true }, (error) => (error ? reject(error) : resolve()));
  });
}

function fail(ws, id, code, message, extra = {}) {
  sendJson(ws, { id, type: 'result', ok: false, error: { code, message, ...extra } });
}

function parseSize(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid binary size');
  return value;
}

async function sendBinaryResult(ws, id, result) {
  if (result === null) {
    fail(ws, id, 'not-found', 'Stored value not found');
    return;
  }

  const { body, size } = Buffer.isBuffer(result)
    ? { body: [result], size: result.length }
    : result;

  sendJson(ws, { id, type: 'binaryStart', ok: true, size });
  for await (const raw of body) {
    const chunk = Buffer.from(raw);
    for (let offset = 0; offset < chunk.length; offset += CHUNK_SIZE) {
      await sendBinary(ws, chunk.subarray(offset, offset + CHUNK_SIZE));
    }
  }
  sendJson(ws, { id, type: 'binaryEnd', ok: true });
}

function beginBufferedUpload(ws, request, finish) {
  const size = parseSize(request.size);
  if (size > MAX_SMALL_UPLOAD) throw new Error('Upload is too large for this operation');
  ws.upload = { id: request.id, size, received: 0, chunks: [], finish };
  sendJson(ws, { id: request.id, type: 'ready', ok: true });
}

async function beginObjectUpload(ws, request) {
  const size = parseSize(request.size);
  const upload = storage.createObjectUpload(request.projectId, request.objectId, size);
  upload.completion.catch(() => undefined);
  await upload.ready;
  ws.upload = {
    id: request.id,
    size,
    received: 0,
    stream: upload.stream,
    completion: upload.completion,
  };
  sendJson(ws, { id: request.id, type: 'ready', ok: true });
}

async function finishUpload(ws, request) {
  const upload = ws.upload;
  if (!upload || upload.id !== request.id) throw new Error('No matching binary upload');
  if (upload.received !== upload.size) throw new Error('Binary size does not match request');
  ws.upload = null;

  if (upload.stream) {
    upload.stream.end();
    await upload.completion;
    sendJson(ws, { id: request.id, type: 'result', ok: true });
    return;
  }

  const bytes = Buffer.concat(upload.chunks, upload.received);
  const result = await upload.finish(bytes);
  if (result?.ok === false) {
    fail(ws, request.id, 'stale-head', 'Remote HEAD changed', { head: result.head });
    return;
  }
  sendJson(ws, { id: request.id, type: 'result', ok: true, ...(result ?? {}) });
}

async function handleRequest(ws, request) {
  if (!request || typeof request !== 'object' || typeof request.id !== 'string') {
    throw new Error('Invalid request');
  }

  if (request.type === 'binaryEnd') {
    await finishUpload(ws, request);
    return;
  }

  if (ws.upload) throw new Error('Finish the active binary upload first');

  switch (request.op) {
    case 'hello':
      sendJson(ws, {
        id: request.id,
        type: 'result',
        ok: true,
        protocol: 'texlyre-storage',
        version: 1,
        chunkSize: CHUNK_SIZE,
        maxBufferedSize: MAX_SMALL_UPLOAD,
      });
      return;
    case 'getCatalogue':
      await sendBinaryResult(ws, request.id, await storage.getCatalogue());
      return;
    case 'putCatalogue':
      beginBufferedUpload(ws, request, (bytes) => storage.putCatalogue(bytes));
      return;
    case 'registerOwner':
      await storage.registerOwner(request.projectId, request.token);
      sendJson(ws, { id: request.id, type: 'result', ok: true });
      return;
    case 'getDeleteChallenge': {
      const nonce = randomBytes(32).toString('hex');
      ws.deleteChallenge = { nonce, expires: Date.now() + 60_000 };
      sendJson(ws, { id: request.id, type: 'result', ok: true, nonce });
      return;
    }
    case 'deleteProject': {
      const challenge = ws.deleteChallenge;
      ws.deleteChallenge = null; // one attempt, even when the proof is incorrect
      if (!challenge || Date.now() > challenge.expires ||
          !await storage.verifyDeletionProof(request.projectId, challenge.nonce, request.proof)) {
        fail(ws, request.id, 'forbidden', 'Invalid or expired deletion authorization');
        return;
      }
      sendJson(ws, {
        id: request.id,
        type: 'result',
        ok: true,
        ...await storage.deleteProject(request.projectId),
      });
      return;
    }
    case 'getHead':
      sendJson(ws, {
        id: request.id,
        type: 'result',
        ok: true,
        head: await storage.getHead(request.projectId),
      });
      return;
    case 'getRevision':
      await sendBinaryResult(
        ws,
        request.id,
        await storage.getRevision(request.projectId, request.revisionId),
      );
      return;
    case 'getObject':
      await sendBinaryResult(
        ws,
        request.id,
        await storage.getObjectStream(request.projectId, request.objectId),
      );
      return;
    case 'putObject':
      await beginObjectUpload(ws, request);
      return;
    case 'commitHead':
      beginBufferedUpload(ws, request, (manifest) =>
        storage.commitHead(
          request.projectId,
          request.expectedHead ?? null,
          request.newRevision,
          manifest,
        ),
      );
      return;
    default:
      fail(ws, request.id, 'unsupported-operation', `Unsupported operation: ${String(request.op)}`);
  }
}

async function startBridge() {
  // Migrate legacy on-disk keys before accepting connections.
  await storage.migrateLegacyPrefixes();
  const server = new WebSocketServer({ host: '0.0.0.0', port: PORT });
  server.on('connection', (ws) => {
  ws.upload = null;

  ws.on('message', async (data, isBinary) => {
    let requestId = ws.upload?.id ?? 'unknown';
    try {
      if (isBinary) {
        const upload = ws.upload;
        if (!upload) throw new Error('Unexpected binary frame');
        const chunk = Buffer.from(data);
        if (upload.received + chunk.length > upload.size) {
          throw new Error('Binary upload exceeds declared size');
        }
        upload.received += chunk.length;

        if (upload.stream) {
          if (!upload.stream.write(chunk)) {
            ws.pause();
            await once(upload.stream, 'drain');
            ws.resume();
          }
        } else {
          upload.chunks.push(chunk);
        }
        return;
      }

      const request = JSON.parse(data.toString('utf8'));
      requestId = typeof request?.id === 'string' ? request.id : requestId;
      await handleRequest(ws, request);
    } catch (error) {
      if (ws.upload?.stream) ws.upload.stream.destroy(error);
      ws.upload = null;
      fail(
        ws,
        requestId,
        typeof error?.code === 'string' ? error.code : 'request-failed',
        error instanceof Error ? error.message : 'Request failed',
      );
    }
  });

  ws.on('close', () => {
    if (ws.upload?.stream) ws.upload.stream.destroy(new Error('WebSocket closed'));
    ws.upload = null;
  });
});

  server.on('listening', () => {
    console.log(`[storage-bridge] listening on ws://0.0.0.0:${PORT}`);
  });
  server.on('error', (error) => {
    console.error('[storage-bridge]', error);
    process.exitCode = 1;
  });
}

startBridge().catch((error) => {
  console.error('[storage-bridge] startup migration failed:', error);
  process.exitCode = 1;
});
