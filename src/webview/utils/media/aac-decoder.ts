/**
 * AAC decoding for response previews, via the vendored fdk-aac WebAssembly build.
 * See `vendor/fdk-aac/README.md` for why this is needed and how the binary was produced.
 */
import wasmDataUri from '../../vendor/fdk-aac/fdk-aac-decoder.wasm';
import {
  isDecodableAacTrack,
  MAX_DECODED_BYTES,
  NOMINAL_FRAME_SAMPLES,
  type Mp4AudioTrack
} from './mp4-audio';
import { wavBlobFromPcmChunks } from './wav';

interface FdkExports {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  fdkaac_open: () => number;
  fdkaac_config: (decoder: number, ptr: number, len: number) => number;
  fdkaac_decode: (decoder: number, ptr: number, len: number) => number;
  fdkaac_pcm: (decoder: number) => number;
  fdkaac_sample_rate: (decoder: number) => number;
  fdkaac_channels: (decoder: number) => number;
  fdkaac_close: (decoder: number) => void;
  fdkaac_malloc: (size: number) => number;
  fdkaac_free: (ptr: number) => void;
}

const MAX_FRAME_BYTES = 8192;

/** Frames decoded between yields, so a long track does not lock up the webview. */
const FRAMES_PER_SLICE = 512;

let instancePromise: Promise<FdkExports> | null = null;

const loadDecoder = (): Promise<FdkExports> => {
  if (!instancePromise) {
    instancePromise = (async () => {
      const base64 = wasmDataUri.slice(wasmDataUri.indexOf(',') + 1);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // The module never touches stdio or exits; these imports exist only because it links wasi-libc.
      const stub = () => 0;
      const { instance } = await WebAssembly.instantiate(bytes, {
        wasi_snapshot_preview1: {
          fd_close: stub,
          fd_prestat_get: () => 8, // EBADF
          fd_prestat_dir_name: stub,
          fd_seek: stub,
          fd_write: stub,
          proc_exit: stub
        }
      });
      const exports = instance.exports as unknown as FdkExports;
      exports._initialize();
      return exports;
    })().catch((error) => {
      instancePromise = null;
      throw error;
    });
  }
  return instancePromise;
};

/**
 * Decodes every access unit of `track` into a WAV blob, dropping the edit-list trim so the audio
 * starts at presentation time zero and stays aligned with the video track.
 *
 * An access unit that cannot be decoded contributes silence rather than being dropped, so the audio
 * keeps the video's timeline instead of running progressively early.
 */
export const decodeAacTrack = async (bytes: Uint8Array, track: Mp4AudioTrack): Promise<Blob | null> => {
  if (!isDecodableAacTrack(track)) return null;

  const fdk = await loadDecoder();
  const decoder = fdk.fdkaac_open();
  if (!decoder) return null;

  const config = track.config as Uint8Array;
  const configPtr = fdk.fdkaac_malloc(config.length);
  const framePtr = fdk.fdkaac_malloc(MAX_FRAME_BYTES);

  try {
    new Uint8Array(fdk.memory.buffer).set(config, configPtr);
    if (fdk.fdkaac_config(decoder, configPtr, config.length) !== 0) return null;

    const chunks: Int16Array[] = [];
    // The sample entry's channel count is unverified, and a zero would give silence no duration.
    let channels = Math.max(track.channels, 1);
    let sampleRate = track.sampleRate;
    // The nominal size stands in until a frame decodes, so leading bad access units still fill time.
    let frameSamples = NOMINAL_FRAME_SAMPLES;
    let decoded = 0;
    let total = 0;

    for (let i = 0; i < track.samples.length; i++) {
      if (i > 0 && i % FRAMES_PER_SLICE === 0) await new Promise<void>((resolve) => setTimeout(resolve));

      const sample = track.samples[i];
      const readable = sample.size <= MAX_FRAME_BYTES && sample.offset + sample.size <= bytes.byteLength;
      let frames = 0;

      // Decoding a short read would hand the decoder whatever the last frame left in the buffer.
      if (readable) {
        new Uint8Array(fdk.memory.buffer).set(bytes.subarray(sample.offset, sample.offset + sample.size), framePtr);
        frames = fdk.fdkaac_decode(decoder, framePtr, sample.size);
      }

      if (frames > 0) {
        channels = fdk.fdkaac_channels(decoder) || channels;
        sampleRate = fdk.fdkaac_sample_rate(decoder) || sampleRate;
        frameSamples = frames;
        decoded++;
        const pcmPtr = fdk.fdkaac_pcm(decoder);
        const count = frames * channels;
        chunks.push(new Int16Array(fdk.memory.buffer, pcmPtr, count).slice());
        total += count;
      } else {
        const count = frameSamples * channels;
        chunks.push(new Int16Array(count));
        total += count;
      }

      // An SBR stream decodes to twice what the sample table suggested, so the budget is enforced
      // here as well as before the offer.
      if (total * 2 > MAX_DECODED_BYTES) return null;
    }

    // Silence alone is not audio: without a single decoded frame the caller should report failure.
    if (!decoded || !sampleRate) return null;

    // trimStart is in samples at the sample entry's rate, which SBR doubles on the way out.
    const trimSamples = Math.round((track.trimStart * sampleRate) / track.sampleRate) * channels;

    return wavBlobFromPcmChunks({ chunks, totalSamples: total, trimSamples, sampleRate, channels });
  } finally {
    fdk.fdkaac_free(configPtr);
    fdk.fdkaac_free(framePtr);
    fdk.fdkaac_close(decoder);
  }
};
