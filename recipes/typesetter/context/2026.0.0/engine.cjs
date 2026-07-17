'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const CONTEXT_BIN = process.env.CONTEXT_BIN || 'context';

function run(command, args, cwd) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd });
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

async function findSyncTeX(workDir, jobName) {
	const candidates = [
		path.join(workDir, `${jobName}.synctex.gz`),
		path.join(workDir, `${jobName}.synctex`),
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
			log: `Could not find ConTeXt source file: ${mainFile}`,
			format,
		};
	}

	const requestedFormat = format === 'canvas-pdf' ? 'canvas-pdf' : 'pdf';
	const jobName = path.basename(mainFile, path.extname(mainFile));
	const sourceDir = path.dirname(sourcePath);
	const sourceName = path.basename(sourcePath);

	const args = [
		'--synctex=repeat',
		'--errorstopmode',
	];

	const resultName = String(options.result || '').trim();
	if (resultName) {
		args.push(`--result=${resultName}`);
	}

	const mode = String(options.mode || '').trim();
	if (mode) {
		args.push(`--mode=${mode}`);
	}

	const environment = String(options.environment || '').trim();
	if (environment) {
		args.push(`--environment=${environment}`);
	}

	args.push(sourceName);

	const result = await run(CONTEXT_BIN, args, sourceDir);
	if (result.status !== 0) {
		return {
			status: result.status,
			log: result.log,
			format: requestedFormat,
		};
	}

	const outputJobName = resultName
		? path.basename(resultName, path.extname(resultName))
		: jobName;
	const pdfPath = path.join(sourceDir, `${outputJobName}.pdf`);

	try {
		await fs.access(pdfPath);
	} catch {
		return {
			status: 1,
			log: `${result.log}\nConTeXt completed without producing ${outputJobName}.pdf.`,
			format: requestedFormat,
		};
	}

	const synctexPath = await findSyncTeX(sourceDir, outputJobName);
	if (!synctexPath) {
		return {
			status: 1,
			log: `${result.log}\nConTeXt completed without producing a SyncTeX file.`,
			format: requestedFormat,
		};
	}

	return {
		status: 0,
		log: result.log,
		format: requestedFormat,
		mimeType: 'application/pdf',
		outputPath: path.relative(workDir, pdfPath),
		artifacts: [
			{
				id: 'synctex',
				name: path.basename(synctexPath),
				mimeType: synctexPath.endsWith('.gz')
					? 'application/gzip'
					: 'application/octet-stream',
				outputPath: path.relative(workDir, synctexPath),
			},
		],
	};
};
