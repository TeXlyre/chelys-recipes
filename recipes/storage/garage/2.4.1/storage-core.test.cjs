'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { StorageCore } = require('./storage-core.cjs');

class MemoryStore {
  constructor() { this.objects = new Map(); }
  async get(key) { return this.objects.get(key) ?? null; }
  async put(key, value) { this.objects.set(key, Buffer.from(value)); }
  async getStream(key) {
    const value = await this.get(key);
    return value === null ? null : { body: [value], size: value.length };
  }
  async putStream(key, body) {
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    this.objects.set(key, Buffer.concat(chunks));
  }
  async *listKeys(prefix) {
    for (const key of [...this.objects.keys()].filter((key) => key.startsWith(prefix))) yield key;
  }
  async listProjectPrefixes() {
    return [...new Set([...this.objects.keys()]
      .filter((key) => key.startsWith('vault/'))
      .map((key) => key.split('/'))
      .filter((parts) => parts.length > 2)
      .map((parts) => `vault/${parts[1]}/`))];
  }
  async copy(source, destination) {
    const bytes = await this.get(source);
    assert(bytes !== null);
    await this.put(destination, bytes);
  }
  async deletePrefix(prefix) {
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) this.objects.delete(key);
    }
  }
}

const prefixSecret = '1'.repeat(64);
const deleteToken = '2'.repeat(64);
const make = () => {
  const store = new MemoryStore();
  return { store, core: new StorageCore(store, { prefixSecret }) };
};

test('project keys never contain the raw storage or Yjs identifier', async () => {
  const { core, store } = make();
  await core.putObject('yjsRoom123', 'asset', Buffer.from('ciphertext'));
  const prefix = core.projectPrefix('yjsRoom123');
  assert.match(prefix, /^vault\/h-[a-f0-9]{64}$/);
  assert(!prefix.includes('yjsRoom123'));
  assert.equal((await core.getObject('yjsRoom123', 'asset')).toString(), 'ciphertext');
  assert([...store.objects.keys()].every((key) => !key.includes('yjsRoom123')));
});

test('migration moves legacy object keys before serving, without losing revisions', async () => {
  const { core, store } = make();
  await store.put('vault/yjsRoom123/HEAD', Buffer.from('rev1'));
  await store.put('vault/yjsRoom123/revisions/rev1', Buffer.from('encrypted revision'));
  await store.put('vault/yjsRoom123/objects/object1', Buffer.from('encrypted object'));
  await core.migrateLegacyPrefixes();
  await core.migrateLegacyPrefixes(); // idempotent
  assert.equal(await core.getHead('yjsRoom123'), 'rev1');
  assert.equal((await core.getRevision('yjsRoom123', 'rev1')).toString(), 'encrypted revision');
  assert.equal((await core.getObject('yjsRoom123', 'object1')).toString(), 'encrypted object');
  assert([...store.objects.keys()].every((key) => !key.includes('yjsRoom123')));
});

test('deletion requires project owner proof, not knowledge of a shared project ID', async () => {
  const { core } = make();
  const projectId = 'room123';
  const nonce = '3'.repeat(64);
  assert.equal(await core.verifyDeletionProof(projectId, nonce, '4'.repeat(64)), false);
  await core.registerOwner(projectId, deleteToken);
  const proof = createHmac('sha256', Buffer.from(deleteToken, 'hex'))
    .update(`${projectId}:${nonce}`).digest('hex');
  assert.equal(await core.verifyDeletionProof(projectId, nonce, proof), true);
  assert.equal(await core.verifyDeletionProof('room456', nonce, proof), false);
  assert.equal(await core.verifyDeletionProof(projectId, nonce, '4'.repeat(64)), false);
  await assert.rejects(core.registerOwner(projectId, '5'.repeat(64)), { code: 'forbidden' });
  await core.registerOwner(projectId, deleteToken); // owner registration is idempotent
});

test('peers cannot claim ownership of pre-existing projects with no registration', async () => {
  const { core } = make();
  await core.commitHead('legacy', null, 'rev1', Buffer.from('ciphertext'));
  await assert.rejects(core.registerOwner('legacy', deleteToken), { code: 'owner-not-registered' });
  assert.equal(await core.verifyDeletionProof('legacy', '3'.repeat(64), '4'.repeat(64)), false);
});

test('deleting a project removes all revisions and prevents resurrection by late clients', async () => {
  const { core, store } = make();
  await core.registerOwner('project1', deleteToken);
  await core.putObject('project1', 'object1', Buffer.from('binary'));
  assert.equal((await core.commitHead('project1', null, 'rev1', Buffer.from('manifest'))).ok, true);
  await store.put('vault/project1/objects/legacy', Buffer.from('orphan'));
  await core.deleteProject('project1');
  await core.deleteProject('project1'); // retry is safe
  const proof = createHmac('sha256', Buffer.from(deleteToken, 'hex'))
    .update(`project1:${'3'.repeat(64)}`).digest('hex');
  assert.equal(await core.verifyDeletionProof('project1', '3'.repeat(64), proof), true);
  assert([...store.objects.keys()].every((key) => !key.includes('project1')));
  assert([...store.objects.keys()].every((key) => !key.startsWith(`${core.projectPrefix('project1')}/`)));
  await assert.rejects(core.getHead('project1'), { code: 'project-deleted' });
  await assert.rejects(core.putObject('project1', 'object2', Buffer.from('stale')), { code: 'project-deleted' });
  await assert.rejects(core.commitHead('project1', null, 'rev2', Buffer.from('stale')), { code: 'project-deleted' });
});

test('deletion waits for an in-flight upload and erases its object', async () => {
  const { core, store } = make();
  await core.registerOwner('project1', deleteToken);
  const upload = core.createObjectUpload('project1', 'large', 10);
  upload.stream.write(Buffer.from('12345'));
  const deletion = core.deleteProject('project1');
  upload.stream.end(Buffer.from('67890'));
  await upload.completion;
  await deletion;
  assert.equal([...store.objects.keys()].filter((key) => key.startsWith(`${core.projectPrefix('project1')}/`)).length, 0);
});

test('deleted project refuses an upload before signalling binary-ready', async () => {
  const { core } = make();
  await core.deleteProject('project1');
  const upload = core.createObjectUpload('project1', 'object2', 1000);
  upload.completion.catch(() => undefined);
  await assert.rejects(upload.ready, { code: 'project-deleted' });
});
