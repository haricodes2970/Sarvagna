import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';

export type PomodoroMode = 'work' | 'break';

interface PomodoroTimerProps {
  onFocusChange?: (active: boolean) => void;
  onSessionComplete?: (mode: PomodoroMode) => void;
  workMinutes?: number;
  breakMinutes?: number;
}

const TICK = 1000;

const fmt = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const PomodoroTimer: React.FC<PomodoroTimerProps> = ({
  onFocusChange,
  onSessionComplete,
  workMinutes = 25,
  breakMinutes = 5,
}) => {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [seconds, setSeconds] = useState(workMinutes * 60);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSeconds = mode === 'work' ? workMinutes * 60 : breakMinutes * 60;
  const progress = ((totalSeconds - seconds) / totalSeconds) * 100;

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const switchMode = useCallback((next: PomodoroMode) => {
    stop();
    setMode(next);
    setSeconds((next === 'work' ? workMinutes : breakMinutes) * 60);
    setRunning(false);
    onFocusChange?.(false);
  }, [stop, workMinutes, breakMinutes, onFocusChange]);

  useEffect(() => {
    if (!running) { stop(); return; }

    intervalRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          stop();
          setRunning(false);
          const completed = mode;
          onSessionComplete?.(completed);
          if (completed === 'work') setSessions(n => n + 1);
          const next: PomodoroMode = completed === 'work' ? 'break' : 'work';
          setMode(next);
          const newSecs = (next === 'work' ? workMinutes : breakMinutes) * 60;
          onFocusChange?.(false);
          return newSecs;
        }
        return s - 1;
      });
    }, TICK);

    return stop;
  }, [running, mode, workMinutes, breakMinutes, stop, onSessionComplete, onFocusChange]);

  const toggle = () => {
    const next = !running;
    setRunning(next);
    onFocusChange?.(next && mode === 'work');
  };

  const reset = () => {
    stop();
    setRunning(false);
    setSeconds(mode === 'work' ? workMinutes * 60 : breakMinutes * 60);
    onFocusChange?.(false);
  };

  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
        {(['work', 'break'] as PomodoroMode[]).map(m => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all capitalize ${
              mode === m
                ? m === 'work' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {m === 'work' ? `Focus ${workMinutes}m` : `Break ${breakMinutes}m`}
          </button>
        ))}
      </div>

      {/* Circular progress */}
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="40" fill="none"
            stroke={mode === 'work' ? '#f43f5e' : '#10b981'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-black tabular-nums ${mode === 'work' ? 'text-rose-400' : 'text-emerald-400'}`}>
            {fmt(seconds)}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-500 hover:text-slate-300 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={toggle}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            running
              ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              : mode === 'work'
              ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30'
              : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
          }`}
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? 'Pause' : 'Start'}
        </button>
      </div>

      {sessions > 0 && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Timer className="w-3 h-3" /> {sessions} session{sessions !== 1 ? 's' : ''} done
        </p>
      )}
    </div>
  );
};

export default PomodoroTimer;
