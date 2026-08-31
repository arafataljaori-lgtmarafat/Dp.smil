import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const output = process.argv[2];
if (!output) throw new Error('Expected output directory.');
await mkdir(output, { recursive: true });
const pixels = Buffer.from([32, 128, 224, 255]);
await sharp(pixels, { raw: { width: 1, height: 1, channels: 4 } }).jpeg().toFile(`${output}/valid.jpg`);
await sharp(pixels, { raw: { width: 1, height: 1, channels: 4 } }).png().toFile(`${output}/valid.png`);
await sharp(pixels, { raw: { width: 1, height: 1, channels: 4 } }).webp().toFile(`${output}/valid.webp`);
const validPng = await sharp(pixels, { raw: { width: 1, height: 1, channels: 4 } }).png().toBuffer();
const validJpeg = await sharp(pixels, { raw: { width: 1, height: 1, channels: 4 } }).jpeg().toBuffer();
await writeFile(`${output}/empty.bin`, Buffer.alloc(0));
await writeFile(`${output}/random.bin`, Buffer.from('not an image; <html>fake image</html>'));
await writeFile(`${output}/truncated.png`, validPng.subarray(0, 16));
await writeFile(`${output}/truncated.jpg`, validJpeg.subarray(0, 16));
await writeFile(`${output}/header-only.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
