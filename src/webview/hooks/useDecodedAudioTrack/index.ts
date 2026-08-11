import { useCallback, useEffect, useRef, useState } from 'react';
import { isDecodableAacTrack, parseMp4AudioTrack, type Mp4AudioTrack } from 'utils/media/mp4-audio';
import { bindEvents } from 'utils/common/dom';

export type DecodedAudioState = 'unavailable' | 'idle' | 'decoding' | 'enabled' | 'failed';

/** Resync when the two elements drift further apart than this, in seconds. */
const MAX_DRIFT = 0.12;

// play() rejects when the host blocks playback (autoplay policy); the video keeps playing silently.
const ignorePlaybackRejection = (): void => undefined;

const audioDecodedBytes = (video: HTMLVideoElement): number =>
  (video as unknown as { webkitAudioDecodedByteCount?: number }).webkitAudioDecodedByteCount || 0;

/**
 * Plays the audio track of a video whose codec the host cannot decode, keeping it in step with the
 * video element. See `vendor/fdk-aac/README.md`.
 *
 * Returns `unavailable` whenever there is nothing to do: no audio track, an unsupported codec, or a
 * host that decodes the track natively (in which case the element's own controls already work).
 */
export const useDecodedAudioTrack = (
  video: HTMLVideoElement | null,
  mediaBytes: Uint8Array | null,
  audioRef: React.RefObject<HTMLAudioElement>
) => {
  const [state, setState] = useState<DecodedAudioState>('unavailable');
  const trackRef = useRef<Mp4AudioTrack | null>(null);
  const urlRef = useRef<string | null>(null);
  const enableIdRef = useRef(0);
  const mutedByUsRef = useRef(false);

  const release = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, [audioRef]);

  /** Only ever undoes this hook's own muting: the element's own mute state belongs to the user. */
  const unmute = useCallback((element: HTMLVideoElement | null) => {
    if (!element || !mutedByUsRef.current) return;

    element.muted = false;
    mutedByUsRef.current = false;
  }, []);

  /** Gives the video element its audio back and invalidates any decode still in flight. */
  const reset = useCallback(
    (element: HTMLVideoElement | null) => {
      enableIdRef.current++;
      trackRef.current = null;
      release();
      unmute(element);
      setState('unavailable');
    },
    [release, unmute]
  );

  useEffect(() => {
    reset(video);
    if (!video || !mediaBytes) return;

    let cancelled = false;

    // The element is the only reliable witness: canPlayType(), MediaSource.isTypeSupported() and
    // AudioDecoder.isConfigSupported() all claim AAC support even where no decoder is present. It
    // reads 0 until the host has actually decoded audio, so probe again once playback begins.
    const detect = () => {
      if (cancelled) return;
      if (audioDecodedBytes(video)) {
        reset(video);
        return;
      }
      if (trackRef.current) return;

      const track = parseMp4AudioTrack(mediaBytes);
      if (!isDecodableAacTrack(track)) return;

      trackRef.current = track;
      setState('idle');
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) detect();
    const unbind = bindEvents(video, { loadeddata: detect, playing: detect });

    return () => {
      cancelled = true;
      unbind();
    };
  }, [video, mediaBytes, reset]);

  const disable = useCallback(() => {
    enableIdRef.current++;
    release();
    unmute(video);
    setState((current) => (current === 'unavailable' ? current : 'idle'));
  }, [release, unmute, video]);

  const enable = useCallback(async () => {
    const audio = audioRef.current;
    if (!video || !audio || !mediaBytes || !trackRef.current) return;

    const enableId = ++enableIdRef.current;
    // A disable(), a new response, or an unmount bumps the id; anything it started is then unwanted.
    const superseded = () => enableId !== enableIdRef.current;

    setState('decoding');
    try {
      const { decodeAacTrack } = await import('utils/media/aac-decoder');
      const wav = await decodeAacTrack(mediaBytes, trackRef.current);
      if (superseded()) return;
      if (!wav) {
        setState('failed');
        return;
      }

      const url = URL.createObjectURL(wav);
      urlRef.current = url;
      audio.src = url;
      audio.currentTime = video.currentTime;
      audio.playbackRate = video.playbackRate;
      audio.volume = video.volume;

      // Only one of the two elements may produce sound; this one is authoritative once enabled.
      video.muted = true;
      mutedByUsRef.current = true;
      if (!video.paused) await audio.play().catch(ignorePlaybackRejection);
      if (superseded()) return;

      setState('enabled');
    } catch {
      if (superseded()) return;
      release();
      setState('failed');
    }
  }, [audioRef, mediaBytes, release, video]);

  useEffect(() => {
    const audio = audioRef.current;
    if (state !== 'enabled' || !video || !audio) return;

    const resync = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > MAX_DRIFT) {
        audio.currentTime = video.currentTime;
      }
    };

    const onPlay = () => {
      audio.currentTime = video.currentTime;
      void audio.play().catch(ignorePlaybackRejection);
    };
    const onPause = () => audio.pause();
    const onSeeked = () => {
      audio.currentTime = video.currentTime;
    };
    const onRateChange = () => {
      audio.playbackRate = video.playbackRate;
    };
    // The video is muted while this audio is authoritative, so its volume control has to reach here.
    const onVolumeChange = () => {
      audio.volume = video.volume;
    };

    return bindEvents(video, {
      play: onPlay,
      pause: onPause,
      ended: onPause,
      seeked: onSeeked,
      ratechange: onRateChange,
      volumechange: onVolumeChange,
      timeupdate: resync
    });
  }, [audioRef, state, video]);

  useEffect(() => {
    return () => {
      enableIdRef.current++;
      release();
    };
  }, [release]);

  return { state, enable, disable };
};
