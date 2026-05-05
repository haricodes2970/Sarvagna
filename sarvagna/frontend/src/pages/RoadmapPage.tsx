import React, { useEffect, useState } from 'react';
import { AlertCircle, BookOpen, CheckCircle2, ChevronRight, Clock, Sparkles, Zap } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import type { RoadmapModule } from '../services/api';

const YIELD_COLORS: Record<string, string> = {
  high: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  medium: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  low: 'bg-slate-700/40 text-slate-400 border-slate-700',
};

const YIELD_LABEL: Record<string, string> = {
  high: 'High Yield',
  medium: 'Medium Yield',
  low: 'Low Yield',
};

interface ToastState { message: string; type: 'error' | 'success' }

const RoadmapPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subjectId = Number(searchParams.get('subject_id') ?? 0);
  const subjectName = searchParams.get('subject_name') ?? 'Subject';

  const [modules, setModules] = useState<RoadmapModule[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [crunchMode, setCrunchMode] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadModules = async (crunch = false) => {
    if (!subjectId) return;
    setLoading(true);
    try {
      const data = crunch
        ? await api.getCrunchModules(subjectId)
        : await api.getRoadmapEntries(subjectId);
      setModules(data);
    } catch {
      showToast('Failed to load roadmap', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!subjectId) return;
    setGenerating(true);
    try {
      const data = await api.generateRoadmap(subjectId, subjectName);
      setModules(data);
      setCrunchMode(false);
      showToast('Roadmap generated!', 'success');
    } catch {
      showToast('Generation failed — ensure files are uploaded for this subject', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const toggleCrunch = async () => {
    const next = !crunchMode;
    setCrunchMode(next);
    await loadModules(next);
  };

  useEffect(() => { loadModules(); }, [subjectId]);

  const totalMinutes = modules.reduce((s, m) => s + m.estimated_minutes, 0);
  const highYield = modules.filter(m => m.yield_score === 'high').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${
          toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span className="font-semibold">{toast.message}</span>
        </div>
      )}

      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-2xl font-black tracking-tighter text-white font-serif italic"
          >
            Sarvagna
          </button>
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Roadmap</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-8 py-12 space-y-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black text-white">{subjectName}</h1>
            <p className="text-slate-500 mt-1">AI-generated study roadmap from your uploaded materials</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={toggleCrunch}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
                crunchMode
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-amber-500/30'
              }`}
            >
              <Zap className="w-4 h-4" />
              Crunch Mode
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all text-sm"
            >
              {generating ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {generating ? 'Generating...' : modules.length ? 'Regenerate' : 'Generate Roadmap'}
            </button>
          </div>
        </div>

        {modules.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-white">{modules.length}</p>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Modules</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-emerald-400">{highYield}</p>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">High Yield</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <p className="text-2xl font-black text-white">{Math.round(totalMinutes / 60)}h</p>
              <p className="text-xs text-slate-500 uppercase tracking-widest mt-1">Est. Study Time</p>
            </div>
          </div>
        )}

        {crunchMode && (
          <div className="flex items-center gap-3 px-5 py-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400 text-sm font-semibold">
            <Zap className="w-4 h-4" />
            Crunch Mode: showing only High Yield and Core modules
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : modules.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <BookOpen className="w-12 h-12 text-slate-700 mx-auto" />
            <p className="text-slate-500 font-semibold">No roadmap yet.</p>
            <p className="text-slate-600 text-sm">Upload study materials for this subject, then click Generate Roadmap.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {modules.map((mod) => (
              <div
                key={mod.id}
                className={`bg-slate-900 border rounded-3xl p-6 space-y-4 transition-all ${
                  mod.yield_score === 'high'
                    ? 'border-emerald-500/30'
                    : mod.is_core
                    ? 'border-indigo-500/20'
                    : 'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-black text-slate-400 shrink-0">
                      {mod.module_number}
                    </span>
                    <div>
                      <h3 className="font-black text-white text-lg leading-tight">{mod.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span className="text-xs text-slate-500">{mod.estimated_minutes} min</span>
                        {mod.is_core && (
                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                            Core
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border ${YIELD_COLORS[mod.yield_score]}`}>
                    {YIELD_LABEL[mod.yield_score]}
                  </span>
                </div>

                {mod.core_concepts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Key Concepts</p>
                    <div className="flex flex-wrap gap-2">
                      {mod.core_concepts.map((c, i) => (
                        <span key={i} className="text-xs px-3 py-1 bg-slate-800 text-slate-300 rounded-xl font-semibold">
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {mod.sections.length > 0 && (
                  <details className="group">
                    <summary className="flex items-center gap-1 text-xs text-slate-500 font-semibold cursor-pointer list-none">
                      <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                      {mod.sections.length} sections
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {mod.sections.map((s, i) => (
                        <span key={i} className="text-xs px-2 py-0.5 bg-slate-800/60 text-slate-400 rounded-lg">
                          {s}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default RoadmapPage;
