'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

const PRETEXT_BIN = process.env.PRETEXT_BIN || 'pretext';
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const MANIFEST = 'project.ptx';
const EXPORT_ARCHIVE = '.chelys-export.zip';

const PROBE = `
import json, sys, xml.etree.ElementTree as ET
root = ET.parse(sys.argv[1]).getroot()
targets = []
for target in root.iter('target'):
    targets.append({
        'name': target.get('name'),
        'format': (target.findtext('format') or target.get('format') or '').strip(),
        'outputDir': (target.findtext('output-dir') or '').strip() or None,
    })
print(json.dumps(targets))
`;

function run(command, args, cwd) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd });
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

async function readTargets(workDir) {
	const result = await run(PYTHON_BIN, ['-c', PROBE, MANIFEST], workDir);
	if (result.status !== 0) {
		throw new Error(`Could not read ${MANIFEST}:\n${result.log}`);
	}
	return JSON.parse(result.log);
}

function selectTarget(targets, requested, wantedFormat) {
	if (requested) {
		const named = targets.find((target) => target.name === requested);
		if (!named) {
			const names = targets.map((target) => target.name).join(', ');
			throw new Error(
				`Target "${requested}" is not declared in ${MANIFEST}. Available: ${names || 'none'}`,
			);
		}
		return named;
	}

	const matched = targets.find((target) => target.format === wantedFormat);
	if (!matched) {
		const summary = targets
			.map((target) => `${target.name} (${target.format || 'no format'})`)
			.join(', ');
		throw new Error(
			`No ${MANIFEST} target produces ${wantedFormat}. Available: ${summary || 'none'}`,
		);
	}
	return matched;
}

async function findFirstPdf(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
	const pdf = entries.find(
		(entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'),
	);
	return pdf ? path.join(pdf.parentPath ?? pdf.path, pdf.name) : null;
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	const isExport = options.export === true || options.export === 'true';
	const wantedFormat =
		format === 'html' || format === 'epub' || format === 'braille'
			? format
			: 'pdf';

	try {
		await fs.access(path.join(workDir, MANIFEST));
	} catch {
		return {
			status: 1,
			log: `No ${MANIFEST} found at the project root. PreTeXt builds a project manifest, not a single file; "pretext new book" scaffolds one alongside ${mainFile}.`,
			format,
		};
	}

	if (wantedFormat !== 'pdf' && !isExport) {
		return {
			status: 1,
			log: `The ${wantedFormat} target produces a site, not a document the preview can render. Use Export to download it as a zip.`,
			format,
		};
	}

	let target;
	try {
		const targets = await readTargets(workDir);
		target = selectTarget(targets, String(options.target || '').trim(), wantedFormat);
	} catch (error) {
		return { status: 1, log: error.message, format };
	}

	const args = ['build', target.name];
	if (options.generateAssets === true || options.generateAssets === 'true') {
		args.push('-g');
	}

	const build = await run(PRETEXT_BIN, args, workDir);
	if (build.status !== 0) {
		return { status: build.status, log: build.log, format };
	}

	const outputDir = target.outputDir || path.posix.join('output', target.name);
	const outputPath = path.join(workDir, outputDir);

	try {
		await fs.access(outputPath);
	} catch {
		return {
			status: 1,
			log: `${build.log}\npretext build ${target.name} completed without producing ${outputDir}.`,
			format,
		};
	}

	if (wantedFormat === 'pdf') {
		const pdf = await findFirstPdf(outputPath);
		if (!pdf) {
			return {
				status: 1,
				log: `${build.log}\nNo PDF found in ${outputDir}.`,
				format,
			};
		}
		return {
			status: 0,
			log: build.log,
			format: format || 'pdf',
			mimeType: 'application/pdf',
			outputPath: path.relative(workDir, pdf),
		};
	}

	const archive = path.join(workDir, EXPORT_ARCHIVE);
	await fs.rm(archive, { force: true });
	const zip = await run(PYTHON_BIN, ['-m', 'zipfile', '-c', archive, '.'], outputPath);
	if (zip.status !== 0) {
		return {
			status: 1,
			log: `${build.log}\nFailed to archive ${outputDir}:\n${zip.log}`,
			format,
		};
	}

	return {
		status: 0,
		log: `${build.log}\nArchived ${outputDir} for download.`,
		format: 'zip',
		mimeType: 'application/zip',
		outputPath: EXPORT_ARCHIVE,
	};
};
