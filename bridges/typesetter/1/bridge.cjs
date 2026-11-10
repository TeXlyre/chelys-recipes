'use strict';

const { WebSocketServer } = require('ws');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const PORT = Number(process.env.WS_PORT || 7040);
const CACHE_ROOT = process.env.CACHE_DIR || '/workspace/.cache';
const SESSION_ROOT = path.join(CACHE_ROOT, 'sessions');
const TIMEOUT = Number(process.env.ENGINE_TIMEOUT || 120000);
const ADAPTER_PATH = process.env.ENGINE_ADAPTER || '';
const ENGINE_CMD = process.env.ENGINE_CMD || '';
const ENGINE_ARGS = process.env.ENGINE_ARGS || '';
const ENGINE_OUTPUT = process.env.ENGINE_OUTPUT || '';
const ENGINE_MIME = process.env.ENGINE_MIME || 'application/octet-stream';

const MISSING_FILES_STATUS = -2;

function normalizePath(filePath) {
	return path.posix
		.normalize(String(filePath || '').replaceAll('\\', '/'))
		.replace(/^\/+/, '');
}

function assertSafePath(filePath) {
	const normalized = normalizePath(filePath);
	if (!normalized || normalized === '.' || normalized.startsWith('../')) {
		throw new Error(`Invalid path: ${String(filePath)}`);
	}
	return normalized;
}

function isTruthy(value) {
	return value === true || value === 'true' || value === 1 || value === '1';
}

function substitute(template, vars) {
	return template.replace(/\$\{([^}]+)\}/g, (match, key) => {
		if (key.startsWith('opt:')) {
			const value = vars.options[key.slice(4)];
			return value === undefined ? '' : String(value);
		}
		return vars[key] === undefined ? match : String(vars[key]);
	});
}

function buildArgs(vars) {
	if (!ENGINE_ARGS.trim()) return [];
	if (ENGINE_ARGS.trim().startsWith('[')) {
		return JSON.parse(ENGINE_ARGS).map((arg) => substitute(String(arg), vars));
	}
	return ENGINE_ARGS.trim()
		.split(/\s+/)
		.map((arg) => substitute(arg, vars))
		.filter((arg) => arg !== '');
}

function run(command, args, cwd) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd });
		const chunks = [];
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, TIMEOUT);

		child.stdout.on('data', (chunk) => chunks.push(chunk));
		child.stderr.on('data', (chunk) => chunks.push(chunk));

		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({ status: 1, log: `${Buffer.concat(chunks)}${error.message}` });
		});

		child.on('close', (code) => {
			clearTimeout(timer);
			const log = Buffer.concat(chunks).toString('utf8');
			if (timedOut) {
				resolve({ status: 1, log: `${log}\nEngine timed out after ${TIMEOUT}ms.` });
				return;
			}
			resolve({ status: code ?? 1, log });
		});
	});
}

const adapter = ADAPTER_PATH ? require(ADAPTER_PATH) : null;

async function runEngine(request, workDir) {
	const mainFile = assertSafePath(request.mainFile);
	const format = request.format || '';
	const options = request.options || {};

	if (adapter) {
		return adapter.compile({ mainFile, format, options, workDir });
	}

	if (!ENGINE_CMD) {
		throw new Error('No ENGINE_CMD or ENGINE_ADAPTER configured.');
	}

	const output = substitute(ENGINE_OUTPUT, { mainFile, format, options });
	const args = buildArgs({ mainFile, format, output, options });
	const result = await run(ENGINE_CMD, args, workDir);

	return {
		status: result.status,
		log: result.log,
		format: format || 'pdf',
		mimeType: ENGINE_MIME,
		outputPath: output,
	};
}

class Session {
	constructor() {
		this.dir = path.join(SESSION_ROOT, randomUUID());
		this.tracked = new Set();
		this.queue = Promise.resolve();
	}

	enqueue(task) {
		const result = this.queue.then(task, task);
		this.queue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	async reset() {
		await fs.rm(this.dir, { recursive: true, force: true });
		this.tracked.clear();
	}

	async writeFiles(files) {
		for (const file of files) {
			const relative = assertSafePath(file.path);
			const target = path.join(this.dir, relative);
			await fs.mkdir(path.dirname(target), { recursive: true });
			await fs.writeFile(target, Buffer.from(file.content, 'base64'));
			this.tracked.add(relative);
		}
	}

	async reconcile(manifest) {
		const wanted = new Set(manifest.map((entry) => assertSafePath(entry.path)));

		for (const relative of this.tracked) {
			if (wanted.has(relative)) continue;
			await fs.rm(path.join(this.dir, relative), { force: true });
			this.tracked.delete(relative);
		}

		const missing = [];
		for (const relative of wanted) {
			try {
				await fs.access(path.join(this.dir, relative));
			} catch {
				missing.push(relative);
			}
		}
		return missing;
	}
}

async function readOutputFile(workDir, outputPath) {
	const relative = assertSafePath(outputPath);
	const absolute = path.join(workDir, relative);
	return {
		relative,
		data: await fs.readFile(absolute),
	};
}

async function compile(session, request) {
	const files = Array.isArray(request.files) ? request.files : [];
	const manifest = Array.isArray(request.manifest) ? request.manifest : null;

	if (manifest) {
		await fs.mkdir(session.dir, { recursive: true });
		await session.writeFiles(files);
		const missing = await session.reconcile(manifest);
		if (missing.length > 0) {
			return {
				status: MISSING_FILES_STATUS,
				log: `Working tree is missing ${missing.length} file(s); resending.`,
				format: request.format,
				missing,
			};
		}
	} else {
		await session.reset();
		await fs.mkdir(session.dir, { recursive: true });
		await session.writeFiles(files);
	}

	const mainFile = assertSafePath(request.mainFile);
	try {
		await fs.access(path.join(session.dir, mainFile));
	} catch {
		return {
			status: 1,
			log: `Main file not found in working tree: ${mainFile}`,
			format: request.format,
		};
	}

	const result = await runEngine(request, session.dir);

	if (result.status !== 0) {
		return { status: result.status, log: result.log, format: result.format };
	}

	let output;
	try {
		output = await readOutputFile(session.dir, result.outputPath);
	} catch {
		return {
			status: 1,
			log: `${result.log}\nEngine completed without producing ${result.outputPath}.`,
			format: result.format,
		};
	}

	const artifacts = [];
	for (const artifact of Array.isArray(result.artifacts)
		? result.artifacts
		: []) {
		try {
			const file = await readOutputFile(session.dir, artifact.outputPath);
			artifacts.push({
				id: String(artifact.id || ''),
				name: artifact.name || path.basename(file.relative),
				mimeType: artifact.mimeType,
				data: file.data.toString('base64'),
			});
		} catch {
			return {
				status: 1,
				log: `${result.log}\nEngine completed without producing artifact ${artifact.outputPath}.`,
				format: result.format,
			};
		}
	}

	const log = isTruthy((request.options || {}).export)
		? `${result.log}${result.log ? '\n' : ''}Export ready: ${mainFile}`
		: result.log;

	return {
		status: 0,
		log,
		format: result.format,
		mimeType: result.mimeType,
		output: output.data.toString('base64'),
		artifacts: artifacts.length > 0 ? artifacts : undefined,
	};
}

async function handle(session, request) {
	const options = request.options || {};

	if (options.action === 'clear-cache') {
		await session.reset();
		return { status: 0, log: 'Cache cleared.', format: '' };
	}

	return compile(session, request);
}

const server = new WebSocketServer({ host: '0.0.0.0', port: PORT });

server.on('connection', (socket) => {
	const session = new Session();

	socket.on('message', (data) => {
		let request;
		try {
			request = JSON.parse(data.toString());
		} catch {
			socket.send(JSON.stringify({ status: 1, log: 'Invalid JSON request.' }));
			return;
		}

		session.enqueue(async () => {
			let response;
			try {
				response = await handle(session, request);
			} catch (error) {
				response = {
					status: 1,
					log: error instanceof Error ? error.message : String(error),
					format: request.format,
				};
			}
			socket.send(JSON.stringify({ requestId: request.requestId, ...response }));
		});
	});

	socket.on('close', () => {
		session.enqueue(() => session.reset().catch(() => undefined));
	});
});

server.on('listening', () => {
	console.log(
		`Chelys typesetter bridge listening on ws://0.0.0.0:${PORT} (engine: ${ADAPTER_PATH || ENGINE_CMD || 'unconfigured'})`,
	);
});

server.on('error', (error) => {
	console.error('Chelys typesetter bridge error:', error);
	process.exitCode = 1;
});
