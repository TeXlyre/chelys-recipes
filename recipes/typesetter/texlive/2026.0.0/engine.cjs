'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const LATEXMK_BIN = process.env.LATEXMK_BIN || 'latexmk';

const ENGINE_FLAGS = {
	pdflatex: '-pdf',
	lualatex: '-pdflua',
	xelatex: '-pdfxe',
};

function run(command, args, cwd) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd, env: process.env });
		const chunks = [];
		child.stdout.on('data', (chunk) => chunks.push(chunk));
		child.stderr.on('data', (chunk) => chunks.push(chunk));
		child.on('error', (error) =>
			resolve({
				status: 1,
				log: `${Buffer.concat(chunks).toString('utf8')}${error.message}`,
			}),
		);
		child.on('close', (code) =>
			resolve({
				status: code ?? 1,
				log: Buffer.concat(chunks).toString('utf8'),
			}),
		);
	});
}

async function findSyncTeX(dir, jobName) {
	const candidates = [
		path.join(dir, `${jobName}.synctex.gz`),
		path.join(dir, `${jobName}.synctex`),
	];
	for (const candidate of candidates) {
		try {
			await fs.access(candidate);
			return candidate;
		} catch {
			// Try the next supported SyncTeX filename.
		}
	}
	return null;
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const sourcePath = path.join(workDir, mainFile);

	try {
		await fs.access(sourcePath);
	} catch {
		return {
			status: 1,
			log: `Could not find LaTeX source file: ${mainFile}`,
			format,
		};
	}

	const requestedFormat = format === 'canvas-pdf' ? 'canvas-pdf' : 'pdf';
	const jobName = path.basename(mainFile, path.extname(mainFile));
	const sourceDir = path.dirname(sourcePath);
	const sourceName = path.basename(sourcePath);

	const engine = String(options.engine || 'pdflatex').trim().toLowerCase();
	const engineFlag = ENGINE_FLAGS[engine];
	if (!engineFlag) {
		return {
			status: 1,
			log: `Unknown engine "${engine}". Choose pdflatex, lualatex, or xelatex.`,
			format: requestedFormat,
		};
	}

	const shellEscape =
		options.shellEscape === false || options.shellEscape === 'false'
			? false
			: true;

	const args = [
		engineFlag,
		'-interaction=nonstopmode',
		'-file-line-error',
		'-halt-on-error',
		'-synctex=1',
	];

	if (shellEscape) {
		args.push('-shell-escape');
	}

	const bibValue = String(options.bibProgram || '').trim().toLowerCase();
	if (bibValue === 'biber') {
		args.push('-e', '$biber = "biber %O %S";');
	} else if (bibValue === 'bibtex') {
		args.push('-e', '$bibtex_use = 2;');
	}

	args.push(sourceName);

	const result = await run(LATEXMK_BIN, args, sourceDir);

	const pdfPath = path.join(sourceDir, `${jobName}.pdf`);
	let pdfExists = false;
	try {
		await fs.access(pdfPath);
		pdfExists = true;
	} catch {
		pdfExists = false;
	}

	if (result.status !== 0 || !pdfExists) {
		return {
			status: result.status !== 0 ? result.status : 1,
			log: pdfExists
				? result.log
				: `${result.log}\n${engine} completed without producing ${jobName}.pdf.`,
			format: requestedFormat,
		};
	}

	const artifacts = [];
	const synctexPath = await findSyncTeX(sourceDir, jobName);
	if (synctexPath) {
		artifacts.push({
			id: 'synctex',
			name: path.basename(synctexPath),
			mimeType: synctexPath.endsWith('.gz')
				? 'application/gzip'
				: 'application/octet-stream',
			outputPath: path.relative(workDir, synctexPath),
		});
	}

	return {
		status: 0,
		log: result.log,
		format: requestedFormat,
		mimeType: 'application/pdf',
		outputPath: path.relative(workDir, pdfPath),
		artifacts,
	};
};
