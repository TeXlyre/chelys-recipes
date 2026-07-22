'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { zipSync } = require('fflate');

const TINYMIST_BIN = process.env.TINYMIST_BIN || 'tinymist';
const TYPST_TS_BIN = process.env.TYPST_TS_BIN || 'typst-ts-cli';

const FORMAT_TARGET = {
	pdf: { flag: 'pdf', ext: 'pdf', mime: 'application/pdf' },
	'canvas-pdf': { flag: 'pdf', ext: 'pdf', mime: 'application/pdf' },
	canvas: { engine: 'typst-ts', ext: 'svg', mime: 'image/svg+xml' },
	svg: { flag: 'svg', ext: 'svg', mime: 'image/svg+xml', perPage: true },
	png: { flag: 'png', ext: 'png', mime: 'image/png', perPage: true, zipOnly: true },
	html: { flag: 'html', ext: 'html', mime: 'text/html' },
};

const PAGE_GAP = 8;

function run(command, args, cwd, env) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { cwd, env: env ?? process.env });
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
			resolve({ status: code ?? 1, log: Buffer.concat(chunks).toString('utf8') }),
		);
	});
}

async function collectPages(workDir, jobName, ext) {
	const suffix = `.${ext}`;
	const prefix = `${jobName}-`;
	const entries = await fs.readdir(workDir);
	return entries
		.filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
		.map((name) => ({
			name,
			page: Number(name.slice(prefix.length, -suffix.length)),
		}))
		.filter((entry) => Number.isFinite(entry.page))
		.sort((a, b) => a.page - b.page);
}

function svgDimensions(svg) {
	const viewBox = svg.match(/viewBox\s*=\s*"([^"]+)"/i);
	if (viewBox) {
		const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
		if (parts.length === 4 && parts.every(Number.isFinite)) {
			return { width: parts[2], height: parts[3] };
		}
	}
	const width = svg.match(/\bwidth\s*=\s*"([\d.]+)(?:pt|px)?"/i);
	const height = svg.match(/\bheight\s*=\s*"([\d.]+)(?:pt|px)?"/i);
	return { width: width ? Number(width[1]) : 0, height: height ? Number(height[1]) : 0 };
}

function mergeSvg(pages) {
	let maxWidth = 0;
	let offsetY = 0;
	const groups = pages.map((svg) => {
		const { width, height } = svgDimensions(svg);
		const inner = svg.replace(/^[\s\S]*?<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
		const y = offsetY;
		maxWidth = Math.max(maxWidth, width);
		offsetY += height + PAGE_GAP;
		return { width, y, inner };
	});
	const height = offsetY > 0 ? offsetY - PAGE_GAP : 0;
	const body = groups
		.map((g) => `<g transform="translate(${(maxWidth - g.width) / 2}, ${g.y})">${g.inner}</g>`)
		.join('');
	return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${maxWidth} ${height}" width="${maxWidth}" height="${height}">${body}</svg>`;
}

async function compileCanvas({ mainFile, jobName, workDir, target }) {
	const outputName = `${jobName}.artifact.svg`;
	const args = ['compile', '-w', workDir, '-e', mainFile, '--format', 'svg', '-o', workDir];
	const result = await run(TYPST_TS_BIN, args, workDir, process.env);
	const produced = await fs
		.access(path.join(workDir, outputName))
		.then(() => true)
		.catch(() => false);

	if (result.status !== 0 || !produced) {
		return {
			status: result.status !== 0 ? result.status : 1,
			log: produced
				? result.log
				: `${result.log}\ntypst-ts-cli completed without producing ${outputName}.`,
			format: 'canvas',
		};
	}

	return {
		status: 0,
		log: result.log,
		format: 'canvas',
		mimeType: target.mime,
		outputPath: outputName,
	};
}

exports.compile = async ({ mainFile, format, options, workDir }) => {
	try {
		await fs.access(path.join(workDir, mainFile));
	} catch {
		return { status: 1, log: `Could not find Typst source file: ${mainFile}`, format };
	}

	const requestedFormat = format in FORMAT_TARGET ? format : 'pdf';
	const target = FORMAT_TARGET[requestedFormat];
	const jobName = path.basename(mainFile, path.extname(mainFile));

	if (target.engine === 'typst-ts') {
		return compileCanvas({ mainFile, jobName, workDir, target });
	}

	const outputName = target.perPage
		? `${jobName}-{0p}.${target.ext}`
		: `${jobName}.${target.ext}`;

	const args = ['compile', '--format', target.flag, '--root', workDir];
	if (target.flag === 'pdf') {
		const standard = String(options.pdfStandard || '').trim();
		if (standard) args.push('--pdf-standard', standard);
		if (options.pdfTags === false || options.pdfTags === 'false') args.push('--no-pdf-tags');
	}
	if (target.flag === 'png') {
		const ppi = String(options.ppi || '').trim();
		if (ppi) args.push('--ppi', ppi);
	}
	const pages = String(options.pages || '').trim();
	if (pages) args.push('--pages', pages);
	args.push(mainFile, outputName);

	const env = { ...process.env };
	if (target.flag === 'html') env.TYPST_FEATURES = 'html';

	const result = await run(TINYMIST_BIN, args, workDir, env);

	if (!target.perPage) {
		const produced = await fs
			.access(path.join(workDir, outputName))
			.then(() => true)
			.catch(() => false);
		if (result.status !== 0 || !produced) {
			return {
				status: result.status !== 0 ? result.status : 1,
				log: produced
					? result.log
					: `${result.log}\ntinymist completed without producing ${outputName}.`,
				format: requestedFormat,
			};
		}
		return {
			status: 0,
			log: result.log,
			format: requestedFormat,
			mimeType: target.mime,
			outputPath: outputName,
		};
	}

	const produced =
		result.status === 0 ? await collectPages(workDir, jobName, target.ext) : [];
	if (result.status !== 0 || produced.length === 0) {
		return {
			status: result.status !== 0 ? result.status : 1,
			log: produced.length
				? result.log
				: `${result.log}\ntinymist completed without producing ${jobName}-*.${target.ext}.`,
			format: requestedFormat,
		};
	}

	const zipPages =
		target.zipOnly || options.zipPages === true || options.zipPages === 'true';

	if (zipPages) {
		const files = {};
		for (const page of produced) {
			files[page.name] = new Uint8Array(await fs.readFile(path.join(workDir, page.name)));
		}
		const outputPath = `${jobName}.zip`;
		await fs.writeFile(path.join(workDir, outputPath), Buffer.from(zipSync(files)));
		return {
			status: 0,
			log: result.log,
			format: requestedFormat,
			mimeType: 'application/zip',
			outputPath,
		};
	}

	const svgs = await Promise.all(
		produced.map((page) => fs.readFile(path.join(workDir, page.name), 'utf8')),
	);
	const outputPath = `${jobName}.${target.ext}`;
	await fs.writeFile(
		path.join(workDir, outputPath),
		svgs.length === 1 ? svgs[0] : mergeSvg(svgs),
		'utf8',
	);
	return {
		status: 0,
		log: result.log,
		format: requestedFormat,
		mimeType: target.mime,
		outputPath,
	};
};
