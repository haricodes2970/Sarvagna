import React, { useState, useEffect, useCallback } from 'react';
import { Flame, Plus, BookOpen, School, GraduationCap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';

interface ToastState {
  message: string;
  type: 'error' | 'success';
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, setSubjects, subjects, setProgress } = useUserStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [selection, setSelection] = useState({
    branch: '',
    semester: '',
    subject: '',
  });

  const branches = ['CS', 'ECE', 'ME', 'CV', 'IS', 'EEE'];
  const subjectsByBranch: Record<string, string[]> = {
    CS: ['Computer Networks', 'OS', 'DBMS', 'Theory of Computation', 'DAA'],
    IS: ['Software Engineering', 'Big Data', 'Cloud Computing'],
    ECE: ['Digital Signal Processing', 'Microcontrollers', 'VLSI'],
    ME: ['Thermodynamics', 'Fluid Mechanics'],
    CV: ['Structural Analysis', 'Geotechnical Engineering'],
    EEE: ['Power Systems', 'Control Systems'],
  };

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [subjectsRes, progressRes] = await Promise.all([
        api.getSubjects(),
        api.getProgress(),
      ]);
      const mapped = subjectsRes.map((s: { id: number; name: string; status: string }) => ({
        id: String(s.id),
        name: s.name,
        currentModule: 'Module 1',
        modulesCompleted: 0,
        streak: 0,
      }));
      setSubjects(mapped);
      setProgress(progressRes);
    } catch {
      showToast('Failed to sync dashboard data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [setSubjects, setProgress]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAddSubject = async () => {
    try {
      await api.postSubject(selection);
      showToast('Subject added successfully!', 'success');
      setIsModalOpen(false);
      setModalStep(1);
      setSelection({ branch: '', semester: '', subject: '' });
      fetchDashboardData();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 400) {
        showToast('Slot full. Remove a subject first.', 'error');
      } else {
        showToast('Operation failed.', 'error');
      }
    }
  };

  const emptySlots = Math.max(0, 10 - subjects.length);

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
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="text-2xl font-black tracking-tighter text-white font-serif italic">Sarvagna</div>
          <div className="flex items-center gap-8">
            <div className="hidden md:flex items-center gap-4 bg-slate-900/50 border border-slate-800 px-4 py-2 rounded-2xl">
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Level {user.level}</span>
                <span className="text-xs font-bold text-indigo-400">{user.xp} XP</span>
              </div>
              <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000"
                  style={{ width: `${Math.min(100, (user.xp % 1000) / 10)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 bg-orange-500/10 text-orange-500 px-4 py-2 rounded-2xl border border-orange-500/20">
              <Flame className="w-5 h-5 fill-current" />
              <span className="font-black">{user.streak} Days</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 py-12">
        {loading ? (
          <div className="text-slate-500 text-center py-20">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {subjects.map((sub) => (
              <div
                key={sub.id}
                onClick={() => navigate(`/subjects/${sub.id}`)}
                className="group bg-slate-900 border border-slate-800 p-6 rounded-3xl hover:border-indigo-500/50 hover:bg-slate-900/80 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-indigo-500/10 p-3 rounded-2xl text-indigo-400 border border-indigo-500/20">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-1 text-orange-500 text-xs font-bold">
                    <Flame className="w-3 h-3 fill-current" /> {sub.streak}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors">{sub.name}</h3>
                <p className="text-sm text-slate-500 mb-6">{sub.currentModule}</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <span>Progress</span>
                    <span>{sub.modulesCompleted} / 5 Modules</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-500"
                      style={{ width: `${(sub.modulesCompleted / 5) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}

            {Array.from({ length: emptySlots }).map((_, i) => (
              <button
                key={`empty-${i}`}
                onClick={() => setIsModalOpen(true)}
                className="border-2 border-dashed border-slate-800 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 bg-slate-900/20 hover:bg-slate-900/40 hover:border-indigo-500/30 transition-all group min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center group-hover:scale-110 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 transition-all">
                  <Plus className="w-6 h-6" />
                </div>
                <span className="font-bold text-slate-500 group-hover:text-slate-300">Add Subject</span>
              </button>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
            onClick={() => { setIsModalOpen(false); setModalStep(1); }}
          />
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-[32px] p-8 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-bold text-white">Initialize Subject</h3>
              <div className="flex gap-1">
                {[1, 2, 3].map((s) => (
                  <div key={s} className={`w-6 h-1 rounded-full ${modalStep >= s ? 'bg-indigo-500' : 'bg-slate-800'}`} />
                ))}
              </div>
            </div>

            {modalStep === 1 && (
              <div className="grid grid-cols-2 gap-3">
                {branches.map((b) => (
                  <button
                    key={b}
                    onClick={() => { setSelection({ ...selection, branch: b }); setModalStep(2); }}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-2xl text-left hover:border-indigo-500 transition-all"
                  >
                    <School className="w-5 h-5 text-indigo-400 mb-2" />
                    <span className="font-bold">{b}</span>
                  </button>
                ))}
              </div>
            )}

            {modalStep === 2 && (
              <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { setSelection({ ...selection, semester: String(i + 1) }); setModalStep(3); }}
                    className="p-4 bg-slate-950 border border-slate-800 rounded-2xl font-bold hover:border-indigo-500 transition-all text-center"
                  >
                    <GraduationCap className="w-4 h-4 text-indigo-400 mb-1 mx-auto" />
                    Sem {i + 1}
                  </button>
                ))}
              </div>
            )}

            {modalStep === 3 && (
              <div className="space-y-3">
                {(subjectsByBranch[selection.branch] ?? ['Advanced Engineering']).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSelection({ ...selection, subject: s })}
                    className={`w-full p-4 border rounded-2xl text-left transition-all ${
                      selection.subject === s
                        ? 'bg-indigo-600 border-indigo-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="font-bold">{s}</span>
                  </button>
                ))}
                <button
                  onClick={handleAddSubject}
                  disabled={!selection.subject}
                  className="w-full mt-6 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 py-4 rounded-2xl font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/20"
                >
                  Start Learning
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
