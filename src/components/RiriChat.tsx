import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Riri Orb (3D CSS sphere — как в AIScriptwriter) ────────────────────────

function RiriOrb({ size = 48, floating = false, className }: { size?: number; floating?: boolean; className?: string }) {
  const s = size;
  return (
    <div
      className={`rounded-full flex-shrink-0 select-none ${floating ? 'riri-orb-float' : ''} ${className || ''}`}
      style={{
        width: s,
        height: s,
        background: `radial-gradient(circle at 36% 28%, #ffffff 0%, #eceef4 20%, #d0d4e2 44%, #a8aec0 68%, #787e92 88%, #5a6070 100%)`,
        boxShadow: `
          inset ${-s * 0.07}px ${-s * 0.07}px ${s * 0.18}px rgba(40,44,60,0.28),
          inset ${s * 0.07}px ${s * 0.055}px ${s * 0.16}px rgba(255,255,255,0.72),
          0 ${s * 0.1}px ${s * 0.42}px rgba(80,88,120,0.16),
          0 ${s * 0.04}px ${s * 0.1}px rgba(60,68,90,0.1)
        `,
      }}
    />
  );
}

// ─── Chat Bubbles (как в AIScriptwriter) ─────────────────────────────────────

function RiriBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2.5 items-start max-w-[85%] fade-in-up">
      <RiriOrb size={26} className="mt-0.5" />
      <div
        className="px-3.5 py-2.5 rounded-[18px] rounded-tl-[6px]"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <p className="text-[14px] text-[#1a1a18] leading-[1.55] whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end fade-in-up">
      <div
        className="px-3.5 py-2.5 rounded-[18px] rounded-tr-[6px] max-w-[80%]"
        style={{
          background: '#1a1a18',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <p className="text-[14px] text-white/90 leading-[1.55] whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-2.5 items-start fade-in-up">
      <RiriOrb size={26} className="mt-0.5" />
      <div
        className="px-4 py-3 rounded-[18px] rounded-tl-[6px]"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex gap-1.5">
          {[0, 0.22, 0.44].map((delay, i) => (
            <span
              key={i}
              className="w-[5px] h-[5px] bg-slate-300 rounded-full typing-dot"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RiriChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useAuth();

  // Автоскролл при новых сообщениях
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Фокус на инпут при открытии
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !user?.id) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/riri-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          message: text,
          history: messages.slice(-10),
        }),
      });
      const data = await res.json();
      if (data.text) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Ой, не получилось ответить. Попробуй ещё раз!' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Что-то пошло не так со связью. Попробуй ещё раз!' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, user?.id, messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestions = ['Как создать проект?', 'Где аналитика?', 'Как добавить видео?'];

  return (
    <>
      {/* ─── Кнопка — 3D шарик ─── */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onClick={() => setIsOpen(true)}
            className="fixed right-4 bottom-20 md:bottom-6 z-50 active:scale-90 transition-transform"
          >
            <RiriOrb size={52} floating />
            {/* Зелёный онлайн-индикатор */}
            <span
              className="absolute bottom-0 right-0 w-3 h-3 rounded-full"
              style={{
                background: '#4ade80',
                boxShadow: '0 0 6px rgba(74,222,128,0.5)',
                border: '2px solid #f0f1f5',
              }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Окно чата ─── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed right-3 bottom-3 md:right-5 md:bottom-5 z-50 w-[calc(100vw-24px)] max-w-[380px] h-[min(540px,calc(100vh-100px))] flex flex-col overflow-hidden rounded-[28px]"
            style={{
              background: '#f5f6f8',
              boxShadow: '0 12px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{
                background: '#ffffff',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
              }}
            >
              <div className="relative">
                <RiriOrb size={34} />
                <span
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                  style={{
                    background: '#4ade80',
                    border: '2px solid #ffffff',
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#1a1a18]">RiRi</p>
                <p className="text-[11px] text-[#1a1a18]/40">твоя подруга-ассистент</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: 'rgba(0,0,0,0.05)' }}
              >
                <X className="w-4 h-4 text-[#1a1a18]/40" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar-light">
              {messages.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center h-full text-center px-2 gap-4">
                  <RiriOrb size={80} floating />
                  <div>
                    <p className="text-[15px] font-medium text-[#1a1a18]">Привет! Я RiRi</p>
                    <p className="text-[13px] text-[#1a1a18]/40 mt-1 leading-relaxed">
                      Спроси меня что угодно о приложении —<br />подскажу куда нажать и как сделать!
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center mt-1">
                    {suggestions.map(q => (
                      <button
                        key={q}
                        onClick={() => { setInput(q); inputRef.current?.focus(); }}
                        className="text-[12px] px-3 py-2 rounded-2xl font-medium text-[#1a1a18] transition-all touch-manipulation active:scale-95"
                        style={{
                          background: '#ffffff',
                          border: '1px solid rgba(0,0,0,0.07)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) =>
                msg.role === 'user'
                  ? <UserBubble key={i} text={msg.content} />
                  : <RiriBubble key={i} text={msg.content} />
              )}

              {loading && <TypingIndicator />}
            </div>

            {/* Input — как в AIScriptwriter */}
            <div className="px-3 pb-3 pt-2 safe-bottom">
              <div
                className="rounded-3xl transition-all"
                style={{
                  background: '#ffffff',
                  border: '1px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.07), 0 1px 4px rgba(0,0,0,0.04)',
                }}
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Спроси что-нибудь..."
                  rows={1}
                  className="w-full resize-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] text-[#1a1a18] placeholder:text-[#1a1a18]/35 focus:outline-none min-h-[44px] max-h-24 leading-relaxed"
                  disabled={loading}
                />
                <div className="flex items-center px-3 pb-2.5 pt-0.5">
                  <span className="text-[11px] text-[#1a1a18]/30">Gemini Flash</span>
                  <div className="ml-auto">
                    <button
                      onClick={sendMessage}
                      disabled={!input.trim() || loading}
                      className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                      style={{
                        background: input.trim() && !loading
                          ? 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)'
                          : 'rgba(15,23,42,0.12)',
                        boxShadow: input.trim() && !loading
                          ? '0 4px 12px rgba(15,23,42,0.25), inset 0 1px 0 rgba(255,255,255,0.1)'
                          : 'none',
                      }}
                    >
                      {loading
                        ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                        : <Send className="w-4 h-4 text-white" strokeWidth={2} />
                      }
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
