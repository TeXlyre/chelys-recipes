'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const SLIDEV_BIN = process.env.SLIDEV_BIN || 'slidev';
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const EXPORT_ARCHIVE = '.chelys-export.zip';

const PDF_OUTPUT = 'slides-export.pdf';
const PPTX_OUTPUT = 'slides-export.pptx';
const SITE_DIR = 'dist';
const PNG_DIR = 'slides-export';

function run(command, args, cwd) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd, env: process.env });
		const chunks = [];
		child.stdout.on('data', (chunk) => chunks.push(chunk));
		child.stderr.on('data', (chunk) => chunks.push(chunk));
		child.on('error', (error) =>
			resolve({ status: 1, log: `${Buffer.concat(chunks)}${error.message}` }),
		);
		child.on('close', (code) =>
			resolve({ status: code ?? 1, log: Buffer.concat(chunks).toString('utf8') }),
		);
	});
}

async function resolveEntry(workDir, mainFile) {
	const candidate = mainFile && String(mainFile).trim();
	if (candidate) {
		try {
			await fs.access(path.join(workDir, candidate));
			return candidate;
		} catch {
			// fall through to default
		}
	}
	return 'slides.md';
}

function exportArgs(entry, format, options) {
	const args = ['export', entry, '--format', format, '--output', 'slides-export'];
	if (options.withClicks === true || options.withClicks === 'true') {
		args.push('--with-clicks');
	}
	if (options.withToc === true || options.withToc === 'true') {
		args.push('--with-toc');
	}
	if (options.dark === true || options.dark === 'true') {
		args.push('--dark');
	}
	const range = String(options.range || '').trim();
	if (range) {
		args.push('--range', range);
	}
	args.push('--timeout', '60000');
	return args;
}

async function archive(workDir, sourceDir) {
	const target = path.join(workDir, EXPORT_ARCHIVE);
	await fs.rm(target, { force: true });
	const zip = await run(
		PYTHON_BIN,
		['-m', 'zipfile', '-c', target, '.'],
		path.join(workDir, sourceDir),
	);
	return { status: zip.status, log: zip.log };
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const isExport = options.export === true || options.export === 'true';
	const wanted = ['pdf', 'pptx', 'png', 'site'].includes(format) ? format : 'pdf';

	const entry = await resolveEntry(workDir, mainFile);
	try {
		await fs.access(path.join(workDir, entry));
	} catch {
		return {
			status: 1,
			log: `No ${entry} found at the project root. Slidev compiles a Markdown deck; create ${entry} or point the main file at your slides.`,
			format,
		};
	}

	if (wanted !== 'pdf' && !isExport) {
		return {
			status: 1,
			log: `The ${wanted} target is download-only. Use Export to download it.`,
			format,
		};
	}

	if (wanted === 'site') {
		const build = await run(SLIDEV_BIN, ['build', entry, '--out', SITE_DIR], workDir);
		if (build.status !== 0) {
			return { status: build.status, log: build.log, format };
		}
		const zip = await archive(workDir, SITE_DIR);
		if (zip.status !== 0) {
			return {
				status: 1,
				log: `${build.log}\nFailed to archive ${SITE_DIR}:\n${zip.log}`,
				format,
			};
		}
		return {
			status: 0,
			log: `${build.log}\nArchived ${SITE_DIR} for download.`,
			format: 'zip',
			mimeType: 'application/zip',
			outputPath: EXPORT_ARCHIVE,
		};
	}

	const build = await run(SLIDEV_BIN, exportArgs(entry, wanted, options), workDir);
	if (build.status !== 0) {
		return { status: build.status, log: build.log, format };
	}

	if (wanted === 'pdf') {
		return {
			status: 0,
			log: build.log,
			format: format || 'pdf',
			mimeType: 'application/pdf',
			outputPath: PDF_OUTPUT,
		};
	}

	if (wanted === 'pptx') {
		return {
			status: 0,
			log: build.log,
			format: 'pptx',
			mimeType:
				'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			outputPath: PPTX_OUTPUT,
		};
	}

	const zip = await archive(workDir, PNG_DIR);
	if (zip.status !== 0) {
		return {
			status: 1,
			log: `${build.log}\nFailed to archive ${PNG_DIR}:\n${zip.log}`,
			format,
		};
	}
	return {
		status: 0,
		log: `${build.log}\nArchived ${PNG_DIR} for download.`,
		format: 'zip',
		mimeType: 'application/zip',
		outputPath: EXPORT_ARCHIVE,
	};
};
