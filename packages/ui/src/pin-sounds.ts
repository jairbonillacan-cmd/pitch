"use client";

import { useCallback, useEffect, useRef } from "react";

export type PinSoundCue = "key" | "back" | "success" | "handoff" | "error";

// Progresión musical ascendente por casilla (D5 -> E5 -> F#5 -> A5)
const STEP_NOTES = [587.33, 659.25, 739.99, 880.0] as const;

const SUCCESS_NOTES = [
  { frequency: 440.0, delay: 0.0, duration: 0.16, volume: 0.042 },
  { frequency: 554.37, delay: 0.065, duration: 0.18, volume: 0.044 },
  { frequency: 659.25, delay: 0.13, duration: 0.22, volume: 0.048 },
  { frequency: 880.0, delay: 0.2, duration: 0.38, volume: 0.052 },
] as const;

const ERROR_PULSES = [
  { fStart: 250, fEnd: 185, delay: 0.0, duration: 0.11, volume: 0.052 },
  { fStart: 190, fEnd: 142, delay: 0.115, duration: 0.16, volume: 0.052 },
] as const;

export function usePinSound(): (cue: PinSoundCue, stepIndex?: number) => void {
  const audioRef = useRef<AudioContext | null>(null);
  const lastNoteEnd = useRef(0);

  useEffect(
    () => () => {
      const audio = audioRef.current;
      audioRef.current = null;
      if (audio && audio.state !== "closed") {
        const remaining =
          audio.state === "running" ? lastNoteEnd.current - audio.currentTime : 0;
        const close = () => void audio.close().catch(() => undefined);
        if (remaining > 0) window.setTimeout(close, remaining * 1000 + 20);
        else close();
      }
      lastNoteEnd.current = 0;
    },
    [],
  );

  return useCallback((cue: PinSoundCue, stepIndex = 0) => {
    if (typeof AudioContext === "undefined") return;

    try {
      // La primera interacción con el teclado desbloquea el audio en navegadores con autoplay policy.
      const audio = (audioRef.current ??= new AudioContext());
      const play = () => {
        if (audioRef.current !== audio || audio.state !== "running") return;
        const now = audio.currentTime;

        if (cue === "key") {
          // 1. Transiente táctil corto (clic mecánico suave)
          const clickOsc = audio.createOscillator();
          const clickGain = audio.createGain();
          clickOsc.type = "triangle";
          clickOsc.frequency.setValueAtTime(1350, now);
          clickOsc.frequency.exponentialRampToValueAtTime(280, now + 0.018);
          clickGain.gain.setValueAtTime(0.042, now);
          clickGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.018);
          clickOsc.connect(clickGain);
          clickGain.connect(audio.destination);
          clickOsc.onended = () => {
            clickOsc.disconnect();
            clickGain.disconnect();
          };
          clickOsc.start(now);
          clickOsc.stop(now + 0.02);

          // 2. Tono armónico progresivo según la casilla (0..3)
          const freq = STEP_NOTES[Math.min(3, Math.max(0, stepIndex))] ?? 659.25;
          const toneOsc = audio.createOscillator();
          const filter = audio.createBiquadFilter();
          const toneGain = audio.createGain();
          toneOsc.type = "sine";
          toneOsc.frequency.setValueAtTime(freq, now);
          filter.type = "lowpass";
          filter.frequency.setValueAtTime(2200, now);
          toneGain.gain.setValueAtTime(0.0008, now);
          toneGain.gain.linearRampToValueAtTime(0.04, now + 0.006);
          toneGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);
          toneOsc.connect(filter);
          filter.connect(toneGain);
          toneGain.connect(audio.destination);
          toneOsc.onended = () => {
            toneOsc.disconnect();
            filter.disconnect();
            toneGain.disconnect();
          };
          toneOsc.start(now);
          toneOsc.stop(now + 0.08);
          lastNoteEnd.current = Math.max(lastNoteEnd.current, now + 0.08);
          return;
        }

        if (cue === "back") {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(520, now);
          osc.frequency.exponentialRampToValueAtTime(310, now + 0.055);
          gain.gain.setValueAtTime(0.0008, now);
          gain.gain.linearRampToValueAtTime(0.035, now + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.06);
          osc.connect(gain);
          gain.connect(audio.destination);
          osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
          };
          osc.start(now);
          osc.stop(now + 0.065);
          lastNoteEnd.current = Math.max(lastNoteEnd.current, now + 0.065);
          return;
        }

        if (cue === "success") {
          for (const { frequency, delay, duration, volume } of SUCCESS_NOTES) {
            const start = now + delay;
            const end = start + duration;
            lastNoteEnd.current = Math.max(lastNoteEnd.current, end);
            const osc1 = audio.createOscillator();
            const osc2 = audio.createOscillator();
            const subGain = audio.createGain();
            const envelope = audio.createGain();

            osc1.type = "sine";
            osc2.type = "triangle";
            osc1.frequency.setValueAtTime(frequency, start);
            osc2.frequency.setValueAtTime(frequency * 2, start);
            subGain.gain.setValueAtTime(0.18, start);

            envelope.gain.setValueAtTime(0.0008, start);
            envelope.gain.linearRampToValueAtTime(volume, start + 0.012);
            envelope.gain.exponentialRampToValueAtTime(0.0008, end);

            osc1.connect(envelope);
            osc2.connect(subGain);
            subGain.connect(envelope);
            envelope.connect(audio.destination);
            osc1.onended = () => {
              osc1.disconnect();
              osc2.disconnect();
              subGain.disconnect();
              envelope.disconnect();
            };
            osc1.start(start);
            osc2.start(start);
            osc1.stop(end + 0.01);
            osc2.stop(end + 0.01);
          }
          return;
        }

        if (cue === "handoff") {
          const osc = audio.createOscillator();
          const gain = audio.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(659.25, now);
          osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.14);
          gain.gain.setValueAtTime(0.0008, now);
          gain.gain.linearRampToValueAtTime(0.032, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.18);
          osc.connect(gain);
          gain.connect(audio.destination);
          osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
          };
          osc.start(now);
          osc.stop(now + 0.19);
          lastNoteEnd.current = Math.max(lastNoteEnd.current, now + 0.19);
          return;
        }

        if (cue === "error") {
          for (const { fStart, fEnd, delay, duration, volume } of ERROR_PULSES) {
            const start = now + delay;
            const end = start + duration;
            lastNoteEnd.current = Math.max(lastNoteEnd.current, end);
            const osc = audio.createOscillator();
            const filter = audio.createBiquadFilter();
            const gain = audio.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(fStart, start);
            osc.frequency.exponentialRampToValueAtTime(fEnd, end);
            filter.type = "lowpass";
            filter.frequency.setValueAtTime(680, start);
            gain.gain.setValueAtTime(0.0008, start);
            gain.gain.linearRampToValueAtTime(volume, start + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0008, end);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audio.destination);
            osc.onended = () => {
              osc.disconnect();
              filter.disconnect();
              gain.disconnect();
            };
            osc.start(start);
            osc.stop(end + 0.01);
          }
        }
      };

      if (audio.state === "running") play();
      else void audio.resume().then(play).catch(() => undefined);
    } catch {
      // El audio es opcional; el estado visual siempre permanece disponible.
      return;
    }
  }, []);
}
