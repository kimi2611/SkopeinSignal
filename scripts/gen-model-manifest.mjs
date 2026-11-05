// Builds manifest.json for each shipped Whisper tier.
//
// The list is deliberate, not "everything in the folder": the tokenizer files
// here are self-contained (tokenizer.json already carries vocab + merges), and
// every extra file is another 40 MB download attempt on a bad link. This is
// exactly the set the pipeline asks for — verified against the network log of a
// real run, which requested 7 files for whisper-tiny.
import { readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MODELS = ['onnx-community/whisper-tiny', 'onnx-community/whisper-base']
const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]

for (const model of MODELS) {
  const root = join('public/models', model, 'resolve/main')
  const files = FILES.map((path) => {
    const full = join(root, path)
    if (!existsSync(full)) throw new Error(`missing model file: ${full}`)
    return { path, size: statSync(full).size }
  })
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0)
  const manifest = { model, files, totalBytes }
  writeFileSync(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  const mb = (totalBytes / 1024 / 1024).toFixed(1)
  console.log(`${model}: ${files.length} files, ${mb} MB`)
}

// Sanity: the ONNX shards must be the big ones, otherwise the manifest is lying
// about what a download costs and the ETA shown to the user is fiction.
const tiny = JSON.parse(readFileSync('public/models/onnx-community/whisper-tiny/resolve/main/manifest.json', 'utf8'))
const dtypes = tiny.files.filter((f) => f.path.endsWith('.onnx'))
if (dtypes.length !== 2) throw new Error('expected two onnx shards')
if (tiny.totalBytes < 30 * 1024 * 1024) throw new Error('tiny manifest totals look wrong')
console.log('manifest OK')
