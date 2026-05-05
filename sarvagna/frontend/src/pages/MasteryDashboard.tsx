import React, { useEffect, useState } from 'react';
import {
  AlertCircle, Award, Brain, CheckCircle2, Download,
  Flame, Target, TrendingUp, Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import type { AnalyticsDashboard } from '../services/api';
import PomodoroTimer from '../components/PomodoroTimer';
import type { PomodoroMode } from '../components/PomodoroTimer';

const COLOR_MAP: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-rose-500',
};

const COLOR_TEXT: Record<string, string> = {
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-rose-400',
};

interface ToastState { message: string; type: 'error' | 'success' }

const MasteryDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [pomodoroSessions, setPomodoroSessions] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    api.getAnalyticsDashboard()
      .then(setData)
      .catch(() => showToast('Failed to load analytics', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleSessionComplete = (mode: PomodoroMode) => {
    if (mode === 'work') {
      setPomodoroSessions(n => n + 1);
      showToast('Focus session complete! Streak updated.', 'success');
    }
  };

  const exportReport = async () => {
    try {
      const md = await api.exportStudyReport();
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sarvagna_report_${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Report downloaded!', 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-200 transition-all ${focusMode ? 'opacity-90' : ''}`}>
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${
          toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span className="font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Nav — hidden in focus mode */}
      {!focusMode && (
        <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-8 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <button onClick={() => navigate('/dashboard')} className="text-2xl font-black tracking-tighter text-white font-serif italic">
              Sarvagna
            </button>
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Mastery Dashboard</span>
            <button
              onClick={exportReport}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl font-bold text-sm transition-all"
            >
              <Download className="w-4 h-4" />
              Export Report
            </button>
          </div>
        </nav>
      )}

      {/* Focus mode banner */}
      {focusMode && (
        <div className="flex items-center justify-center py-3 bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-sm font-bold">
          <Zap className="w-4 h-4 mr-2" /> Focus Mode Active — distractions hidden
        </div>
      )}

      <main className="max-w-6xl mx-auto px-8 py-10 space-y-10">

        {/* Pomodoro always visible */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col items-center gap-2 shrink-0">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">Focus Timer</p>
            <PomodoroTimer
              onFocusChange={setFocusMode}
              onSessionComplete={handleSessionComplete}
            />
            {pomodoroSessions > 0 && (
              <p className="text-xs text-slate-500 mt-2">+{pomodoroSessions * 25} min studied today</p>
            )}
          </div>

          {/* SRS reminder */}
          {data && data.srs_due > 0 && !focusMode && (
            <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex items-start gap-4">
              <Brain className="w-8 h-8 text-amber-400 shrink-0 mt-1" />
              <div>
                <p className="font-black text-white text-lg">{data.srs_due} flashcard{data.srs_due !== 1 ? 's' : ''} due for review</p>
                <p className="text-slate-400 text-sm mt-1">Reviewing now keeps your memory strong and improves SRS health score.</p>
                <button
                  onClick={() => navigate('/review')}
                  className="mt-3 px-5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold rounded-xl text-sm transition-all border border-amber-500/30"
                >
                  Review Now
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rest hidden in focus mode */}
        {!focusMode && (
          <>
            {loading ? (
              <div className="flex justify-center py-20">
                <span className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : data ? (
              <>
                {/* Progress stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'XP', value: data.progress.xp, icon: <Zap className="w-5 h-5" />, color: 'text-indigo-400' },
                    { label: 'Level', value: data.progress.level, icon: <TrendingUp className="w-5 h-5" />, color: 'text-violet-400' },
                    { label: 'Streak', value: `${data.progress.streak_days}d`, icon: <Flame className="w-5 h-5" />, color: 'text-orange-400' },
                    { label: 'Badges', value: data.progress.badges.length, icon: <Award className="w-5 h-5" />, color: 'text-amber-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-4">
                      <span className={s.color}>{s.icon}</span>
                      <div>
                        <p className="text-2xl font-black text-white">{s.value}</p>
                        <p className="text-xs text-slate-500 uppercase tracking-widest">{s.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Subject mastery bars */}
                {data.mastery.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
                    <h2 className="font-black text-white text-lg flex items-center gap-2">
                      <Target className="w-5 h-5 text-indigo-400" /> Subject Mastery
                    </h2>
                    <div className="space-y-4">
                      {data.mastery.map(s => (
                        <div key={s.subject_id} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="font-bold text-slate-200">{s.subject_name}</span>
                            <span className="font-black text-indigo-400">{s.mastery_score.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-700"
                              style={{ width: `${Math.min(100, s.mastery_score)}%` }}
                            />
                          </div>
                          <div className="flex gap-4 text-[10px] text-slate-500 font-semibold">
                            <span>Roadmap {s.roadmap_pct.toFixed(0)}%</span>
                            <span>Quiz {s.quiz_pct.toFixed(0)}%</span>
                            <span>SRS {s.srs_pct.toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Heatmap grid */}
                {data.heatmap.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                    <h2 className="font-black text-white text-lg">Topic Heatmap</h2>
                    <div className="flex flex-wrap gap-2">
                      {data.heatmap.map(t => (
                        <div
                          key={t.topic}
                          title={`${t.topic}: ${t.score_pct.toFixed(1)}% (${t.quiz_count} quiz${t.quiz_count !== 1 ? 'zes' : ''})`}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold text-white/90 ${COLOR_MAP[t.color] ?? 'bg-slate-700'} opacity-80 hover:opacity-100 transition-opacity cursor-default`}
                        >
                          {t.topic}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Strong ≥80%</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Developing 50-79%</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500 inline-block" /> Weak &lt;50%</span>
                    </div>
                  </div>
                )}

                {/* Weak areas list */}
                {data.weak_areas.length > 0 && (
                  <div className="bg-slate-900 border border-rose-500/20 rounded-3xl p-6 space-y-4">
                    <h2 className="font-black text-white text-lg flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-rose-400" /> Weak Areas
                    </h2>
                    <div className="space-y-3">
                      {data.weak_areas.map(w => (
                        <div key={w.topic} className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-200 text-sm">{w.topic}</p>
                            <p className="text-xs text-slate-500">{w.quiz_count} quiz{w.quiz_count !== 1 ? 'zes' : ''}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`font-black text-sm ${COLOR_TEXT[w.color]}`}>{w.score_pct.toFixed(1)}%</span>
                            <button
                              onClick={() => navigate(`/teach?topic=${encodeURIComponent(w.topic)}`)}
                              className="text-xs px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg font-bold transition-all border border-rose-500/20"
                            >
                              Study
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Badges */}
                {data.progress.badges.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                    <h2 className="font-black text-white text-lg flex items-center gap-2">
                      <Award className="w-5 h-5 text-amber-400" /> Earned Badges
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      {data.progress.badges.map(b => (
                        <span key={b} className="px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-black uppercase tracking-widest">
                          {b.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-slate-500 text-center py-10">No analytics data yet. Start studying!</p>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default MasteryDashboard;
