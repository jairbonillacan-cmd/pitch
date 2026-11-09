"use client";

import { useCallback, useEffect, useRef } from "react";

const sounds = {
  key: [{ frequency: 680, delay: 0, duration: 0.045, volume: 0.035 }],
  error: [
    { frequency: 330, delay: 0, duration: 0.10, volume: 0.05 },
    { frequency: 220, delay: 0.11, duration: 0.15, volume: 0.05 },
  ],
  success: [
    { frequency: 440, delay: 0, duration: 0.12, volume: 0.045 },
    { frequency: 554, delay: 0.08, duration: 0.14, volume: 0.045 },
    { frequency: 659, delay: 0.16, duration: 0.18, volume: 0.05 },
  ],
};

export function usePinSound(): (cue: keyof typeof sounds) => void {
  const audioRef = useRef<AudioContext | null>(null);
  const lastNoteEnd = useRef(0);

  useEffect(() => () => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio && audio.state !== "closed") {
      const remaining = audio.state === "running" ? lastNoteEnd.current - audio.currentTime : 0;
      const close = () => void audio.close().catch(() => undefined);
      if (remaining > 0) window.setTimeout(close, remaining * 1000 + 20);
      else close();
    }
    lastNoteEnd.current = 0;
  }, []);

  return useCallback((cue: keyof typeof sounds) => {
    if (typeof AudioContext === "undefined") return;

    try {
      // The first keypad interaction unlocks audio on browsers that require a gesture.
      const audio = (audioRef.current ??= new AudioContext());
      const play = () => {
        if (audioRef.current !== audio || audio.state !== "running") return;
        const now = audio.currentTime;
        for (const { frequency, delay, duration, volume } of sounds[cue]) {
          const start = now + delay;
          const end = start + duration;
          lastNoteEnd.current = Math.max(lastNoteEnd.current, end);
          const tone = audio.createOscillator();
          const envelope = audio.createGain();
          tone.frequency.setValueAtTime(frequency, start);
          envelope.gain.setValueAtTime(0, start);
          envelope.gain.linearRampToValueAtTime(volume, start + 0.008);
          envelope.gain.exponentialRampToValueAtTime(0.001, end);
          tone.connect(envelope);
          envelope.connect(audio.destination);
          tone.onended = () => {
            tone.disconnect();
            envelope.disconnect();
          };
          tone.start(start);
          tone.stop(end);
        }
      };

      if (audio.state === "running") play();
      else void audio.resume().then(play).catch(() => undefined);
    } catch {
      // Audio feedback is optional; the visual state always stays available.
      return;
    }
  }, []);
}
