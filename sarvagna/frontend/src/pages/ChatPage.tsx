import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Bot, User, Trash2, Download, LayoutGrid } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { chatApi, subjectsApi, type ChatMessage } from "@/lib/api";
import MermaidDiagram from "@/components/MermaidDiagram";

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { module: 0, label: "Subject", short: "S" },
  { module: 1, label: "Module 1", short: "1" },
  { module: 2, label: "Module 2", short: "2" },
  { module: 3, label: "Module 3", short: "3" },
  { module: 4, label: "Module 4", short: "4" },
  { module: 5, label: "Module 5", short: "5" },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Set initial tab from URL param
  const initialModule = Number(moduleNumber ?? 0);
  const [activeModule, setActiveModule] = useState(initialModule);

  // topicTitle only applies to the tab we landed on
  const topicTitle = activeModule === initialModule ? searchParams.get("topicTitle") : null;

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => subjectsApi.list().then((r) => r.data),
    refetchInterval: (query) => {
      const subj = query.state.data?.find((s) => s.id === subjectId);
      return subj && subj.modules_scraped >= 5 ? false : 8000;
    },
  });
  const subject = subjects.find((s) => s.id === subjectId);
  const modulesScraped = subject?.modules_scraped ?? 0;

  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-zinc-100">
      {/* ── Header ── */}
      <div className="shrink-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/roadmap/${subjectId}`)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-bold truncate">{subject?.name ?? "Subject"}</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            AI Teaching Session
          </p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] text-zinc-400">Sarvagna AI</span>
        </div>
      </div>

      {/* ── Scrape banner ── */}
      {subject && modulesScraped < 5 && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-950/60 border-b border-amber-800/40 text-amber-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          Scraping content… {modulesScraped}/5 modules done
        </div>
      )}

      {/* ── Tab bar ── */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 bg-zinc-950 border-b border-zinc-800 overflow-x-auto scrollbar-none">
        <LayoutGrid size={14} className="text-zinc-600 shrink-0 mr-1" />
        {TABS.map((tab) => (
          <button
            key={tab.module}
            onClick={() => setActiveModule(tab.module)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
              activeModule === tab.module
                ? "bg-amber-500 text-black shadow-[0_0_10px_rgba(245,158,11,0.3)]"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Chat boards — only active one is visible ── */}
      {TABS.map((tab) => (
        <ChatBoard
          key={tab.module}
          subjectId={subjectId!}
          moduleNumber={tab.module}
          subjectName={subject?.name ?? ""}
          active={activeModule === tab.module}
          initialTopicTitle={tab.module === initialModule ? topicTitle : null}
        />
      ))}
    </div>
  );
}

// ─── Individual Chat Board ────────────────────────────────────────────────────

interface ChatBoardProps {
  subjectId: string;
  moduleNumber: number;
  subjectName: string;
  active: boolean;
  initialTopicTitle: string | null;
}

function ChatBoard({ subjectId, moduleNumber, subjectName, active, initialTopicTitle }: ChatBoardProps) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const autoSentRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history, isLoading } = useQuery({
    queryKey: ["chat", subjectId, moduleNumber],
    queryFn: () => chatApi.getHistory(subjectId, moduleNumber).then((r) => r.data),
    enabled: !!subjectId,
  });

  useEffect(() => {
    if (history?.messages) setLocalMessages(history.messages);
  }, [history]);

  // Auto-scroll only for active board
  useEffect(() => {
    if (active) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, active]);

  // Auto-send initial topic — only once per board mount
  const sendMutation = useMutation({
    mutationFn: (content: string) => chatApi.sendMessage(subjectId, moduleNumber, content),
    onMutate: (content) => {
      setLocalMessages((prev) => [
        ...prev,
        { id: `opt-${Date.now()}`, role: "user", content, created_at: new Date().toISOString() },
      ]);
    },
    onSuccess: (res) => {
      setLocalMessages((prev) => {
        const clean = prev.filter((m) => !m.id.startsWith("opt-"));
        return [...clean, res.data.user_message, res.data.ai_message];
      });
      queryClient.invalidateQueries({ queryKey: ["chat", subjectId, moduleNumber] });
    },
    onError: (err: any) => {
      setLocalMessages((prev) => prev.filter((m) => !m.id.startsWith("opt-")));
      toast.error(err.response?.data?.detail ?? "Failed to send message");
    },
  });

  useEffect(() => {
    if (
      initialTopicTitle &&
      !autoSentRef.current &&
      history !== undefined
    ) {
      autoSentRef.current = true;
      sendMutation.mutate(`Teach me this topic: ${initialTopicTitle}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTopicTitle, history]);

  const clearMutation = useMutation({
    mutationFn: () => chatApi.clearHistory(subjectId, moduleNumber),
    onSuccess: () => {
      setLocalMessages([]);
      queryClient.invalidateQueries({ queryKey: ["chat", subjectId, moduleNumber] });
      toast.success("Chat cleared");
    },
    onError: () => toast.error("Failed to clear chat"),
  });

  const handleExport = useCallback(() => {
    const tabLabel = moduleNumber === 0 ? "Subject Chat" : `Module ${moduleNumber}`;
    const lines = [
      `Sarvagna AI — ${subjectName} / ${tabLabel}`,
      `Exported: ${new Date().toLocaleString()}`,
      "─".repeat(60),
      "",
      ...localMessages.map((m) => {
        const role = m.role === "user" ? "You" : "Sarvagna AI";
        const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        // Strip image marker blocks from exported text
        const text = m.content.replace(/<!-- SARVAGNA_IMAGES -->[\s\S]*?<!-- \/SARVAGNA_IMAGES -->/g, "").trim();
        return `[${time}] ${role}:\n${text}\n`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sarvagna-${subjectName.replace(/\s+/g, "_")}-module${moduleNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [localMessages, subjectName, moduleNumber]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(text);
  };

  // Keep all boards mounted but hide inactive ones — preserves state
  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${active ? "" : "hidden"}`}
    >
      {/* Board toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 bg-zinc-950/50">
        <span className="text-[11px] text-zinc-500 font-semibold uppercase tracking-widest">
          {moduleNumber === 0 ? "Full Subject Chat" : `Module ${moduleNumber} — Isolated Session`}
        </span>
        <div className="flex items-center gap-1">
          {localMessages.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Export chat as .txt"
            >
              <Download size={13} />
              Export
            </button>
          )}
          {localMessages.length > 0 && (
            <button
              onClick={() => {
                if (confirm("Clear all messages in this chat?")) clearMutation.mutate();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Clear chat history"
            >
              <Trash2 size={13} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              <p className="text-zinc-600 text-xs">Loading history…</p>
            </div>
          </div>
        ) : localMessages.length === 0 ? (
          <EmptyState subjectName={subjectName} moduleNumber={moduleNumber} />
        ) : (
          <AnimatePresence initial={false}>
            {localMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>
        )}

        {sendMutation.isPending && <ThinkingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-zinc-800 bg-black/60 backdrop-blur-md px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder={
              moduleNumber === 0
                ? "Ask anything about this subject…"
                : `Ask about Module ${moduleNumber}…`
            }
            rows={1}
            disabled={sendMutation.isPending}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 resize-none outline-none focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.15)] transition-all max-h-32 overflow-y-auto"
            style={{ lineHeight: "1.5" }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center shrink-0 hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-center text-[10px] text-zinc-700 mt-1.5">
          <kbd className="bg-zinc-800 px-1 rounded text-zinc-500">Enter</kbd> send ·{" "}
          <kbd className="bg-zinc-800 px-1 rounded text-zinc-500">Shift+Enter</kbd> new line
        </p>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ subjectName, moduleNumber }: { subjectName: string; moduleNumber: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
        <Bot size={28} className="text-amber-500" />
      </div>
      <div>
        <p className="text-zinc-300 font-semibold mb-1 text-sm">Start learning</p>
        <p className="text-zinc-600 text-xs max-w-xs">
          {moduleNumber === 0
            ? `Ask anything about ${subjectName || "this subject"}.`
            : `This is your isolated session for Module ${moduleNumber}. Say "Let's start" to begin.`}
        </p>
      </div>
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
        <Bot size={14} className="text-amber-500" />
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3">
        <span className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  const renderAI = () => {
    const raw = message.content;
    const imgMatch = raw.match(/<!-- SARVAGNA_IMAGES -->\n([\s\S]*?)\n<!-- \/SARVAGNA_IMAGES -->/);
    const cleanText = imgMatch ? raw.replace(imgMatch[0], "").trim() : raw;
    const imgUrls = imgMatch ? imgMatch[1].split("\n").filter(Boolean) : [];

    return (
      <>
        <div className="prose prose-sm prose-invert max-w-none
          prose-p:my-1 prose-p:leading-relaxed
          prose-headings:text-zinc-100 prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1
          prose-strong:text-zinc-100 prose-strong:font-semibold
          prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
          prose-ol:my-1 prose-ol:pl-4
          prose-blockquote:border-amber-500 prose-blockquote:bg-amber-500/5 prose-blockquote:rounded prose-blockquote:not-italic
          prose-code:bg-zinc-800 prose-code:text-amber-400 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-zinc-800 prose-pre:rounded-xl prose-pre:p-4 prose-pre:my-2 prose-pre:overflow-x-auto prose-pre:border prose-pre:border-zinc-700
          prose-table:text-xs prose-th:bg-zinc-800 prose-th:px-2 prose-td:px-2">
          <ReactMarkdown
            components={{
              code({ className, children }) {
                const lang = (className ?? "").replace("language-", "");
                const code = String(children).trim();
                if (lang === "mermaid" || /^(graph|sequenceDiagram|classDiagram|flowchart|pie|gantt|erDiagram)\b/.test(code)) {
                  return <MermaidDiagram code={code} />;
                }
                return <code className={className}>{children}</code>;
              },
            }}
          >{cleanText}</ReactMarkdown>
        </div>
        {imgUrls.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {imgUrls.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                <img
                  src={src}
                  alt={`ref-${i + 1}`}
                  className="rounded-xl border border-zinc-700 w-full object-cover max-h-48 hover:opacity-90 transition-opacity"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </a>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <motion.div
      className={`flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isUser ? "bg-violet-500/20 border border-violet-500/30" : "bg-amber-500/20 border border-amber-500/30"
      }`}>
        {isUser
          ? <User size={13} className="text-violet-400" />
          : <Bot size={13} className="text-amber-400" />}
      </div>

      <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? "bg-violet-600/25 border border-violet-500/20 rounded-tr-sm text-zinc-100 whitespace-pre-wrap"
          : "bg-zinc-900 border border-zinc-800 rounded-tl-sm text-zinc-200"
      }`}>
        {isUser ? message.content : renderAI()}
        <p className={`text-[10px] mt-1.5 ${isUser ? "text-violet-400/50 text-right" : "text-zinc-700"}`}>
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </motion.div>
  );
}
