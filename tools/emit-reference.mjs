// tools/emit-reference.mjs — regenerate the checked-in reference component.
//
//     node tools/emit-reference.mjs
//
// T-075 commits the emitter's output for the reference IR so that a change to the
// emitter shows up as a reviewable DIFF rather than as a silently different build.
// tests/reference-component-diff.test.mjs compares a fresh emit against that file
// byte for byte and fails when they part company.
//
// The IR comes from the test module rather than being duplicated here. Two copies of
// the reference IR would drift, and the snapshot would then be comparing the emitter
// against a stale input while reporting it as an emitter change.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitComponent } from '../server/src/generate/emitComponent.js';
import { makeReferenceIr } from '../tests/reference-component-diff.test.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client/src/sections/generated/reference/HeroSection-reference.jsx');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, emitComponent(makeReferenceIr()), 'utf8');
console.log(`wrote ${path.relative(ROOT, OUT)}`);
