import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Award, BookOpen, Brain, CheckCircle2,
  ChevronRight, RotateCcw, Sparkles, Zap
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import type { FlashcardOut, QuizAnswer, QuizQuestion, QuizResult } from '../services/api';

type Tab = 'flashcards' | 'quiz';
type Phase = 'idle' | 'reviewing' | 'done';
type QuizPhase = 'setup' | 'active' | 'result';

interface ToastState { message: string; type: 'error' | 'success' }

const RATING_LABELS = ['', 'Blackout', 'Wrong', 'Hard', 'Good', 'Perfect'];
const RATING_COLORS = ['', 'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500', 'bg-indigo-500'];

// ─── Flashcard flip card ──────────────────────────────────────────────────────
const FlipCard: React.FC<{
  card: FlashcardOut;
  onRate: (rating: number) => void;
  index: number;
  total: number;
}> = ({ card, onRate, index, total }) => {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => setFlipped(false), [card.id]);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-xl">
      <div className="text-xs text-slate-500 font-mono">{index + 1} / {total}</div>

      {/* Card */}
      <div
        className="w-full cursor-pointer"
        style={{ perspective: '1000px' }}
        onClick={() => setFlipped(f => !f)}
      >
        <div
          className="relative w-full transition-transform duration-500"
          style={{
            transformStyle: 'preserve-3d',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            minHeight: '240px',
          }}
        >
          {/* Front */}
          <div
            className="absolute inset-0 bg-slate-900 border border-slate-700 rounded-3xl p-8 flex flex-col items-center justify-center gap-4"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Question</p>
            <p className="text-center text-white font-bold text-lg leading-relaxed">{card.front}</p>
            <p className="text-xs text-slate-600 mt-2">Tap to reveal answer</p>
          </div>
          {/* Back */}
          <div
            className="absolute inset-0 bg-indigo-950 border border-indigo-500/30 rounded-3xl p-8 flex flex-col items-center justify-center gap-4"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Answer</p>
            <p className="text-center text-slate-200 leading-relaxed">{card.back}</p>
          </div>
        </div>
      </div>

      {/* Rating buttons — only show when flipped */}
      <div className={`flex gap-2 transition-all duration-300 ${flipped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {[1, 2, 3, 4, 5].map(r => (
          <button
            key={r}
            onClick={() => onRate(r)}
            className={`flex flex-col items-center gap-1 px-3 py-2 rounded-2xl ${RATING_COLORS[r]}/10 hover:${RATING_COLORS[r]}/20 border border-${RATING_COLORS[r]?.replace('bg-', '')}/30 transition-all`}
          >
            <span className="text-sm font-black text-white">{r}</span>
            <span className="text-[9px] text-slate-400 whitespace-nowrap">{RATING_LABELS[r]}</span>
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-600">
        Next review in <span className="text-slate-400 font-semibold">{card.interval} day{card.interval !== 1 ? 's' : ''}</span>
        · EF {card.easiness_factor.toFixed(2)}
      </p>
    </div>
  );
};

// ─── Quiz question renderer ───────────────────────────────────────────────────
const QuizQuestionView: React.FC<{
  question: QuizQuestion;
  index: number;
  total: number;
  onAnswer: (answer: string) => void;
  answered: string | null;
}> = ({ question, index, total, onAnswer, answered }) => {
  const [input, setInput] = useState('');
  const correct = answered === question.correct_answer;

  return (
    <div className="space-y-5 w-full max-w-xl">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="font-mono">{index + 1} / {total}</span>
        <span className="px-2 py-0.5 bg-slate-800 rounded-lg font-bold">{question.type}</span>
      </div>

      <p className="text-white font-bold text-lg leading-relaxed">{question.question}</p>

      {question.type === 'MCQ' && (
        <div className="space-y-2">
          {question.options.map((opt, i) => {
            const isSelected = answered === opt;
            const isCorrect = opt === question.correct_answer;
            let cls = 'bg-slate-900 border-slate-700 text-slate-300 hover:border-indigo-500/40';
            if (answered) {
              if (isCorrect) cls = 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300';
              else if (isSelected) cls = 'bg-rose-500/10 border-rose-500/40 text-rose-300';
              else cls = 'bg-slate-900/40 border-slate-800 text-slate-500';
            }
            return (
              <button
                key={i}
                disabled={!!answered}
                onClick={() => onAnswer(opt)}
                className={`w-full text-left px-5 py-3 rounded-2xl border font-semibold text-sm transition-all ${cls}`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}

      {(question.type === 'BLANK' || question.type === 'SHORT') && !answered && (
        <form onSubmit={e => { e.preventDefault(); if (input.trim()) onAnswer(input.trim()); }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={question.type === 'BLANK' ? 'Fill in the blank…' : 'Your answer…'}
            className="w-full bg-slate-900 border border-slate-700 rounded-2xl px-5 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50 transition-all mb-3"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl text-sm transition-all"
          >
            Submit
          </button>
        </form>
      )}

      {answered && (
        <div className={`p-4 rounded-2xl border ${correct ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
          <p className={`font-black text-sm mb-1 ${correct ? 'text-emerald-400' : 'text-rose-400'}`}>
            {correct ? '✓ Correct!' : `✗ Answer: ${question.correct_answer}`}
          </p>
          <p className="text-slate-400 text-sm">{question.explanation}</p>
        </div>
      )}
    </div>
  );
};

// ─── Main ReviewCenter ────────────────────────────────────────────────────────
const ReviewCenter: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subjectId = Number(searchParams.get('subject_id') ?? 0) || undefined;
  const subjectName = searchParams.get('subject_name') ?? 'All Subjects';

  const [tab, setTab] = useState<Tab>('flashcards');
  const [toast, setToast] = useState<ToastState | null>(null);

  // Flashcard state
  const [cards, setCards] = useState<FlashcardOut[]>([]);
  const [cardIdx, setCardIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [cardLoading, setCardLoading] = useState(false);
  const [sessionXP, setSessionXP] = useState(0);

  // Quiz state
  const [quizPhase, setQuizPhase] = useState<QuizPhase>('setup');
  const [quizTopic, setQuizTopic] = useState('');
  const [quizCount, setQuizCount] = useState(5);
  const [quizLoading, setQuizLoading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [currentAnswered, setCurrentAnswered] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load due cards
  const loadReviewCards = async () => {
    setCardLoading(true);
    try {
      const data = await api.getReviewCards(subjectId);
      setCards(data);
      setCardIdx(0);
      setPhase(data.length ? 'reviewing' : 'idle');
      setSessionXP(0);
    } catch {
      showToast('Failed to load review cards', 'error');
    } finally {
      setCardLoading(false);
    }
  };

  useEffect(() => { loadReviewCards(); }, [subjectId]);

  const handleRate = useCallback(async (rating: number) => {
    const card = cards[cardIdx];
    try {
      await api.rateFlashcard(card.id, rating);
      if (rating >= 3) setSessionXP(x => x + 3);
      if (cardIdx + 1 < cards.length) {
        setCardIdx(i => i + 1);
      } else {
        setPhase('done');
        showToast(`Session done! +${sessionXP + (rating >= 3 ? 3 : 0)} XP`, 'success');
      }
    } catch {
      showToast('Rating failed', 'error');
    }
  }, [cards, cardIdx, sessionXP]);

  // Quiz flow
  const startQuiz = async () => {
    if (!quizTopic.trim()) { showToast('Enter a topic', 'error'); return; }
    setQuizLoading(true);
    try {
      const data = await api.generateQuiz(quizTopic, subjectId, quizCount);
      setSessionId(data.session_id);
      setQuestions(data.questions);
      setQIdx(0);
      setAnswers(new Map());
      setCurrentAnswered(null);
      setQuizResult(null);
      setQuizPhase('active');
    } catch {
      showToast('Quiz generation failed — upload study materials first', 'error');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleQuizAnswer = (answer: string) => {
    setCurrentAnswered(answer);
    const q = questions[qIdx];
    setAnswers(prev => new Map(prev).set(q.id, answer));
  };

  const nextQuestion = () => {
    if (qIdx + 1 < questions.length) {
      setQIdx(i => i + 1);
      setCurrentAnswered(null);
    }
  };

  const submitQuiz = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const payload: QuizAnswer[] = questions.map(q => {
        const userAns = answers.get(q.id) ?? '';
        const correct = q.type === 'MCQ'
          ? userAns === q.correct_answer
          : userAns.toLowerCase().trim() === q.correct_answer.toLowerCase().trim();
        return { question_id: q.id, user_answer: userAns, is_correct: correct };
      });
      const result = await api.submitQuiz(sessionId, payload, false);
      setQuizResult(result);
      setQuizPhase('result');
    } catch {
      showToast('Submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const currentCard = cards[cardIdx];
  const currentQ = questions[qIdx];
  const allAnswered = questions.length > 0 && answers.size === questions.length;

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

      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate('/dashboard')} className="text-2xl font-black tracking-tighter text-white font-serif italic">
            Sarvagna
          </button>
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-2xl p-1">
            {(['flashcards', 'quiz'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all capitalize ${
                  tab === t ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'flashcards' ? <span className="flex items-center gap-2"><Brain className="w-3.5 h-3.5" />Cards</span>
                  : <span className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" />Quiz</span>}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 font-semibold hidden sm:block">{subjectName}</span>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-8 py-10">

        {/* ── FLASHCARD TAB ─────────────────────────────────── */}
        {tab === 'flashcards' && (
          <div className="flex flex-col items-center gap-8">
            <div className="w-full flex items-center justify-between">
              <h1 className="text-2xl font-black text-white">Spaced Review</h1>
              <div className="flex items-center gap-3">
                {sessionXP > 0 && (
                  <span className="flex items-center gap-1 text-indigo-400 font-black text-sm">
                    <Zap className="w-4 h-4" />+{sessionXP} XP
                  </span>
                )}
                <button onClick={loadReviewCards} className="p-2 rounded-xl bg-slate-800 border border-slate-700 hover:text-slate-200 text-slate-500 transition-all">
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {cardLoading ? (
              <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mt-20" />
            ) : phase === 'idle' ? (
              <div className="text-center space-y-4 mt-10">
                <BookOpen className="w-12 h-12 text-slate-700 mx-auto" />
                <p className="text-slate-400 font-semibold">No cards due for review today.</p>
                <p className="text-slate-600 text-sm">Create flashcards from topics in your roadmap or teaching sessions.</p>
              </div>
            ) : phase === 'done' ? (
              <div className="text-center space-y-5 mt-10">
                <div className="w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <p className="text-2xl font-black text-white">Session Complete!</p>
                <p className="text-slate-500">You reviewed {cards.length} card{cards.length !== 1 ? 's' : ''} and earned <span className="text-indigo-400 font-bold">+{sessionXP} XP</span>.</p>
                <button onClick={loadReviewCards} className="px-6 py-3 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl transition-all">
                  Check Again
                </button>
              </div>
            ) : currentCard ? (
              <FlipCard card={currentCard} onRate={handleRate} index={cardIdx} total={cards.length} />
            ) : null}
          </div>
        )}

        {/* ── QUIZ TAB ──────────────────────────────────────── */}
        {tab === 'quiz' && (
          <div className="flex flex-col items-center gap-8">
            <div className="w-full">
              <h1 className="text-2xl font-black text-white">Quiz</h1>
            </div>

            {quizPhase === 'setup' && (
              <div className="w-full max-w-md space-y-5">
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 block">Topic</label>
                  <input
                    value={quizTopic}
                    onChange={e => setQuizTopic(e.target.value)}
                    placeholder="e.g. Binary Trees, Fourier Transform…"
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 block">Questions: {quizCount}</label>
                  <input
                    type="range" min={3} max={15} value={quizCount}
                    onChange={e => setQuizCount(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                </div>
                <button
                  onClick={startQuiz}
                  disabled={quizLoading || !quizTopic.trim()}
                  className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all"
                >
                  {quizLoading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Sparkles className="w-5 h-5" />}
                  {quizLoading ? 'Generating…' : 'Generate Quiz'}
                </button>
              </div>
            )}

            {quizPhase === 'active' && currentQ && (
              <div className="w-full max-w-xl space-y-6">
                <QuizQuestionView
                  question={currentQ}
                  index={qIdx}
                  total={questions.length}
                  onAnswer={handleQuizAnswer}
                  answered={currentAnswered}
                />

                <div className="flex items-center justify-between">
                  {qIdx + 1 < questions.length ? (
                    <button
                      onClick={nextQuestion}
                      disabled={!currentAnswered}
                      className="flex items-center gap-2 px-5 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-bold rounded-xl transition-all text-sm"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={submitQuiz}
                      disabled={!allAnswered || submitting}
                      className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-bold rounded-xl transition-all text-sm"
                    >
                      {submitting ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Submit Quiz
                    </button>
                  )}
                  <span className="text-xs text-slate-500">{answers.size}/{questions.length} answered</span>
                </div>
              </div>
            )}

            {quizPhase === 'result' && quizResult && (
              <div className="w-full max-w-md space-y-6 text-center">
                <div className={`w-24 h-24 rounded-full mx-auto flex items-center justify-center border-4 ${
                  quizResult.percentage >= 80 ? 'border-emerald-500 bg-emerald-500/10' : quizResult.percentage >= 50 ? 'border-amber-500 bg-amber-500/10' : 'border-rose-500 bg-rose-500/10'
                }`}>
                  <span className={`text-2xl font-black ${quizResult.percentage >= 80 ? 'text-emerald-400' : quizResult.percentage >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                    {quizResult.percentage}%
                  </span>
                </div>

                <div>
                  <p className="text-2xl font-black text-white">{quizResult.score}/{quizResult.total} Correct</p>
                  <p className="text-slate-500 mt-1">+{quizResult.xp_awarded} XP earned</p>
                </div>

                {quizResult.new_badges.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center">
                    {quizResult.new_badges.map(b => (
                      <span key={b} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl font-bold text-sm">
                        <Award className="w-4 h-4" />
                        {b === 'perfect_quiz' ? 'Quiz Master' : b === 'high_yield_mastery' ? 'Exam Ready' : b}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => { setQuizPhase('setup'); setQuizResult(null); }}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all text-sm"
                  >
                    New Quiz
                  </button>
                  <button
                    onClick={() => navigate('/dashboard')}
                    className="px-5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold rounded-xl transition-all text-sm"
                  >
                    Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ReviewCenter;
