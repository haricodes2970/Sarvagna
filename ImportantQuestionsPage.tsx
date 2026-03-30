import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BookOpen, Sparkles, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { subjectsApi, importantQuestionsApi } from '@/lib/api';

interface Subject {
  id: string;
  name: string;
  branch: string;
  semester: number;
}

interface ImportantQuestion {
  id: string;
  question: string;
  created_at: string;
}

export default function ImportantQuestionsPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState('');

  // Fetch subject info for the header
  const { data: subjects = [] as Subject[] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsApi.list().then((r) => r.data),
  });
  const subject = subjects.find((s: Subject) => s.id === subjectId);
  const subjectName = subject?.name ?? 'Subject';

  // Fetch existing important questions
  const { data: questions = [] as ImportantQuestion[], isLoading } = useQuery<ImportantQuestion[]>({
    queryKey: ['important-questions', subjectId],
    queryFn: () => importantQuestionsApi.list(subjectId!).then((r) => r.data),
    enabled: !!subjectId,
  });

  const addMutation = useMutation({
    mutationFn: (text: string) => importantQuestionsApi.upload(subjectId!, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['important-questions', subjectId] });
      setRawText('');
      toast.success('Questions saved to your vault!');
    },
    onError: () => toast.error('Failed to save questions'),
  });

  const deleteMutation = useMutation({
    mutationFn: (questionId: string) => importantQuestionsApi.delete(subjectId!, questionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['important-questions', subjectId] });
      toast.success('Question removed');
    },
    onError: () => toast.error('Failed to remove question'),
  });

  const handleStudy = (question: string) => {
    // Navigate to chat with the question as a topic title
    // Using module 1 as a default target for important questions chat
    navigate(`/chat/${subjectId}/1?topicTitle=${encodeURIComponent(question)}`);
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 font-sans">
      {/* --- Header --- */}
      <header className="sticky top-0 z-30 bg-black/60 backdrop-blur-xl border-b border-zinc-800/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black tracking-tight text-white">
              Important Questions <span className="text-zinc-500 mx-2">—</span> 
              <span className="text-amber-500">{subjectName}</span>
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">
              Professor's Question Vault
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-12">
        
        {/* --- Input Section --- */}
        <section className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <div className="relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
            <label className="block text-sm font-bold text-zinc-400 mb-3 uppercase tracking-widest">
              Bulk Import
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste your professor's important questions here, one per line..."
              className="w-full h-40 bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all resize-none"
            />
            <div className="flex justify-end mt-4">
              <button
                onClick={() => addMutation.mutate(rawText)}
                disabled={!rawText.trim() || addMutation.isPending}
                className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black px-8 py-3 rounded-xl font-black uppercase tracking-widest text-sm transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_30px_rgba(245,158,11,0.4)] active:scale-95"
              >
                <Sparkles size={16} />
                {addMutation.isPending ? 'Saving...' : 'Save Questions'}
              </button>
            </div>
          </div>
        </section>

        {/* --- List Section --- */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-zinc-300">
              <BookOpen size={20} className="text-teal-500" />
              Saved Vault ({questions.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="grid gap-4 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-zinc-900 rounded-2xl border border-zinc-800" />
              ))}
            </div>
          ) : questions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-700">
                <BookOpen size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-zinc-400 font-medium">No important questions yet.</p>
                <p className="text-zinc-600 text-sm">Paste your professor's questions above to begin your conquest.</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <AnimatePresence mode="popLayout">
                {questions.map((q: ImportantQuestion) => (
                  <motion.div
                    key={q.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="group bg-zinc-900/40 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all"
                  >
                    <div className="flex-1">
                      <p className="text-zinc-200 font-medium leading-relaxed">
                        {q.question}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">
                          Added {new Date(q.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 w-full md:w-auto">
                      <button
                        onClick={() => handleStudy(q.question)}
                        className="flex-1 md:flex-none bg-teal-500/10 hover:bg-teal-500 text-teal-400 hover:text-black border border-teal-500/20 px-5 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 whitespace-nowrap"
                      >
                        Study This
                        <ArrowRight size={16} />
                      </button>
                      <button 
                        onClick={() => deleteMutation.mutate(q.id)}
                        disabled={deleteMutation.isPending}
                        className="p-2.5 rounded-xl bg-zinc-800/50 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 border border-transparent hover:border-red-400/20 transition-all"
                        title={deleteMutation.isPending ? "Removing..." : "Remove question"}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>

      {/* --- Footer Decoration --- */}
      <div className="h-20 pointer-events-none bg-gradient-to-t from-black to-transparent sticky bottom-0 z-0" />
    </div>
  );
}