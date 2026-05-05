import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronDown,
  Download, ExternalLink, Mic, Send, Sparkles, Star, TrendingUp,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import type { ChatMessage, SourceChunk, TutorReply } from '../services/api';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  reply?: TutorReply;
  sources?: SourceChunk[];
  ts: number;
}

interface SourceFile {
  id: number;
  filename: string;
  storage_url: string;
}

// ── Waveform bars (TTS speaking indicator) ─────────────────────────────────────

const WAVEFORM_BARS = [0.4, 0.9, 0.6, 1.0, 0.5, 0.8, 0.3, 0.7, 0.95, 0.5];

const Waveform: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="flex items-center gap-[3px] h-8">
    {WAVEFORM_BARS.map((scale, i) => (
      <motion.span
        key={i}
        className="w-[3px] rounded-full bg-cyan-400"
        animate={active ? {
          scaleY: [scale * 0.3, scale, scale * 0.4, scale * 0.9, scale * 0.2],
          opacity: [0.6, 1, 0.7, 1, 0.5],
        } : { scaleY: 0.15, opacity: 0.25 }}
        transition={active ? {
          duration: 0.8 + i * 0.05,
          repeat: Infinity,
          repeatType: 'mirror',
          ease: 'easeInOut',
          delay: i * 0.06,
        } : { duration: 0.3 }}
        style={{ height: 28, originY: 0.5 }}
      />
    ))}
  </div>
);

// ── Markdown renderer with KaTeX ───────────────────────────────────────────────

const MathContent: React.FC<{ children: string; className?: string }> = ({ children, className }) => (
  <div className={className}>
  <ReactMarkdown
    remarkPlugins={[remarkMath]}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rehypePlugins={[rehypeKatex as any]}
    components={{
      p: ({ children: c }) => <p className="leading-relaxed mb-2 last:mb-0">{c}</p>,
      code: ({ children: c }) => (
        <code className="px-1.5 py-0.5 bg-slate-800 text-cyan-300 rounded font-mono text-sm">{c}</code>
      ),
      pre: ({ children: c }) => (
        <pre className="my-2 p-3 bg-slate-900 rounded-xl text-cyan-200 text-sm overflow-x-auto font-mono">{c}</pre>
      ),
    }}
  >
    {children}
  </ReactMarkdown>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────

const TeachPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subjectId   = Number(searchParams.get('subject_id') ?? 0);
  const subjectName = searchParams.get('subject_name') ?? '';
  const initialTopic = searchParams.get('topic') ?? '';

  // Chat state
  const [topic, setTopic] = useState(initialTopic);
  const [input, setInput] = useState('');
  const [cpInput, setCpInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [checkpointPending, setCheckpointPending] = useState(false);

  // Voice
  const [listening, setListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const voiceSupported = useRef(true);

  // Source viewer
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [activeSource, setActiveSource] = useState<SourceFile | null>(null);

  // Analytics
  const [sessionXP, setSessionXP] = useState(0);
  const [checkpointsAnswered, setCheckpointsAnswered] = useState(0);
  const [sessionStart] = useState(Date.now());

  // Misc
  const [toast, setToast] = useState<{ message: string; type: 'error' | 'success' } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cpInputRef = useRef<HTMLInputElement>(null);

  // ── Voice setup ──────────────────────────────────────────────────────────────

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { voiceSupported.current = false; return; }

    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-IN';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const t: string = Array.from({ length: e.results.length as number }, (_: unknown, i: number) =>
        (e.results[i][0] as { transcript: string }).transcript
      ).join(' ').trim();
      if (t) handleSend(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    synthRef.current = window.speechSynthesis;
    return () => { (rec as { abort(): void }).abort(); synthRef.current?.cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Speak new spokenText
  useEffect(() => {
    if (!ttsEnabled || !spokenText || !synthRef.current) return;
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(spokenText);
    utt.rate = 0.95; utt.pitch = 1; utt.lang = 'en-IN';
    utt.onstart = () => setIsSpeaking(true);
    utt.onend   = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utt);
  }, [spokenText, ttsEnabled]);

  const handlePushToTalk = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = recognitionRef.current as any;
    if (!rec || sending) return;
    if (listening) {
      rec.stop(); setListening(false);
    } else {
      synthRef.current?.cancel(); setIsSpeaking(false);
      rec.start(); setListening(true);
    }
  }, [listening, sending]);

  // ── Load source files ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!subjectId) return;
    api.getUploadedFiles().then(files => {
      const pdfs = files.filter(f => f.subject_id === subjectId && f.storage_url && f.file_type === 'pdf') as SourceFile[];
      setSources(pdfs);
      if (pdfs.length > 0) setActiveSource(pdfs[0]);
    }).catch(() => {});
  }, [subjectId]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  // ── Send message ─────────────────────────────────────────────────────────────

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSend = useCallback(async (text: string, isCheckpoint = false) => {
    if (!text.trim() || !topic.trim() || sending) return;

    const userMsg: DisplayMessage = { id: crypto.randomUUID(), role: 'user', text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setCpInput('');
    setSending(true);
    setCheckpointPending(false);

    const currentHistory = [...apiHistory];

    try {
      const reply = await api.teachSession({
        topic: topic.trim(),
        message: text.trim(),
        subject_id: subjectId || undefined,
        session_id: sessionId,
        history: currentHistory,
      });

      setSessionId(reply.session_id);
      setApiHistory(prev => [
        ...prev,
        { role: 'user', content: text },
        { role: 'assistant', content: JSON.stringify(reply) },
      ]);

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        reply,
        sources: reply.sources,
        ts: Date.now(),
      }]);

      setSpokenText(reply.spoken_text);
      setCheckpointPending(true);

      // XP: +15 per exchange; +25 bonus if checkpoint validated correct
      setSessionXP(prev => prev + 15 + (reply.checkpoint_validated === true ? 25 : 0));
      if (isCheckpoint && reply.checkpoint_validated !== false) {
        setCheckpointsAnswered(prev => prev + 1);
      }

      setTimeout(() => cpInputRef.current?.focus(), 100);
    } catch {
      showToast('Response failed. Try again.', 'error');
    } finally {
      setSending(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, sending, apiHistory, sessionId, subjectId]);

  const handleMainSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleCheckpointSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(cpInput, true);
  };

  // ── Export ───────────────────────────────────────────────────────────────────

  const exportSession = async () => {
    try {
      if (subjectId) {
        const sessions = await api.exportTeachSessions(subjectId);
        const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `sarvagna_sessions_subject${subjectId}.json`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify({ topic, messages }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `sarvagna_session_${topic.replace(/\s+/g, '_')}.json`; a.click();
        URL.revokeObjectURL(url);
      }
      showToast('Session exported!', 'success');
    } catch {
      showToast('Export failed.', 'error');
    }
  };

  // ── Session duration ─────────────────────────────────────────────────────────

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart) / 1000)), 1000);
    return () => clearInterval(id);
  }, [sessionStart]);
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-[#020617] text-slate-200 overflow-hidden">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${
              toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
            }`}
          >
            {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            <span className="font-semibold">{toast.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nav */}
      <nav className="shrink-0 border-b border-white/5 px-6 py-3 flex items-center justify-between bg-black/40 backdrop-blur-md z-10">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-xl font-black tracking-tighter text-white font-serif italic"
        >
          Sarvagna
        </button>

        {/* Topic bar */}
        <div className="flex items-center gap-3 flex-1 max-w-lg mx-6">
          <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
          {initialTopic ? (
            <span className="font-bold text-slate-200 text-sm truncate">{topic}</span>
          ) : (
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="Enter topic to study…"
              className="flex-1 bg-transparent text-slate-200 placeholder:text-slate-600 text-sm font-semibold focus:outline-none"
            />
          )}
          {subjectName && (
            <span className="text-xs text-cyan-500/70 font-semibold shrink-0 border border-cyan-500/20 px-2 py-0.5 rounded-lg">
              {subjectName}
            </span>
          )}
        </div>

        <button
          onClick={exportSession}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-slate-200 transition-all"
          title="Export session"
        >
          <Download className="w-4 h-4" />
        </button>
      </nav>

      {/* 4-pane grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 grid-rows-[1fr_auto] md:grid-rows-[1fr_220px] overflow-hidden gap-px bg-white/5">

        {/* ── TOP LEFT: Source Viewer ─────────────────────────────────────────── */}
        <div className="relative bg-[#020617] flex flex-col overflow-hidden order-2 md:order-1">
          {/* Glass header */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/5">
            <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400/70">Source</span>
            {sources.length > 1 && (
              <select
                value={activeSource?.id ?? ''}
                onChange={e => setActiveSource(sources.find(s => s.id === Number(e.target.value)) ?? null)}
                className="ml-auto text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 text-slate-400 focus:outline-none"
              >
                {sources.map(s => (
                  <option key={s.id} value={s.id}>{s.filename}</option>
                ))}
              </select>
            )}
            {activeSource && (
              <a
                href={activeSource.storage_url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto p-1 text-slate-600 hover:text-cyan-400 transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {activeSource ? (
            <iframe
              src={`${activeSource.storage_url}#toolbar=0&navpanes=0`}
              className="flex-1 w-full bg-slate-900"
              title={activeSource.filename}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-cyan-500/50" />
              </div>
              <p className="text-xs text-slate-600 font-semibold">
                {subjectId
                  ? 'No PDFs uploaded for this subject yet'
                  : 'Link a subject to see source materials here'}
              </p>
              <button
                onClick={() => navigate('/upload')}
                className="text-xs text-cyan-500/70 hover:text-cyan-400 underline underline-offset-2 transition-colors"
              >
                Upload PDFs →
              </button>
            </div>
          )}
        </div>

        {/* ── TOP RIGHT: Socratic Chat ────────────────────────────────────────── */}
        <div className="relative bg-[#020617] flex flex-col overflow-hidden order-1 md:order-2">
          {/* Glow border top */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

          {/* Glass header */}
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-b border-white/5">
            <div className="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400/70">Socratic Chat</span>
            {checkpointPending && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="ml-auto text-[10px] font-black uppercase px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full"
              >
                Checkpoint Active
              </motion.span>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-thin scrollbar-thumb-white/10">
            {messages.length === 0 && !sending && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-full gap-4 text-center"
              >
                <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.15)]">
                  <Sparkles className="w-7 h-7 text-indigo-400" />
                </div>
                <div>
                  <p className="font-black text-white text-lg">{topic || 'Set a topic above'}</p>
                  <p className="text-slate-500 text-xs mt-1">
                    {topic ? `Start with "Explain ${topic}"` : 'Type a topic in the nav bar to begin'}
                  </p>
                </div>
                {topic && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {[`Explain ${topic}`, `Derive ${topic}`, `Give me an example of ${topic}`].map(s => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-slate-200 transition-all"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            <AnimatePresence>
              {messages.map(msg => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'user' ? (
                    <div className="max-w-sm px-4 py-3 bg-gradient-to-br from-indigo-600 to-indigo-500 text-white rounded-3xl rounded-br-md text-sm font-semibold shadow-lg shadow-indigo-500/20">
                      {msg.text}
                    </div>
                  ) : msg.reply ? (
                    <div className="max-w-xl w-full space-y-2">
                      {/* Exact answer */}
                      <div className="bg-white/[0.04] border border-white/10 rounded-2xl rounded-tl-md p-4 backdrop-blur-sm">
                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-2">
                          Exact Answer
                        </p>
                        <div className="text-slate-200 text-sm prose prose-invert prose-sm max-w-none">
                          <MathContent>{msg.reply.exact}</MathContent>
                        </div>
                      </div>

                      {/* Simple */}
                      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-4 py-3">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1.5">
                          In Simple Terms
                        </p>
                        <p className="text-slate-300 text-sm leading-relaxed">{msg.reply.simple}</p>
                      </div>

                      {/* Example — collapsible */}
                      {msg.reply.example && (
                        <details className="group bg-white/[0.02] border border-white/[0.07] rounded-xl px-4 py-3">
                          <summary className="flex items-center gap-2 text-[10px] font-bold text-slate-500 cursor-pointer list-none select-none">
                            <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                            Worked Example
                          </summary>
                          <div className="mt-3 text-slate-300 text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
                            <MathContent>{msg.reply.example}</MathContent>
                          </div>
                        </details>
                      )}

                      {/* Checkpoint */}
                      <div className={`border rounded-xl px-4 py-3 shadow-[0_0_20px_rgba(245,158,11,0.05)] ${
                        msg.reply.checkpoint_validated === true
                          ? 'bg-emerald-500/[0.06] border-emerald-500/25'
                          : msg.reply.checkpoint_validated === false
                          ? 'bg-rose-500/[0.06] border-rose-500/25'
                          : 'bg-amber-500/[0.06] border-amber-500/25'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Sparkles className={`w-3.5 h-3.5 ${
                            msg.reply.checkpoint_validated === true ? 'text-emerald-400'
                            : msg.reply.checkpoint_validated === false ? 'text-rose-400'
                            : 'text-amber-400'
                          }`} />
                          <p className={`text-[9px] font-black uppercase tracking-widest ${
                            msg.reply.checkpoint_validated === true ? 'text-emerald-400'
                            : msg.reply.checkpoint_validated === false ? 'text-rose-400'
                            : 'text-amber-400'
                          }`}>
                            {msg.reply.checkpoint_validated === true ? '✓ Checkpoint Passed'
                            : msg.reply.checkpoint_validated === false ? '✗ Try Again'
                            : 'Checkpoint'}
                          </p>
                        </div>
                        <p className="text-amber-200 text-sm font-semibold leading-relaxed">{msg.reply.checkpoint}</p>
                      </div>

                      {/* Source citations sidebar */}
                      {msg.sources && msg.sources.length > 0 && (
                        <details className="group bg-white/[0.02] border border-white/[0.07] rounded-xl px-4 py-2">
                          <summary className="flex items-center gap-2 text-[10px] font-bold text-slate-600 cursor-pointer list-none select-none">
                            <BookOpen className="w-3 h-3" />
                            Sources ({msg.sources.length})
                          </summary>
                          <div className="mt-2 space-y-1">
                            {msg.sources.map((src, i) => (
                              <div key={i} className="flex items-center gap-2 text-[10px] text-slate-500">
                                <span className="shrink-0 w-1 h-1 rounded-full bg-cyan-500/50" />
                                <span className="font-mono text-cyan-600/70 truncate">{src.filename}</span>
                                <span className="shrink-0">p.{src.page}</span>
                                {src.section && <span className="text-slate-700 truncate">· {src.section}</span>}
                                <span className="ml-auto shrink-0 text-slate-700">{(src.score * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </AnimatePresence>

            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.04] border border-white/10 rounded-2xl rounded-tl-md">
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 bg-indigo-400 rounded-full"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                  <span className="text-slate-500 text-xs ml-1">Thinking…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-white/5 bg-black/20 backdrop-blur-md p-3 space-y-2">
            {/* Checkpoint answer input */}
            <AnimatePresence>
              {checkpointPending && (
                <motion.form
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  onSubmit={handleCheckpointSubmit}
                  className="flex gap-2"
                >
                  <input
                    ref={cpInputRef}
                    value={cpInput}
                    onChange={e => setCpInput(e.target.value)}
                    placeholder="Answer the checkpoint…"
                    disabled={sending}
                    className="flex-1 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 text-amber-100 placeholder:text-amber-700/60 text-sm focus:outline-none focus:border-amber-500/60 disabled:opacity-40 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={sending || !cpInput.trim()}
                    className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 disabled:opacity-40 text-amber-300 rounded-xl transition-all text-xs font-bold"
                  >
                    Submit
                  </button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Main input — disabled when checkpoint pending */}
            <form onSubmit={handleMainSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={
                  checkpointPending
                    ? 'Answer the checkpoint above to continue…'
                    : topic
                    ? `Ask about ${topic}…`
                    : 'Set a topic first…'
                }
                disabled={sending || !topic.trim() || checkpointPending}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-slate-200 placeholder:text-slate-600 text-sm focus:outline-none focus:border-cyan-500/40 focus:shadow-[0_0_15px_rgba(34,211,238,0.05)] disabled:opacity-30 transition-all"
              />
              <button
                type="submit"
                disabled={sending || !input.trim() || !topic.trim() || checkpointPending}
                className="p-2.5 bg-gradient-to-br from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 text-white rounded-xl transition-all shadow-[0_0_15px_rgba(34,211,238,0.15)] disabled:shadow-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* ── BOTTOM LEFT: Voice Command ──────────────────────────────────────── */}
        <div className="bg-[#020617] flex flex-col overflow-hidden order-3 md:order-3">
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-t border-b border-white/5">
            <div className={`w-2 h-2 rounded-full transition-all ${listening ? 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]' : 'bg-slate-600'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Voice</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-4">
            {/* Waveform — shows when TTS is speaking */}
            <div className="h-10 flex items-center">
              <Waveform active={isSpeaking} />
            </div>

            {/* Push-to-talk button */}
            <motion.button
              onClick={handlePushToTalk}
              disabled={sending || !voiceSupported.current}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                listening
                  ? 'bg-rose-500/20 border-2 border-rose-400 shadow-[0_0_30px_rgba(251,113,133,0.4)]'
                  : 'bg-white/5 border-2 border-white/10 hover:border-cyan-500/40 hover:shadow-[0_0_25px_rgba(34,211,238,0.2)]'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              {listening && (
                <motion.span
                  className="absolute inset-0 rounded-full border-2 border-rose-400"
                  animate={{ scale: [1, 1.5], opacity: [0.6, 0] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
              <Mic className={`w-6 h-6 ${listening ? 'text-rose-400' : 'text-slate-400'}`} />
            </motion.button>

            <p className="text-xs text-slate-600 font-semibold">
              {!voiceSupported.current
                ? 'Voice not supported in this browser'
                : listening
                ? 'Listening… click to stop'
                : 'Click to speak'}
            </p>

            {/* TTS toggle */}
            <button
              onClick={() => {
                const next = !ttsEnabled;
                setTtsEnabled(next);
                if (!next) { synthRef.current?.cancel(); setIsSpeaking(false); }
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                ttsEnabled
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-white/5 text-slate-500 border-white/10 hover:border-white/20'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${ttsEnabled ? 'bg-cyan-400' : 'bg-slate-600'}`} />
              AI Voice {ttsEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* ── BOTTOM RIGHT: Session Analytics ────────────────────────────────── */}
        <div className="bg-[#020617] flex flex-col overflow-hidden order-4 md:order-4">
          <div className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-white/[0.03] border-t border-b border-white/5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400/70">Session Analytics</span>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-3 p-4">
            {/* XP */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-yellow-400">
                <Star className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">XP Earned</span>
              </div>
              <motion.p
                key={sessionXP}
                initial={{ scale: 1.2, color: '#facc15' }}
                animate={{ scale: 1, color: '#fff' }}
                className="text-2xl font-black text-white"
              >
                {sessionXP}
              </motion.p>
            </div>

            {/* Checkpoint status */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-amber-400">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Checkpoints</span>
              </div>
              <p className="text-2xl font-black text-white">{checkpointsAnswered}</p>
              <p className={`text-[10px] font-semibold ${checkpointPending ? 'text-amber-400' : 'text-slate-600'}`}>
                {checkpointPending ? '⏳ Pending answer' : '✓ Clear'}
              </p>
            </div>

            {/* Messages */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-indigo-400">
                <TrendingUp className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Exchanges</span>
              </div>
              <p className="text-2xl font-black text-white">
                {Math.floor(messages.filter(m => m.role === 'user').length)}
              </p>
            </div>

            {/* Timer */}
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-cyan-400">
                <span className="text-[9px] font-black uppercase tracking-widest">Duration</span>
              </div>
              <p className="text-2xl font-black text-white font-mono">{fmtTime(elapsed)}</p>
            </div>

            {/* Export */}
            <div className="col-span-2">
              <button
                onClick={exportSession}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-cyan-500/30 rounded-2xl text-xs font-bold text-slate-400 hover:text-cyan-400 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Export Session
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeachPage;
