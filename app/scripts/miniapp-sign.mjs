#!/usr/bin/env node
// miniapp-sign.mjs — local signer for MVP (mobile-only, no backend)
// Usage: node scripts/miniapp-sign.mjs path/to/manifest.json > signed.json
import fs from 'fs';
import { signPackage } from '../src/miniapps/manifest/signer.ts';

const path = process.argv[2];
if (!path) {
  console.error('Usage: miniapp-sign.mjs <manifest.json>');
  process.exit(1);
}
const raw = fs.readFileSync(path, 'utf8');
const manifest = JSON.parse(raw);
const signed = signPackage(manifest);
console.log(JSON.stringify(signed, null, 2));
