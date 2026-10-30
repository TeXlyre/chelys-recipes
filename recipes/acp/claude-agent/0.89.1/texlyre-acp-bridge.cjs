#!/usr/bin/env node
// texlyre-acp-bridge: runs an ACP agent on stdio and sits between it and
// TeXlyre (reached through a line-mode WebSocket proxy such as websocat).
//
// TeXlyre keeps project files in the browser, so the agent cannot reach them
// on disk. The bridge serves an MCP endpoint over HTTP on a random loopback
// port, protected by a per-process bearer token, and tunnels every MCP request
// to TeXlyre over the existing ACP connection as a `_texlyre/mcp` request.
// It rewrites `session/new` and `session/load` to point the agent at that
// endpoint and at a real working directory, and reports the directory back on
// the result as `_meta.texlyre.cwd`.
//
// The bridge, not the client, decides how sessions are set up. Whoever reaches
// the WebSocket is the client, so `session/new` and `session/load` get only
// TeXlyre's MCP server and the session options from --session-meta, whatever
// the client sent; `session/load` only reopens sessions this bridge started,
// which it lists in <workspace>.sessions; and the client can only send the
// methods TeXlyre uses. Agent replies and requests pass through untouched.
//
// Usage: node texlyre-acp-bridge.cjs [--session-meta <file>] <agent-command> [args...]
//   --session-meta  JSON object sent as `_meta` on every `session/new`, e.g.
//                   the agent's tool restrictions. Without it, none is sent.
// Env:   TEXLYRE_ACP_WORKSPACE  agent working directory (default ./workspace)
//                                The started sessions are listed beside it, in
//                                <workspace>.sessions, one id per line.
'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createInterface } = require('node:readline');

const MCP_METHOD = '_texlyre/mcp';
const MCP_ID_PREFIX = 'texlyre-mcp:';
const MCP_SERVER_NAME = 'texlyre';
const MCP_PATH = '/mcp';
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MCP_TIMEOUT_MS = 5 * 60 * 1000;

// What TeXlyre sends. The agent accepts more (resuming and forking sessions,
// listing them, providers, gateway login), and each of those could hand it
// options or MCP servers of the client's choosing, reveal other sessions, or
// redirect its API traffic.
const CLIENT_REQUESTS = new Set([
	'initialize',
	'session/new',
	'session/load',
	'session/prompt',
]);
const CLIENT_NOTIFICATIONS = new Set(['session/cancel']);

const log = (...parts) => console.error('[texlyre-acp-bridge]', ...parts);

const isObject = (value) =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const usage = () => {
	log(
		'usage: texlyre-acp-bridge.cjs [--session-meta <file>] <agent-command> [args...]',
	);
	process.exit(2);
};

const args = process.argv.slice(2);
let sessionMetaFile;
if (args[0] === '--session-meta') {
	sessionMetaFile = args[1];
	args.splice(0, 2);
	if (!sessionMetaFile) usage();
}
const [command, ...commandArgs] = args;
if (!command) usage();

const readSessionMeta = (file) => {
	try {
		const value = JSON.parse(fs.readFileSync(file, 'utf8'));
		if (!isObject(value)) throw new Error('not a JSON object');
		return value;
	} catch (error) {
		log(`--session-meta ${file}:`, error.message);
		process.exit(2);
	}
};
const sessionMeta = sessionMetaFile
	? readSessionMeta(path.resolve(sessionMetaFile))
	: undefined;

const workspace = path.resolve(
	process.env.TEXLYRE_ACP_WORKSPACE || 'workspace',
);
fs.mkdirSync(workspace, { recursive: true });

// Agents such as claude-agent-acp find a session to load by its id alone,
// anywhere on the machine, so the bridge only loads the ones it started. The
// list sits beside the workspace, out of the agent's working directory.
const sessionsFile = `${workspace}.sessions`;
const readKnownSessions = () => {
	try {
		return new Set(
			fs.readFileSync(sessionsFile, 'utf8').split('\n').filter(Boolean),
		);
	} catch (error) {
		if (error.code !== 'ENOENT') log(`${sessionsFile}:`, error.message);
		return new Set();
	}
};
const knownSessions = readKnownSessions();
const rememberSession = (sessionId) => {
	if (typeof sessionId !== 'string' || !sessionId || sessionId.includes('\n')) {
		return;
	}
	if (knownSessions.has(sessionId)) return;
	knownSessions.add(sessionId);
	try {
		fs.appendFileSync(sessionsFile, `${sessionId}\n`);
	} catch (error) {
		log(`could not record session in ${sessionsFile}:`, error.message);
	}
};

const token = crypto.randomBytes(32).toString('hex');
const expectedAuth = Buffer.from(`Bearer ${token}`);

const pendingMcp = new Map();
// Request id -> method, for session/new and session/load results.
const pendingSessionSetup = new Map();
let nextMcpId = 1;
let mcpUrl = '';

const parse = (line) => {
	try {
		return JSON.parse(line);
	} catch {
		return null;
	}
};

const toClient = (message) => {
	process.stdout.write(`${JSON.stringify(message)}\n`);
};

// --- MCP over HTTP ---------------------------------------------------------

const tunnel = (message) =>
	new Promise((resolve, reject) => {
		const id = `${MCP_ID_PREFIX}${nextMcpId++}`;
		const timer = setTimeout(() => {
			pendingMcp.delete(id);
			reject(new Error('TeXlyre did not answer in time'));
		}, MCP_TIMEOUT_MS);
		pendingMcp.set(id, { resolve, reject, timer });
		toClient({ jsonrpc: '2.0', id, method: MCP_METHOD, params: { message } });
	});

const settleMcp = (message) => {
	const pending = pendingMcp.get(message.id);
	if (!pending) return;
	pendingMcp.delete(message.id);
	clearTimeout(pending.timer);
	if (message.error) pending.reject(new Error(message.error.message));
	else pending.resolve(message.result?.message ?? null);
};

const reply = (res, status, body, headers = {}) => {
	res.writeHead(status, {
		...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
		...headers,
	});
	res.end(body === undefined ? undefined : JSON.stringify(body));
};

const isAuthorized = (req) => {
	const given = Buffer.from(req.headers.authorization || '');
	return (
		given.length === expectedAuth.length &&
		crypto.timingSafeEqual(given, expectedAuth)
	);
};

const readBody = (req) =>
	new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(Object.assign(new Error('body too large'), { status: 413 }));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});

const handleHttp = async (req, res, port) => {
	const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
	// Refuse DNS-rebinding and any browser-originated request outright.
	if (!allowedHosts.includes(req.headers.host) || req.headers.origin) {
		return reply(res, 403);
	}
	if (new URL(req.url, 'http://localhost').pathname !== MCP_PATH) {
		return reply(res, 404);
	}
	if (!isAuthorized(req)) return reply(res, 401);
	if (req.method !== 'POST') return reply(res, 405, undefined, { Allow: 'POST' });

	let message;
	try {
		message = JSON.parse(await readBody(req));
	} catch (error) {
		if (error.status === 413) return reply(res, 413);
		return reply(res, 400, {
			jsonrpc: '2.0',
			id: null,
			error: { code: -32700, message: 'Parse error' },
		});
	}

	if (!message || typeof message !== 'object' || Array.isArray(message)) {
		return reply(res, 400, {
			jsonrpc: '2.0',
			id: null,
			error: { code: -32600, message: 'Batches are not supported' },
		});
	}
	// Notifications and client responses need no answer from TeXlyre.
	if (!message.method || message.id === undefined) return reply(res, 202);

	try {
		const response = await tunnel(message);
		if (!response) return reply(res, 202);
		return reply(res, 200, response);
	} catch (error) {
		return reply(res, 200, {
			jsonrpc: '2.0',
			id: message.id,
			error: { code: -32603, message: error.message },
		});
	}
};

// --- ACP stream rewriting --------------------------------------------------

const mcpServerEntry = () => ({
	type: 'http',
	name: MCP_SERVER_NAME,
	url: mcpUrl,
	headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
});

const refuse = (
	message,
	code = -32601,
	reason = `${String(message.method)} is not available through texlyre-acp-bridge`,
) => {
	log(`refused ${String(message.method)} from the client`);
	if (message.id === undefined) return;
	toClient({ jsonrpc: '2.0', id: message.id, error: { code, message: reason } });
};

// The session parameters the agent gets, built from scratch so nothing the
// client adds (options, MCP servers, extra directories) reaches it.
const sessionParams = (extra) => ({
	...extra,
	cwd: workspace,
	mcpServers: [mcpServerEntry()],
	...(sessionMeta ? { _meta: sessionMeta } : {}),
});

const ignoredServers = (params) => {
	const count = Array.isArray(params.mcpServers) ? params.mcpServers.length : 0;
	if (count) log(`ignored ${count} MCP server(s) from the client`);
};

const fromClient = (line, agent) => {
	const message = parse(line);
	if (!isObject(message)) {
		log('dropped a client message that is not a JSON-RPC object');
		return;
	}

	// Replies: to the bridge's MCP tunnel requests, or to the agent's requests.
	if (message.method === undefined) {
		if (typeof message.id === 'string' && message.id.startsWith(MCP_ID_PREFIX)) {
			settleMcp(message);
			return;
		}
		agent.stdin.write(`${JSON.stringify(message)}\n`);
		return;
	}

	const allowed =
		message.id === undefined ? CLIENT_NOTIFICATIONS : CLIENT_REQUESTS;
	if (!allowed.has(message.method)) {
		refuse(message);
		return;
	}

	if (message.method === 'session/new') {
		const params = isObject(message.params) ? message.params : {};
		ignoredServers(params);
		message.params = sessionParams({});
		pendingSessionSetup.set(message.id, message.method);
	}

	if (message.method === 'session/load') {
		const params = isObject(message.params) ? message.params : {};
		if (!knownSessions.has(params.sessionId)) {
			refuse(message, -32602, 'Unknown session');
			return;
		}
		ignoredServers(params);
		message.params = sessionParams({ sessionId: params.sessionId });
		pendingSessionSetup.set(message.id, message.method);
	}

	agent.stdin.write(`${JSON.stringify(message)}\n`);
};

const fromAgent = (line) => {
	const message = parse(line);

	const setup =
		message && !message.method ? pendingSessionSetup.get(message.id) : undefined;
	if (setup) pendingSessionSetup.delete(message.id);
	if (setup && !message.error) {
		const result = isObject(message.result) ? message.result : {};
		if (setup === 'session/new') rememberSession(result.sessionId);
		const meta = isObject(result._meta) ? result._meta : {};
		message.result = {
			...result,
			_meta: { ...meta, texlyre: { ...(meta.texlyre || {}), cwd: workspace } },
		};
		toClient(message);
		return;
	}

	process.stdout.write(`${line}\n`);
};

// --- lifecycle -------------------------------------------------------------

const main = async () => {
	const server = http.createServer((req, res) => {
		handleHttp(req, res, server.address().port).catch((error) => {
			log('request failed:', error.message);
			if (!res.headersSent) reply(res, 500);
		});
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	mcpUrl = `http://127.0.0.1:${server.address().port}${MCP_PATH}`;

	const agent = spawn(command, commandArgs, {
		cwd: workspace,
		stdio: ['pipe', 'pipe', 'inherit'],
		shell: process.platform === 'win32',
	});

	const shutdown = (code) => {
		server.close();
		for (const pending of pendingMcp.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error('Bridge shutting down'));
		}
		process.exit(code);
	};

	agent.on('error', (error) => {
		log(`could not start ${command}:`, error.message);
		shutdown(1);
	});
	agent.on('exit', (code, signal) => {
		log(`agent exited (${signal || code})`);
		shutdown(code ?? 1);
	});
	agent.stdin.on('error', (error) => log('agent stdin:', error.message));
	// The proxy closes our stdout when TeXlyre disconnects; stop the agent
	// instead of crashing on the next write.
	process.stdout.on('error', (error) => {
		if (error.code !== 'EPIPE') log('stdout:', error.message);
		agent.kill();
	});

	createInterface({ input: agent.stdout, crlfDelay: Infinity }).on(
		'line',
		fromAgent,
	);

	const client = createInterface({ input: process.stdin, crlfDelay: Infinity });
	client.on('line', (line) => {
		if (line.trim()) fromClient(line, agent);
	});
	client.on('close', () => {
		agent.stdin.end();
		setTimeout(() => agent.kill(), 3000).unref();
	});

	for (const signal of ['SIGINT', 'SIGTERM']) {
		process.on(signal, () => agent.kill(signal));
	}

	log(
		`agent ${command} in ${workspace}; MCP on ${mcpUrl}; session options ${
			sessionMetaFile ? `from ${sessionMetaFile}` : 'none'
		}`,
	);
};

main().catch((error) => {
	log(error.stack || error.message);
	process.exit(1);
});
