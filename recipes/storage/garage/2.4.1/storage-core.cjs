// recipes/storage/garage/2.4.1/storage-core.cjs
'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');
const { PassThrough } = require('node:stream');

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CATALOGUE_KEY = 'vault/catalogue';

function assertOpaqueId(value, label) {
  if (typeof value !== 'string' || !OPAQUE_ID.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

class StorageCore {
  constructor(store, { prefixSecret }) {
    if (!/^[a-f0-9]{64}$/.test(prefixSecret ?? '')) throw new Error('Storage prefix secret is required');
    this.store = store;
    this.prefixSecret = Buffer.from(prefixSecret, 'hex');
    this.commitQueues = new Map();
  }

  projectPrefix(projectId) {
    const digest = createHmac('sha256', this.prefixSecret)
      .update(assertOpaqueId(projectId, 'project id')).digest('hex');
    // The S3 namespace never contains a client-supplied project ID / Yjs room ID.
    return `vault/h-${digest}`;
  }

  deletedKey(projectId) {
    return `vault/.deleted/${this.projectPrefix(projectId).slice('vault/'.length)}`;
  }

  ownerKey(projectId) {
    return `vault/.owners/${this.projectPrefix(projectId).slice('vault/'.length)}`;
  }

  headKey(projectId) { return `${this.projectPrefix(projectId)}/HEAD`; }
  revisionKey(projectId, revisionId) {
    return `${this.projectPrefix(projectId)}/revisions/${assertOpaqueId(revisionId, 'revision id')}`;
  }
  objectKey(projectId, objectId) {
    return `${this.projectPrefix(projectId)}/objects/${assertOpaqueId(objectId, 'object id')}`;
  }

  async assertActive(projectId) {
    if (await this.store.get(this.deletedKey(projectId)) !== null) {
      const error = new Error('Remote project has been permanently deleted');
      error.code = 'project-deleted';
      throw error;
    }
  }

  async registerOwner(projectId, token) {
    assertOpaqueId(projectId, 'project id');
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new Error('Invalid project deletion key');
    }
    return this.#withProjectLock(projectId, async () => {
      await this.assertActive(projectId);
      const previous = await this.store.get(this.ownerKey(projectId));
      if (previous !== null) {
        if (previous.toString('utf8') !== token) {
          const error = new Error('This project is owned by another client');
          error.code = 'forbidden';
          throw error;
        }
        return;
      }
      // A legacy project cannot be claimed simply by knowing its ID: peers also know it.
      if (await this.store.get(this.headKey(projectId)) !== null) {
        const error = new Error('Existing project has no verifiable deletion owner');
        error.code = 'owner-not-registered';
        throw error;
      }
      for await (const _ of this.store.listKeys(`${this.projectPrefix(projectId)}/`)) {
        const error = new Error('Existing project has no verifiable deletion owner');
        error.code = 'owner-not-registered';
        throw error;
      }
      // Registration happens before the first project upload; never store in its project prefix.
      await this.store.put(this.ownerKey(projectId), Buffer.from(token, 'utf8'));
    });
  }

  async verifyDeletionProof(projectId, nonce, proof) {
    assertOpaqueId(projectId, 'project id');
    if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) return false;
    if (typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof)) return false;
    const token = await this.store.get(this.ownerKey(projectId));
    if (!token || !/^[a-f0-9]{64}$/.test(token.toString('utf8'))) return false;
    const expected = createHmac('sha256', Buffer.from(token.toString('utf8'), 'hex'))
      .update(`${projectId}:${nonce}`).digest();
    return timingSafeEqual(Buffer.from(proof, 'hex'), expected);
  }

  getCatalogue() { return this.store.get(CATALOGUE_KEY); }
  putCatalogue(bytes) { return this.store.put(CATALOGUE_KEY, bytes); }

  async getHead(projectId) {
    await this.assertActive(projectId);
    const bytes = await this.store.get(this.headKey(projectId));
    return bytes === null ? null : bytes.toString('utf8');
  }

  async getRevision(projectId, revisionId) {
    await this.assertActive(projectId);
    return this.store.get(this.revisionKey(projectId, revisionId));
  }

  async getObject(projectId, objectId) {
    await this.assertActive(projectId);
    return this.store.get(this.objectKey(projectId, objectId));
  }

  async getObjectStream(projectId, objectId) {
    await this.assertActive(projectId);
    return this.store.getStream(this.objectKey(projectId, objectId));
  }

  putObject(projectId, objectId, bytes) {
    return this.#withProjectLock(projectId, async () => {
      await this.assertActive(projectId);
      await this.store.put(this.objectKey(projectId, objectId), bytes);
    });
  }

  putObjectStream(projectId, objectId, body, size) {
    return this.#withProjectLock(projectId, async () => {
      await this.assertActive(projectId);
      await this.store.putStream(this.objectKey(projectId, objectId), body, size);
    });
  }

  async commitHead(projectId, expectedHead, newRevision, manifest) {
    assertOpaqueId(projectId, 'project id');
    assertOpaqueId(newRevision, 'revision id');
    if (expectedHead !== null && expectedHead !== undefined) {
      assertOpaqueId(expectedHead, 'expected revision id');
    }

    return this.#withProjectLock(projectId, async () => {
      const currentHead = await this.getHead(projectId);
      if (currentHead !== (expectedHead ?? null)) {
        return { ok: false, head: currentHead };
      }
      await this.store.put(this.revisionKey(projectId, newRevision), manifest);
      await this.store.put(this.headKey(projectId), Buffer.from(newRevision, 'utf8'));
      return { ok: true, head: newRevision };
    });
  }

  createObjectUpload(projectId, objectId, size) {
    const stream = new PassThrough();
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    const completion = this.#withProjectLock(projectId, async () => {
      await this.assertActive(projectId);
      resolveReady(); // Binary frames are accepted only after acquiring the project lock.
      await this.store.putStream(this.objectKey(projectId, objectId), stream, size);
    }).catch((error) => {
      rejectReady(error);
      throw error;
    });
    return { stream, ready, completion };
  }

  async deleteProject(projectId) {
    return this.#withProjectLock(projectId, async () => {
      // Tombstone FIRST: block all future writes, including disconnected peers.
      await this.store.put(this.deletedKey(projectId), Buffer.from('deleted'));
      await this.store.deletePrefix(`${this.projectPrefix(projectId)}/`);
      // Also remove any unmigrated legacy keys (safe to retry after an interruption).
      await this.store.deletePrefix(`vault/${assertOpaqueId(projectId, 'project id')}/`);
      // Retain the owner proof alongside the tombstone so retries remain authenticated
      // if TeXlyre loses its connection before the encrypted catalogue is updated.
      return { deleted: true };
    });
  }

  async migrateLegacyPrefixes() {
    // Run before accepting WebSocket connections; migration is restart-safe.
    // Copy all objects first and only then delete legacy keys.
    const prefixes = await this.store.listProjectPrefixes();
    for (const prefix of prefixes) {
      const id = prefix.slice('vault/'.length, -1);
      if (id.startsWith('h-') || id.startsWith('.') || !OPAQUE_ID.test(id)) continue;
      // A legacy project ID can be a Yjs ID: it must not remain visible as an S3 key.
      const legacyKeys = [];
      for await (const key of this.store.listKeys(prefix)) legacyKeys.push(key);
      for (const source of legacyKeys) {
        await this.store.copy(source, `${this.projectPrefix(id)}/${source.slice(prefix.length)}`);
      }
      await this.store.deletePrefix(prefix);
    }
  }

  async #withProjectLock(projectId, operation) {
    assertOpaqueId(projectId, 'project id');
    const previous = this.commitQueues.get(projectId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    const tail = run.then(() => undefined, () => undefined);
    this.commitQueues.set(projectId, tail);
    try {
      return await run;
    } finally {
      if (this.commitQueues.get(projectId) === tail) this.commitQueues.delete(projectId);
    }
  }
}

module.exports = { CATALOGUE_KEY, StorageCore, assertOpaqueId };
