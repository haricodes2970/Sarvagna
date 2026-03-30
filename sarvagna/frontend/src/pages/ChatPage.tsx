import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Bot, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import toast from "react-hot-toast";
import { chatApi, subjectsApi, type ChatMessage } from "@/lib/api";

export default function ChatPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const [searchParams] = useSearchParams();
  const topicTitle = searchParams.get("topicTitle"); // e.g. "K-nearest neighbors algorithm"
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const modNum = Number(moduleNumber);

  const [input, setInput] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const autoSentRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch subject (poll while scraping incomplete)
  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects"],
    queryFn: () => subjectsApi.list().then((r) => r.data),
    refetchInterval: (query) => {
      const subj = query.state.data?.find((s) => s.id === subjectId);
      // Stop polling once all 5 modules are scraped
      return subj && subj.modules_scraped >= 5 ? false : 8000;
    },
  });
  const subject = subjects.find((s) => s.id === subjectId);
  const modulesScraped = subject?.modules_scraped ?? 0;
  const moduleReady = modNum === 0 ? modulesScraped > 0 : modulesScraped >= modNum;

  // Load chat history
  const { data: history, isLoading } = useQuery({
    queryKey: ["chat", subjectId, modNum],
    queryFn: () => chatApi.getHistory(subjectId!, modNum).then((r) => r.data),
    enabled: !!subjectId,
  });

  // Sync server history into localMessages on first load
  useEffect(() => {
    if (history?.messages) {
      setLocalMessages(history.messages);
    }
  }, [history]);

  // Auto-send opening message when arriving from map/important-questions with a topicTitle param
  useEffect(() => {
    if (
      topicTitle &&
      !autoSentRef.current &&
      history !== undefined   // history loaded (send regardless of existing messages)
    ) {
      autoSentRef.current = true;
      sendMutation.mutate(`Teach me this topic: ${topicTitle}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicTitle, history]);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      chatApi.sendMessage(subjectId!, modNum, content),
    onMutate: (content) => {
      // Optimistic user bubble
      const optimistic: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      setLocalMessages((prev) => [...prev, optimistic]);
    },
    onSuccess: (res) => {
      // Replace optimistic bubble + add AI response
      setLocalMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => !m.id.startsWith("optimistic-"));
        return [...withoutOptimistic, res.data.user_message, res.data.ai_message];
      });
      queryClient.invalidateQueries({ queryKey: ["chat", subjectId, modNum] });
    },
    onError: (err: any) => {
      setLocalMessages((prev) => prev.filter((m) => !m.id.startsWith("optimistic-")));
      toast.error(err.response?.data?.detail ?? "Failed to send message");
    },
  });

  const handleSend = () => {
    const text = input.trim();
    if (!text || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-zinc-100">

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(`/roadmap/${subjectId}`)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold truncate">
            {subject?.name ?? "Subject"} — Module {modNum}
          </h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
            AI Teaching Session
          </p>
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-zinc-400">Sarvagna AI</span>
        </div>
      </div>

      {/* ── Scrape status banner ── */}
      {subject && (
        moduleReady ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-950/60 border-b border-emerald-800/40 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            Textbook content ready — {modulesScraped}/5 modules scraped
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-950/60 border-b border-amber-800/40 text-amber-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
            Scraping content… {modulesScraped}/5 modules done — AI will teach from general knowledge until ready
          </div>
        )
      )}

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-600 text-sm">Loading chat history…</p>
          </div>
        ) : localMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
              <Bot size={32} className="text-amber-500" />
            </div>
            <div>
              <p className="text-zinc-300 font-semibold mb-1">Start your learning session</p>
              <p className="text-zinc-600 text-sm">
                Say <span className="text-amber-500 font-medium">"Let's start"</span> or ask anything about{" "}
                <span className="text-white font-medium">{subject?.name ?? "this subject"}</span> Module {modNum}.
              </p>
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {localMessages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </AnimatePresence>
        )}

        {/* Thinking indicator */}
        {sendMutation.isPending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Bot size={16} className="text-amber-500" />
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="border-t border-zinc-800 bg-black/60 backdrop-blur-md px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or say 'Let's start'…"
            rows={1}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 resize-none outline-none focus:border-amber-500 focus:shadow-[0_0_0_2px_rgba(245,158,11,0.15)] transition-all max-h-32 overflow-y-auto"
            style={{ lineHeight: "1.5" }}
            disabled={sendMutation.isPending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center shrink-0 hover:bg-amber-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-[10px] text-zinc-700 mt-2">
          Press <kbd className="bg-zinc-800 px-1 rounded text-zinc-500">Enter</kbd> to send · <kbd className="bg-zinc-800 px-1 rounded text-zinc-500">Shift+Enter</kbd> for new line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <motion.div
      className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}
      initial={{ opacity: 0, x: isUser ? 20 : -20, y: 4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        isUser
          ? "bg-violet-500/20 border border-violet-500/30"
          : "bg-amber-500/20 border border-amber-500/30"
      }`}>
        {isUser
          ? <User size={15} className="text-violet-400" />
          : <Bot size={15} className="text-amber-400" />
        }
      </div>

      {/* Bubble */}
      <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? "bg-violet-600/30 border border-violet-500/20 rounded-tr-sm text-zinc-100 whitespace-pre-wrap"
          : "bg-zinc-900 border border-zinc-800 rounded-tl-sm text-zinc-200"
      }`}>
        {isUser ? (
          message.content
        ) : (
          <div className="prose prose-sm prose-invert max-w-none
            prose-p:my-1 prose-p:leading-relaxed
            prose-headings:text-zinc-100 prose-headings:font-bold prose-headings:mt-2 prose-headings:mb-1
            prose-strong:text-zinc-100 prose-strong:font-semibold
            prose-ul:my-1 prose-ul:pl-4 prose-li:my-0.5
            prose-ol:my-1 prose-ol:pl-4
            prose-code:bg-zinc-800 prose-code:text-amber-400 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:before:content-none prose-code:after:content-none
            prose-pre:bg-zinc-800 prose-pre:rounded-lg prose-pre:p-3 prose-pre:my-2 prose-pre:overflow-x-auto">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        <p className={`text-[10px] mt-1.5 ${isUser ? "text-violet-400/60 text-right" : "text-zinc-600"}`}>
          {new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>
    </motion.div>
  );
}
