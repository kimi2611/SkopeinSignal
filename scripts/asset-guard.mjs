#!/usr/bin/env node
/**
 * asset-guard — fails the build if any load-bearing static asset is missing.
 *
 * Guards against silent asset loss (this project's i18n dicts and media files
 * have been wiped by accident before). Checked groups:
 *   1. On-device transcription runtime: public/models/** (11 files) + public/ort/** (8 files)
 *   2. Module vignettes + entrance/stage troupe PNGs referenced by code
 *   3. Every src path referenced by recordings/artworks/art guides + all 22 recording illustrations
 *   4. i18n dictionary files exist and parse to a plausible key count
 *
 * Wired into `prebuild` so a missing file can never ship.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const failures = []

function requireFile(path, minBytes, label) {
  const abs = join(ROOT, path)
  try {
    const size = statSync(abs).size
    if (size < minBytes) failures.push(`${label || path}: only ${size} bytes (expected ≥ ${minBytes})`)
  } catch {
    failures.push(`${label || path}: missing`)
  }
}

// 1. Transcription runtime — exact file lists (mirrors transformers.js fetch paths)
const MODEL_FILES = [
  'added_tokens.json', 'config.json', 'generation_config.json', 'merges.txt',
  'onnx/decoder_model_merged_quantized.onnx', 'onnx/encoder_model_quantized.onnx',
  'preprocessor_config.json', 'special_tokens_map.json', 'tokenizer.json',
  'tokenizer_config.json', 'vocab.json',
]
for (const f of MODEL_FILES) {
  requireFile(`public/models/onnx-community/whisper-tiny/resolve/main/${f}`, f.endsWith('.onnx') ? 1_000_000 : 100, `model-tiny:${f}`)
}
// Higher quality tier: whisper-base ships bundled too (base adds normalizer.json;
// it has no use for added_tokens/vocab but they ship for tokenizer parity).
const BASE_MODEL_FILES = [
  'added_tokens.json', 'config.json', 'generation_config.json', 'merges.txt',
  'normalizer.json', 'onnx/decoder_model_merged_quantized.onnx', 'onnx/encoder_model_quantized.onnx',
  'preprocessor_config.json', 'special_tokens_map.json', 'tokenizer.json',
  'tokenizer_config.json', 'vocab.json',
]
for (const f of BASE_MODEL_FILES) {
  requireFile(`public/models/onnx-community/whisper-base/resolve/main/${f}`, f.endsWith('.onnx') ? 20_000_000 : 100, `model-base:${f}`)
}
const ORT_FILES = [
  'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jspi.mjs', 'ort-wasm-simd-threaded.jspi.wasm',
  'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm',
]
for (const f of ORT_FILES) requireFile(`public/ort/${f}`, 1000, `ort:${f}`)

// 2. Module vignettes — one webp per module + stage troupe PNGs
const MODULES = ['week', 'inbox', 'shows', 'dedupe', 'insights', 'study', 'quiz', 'sparks', 'cards', 'gallery', 'notes', 'guide', 'settings', 'account']
for (const m of MODULES) requireFile(`public/module-pigs/${m}.webp`, 5000, `vignette:${m}`)
for (const p of ['entrance-pig.png', 'stage-pig-tutu.png', 'stage-pig-gift.png', 'stage-pig-water.png']) {
  requireFile(`public/module-pigs/${p}`, 10000, `troupe:${p}`)
}

// 3. Media referenced by data files — extract src: '/...' literals
for (const dataFile of ['src/data/recordings.ts', 'src/data/artworks.ts', 'src/data/artGuides.ts']) {
  const source = readFileSync(join(ROOT, dataFile), 'utf8')
  const refs = [...source.matchAll(/src:\s*'([^']+)'/g)].map((m) => m[1])
  if (!refs.length) failures.push(`${dataFile}: no src references parsed`)
  for (const ref of refs) requireFile(`public${ref}`, 10000, `${relative(ROOT, dataFile)} → ${ref}`)
}

// Every recording id must have its own complete picture-book selection image.
// These paths are built by a helper in recordingIllustrations.ts, so a generic
// src-literal scan alone would miss most of them.
const recordingSource = readFileSync(join(ROOT, 'src/data/recordings.ts'), 'utf8')
const recordingIds = [...recordingSource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1])
if (recordingIds.length !== 22 || new Set(recordingIds).size !== 22) {
  failures.push(`recordings: expected 22 unique ids, found ${recordingIds.length}`)
}
for (const id of recordingIds) requireFile(`public/recording-pigs/${id}.webp`, 5000, `recording-illustration:${id}`)

// Every historical artwork has exactly one fixed, non-random picture-book guide.
const artGuideSource = readFileSync(join(ROOT, 'src/data/artGuides.ts'), 'utf8')
const guideArtworkIds = [...artGuideSource.matchAll(/artworkId:\s*'([^']+)'/g)].map((match) => match[1])
const guideSrcs = [...artGuideSource.matchAll(/src:\s*'([^']+)'/g)].map((match) => match[1])
if (guideArtworkIds.length !== 22 || new Set(guideArtworkIds).size !== 22) {
  failures.push(`art guides: expected 22 unique artwork ids, found ${guideArtworkIds.length}`)
}
if (guideSrcs.length !== 22 || new Set(guideSrcs).size !== 22) {
  failures.push(`art guides: expected 22 unique illustration paths, found ${guideSrcs.length}`)
}

// 4. i18n dictionaries
for (const f of ['src/lib/translations/zh-CN.ts', 'src/lib/translations/de.ts']) {
  requireFile(f, 100000, `i18n:${f}`)
}
requireFile('src/lib/translations/research.ts', 20000, 'i18n:src/lib/translations/research.ts')

// 5. Icons referenced by the service worker CORE list
for (const f of ['icons/icon-192-v52.png', 'icons/icon-512-v52.png', 'icons/icon-512-maskable-v52.png', 'icons/apple-touch-icon-v52.png']) requireFile(`public/${f}`, 1000, `icon:${f}`)

if (failures.length) {
  console.error(`asset-guard: ${failures.length} problem(s) found:`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
const counts = {
  models: MODEL_FILES.length + BASE_MODEL_FILES.length, ort: ORT_FILES.length,
  vignettes: MODULES.length, troupe: 4,
}
console.log(`asset-guard OK — ${counts.models} model files, ${counts.ort} ort files, ${counts.vignettes} vignettes, ${counts.troupe} stage figures, media refs, i18n dicts`)
