import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronDown, Download,
  Send, Sparkles
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import type { ChatMessage, TutorReply } from '../services/api';
import VoiceController from '../components/VoiceController';

// Simple LaTeX renderer: wraps $..$ in <em> and $$..$$ in <pre> for now
function renderLatex(text: string): React.ReactNode[] {
  const parts = text.split(/($$[\s\S]*?$$|\$[^$\n]+?\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith('$$') && part.endsWith('$$')) {
      return (
        <pre key={i} className="my-2 p-3 bg-slate-800 rounded-xl text-emerald-300 text-sm overflow-x-auto font-mono whitespace-pre-wrap">
          {part.slice(2, -2).trim()}
        </pre>
      );
    }
    if (part.startsWith('$') && part.endsWith('$')) {
      return <code key={i} className="px-1.5 py-0.5 bg-slate-800 text-emerald-300 rounded font-mono text-sm">{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  reply?: TutorReply;
  ts: number;
}

interface ToastState { message: string; type: 'error' | 'success' }

const TeachPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subjectId = Number(searchParams.get('subject_id') ?? 0);
  const subjectName = searchParams.get('subject_name') ?? 'Subject';
  const initialTopic = searchParams.get('topic') ?? '';

  const [topic, setTopic] = useState(initialTopic);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [apiHistory, setApiHistory] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [sending, setSending] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [spokenText, setSpokenText] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !topic.trim() || sending) return;
    const userMsg: DisplayMessage = { id: crypto.randomUUID(), role: 'user', text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

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

      const assistantMsg: DisplayMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        reply,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setSpokenText(reply.spoken_text);
    } catch {
      showToast('Failed to get response. Try again.', 'error');
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [topic, sending, apiHistory, sessionId, subjectId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleVoiceTranscript = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  const exportTranscript = async () => {
    if (!subjectId) {
      // local export
      const data = JSON.stringify({ topic, messages }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sarvagna_session_${topic.replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      const sessions = await api.exportTeachSessions(subjectId);
      const data = JSON.stringify(sessions, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sarvagna_sessions_subject${subjectId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Sessions exported!', 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  const welcomeVisible = messages.length === 0 && !sending;

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-200 overflow-hidden">
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${
          toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span className="font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Nav */}
      <nav className="shrink-0 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-xl font-black tracking-tighter text-white font-serif italic"
        >
          Sarvagna
        </button>
        <div className="flex items-center gap-3">
          <VoiceController
            onTranscript={handleVoiceTranscript}
            spokenText={spokenText}
            ttsEnabled={ttsEnabled}
            onTtsToggle={setTtsEnabled}
            disabled={sending}
          />
          <button
            onClick={exportTranscript}
            title="Export session transcript"
            className="p-2 rounded-xl bg-slate-800 text-slate-500 hover:text-slate-300 border border-slate-700 transition-all"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </nav>

      {/* Topic bar */}
      <div className="shrink-0 border-b border-slate-900 px-6 py-3 flex items-center gap-3 bg-slate-900/30">
        <BookOpen className="w-4 h-4 text-indigo-400 shrink-0" />
        {initialTopic ? (
          <span className="font-bold text-slate-200 text-sm">{topic}</span>
        ) : (
          <input
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="Enter topic to study (e.g. 'Binary Search Trees')"
            className="flex-1 bg-transparent text-slate-200 placeholder:text-slate-600 text-sm font-semibold focus:outline-none"
          />
        )}
        {subjectName && (
          <span className="ml-auto text-xs text-slate-500 font-semibold shrink-0">{subjectName}</span>
        )}
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {welcomeVisible && (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-indigo-400" />
            </div>
            <div>
              <p className="font-black text-white text-xl">{topic || 'Ask anything'}</p>
              <p className="text-slate-500 text-sm mt-1">
                {topic
                  ? `Start with "Explain ${topic}" or ask a specific question.`
                  : 'Set a topic above, then ask your first question.'}
              </p>
            </div>
            {topic && (
              <div className="flex flex-wrap gap-2 justify-center">
                {[`Explain ${topic}`, `Give me an example of ${topic}`, `What are common mistakes with ${topic}?`].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-xs px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-400 hover:text-slate-200 transition-all font-semibold"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'user' ? (
              <div className="max-w-lg px-5 py-3 bg-indigo-500 text-white rounded-3xl rounded-br-md font-semibold text-sm">
                {msg.text}
              </div>
            ) : msg.reply ? (
              <div className="max-w-2xl w-full space-y-3">
                {/* Exact */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl rounded-tl-md p-5 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Exact</p>
                  <div className="text-slate-200 text-sm leading-relaxed">
                    {renderLatex(msg.reply.exact)}
                  </div>
                </div>

                {/* Simple */}
                <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl px-5 py-4 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Simple</p>
                  <p className="text-slate-300 text-sm leading-relaxed">{msg.reply.simple}</p>
                </div>

                {/* Example — collapsible */}
                {msg.reply.example && (
                  <details className="group bg-slate-900/40 border border-slate-800/40 rounded-2xl px-5 py-3">
                    <summary className="flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer list-none">
                      <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
                      Example / Worked Solution
                    </summary>
                    <div className="mt-3 text-slate-300 text-sm leading-relaxed">
                      {renderLatex(msg.reply.example)}
                    </div>
                  </details>
                )}

                {/* Checkpoint */}
                <div className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-2xl px-5 py-4">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-amber-300 text-sm font-semibold leading-relaxed">{msg.reply.checkpoint}</p>
                </div>
              </div>
            ) : null}
          </div>
        ))}

        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 px-5 py-3 bg-slate-900 border border-slate-800 rounded-3xl rounded-tl-md">
              <span className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </span>
              <span className="text-slate-500 text-xs">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-slate-900 px-6 py-4 flex items-center gap-3 bg-slate-950"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={topic ? `Ask about ${topic}…` : 'Set a topic first…'}
          disabled={sending || !topic.trim()}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3 text-slate-200 placeholder:text-slate-600 text-sm focus:outline-none focus:border-indigo-500/50 disabled:opacity-40 transition-all"
        />
        <button
          type="submit"
          disabled={sending || !input.trim() || !topic.trim()}
          className="p-3 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white rounded-2xl transition-all"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default TeachPage;
