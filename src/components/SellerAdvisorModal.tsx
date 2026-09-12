import React, { useState, useRef, useEffect } from "react";
import { X, Send, Sparkles, MessageSquare, Bot, User } from "lucide-react";

interface SellerAdvisorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  "How do I prevent eBay Vero IP strikes when sourcing?",
  "What is the best way to handle a buyer return claim?",
  "How does Cassini rank 80-character titles in 2026?",
  "Explain USPS Cubic rate savings vs standard rates.",
];

export const SellerAdvisorModal: React.FC<SellerAdvisorModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your eBay Reselling & Arbitrage AI Strategist. Ask me anything about eBay Cassini search rankings, fee optimization, safe dropshipping compliance, or buyer negotiation tactics.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSendMessage = async (textToSend?: string) => {
    const messageText = textToSend || input;
    if (!messageText.trim() || loading) return;

    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: messageText },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/gemini/chat-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          history: messages.slice(1),
        }),
      });
      const data = await res.json();
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            data.reply ||
            "I'm here to help optimize your resale operations and protect your account status.",
        },
      ]);
    } catch (err) {
      console.error("Chat error:", err);
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content:
            "Connection interrupted. Please verify your internet and API settings.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl h-[600px] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                Listofa AI Seller Advisor
              </h3>
              <p className="text-[11px] text-slate-400">
                Powered by Gemini 3.8 Flash & Resale Rules
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Prompts Bar */}
        <div className="px-5 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
          <span className="text-slate-400 text-[11px] whitespace-nowrap">Suggested:</span>
          {QUICK_PROMPTS.map((prompt, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(prompt)}
              className="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 whitespace-nowrap transition text-[11px]"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex gap-3 text-xs sm:text-sm ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`p-3 rounded-2xl max-w-[80%] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-amber-500 text-slate-950 font-medium rounded-tr-none"
                    : "bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-none"
                }`}
              >
                {msg.content}
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-3 text-xs text-slate-400 items-center">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <span className="animate-pulse">Advisor is formulating recommendation...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about eBay fees, Vero policy, or sourcing strategy..."
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
