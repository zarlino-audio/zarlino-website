// Convert rendered dry/proc WAV pairs to MP3 for the website A/B demos.
// Run: node scripts/demo-mp3.mjs   (devDep: @breezystack/lamejs)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const { default: lamejs } = await import('@breezystack/lamejs');
const KBPS = 128;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcRoot = 'c:/Users/khrit/Desktop/plugin/artifacts/ab-sources';
const outRoot = join(root, 'public', 'audio');

function readWavPcm(path) {
  const b = readFileSync(path);
  let d = 12, fmt = null, dataStart = -1, dataSize = 0;
  while (d + 8 <= b.length) {
    const id = b.toString('ascii', d, d + 4);
    const sz = b.readUInt32LE(d + 4);
    if (id === 'fmt ') {
      fmt = {
        channels: b.readUInt16LE(d + 10),
        sampleRate: b.readUInt32LE(d + 12),
        bits: b.readUInt16LE(d + 22),
      };
    }
    if (id === 'data') { dataStart = d + 8; dataSize = sz; break; }
    d += 8 + sz + (sz % 2);
  }
  if (!fmt || dataStart < 0) throw new Error('bad wav: ' + path);
  const { channels, sampleRate, bits } = fmt;
  const pcm = b.slice(dataStart, dataStart + dataSize);
  const bytesPerSample = bits / 8;
  const frames = Math.floor(pcm.length / (channels * bytesPerSample));
  // decode interleaved to a mono float array (average channels)
  const mono = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) {
      const off = (f * channels + c) * bytesPerSample;
      acc += pcm.readInt16LE(off) / 32768;
    }
    mono[f] = acc / channels;
  }
  return { mono, sampleRate };
}

function pcmToMp3(mono, sampleRate) {
  const enc = new lamejs.Mp3Encoder(1, sampleRate, KBPS);
  const out = [];
  const block = 1152;
  const s16 = new Int16Array(mono.length);
  for (let i = 0; i < mono.length; i++) s16[i] = Math.max(-32768, Math.min(32767, Math.round(mono[i] * 32767)));
  for (let i = 0; i < s16.length; i += block) {
    const chunk = s16.subarray(i, Math.min(i + block, s16.length));
    const buf = enc.encodeBuffer(chunk);
    if (buf.length > 0) out.push(Buffer.from(buf));
  }
  const end = enc.flush();
  if (end.length > 0) out.push(Buffer.from(end));
  return Buffer.concat(out);
}

// Mapping: preset -> { dry, proc, outA, outB }
const demos = {
  ztame: [
    { dry: 'karra_dry.wav', proc: 'karra_proc.wav', outA: 'A_vocal-soothe_dry.mp3', outB: 'B_vocal-soothe_ztame.mp3' },
    { dry: 'ella_dry.wav', proc: 'ella_proc.wav', outA: 'A_room-tamer_dry.mp3', outB: 'B_room-tamer_ztame.mp3' },
    { dry: 'mix_dry.wav', proc: 'mix_proc.wav', outA: 'A_master-polish_dry.mp3', outB: 'B_master-polish_ztame.mp3' },
  ],
  zscorch: [
    { dry: 'guitar_dry.wav', proc: 'guitar_proc.wav', outA: 'A_tape-warm_dry.mp3', outB: 'B_tape-warm_zscorch.mp3' },
    { dry: 'chorus_dry.wav', proc: 'chorus_proc.wav', outA: 'A_studio-drive_dry.mp3', outB: 'B_studio-drive_zscorch.mp3' },
    { dry: 'crunch_dry.wav', proc: 'crunch_proc.wav', outA: 'A_aggressive-crunch_dry.mp3', outB: 'B_aggressive-crunch_zscorch.mp3' },
  ],
};

let totalBefore = 0, totalAfter = 0;
for (const plugin of Object.keys(demos)) {
  const outDir = join(outRoot, plugin);
  mkdirSync(outDir, { recursive: true });
  for (const demo of demos[plugin]) {
    for (const [kind, file, outName] of [['dry', demo.dry, demo.outA], ['proc', demo.proc, demo.outB]]) {
      const { mono, sampleRate } = readWavPcm(join(srcRoot, plugin.toLowerCase(), file));
      const mp3 = pcmToMp3(mono, sampleRate);
      writeFileSync(join(outDir, outName), mp3);
      totalBefore += mono.length * 2;
      totalAfter += mp3.length;
      console.log(`${plugin}/${outName}: ${(mp3.length / 1024).toFixed(0)} KB (${mono.length / sampleRate}s)`);
    }
  }
}
console.log(`Total: ${(totalBefore / 1048576).toFixed(1)} MB PCM -> ${(totalAfter / 1048576).toFixed(1)} MB MP3`);
