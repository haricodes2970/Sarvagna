import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface VoiceControllerProps {
  onTranscript: (text: string) => void;
  spokenText: string | null;
  ttsEnabled: boolean;
  onTtsToggle: (enabled: boolean) => void;
  onSpeakingChange?: (speaking: boolean) => void;
  disabled?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

const VoiceController: React.FC<VoiceControllerProps> = ({
  onTranscript,
  spokenText,
  ttsEnabled,
  onTtsToggle,
  onSpeakingChange,
  disabled = false,
}) => {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<AnySpeechRecognition>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-IN';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript: string = Array.from({ length: e.results.length as number }, (_: unknown, i: number) =>
        (e.results[i][0] as { transcript: string }).transcript
      ).join(' ').trim();
      if (transcript) onTranscript(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;

    synthRef.current = window.speechSynthesis;
    return () => { rec.abort(); synthRef.current?.cancel(); };
  }, [onTranscript]);

  // Speak when spokenText changes and TTS is on
  useEffect(() => {
    if (!ttsEnabled || !spokenText || !synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(spokenText);
    utt.rate = 0.95;
    utt.pitch = 1;
    utt.lang = 'en-IN';
    utt.onstart = () => onSpeakingChange?.(true);
    utt.onend = () => onSpeakingChange?.(false);
    utt.onerror = () => onSpeakingChange?.(false);
    synthRef.current.speak(utt);
  }, [spokenText, ttsEnabled, onSpeakingChange]);

  const handlePushToTalk = useCallback(() => {
    if (!recognitionRef.current || disabled) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      synthRef.current?.cancel();
      onSpeakingChange?.(false);
      recognitionRef.current.start();
      setListening(true);
    }
  }, [listening, disabled, onSpeakingChange]);

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => { onTtsToggle(!ttsEnabled); if (ttsEnabled) { synthRef.current?.cancel(); onSpeakingChange?.(false); } }}
        title={ttsEnabled ? 'Mute voice' : 'Enable voice readback'}
        className={`p-2 rounded-xl border transition-all ${
          ttsEnabled
            ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30'
            : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
        }`}
      >
        {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>

      <button
        onMouseDown={handlePushToTalk}
        onTouchStart={handlePushToTalk}
        disabled={disabled}
        title={listening ? 'Release to send' : 'Hold to speak'}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border font-bold text-xs transition-all ${
          listening
            ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse'
            : disabled
            ? 'bg-slate-800 text-slate-600 border-slate-700 cursor-not-allowed'
            : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-emerald-400 hover:border-emerald-500/30'
        }`}
      >
        {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        {listening ? 'Listening…' : 'Push to Talk'}
      </button>
    </div>
  );
};

export default VoiceController;
