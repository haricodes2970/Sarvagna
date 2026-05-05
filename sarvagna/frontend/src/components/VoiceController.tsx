import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface VoiceControllerProps {
  onTranscript: (text: string) => void;
  spokenText: string | null;
  ttsEnabled: boolean;
  onTtsToggle: (enabled: boolean) => void;
  disabled?: boolean;
}

// Browser Speech API types
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

const VoiceController: React.FC<VoiceControllerProps> = ({
  onTranscript,
  spokenText,
  ttsEnabled,
  onTtsToggle,
  disabled = false,
}) => {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-IN';

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join(' ')
        .trim();
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
    utteranceRef.current = utt;
    synthRef.current.speak(utt);
  }, [spokenText, ttsEnabled]);

  const handlePushToTalk = useCallback(() => {
    if (!recognitionRef.current || disabled) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      synthRef.current?.cancel();
      recognitionRef.current.start();
      setListening(true);
    }
  }, [listening, disabled]);

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2">
      {/* TTS toggle */}
      <button
        onClick={() => { onTtsToggle(!ttsEnabled); if (!ttsEnabled === false) synthRef.current?.cancel(); }}
        title={ttsEnabled ? 'Mute voice' : 'Enable voice readback'}
        className={`p-2 rounded-xl border transition-all ${
          ttsEnabled
            ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30'
            : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
        }`}
      >
        {ttsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>

      {/* Push-to-talk */}
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
