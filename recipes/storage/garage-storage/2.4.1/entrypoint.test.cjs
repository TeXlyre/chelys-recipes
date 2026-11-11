// recipes/storage/garage-storage/2.4.1/entrypoint.test.cjs
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

function withState(check) {
	const dir = mkdtempSync(join(tmpdir(), 'garage-state-'));
	try {
		mkdirSync(join(dir, 'meta'));
		mkdirSync(join(dir, 'data'));
		check(dir, () => spawnSync('sh', [join(__dirname, 'entrypoint.sh')], {
			encoding: 'utf8', env: { ...process.env, GARAGE_STATE_DIR: dir },
		}));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

test('does not regenerate credentials when Garage data already exists', () => {
	withState((dir, run) => {
		writeFileSync(join(dir, 'meta', 'db'), 'saved metadata');
		const result = run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Restore the original storage.env/);
		assert.equal(existsSync(join(dir, 'storage.env')), false);
	});
});

test('does not regenerate credentials when Garage config already exists', () => {
	withState((dir, run) => {
		writeFileSync(join(dir, 'garage.toml'), 'saved config');
		const result = run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Restore the original storage.env/);
		assert.equal(existsSync(join(dir, 'storage.env')), false);
	});
});

test('does not rotate an absent storage prefix secret', () => {
	withState((dir, run) => {
		const envPath = join(dir, 'storage.env');
		writeFileSync(envPath, 'GARAGE_ACCESS_KEY=old-key\n');
		const result = run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /missing a valid STORAGE_PREFIX_SECRET/);
		assert.equal(readFileSync(envPath, 'utf8'), 'GARAGE_ACCESS_KEY=old-key\n');
	});
});

test('does not regenerate Garage config after data has been created', () => {
	withState((dir, run) => {
		writeFileSync(join(dir, 'storage.env'), `STORAGE_PREFIX_SECRET=${'a'.repeat(64)}\n`);
		writeFileSync(join(dir, 'data', 'blob'), 'saved data');
		const result = run();
		assert.notEqual(result.status, 0);
		assert.match(result.stderr, /Restore the original configuration/);
		assert.equal(existsSync(join(dir, 'garage.toml')), false);
	});
});
