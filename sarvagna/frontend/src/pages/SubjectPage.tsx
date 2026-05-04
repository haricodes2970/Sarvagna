import React, { useState, useEffect, useRef } from 'react';
import {
  Lock, CheckCircle2, Send, Sparkles, Zap, Brain,
  Trophy, ChevronLeft, Layout, Loader2,
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type ModuleStatus } from '../services/api';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
}

type ModuleState = 'completed' | 'current' | 'locked';

interface UIModule {
  id: number;
  title: string;
  state: ModuleState;
  topics: string[];
}

const statusToState = (status: string): ModuleState => {
  if (status === 'complete') return 'completed';
  if (status === 'unlocked') return 'current';
  return 'locked';
};

const SubjectPage: React.FC = () => {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const numericSubjectId = subjectId ? parseInt(subjectId, 10) : null;

  const [messages, setMessages] = useState<Message[]>([
    { id: '1', sender: 'ai', text: "Ready to master this module? I've prepared the key concepts for you." },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'textbook' | 'simple' | 'example'>('simple');
  const [expandedNode, setExpandedNode] = useState<number | null>(null);
  const [showBadge, setShowBadge] = useState(false);
  const [modules, setModules] = useState<UIModule[]>([]);
  const [subjectName] = useState('Subject');

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!numericSubjectId) return;
    api.getRoadmap(numericSubjectId).then((data: ModuleStatus[]) => {
      const uiModules: UIModule[] = data.map((m) => ({
        id: m.module_number,
        title: m.title,
        state: statusToState(m.status),
        topics: m.topics,
      }));
      setModules(uiModules);
      const current = uiModules.find((m) => m.state === 'current');
      if (current) setExpandedNode(current.id);
    }).catch(() => {
      setMessages((prev) => [...prev, { id: 'err-roadmap', sender: 'ai', text: 'Could not load roadmap.' }]);
    });
  }, [numericSubjectId]);

  const handleQuery = async (text: string) => {
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    try {
      const res = await api.postQuery({ subjectId: numericSubjectId, query: text });
      const aiMsg: Message = { id: (Date.now() + 1).toString(), sender: 'ai', text: res.response };
      setMessages((prev) => [...prev, aiMsg]);
      if (res.moduleCompleted) setShowBadge(true);
    } catch {
      setMessages((prev) => [...prev, { id: 'err', sender: 'ai', text: 'Connection error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200">
      {/* Left Panel: Roadmap */}
      <aside className="w-[35%] border-r border-slate-900 p-8 flex flex-col bg-slate-950/50">
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-400 transition-colors mb-10 group"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-xs font-black uppercase tracking-widest">Dashboard</span>
        </button>

        <h2 className="text-3xl font-black text-white mb-12 tracking-tighter">{subjectName}</h2>

        <div className="relative flex-1 overflow-y-auto pr-4">
          <div className="absolute left-[19px] top-4 bottom-4 w-0.5 border-l-2 border-dashed border-slate-800" />

          <div className="space-y-10">
            {modules.map((m) => (
              <div key={m.id} className="relative">
                <div
                  className={`flex items-center gap-6 cursor-pointer group ${m.state === 'locked' ? 'opacity-40' : 'opacity-100'}`}
                  onClick={() => m.state !== 'locked' && setExpandedNode(expandedNode === m.id ? null : m.id)}
                >
                  <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500
                    ${m.state === 'completed' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' :
                      m.state === 'current' ? 'bg-amber-500 animate-pulse shadow-[0_0_15px_rgba(245,158,11,0.4)]' :
                      'bg-slate-900 border-2 border-slate-800 text-slate-600'}`}
                  >
                    {m.state === 'completed' ? <CheckCircle2 className="w-6 h-6 text-white" /> :
                     m.state === 'current' ? <div className="w-3 h-3 bg-white rounded-full" /> :
                     <Lock className="w-4 h-4" />}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-500 uppercase">Module {String(m.id).padStart(2, '0')}</span>
                      {m.state === 'current' && (
                        <span className="text-[8px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">Current</span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">{m.title}</h3>
                  </div>
                </div>

                {expandedNode === m.id && m.topics.length > 0 && (
                  <div className="ml-16 mt-4 space-y-2">
                    {m.topics.map((t, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {modules.length === 0 && (
              <div className="text-slate-600 text-sm pl-4">Loading modules...</div>
            )}
          </div>
        </div>
      </aside>

      {/* Right Panel: Chat */}
      <main className="w-[65%] flex flex-col bg-slate-950">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-12 space-y-8 scroll-smooth">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`group relative max-w-[85%] p-6 rounded-3xl ${
                msg.sender === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none shadow-xl shadow-indigo-600/10'
                  : 'bg-slate-900 border border-slate-800 rounded-tl-none'
              }`}>
                {msg.sender === 'ai' && (
                  <div className="absolute -left-12 top-0 w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center font-serif font-black italic text-white text-xs">S</div>
                )}
                <p className="text-sm leading-relaxed font-medium">{msg.text}</p>

                {msg.sender === 'ai' && (
                  <div className="mt-6 flex gap-1 bg-slate-950 p-1 rounded-2xl w-fit border border-slate-800">
                    {(['simple', 'textbook', 'example'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          activeTab === tab ? 'bg-slate-800 text-indigo-400 shadow-inner' : 'text-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start items-center gap-3 text-indigo-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs font-black uppercase tracking-widest animate-pulse">Generating Insights...</span>
            </div>
          )}
        </div>

        <div className="px-12 flex gap-3 mb-6">
          {[
            { icon: <Brain className="w-4 h-4" />, label: 'Teach this module' },
            { icon: <Zap className="w-4 h-4" />, label: 'Exam mode' },
            { icon: <Layout className="w-4 h-4" />, label: 'Generate flashcards' },
          ].map((action, i) => (
            <button
              key={i}
              onClick={() => handleQuery(action.label)}
              className="flex items-center gap-2 bg-slate-900/50 border border-slate-800 px-5 py-2.5 rounded-2xl text-xs font-bold text-slate-400 hover:text-indigo-400 hover:border-indigo-500/30 transition-all active:scale-95"
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>

        <div className="p-8 border-t border-slate-900 bg-slate-950">
          <div className="max-w-4xl mx-auto relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && inputValue && handleQuery(inputValue)}
              placeholder="Ask anything about this module..."
              className="w-full bg-slate-900 border border-slate-800 rounded-[24px] py-5 pl-8 pr-16 text-slate-200 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
            />
            <button
              disabled={loading || !inputValue}
              onClick={() => handleQuery(inputValue)}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-500 p-3.5 rounded-2xl text-white hover:bg-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </main>

      {showBadge && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl" />
          <div className="relative text-center">
            <div className="w-56 h-56 mx-auto mb-8 relative">
              <div className="absolute inset-0 bg-indigo-500/30 blur-[80px] animate-pulse" />
              <div className="relative bg-gradient-to-br from-indigo-500 to-purple-600 w-full h-full rounded-[48px] rotate-12 flex items-center justify-center shadow-2xl border-4 border-indigo-400/50">
                <Trophy className="w-24 h-24 text-white -rotate-12 drop-shadow-lg" />
              </div>
            </div>
            <h3 className="text-5xl font-black text-white mb-3 uppercase tracking-tighter italic">Module Unlocked!</h3>
            <div className="flex items-center justify-center gap-3 bg-emerald-500/10 text-emerald-400 w-fit mx-auto px-8 py-3 rounded-full border border-emerald-500/20 mb-10">
              <Sparkles className="w-6 h-6" />
              <span className="font-black text-2xl tracking-tighter">+50 XP</span>
            </div>
            <button
              onClick={() => setShowBadge(false)}
              className="bg-white text-slate-950 px-16 py-5 rounded-[24px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl"
            >
              Continue Mastery
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubjectPage;
