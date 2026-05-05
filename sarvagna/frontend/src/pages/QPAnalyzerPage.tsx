import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Sparkles, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

interface QPResult {
  questions: Array<{ question: string; marks: number; topic: string; unit: string }>;
  repeated_topics: Array<{ topic: string; frequency: number }>;
  high_weightage: string[];
  predictions: string[];
}

interface ToastState {
  message: string;
  type: 'error' | 'success';
}

const QPAnalyzerPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<QPResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.toLowerCase().endsWith('.pdf')) {
      setSelectedFile(file);
      setResult(null);
    } else {
      showToast('Only PDF files accepted', 'error');
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setAnalyzing(true);
    try {
      const data = await api.analyzeQP(selectedFile);
      setResult(data);
      showToast('Analysis complete!', 'success');
    } catch {
      showToast('Analysis failed. Check your file and try again.', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  const saveToStudyList = async () => {
    if (!result) return;
    localStorage.setItem('sarvagna_study_predictions', JSON.stringify(result.predictions));
    try {
      await api.savePredictions({
        topics: result.predictions,
        source_filename: selectedFile?.name,
      });
      showToast('Saved to study list!', 'success');
    } catch {
      showToast('Saved locally (server sync failed)', 'success');
    }
  };

  const maxFreq = result
    ? Math.max(...result.repeated_topics.map(t => t.frequency), 1)
    : 1;

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
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">QP Analyzer</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-8 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-black text-white">Question Paper Analyzer</h1>
          <p className="text-slate-500 mt-1">Upload VTU question papers — get topic predictions and exam patterns</p>
        </div>

        {/* Upload zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer ${
            dragging
              ? 'border-indigo-500 bg-indigo-500/5'
              : selectedFile
              ? 'border-amber-500/40 bg-amber-500/5 cursor-default'
              : 'border-slate-700 bg-slate-900/30 hover:border-indigo-500/40 hover:bg-slate-900/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => { setSelectedFile(e.target.files?.[0] ?? null); setResult(null); }}
          />
          {selectedFile ? (
            <>
              <FileText className="w-10 h-10 text-amber-400" />
              <div className="text-center">
                <p className="font-bold text-white">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={e => { e.stopPropagation(); handleAnalyze(); }}
                  disabled={analyzing}
                  className="px-6 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  {analyzing ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {analyzing ? 'Analyzing...' : 'Analyze Paper'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setSelectedFile(null); setResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all text-sm font-bold"
                >
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                <Upload className="w-6 h-6 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-300">Drop question paper PDF here</p>
                <p className="text-sm text-slate-500 mt-1">Only PDF supported</p>
              </div>
            </>
          )}
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-8">

            {/* Questions table */}
            {result.questions.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="font-bold text-white">Questions Found</h2>
                  <span className="text-xs text-slate-500 font-mono">{result.questions.length} questions</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 text-[10px] uppercase tracking-widest text-slate-500">
                        <th className="text-left px-6 py-3">Question</th>
                        <th className="text-left px-4 py-3 whitespace-nowrap">Topic</th>
                        <th className="text-left px-4 py-3">Unit</th>
                        <th className="text-right px-6 py-3">Marks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {result.questions.map((q, i) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-3 text-slate-300 max-w-xs">{q.question}</td>
                          <td className="px-4 py-3 text-slate-400">{q.topic}</td>
                          <td className="px-4 py-3 text-slate-500">{q.unit}</td>
                          <td className="px-6 py-3 text-right">
                            <span className={`font-black text-sm px-2 py-0.5 rounded-lg ${
                              q.marks >= 10 ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {q.marks}M
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Most repeated topics — bar chart */}
            {result.repeated_topics.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h2 className="font-bold text-white">Most Repeated Topics</h2>
                <div className="space-y-3">
                  {result.repeated_topics
                    .sort((a, b) => b.frequency - a.frequency)
                    .map((t, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold">
                          <span className="text-slate-300">{t.topic}</span>
                          <span className="text-slate-500">{t.frequency}×</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                            style={{ width: `${(t.frequency / maxFreq) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* High weightage */}
            {result.high_weightage.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
                <h2 className="font-bold text-white">High Weightage Topics</h2>
                <div className="flex flex-wrap gap-2">
                  {result.high_weightage.map((topic, i) => (
                    <span
                      key={i}
                      className="px-4 py-2 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-2xl font-semibold text-sm"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Predictions */}
            {result.predictions.length > 0 && (
              <div className="bg-slate-900 border border-emerald-500/20 rounded-3xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <h2 className="font-bold text-white">Predicted Topics</h2>
                  </div>
                  <button
                    onClick={saveToStudyList}
                    className="text-xs font-black uppercase tracking-widest px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl transition-all"
                  >
                    Study These First
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.predictions.map((topic, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-2xl font-semibold text-sm"
                    >
                      <Sparkles className="w-3 h-3" />
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default QPAnalyzerPage;
