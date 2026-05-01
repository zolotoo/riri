import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Loader2, Link as LinkIcon, Type, Wand2, ChevronRight, Copy,
  Bookmark, Check, Send, RefreshCcw,
} from 'lucide-react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { useScriptDrafts } from '../hooks/useScriptDrafts';
import { getTokenCost } from '../constants/tokenCosts';
import { TokenBadge } from './ui/TokenBadge';
import { cn } from '../utils/cn';
import { iosSpringSoft } from '../utils/motionPresets';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Mode = 'hook' | 'link' | 'text';
type CtaIntent = 'soft_loop' | 'save_bait' | 'comment_bait' | 'profile_visit' | null;

type Step =
  | 'home'
  | 'mode-hook-input'
  | 'mode-hook-pick'
  | 'mode-link-input'
  | 'mode-text-input'
  | 'options'
  | 'generating'
  | 'results'
  | 'detail';

interface AiHook {
  original: string;
  adapted: string;
  explanation: string;
  views?: string;
  niche?: string;
  url?: string | null;
  owner_username?: string | null;
}

interface ShotListItem {
  section: string;
  speech: string;
  on_screen: string;
}

interface SourceReference {
  owner_username?: string | null;
  view_count?: number | null;
  url?: string | null;
}

interface OriginalScript {
  hook: string | null;
  body: string | null;
  ending: string | null;
}

interface Variant {
  skeleton_index: number;
  total_seconds: number;
  format_type: string;
  hook: string;
  body: string;
  ending: string;
  shot_list: ShotListItem[];
  source_reference: SourceReference;
  original?: OriginalScript | null;
}

type RichKind = 'hooks' | 'options' | 'results';

interface ChatMsg {
  id: string;
  role: 'riri' | 'user' | 'rich' | 'typing';
  text?: string;
  rich?: RichKind;
}

// ─── Loading lines (мемные, ротация) ─────────────────────────────────────────

const LOADING_LINES = [
  'Я как Шерлок Холмс — ищу самые залётные рилсы по теме...',
  'Перебираю тысячу сценариев со всего мира...',
  'Считаю какая структура сейчас работает в этой нише...',
  'Подбираю самые сочные хуки от топов...',
  'Сшиваю всё это в твой голос...',
  'Ещё пара секунд — почти готово',
];

// ─── Suggestion chips per step ───────────────────────────────────────────────

const HOOK_SUGGESTIONS = [
  'про продажи в b2b',
  'про утренние привычки',
  'про тренировки дома',
  'про переезд в Москву',
  'как я начал зарабатывать',
];
const TEXT_SUGGESTIONS = [
  'хочу рассказать как я перестал прокрастинировать',
  '3 факта про мой ремонт',
  'почему мой стартап не взлетел',
  'один вечер из жизни мамы троих',
];

// ─── Local UI helpers ────────────────────────────────────────────────────────

function RiriOrb({ size = 26, className, floating = false }: { size?: number; className?: string; floating?: boolean }) {
  const s = size;
  return (
    <div
      className={cn('rounded-full flex-shrink-0 select-none', floating && 'riri-orb-float', className)}
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

function RiriBubble({ text, children }: { text?: string; children?: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={iosSpringSoft}
      className="flex gap-2.5 items-start max-w-[88%]"
    >
      <RiriOrb size={26} className="mt-0.5" />
      <div
        className="px-3.5 py-2.5 rounded-[18px] rounded-tl-[6px]"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        {text && <p className="text-[15px] text-slate-900 leading-[1.55] whitespace-pre-wrap">{text}</p>}
        {children}
      </div>
    </motion.div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={iosSpringSoft}
      className="flex justify-end"
    >
      <div
        className="px-3.5 py-2.5 rounded-[18px] rounded-tr-[6px] max-w-[80%]"
        style={{
          background: '#e9eaf0',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <p className="text-[15px] text-slate-900 leading-[1.55] whitespace-pre-wrap">{text}</p>
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={iosSpringSoft}
      className="flex gap-2.5 items-start"
    >
      <RiriOrb size={26} />
      <div
        className="px-4 py-3 rounded-[18px] rounded-tl-[6px]"
        style={{
          background: '#ffffff',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}
      >
        <div className="flex gap-1">
          {[0, 0.22, 0.44].map((delay, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-slate-300"
              style={{
                animation: `typingDot 1.2s ease-in-out ${delay}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function GlassCard({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn('rounded-[16px]', onClick && 'cursor-pointer', className)}
      style={{
        background: '#ffffff',
        border: '1px solid rgba(0,0,0,0.07)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {children}
    </div>
  );
}

function PrimaryBtn({
  onClick, disabled, loading, cost, children, className,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  cost?: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-all',
        'bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed',
        'shadow-[0_2px_8px_rgba(15,23,42,0.18)]',
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
      {cost != null && cost > 0 && !loading && <TokenBadge tokens={cost} size="sm" />}
    </button>
  );
}

function Chip({ children, active, onClick, className }: { children: React.ReactNode; active?: boolean; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap',
        active ? 'bg-slate-900 text-white shadow-[0_2px_8px_rgba(15,23,42,0.15)]' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

function formatViews(n?: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1000) return `${Math.round(n / 1000)}К`;
  return String(n);
}

function extractShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const BG = '#f5f6f8';

// ─── Full-screen loader ──────────────────────────────────────────────────────

function FullScreenLoader() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % LOADING_LINES.length), 3200);
    return () => clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 flex flex-col items-center justify-center px-8"
      style={{ background: BG }}
    >
      <RiriOrb size={160} floating />
      <div className="mt-10 h-16 max-w-md w-full">
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-center text-[15px] leading-relaxed text-slate-700"
          >
            {LOADING_LINES[idx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ScriptStudio() {
  const { currentProject } = useProjectContext();
  const { canAfford, deduct } = useTokenBalance();
  const { createDraft } = useScriptDrafts();

  const [step, setStep] = useState<Step>('home');
  const [mode, setMode] = useState<Mode | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);

  // Inputs
  const [hookSeed, setHookSeed] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [textIdea, setTextIdea] = useState('');
  const [linkTranscript, setLinkTranscript] = useState<string | null>(null);
  const [linkTranscribing, setLinkTranscribing] = useState(false);

  // Hook selection
  const [hooksList, setHooksList] = useState<AiHook[]>([]);
  const [selectedHook, setSelectedHook] = useState<AiHook | null>(null);
  const [hooksLoading, setHooksLoading] = useState(false);

  // Options
  const [ctaIntent, setCtaIntent] = useState<CtaIntent>(null);

  // Generation
  const [variants, setVariants] = useState<Variant[]>([]);
  const [openVariantIdx, setOpenVariantIdx] = useState<number | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const toneProfile = useMemo(() => {
    const styles = currentProject?.projectStyles ?? [];
    return styles[0]?.prompt ?? null;
  }, [currentProject]);

  const isWelcome = step === 'home' && messages.length === 0;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const addMsg = useCallback((m: Omit<ChatMsg, 'id'>) => {
    setMessages((prev) => [...prev, { ...m, id: uid() }]);
  }, []);

  const replaceTyping = useCallback((m: Omit<ChatMsg, 'id'>) => {
    setMessages((prev) => {
      const idx = prev.findIndex((x) => x.role === 'typing');
      if (idx === -1) return [...prev, { ...m, id: uid() }];
      const copy = [...prev];
      copy[idx] = { ...m, id: copy[idx].id };
      return copy;
    });
  }, []);

  const removeTyping = useCallback(() => {
    setMessages((prev) => prev.filter((x) => x.role !== 'typing'));
  }, []);

  const goHome = useCallback(() => {
    setStep('home');
    setMode(null);
    setHookSeed('');
    setLinkUrl('');
    setLinkTranscript(null);
    setTextIdea('');
    setHooksList([]);
    setSelectedHook(null);
    setCtaIntent(null);
    setVariants([]);
    setOpenVariantIdx(null);
    setMessages([]);
  }, []);

  // ─── Mode selection ───────────────────────────────────────────────────────

  const pickMode = useCallback((m: Mode) => {
    setMode(m);
    if (m === 'hook') {
      addMsg({ role: 'user', text: 'Подбери мне хук' });
      addMsg({ role: 'riri', text: 'Окей. Расскажи про что хочешь снять — нишу или идею. Можно в свободной форме, я всё пойму.' });
      setStep('mode-hook-input');
    } else if (m === 'link') {
      addMsg({ role: 'user', text: 'Хочу по ссылке на чужой рилс' });
      addMsg({ role: 'riri', text: `Кинь ссылку на Instagram-рилс. Если он уже у нас в базе — бесплатно, иначе транскрибируем за ${getTokenCost('transcribe_video')} коина.` });
      setStep('mode-link-input');
    } else {
      addMsg({ role: 'user', text: 'У меня есть своя идея' });
      addMsg({ role: 'riri', text: 'Отлично. Опиши идею — нишу, тему, угол. Можно в свободной форме.' });
      setStep('mode-text-input');
    }
  }, [addMsg]);

  // ─── Mode: hook ───────────────────────────────────────────────────────────

  const fetchHooks = useCallback(async () => {
    const seed = hookSeed.trim();
    if (seed.length < 3) { toast.error('Опиши тему хотя бы парой слов'); return; }
    const cost = getTokenCost('ai_hook');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }
    addMsg({ role: 'user', text: seed });
    addMsg({ role: 'typing' });
    setHooksLoading(true);
    try {
      await deduct(cost, { action: 'ai_hook', section: 'script-studio', label: 'Подобрать хуки' });
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate-ai-hook', script: seed, min_views: 50000 }),
      });
      const raw = await res.text();
      let data: { success?: boolean; hooks?: AiHook[]; error?: string };
      try { data = JSON.parse(raw); }
      catch { removeTyping(); toast.error('RiRi не смог ответить. Попробуй ещё раз'); return; }
      if (!data.success) { removeTyping(); toast.error(data.error || 'Не удалось подобрать хуки'); return; }
      const hooks: AiHook[] = (data.hooks || []).slice(0, 5);
      if (!hooks.length) {
        replaceTyping({ role: 'riri', text: 'По этой теме хуков пока нет. Попробуй переформулировать или зайди через "По теме".' });
        return;
      }
      setHooksList(hooks);
      replaceTyping({ role: 'riri', text: 'Готово, вот 5 хуков из топа в твоей нише. Какой берём?' });
      addMsg({ role: 'rich', rich: 'hooks' });
      setStep('mode-hook-pick');
    } catch (e) {
      console.error(e);
      removeTyping();
      toast.error('Ошибка запроса');
    } finally {
      setHooksLoading(false);
    }
  }, [hookSeed, canAfford, deduct, addMsg, replaceTyping, removeTyping]);

  const pickHook = useCallback((h: AiHook) => {
    setSelectedHook(h);
    addMsg({ role: 'user', text: `Беру: «${h.adapted || h.original}»` });
    addMsg({ role: 'riri', text: 'Отличный выбор. Какая цель концовки? Можешь оставить на моё усмотрение.' });
    addMsg({ role: 'rich', rich: 'options' });
    setStep('options');
  }, [addMsg]);

  // ─── Mode: link ───────────────────────────────────────────────────────────

  const submitLink = useCallback(async () => {
    const url = linkUrl.trim();
    if (!url) { toast.error('Вставь ссылку на Instagram-рилс'); return; }
    const code = extractShortcode(url);
    if (!code) { toast.error('Не похоже на ссылку Instagram'); return; }

    addMsg({ role: 'user', text: url });
    addMsg({ role: 'typing' });
    setHooksLoading(true);
    try {
      const { supabase } = await import('../utils/supabase');
      const { data, error } = await supabase
        .from('videos')
        .select('transcript_text, translation_text, owner_username')
        .eq('shortcode', code)
        .maybeSingle();
      if (error) throw error;
      const cached = (data?.translation_text?.trim() || data?.transcript_text?.trim()) ?? '';
      if (cached) {
        setLinkTranscript(cached);
        replaceTyping({ role: 'riri', text: 'Этот рилс уже у нас — взял транскрипт бесплатно. Какая цель концовки?' });
        addMsg({ role: 'rich', rich: 'options' });
        setStep('options');
        return;
      }

      const cost = getTokenCost('transcribe_video');
      if (!canAfford(cost)) {
        removeTyping();
        toast.error(`Недостаточно коинов (нужно ${cost} на транскрибацию)`);
        return;
      }
      setHooksLoading(false);
      setLinkTranscribing(true);
      replaceTyping({ role: 'riri', text: 'Транскрибирую рилс... обычно 20-60 секунд.' });
      addMsg({ role: 'typing' });
      await deduct(cost, { action: 'transcribe_video', section: 'script-studio', label: 'Транскрибировать референс' });
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const td = await res.json();
      const transcript = (td.transcript || td.text || '').trim();
      if (!transcript) { removeTyping(); toast.error(td.error || 'Не удалось транскрибировать видео'); return; }
      setLinkTranscript(transcript);
      replaceTyping({ role: 'riri', text: 'Готово, разобрал. Какая цель концовки?' });
      addMsg({ role: 'rich', rich: 'options' });
      setStep('options');
    } catch (e) {
      console.error(e);
      removeTyping();
      toast.error('Не удалось загрузить ссылку');
    } finally {
      setHooksLoading(false);
      setLinkTranscribing(false);
    }
  }, [linkUrl, canAfford, deduct, addMsg, replaceTyping, removeTyping]);

  // ─── Mode: text ───────────────────────────────────────────────────────────

  const submitTextIdea = useCallback(() => {
    const idea = textIdea.trim();
    if (idea.length < 5) { toast.error('Опиши идею хоть немного подробнее'); return; }
    addMsg({ role: 'user', text: idea });
    addMsg({ role: 'riri', text: 'Принято. Какая цель концовки? Можешь оставить на моё усмотрение.' });
    addMsg({ role: 'rich', rich: 'options' });
    setStep('options');
  }, [textIdea, addMsg]);

  // Универсальный submit с любого шага — продолжение разговора как новая тема.
  // Сбрасывает старый mode-context и стартует свежий text-mode flow с этой темой.
  const submitFromAny = useCallback(() => {
    const idea = textIdea.trim();
    if (idea.length < 5) { toast.error('Опиши идею хоть немного подробнее'); return; }
    setMode('text');
    setSelectedHook(null);
    setLinkTranscript(null);
    setHooksList([]);
    setVariants([]);
    setOpenVariantIdx(null);
    setHookSeed('');
    setLinkUrl('');
    addMsg({ role: 'user', text: idea });
    addMsg({ role: 'riri', text: 'Принято — новая тема. Какая цель концовки?' });
    addMsg({ role: 'rich', rich: 'options' });
    setStep('options');
  }, [textIdea, addMsg]);

  // ─── Generate full script ─────────────────────────────────────────────────

  const generate = useCallback(async () => {
    const cost = getTokenCost('sw_full_script');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }

    setGenLoading(true);
    setStep('generating');
    try {
      await deduct(cost, { action: 'sw_full_script', section: 'script-studio', label: 'Полный сценарий' });
      const body: Record<string, unknown> = {
        action: 'generate-full-script',
        tone_profile: toneProfile,
        cta_intent: ctaIntent,
      };
      if (mode === 'hook' && selectedHook) {
        body.topic = hookSeed.trim() || selectedHook.original.slice(0, 100);
        body.hook_text = selectedHook.adapted || selectedHook.original;
      } else if (mode === 'link' && linkTranscript) {
        body.reference_transcript = linkTranscript;
      } else if (mode === 'text') {
        body.topic = textIdea.trim();
      }

      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let data: { success?: boolean; variants?: Variant[]; error?: string; message?: string };
      try { data = JSON.parse(raw); }
      catch {
        addMsg({ role: 'riri', text: res.status === 504
          ? 'Не успел уложиться за минуту. Попробуй ещё раз — обычно со второго раза получается.'
          : 'Что-то сломалось на сервере. Попробуй ещё раз.' });
        addMsg({ role: 'rich', rich: 'options' });
        setStep('options');
        return;
      }
      if (!data.success) {
        addMsg({ role: 'riri', text: data.message || data.error || 'Не получилось сгенерировать. Попробуй ещё раз.' });
        addMsg({ role: 'rich', rich: 'options' });
        setStep('options');
        return;
      }
      const vs: Variant[] = Array.isArray(data.variants) ? data.variants : [];
      if (!vs.length) {
        addMsg({ role: 'riri', text: data.message || 'По этой теме пока нет похожих структур в базе. Попробуй другую формулировку.' });
        addMsg({ role: 'rich', rich: 'options' });
        setStep('options');
        return;
      }
      setVariants(vs);
      addMsg({ role: 'riri', text: `Готово, вот ${vs.length} ${vs.length === 1 ? 'вариант' : vs.length < 5 ? 'варианта' : 'вариантов'} на разных структурах. Тапни любой — увидишь полный сценарий и шот-лист.` });
      addMsg({ role: 'rich', rich: 'results' });
      setStep('results');
    } catch (e) {
      console.error(e);
      addMsg({ role: 'riri', text: 'Ошибка сети. Попробуй ещё раз.' });
      addMsg({ role: 'rich', rich: 'options' });
      setStep('options');
    } finally {
      setGenLoading(false);
    }
  }, [mode, selectedHook, hookSeed, linkTranscript, textIdea, toneProfile, ctaIntent, canAfford, deduct, addMsg]);

  const regenerate = useCallback(() => {
    addMsg({ role: 'user', text: 'Дай ещё варианты' });
    generate();
  }, [generate, addMsg]);

  // ─── Save to drafts ───────────────────────────────────────────────────────

  const saveVariant = useCallback(async (v: Variant): Promise<boolean> => {
    const fullText = `${v.hook}\n\n${v.body}\n\n${v.ending}`;
    const titleSeed = (v.hook || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'ИИ-сценарий';
    const sourceType: 'topic' | 'reference' = mode === 'link' ? 'reference' : 'topic';
    const draft = await createDraft({
      title: titleSeed,
      script_text: fullText,
      source_type: sourceType,
      source_data: {
        mode,
        hookSeed: mode === 'hook' ? hookSeed : undefined,
        selectedHook: mode === 'hook' ? selectedHook : undefined,
        linkUrl: mode === 'link' ? linkUrl : undefined,
        textIdea: mode === 'text' ? textIdea : undefined,
        ctaIntent,
        variant: v,
      },
    });
    if (draft) toast.success('Сохранено в черновики');
    else toast.error('Не получилось сохранить');
    return Boolean(draft);
  }, [mode, hookSeed, selectedHook, linkUrl, textIdea, ctaIntent, createDraft]);

  // ─── Suggestion chips ─────────────────────────────────────────────────────

  const suggestions = step === 'mode-hook-input' ? HOOK_SUGGESTIONS
    : step === 'mode-text-input' ? TEXT_SUGGESTIONS
    : null;
  const onSuggest = (s: string) => {
    if (step === 'mode-hook-input') setHookSeed(s);
    else if (step === 'mode-text-input') setTextIdea(s);
  };

  // ─── Render rich blocks ───────────────────────────────────────────────────

  const renderRich = useCallback((kind: RichKind) => {
    if (kind === 'hooks') {
      return (
        <div className="mt-2 space-y-2 max-w-[88%] pl-9">
          {hooksList.map((h, i) => (
            <GlassCard key={i} className="p-3 hover:shadow-md transition-shadow" onClick={() => pickHook(h)}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-[14px] font-medium leading-snug text-slate-900">{h.adapted || h.original}</p>
                  {h.explanation && (
                    <p className="mt-1.5 text-[12px] text-slate-500 leading-relaxed">{h.explanation}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                    {h.views && <span>{h.views} views</span>}
                    {h.owner_username && <span>· @{h.owner_username}</span>}
                  </div>
                </div>
                <ChevronRight size={16} className="mt-1 text-slate-300" />
              </div>
            </GlassCard>
          ))}
        </div>
      );
    }
    if (kind === 'options') {
      return (
        <div className="mt-2 space-y-3 max-w-[88%] pl-9">
          <div className="flex flex-wrap gap-2">
            <Chip active={ctaIntent === null} onClick={() => setCtaIntent(null)}>Авто</Chip>
            <Chip active={ctaIntent === 'save_bait'} onClick={() => setCtaIntent('save_bait')}>На сохранение</Chip>
            <Chip active={ctaIntent === 'comment_bait'} onClick={() => setCtaIntent('comment_bait')}>На комментарий</Chip>
            <Chip active={ctaIntent === 'profile_visit'} onClick={() => setCtaIntent('profile_visit')}>На подписку</Chip>
          </div>
          <PrimaryBtn onClick={generate} cost={getTokenCost('sw_full_script')} loading={genLoading}>
            Сгенерировать варианты
          </PrimaryBtn>
        </div>
      );
    }
    if (kind === 'results') {
      return (
        <div className="mt-2 space-y-2 max-w-[88%] pl-9">
          {variants.map((v, i) => (
            <GlassCard
              key={i}
              className="p-3 hover:shadow-md transition-shadow"
              onClick={() => { setOpenVariantIdx(i); setStep('detail'); }}
            >
              {/* Source-бейдж сверху — сразу понятно на каком виральном видео основано */}
              {v.source_reference?.owner_username && (
                <div className="mb-2 flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-1 w-fit">
                  <span className="text-[11px] font-medium text-emerald-700">
                    Адаптировано из @{v.source_reference.owner_username}
                  </span>
                  <span className="text-[10px] text-emerald-600">
                    · {formatViews(v.source_reference.view_count)} views
                  </span>
                </div>
              )}
              <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">~{v.total_seconds}с</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5">{v.format_type}</span>
              </div>
              <p className="text-[14px] font-medium leading-snug line-clamp-2 text-slate-900">{v.hook}</p>
              <p className="mt-1 text-[12px] text-slate-500 line-clamp-2">{v.body.slice(0, 110)}...</p>
            </GlassCard>
          ))}
          <button
            onClick={regenerate}
            disabled={genLoading}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={12} /> Дай ещё варианты
          </button>
        </div>
      );
    }
    return null;
  }, [hooksList, variants, ctaIntent, genLoading, pickHook, generate, regenerate]);

  // ─── Detail screen (full takeover) ────────────────────────────────────────

  if (step === 'detail' && openVariantIdx !== null && variants[openVariantIdx]) {
    return (
      <VariantDetail
        v={variants[openVariantIdx]}
        onBack={() => setStep('results')}
        onSave={() => saveVariant(variants[openVariantIdx])}
      />
    );
  }

  // ─── Bottom input bar — виден всегда в chat-state (не welcome, не detail) ─

  const showInput = !isWelcome && step !== 'detail' && step !== 'generating';
  const isFreeFormStep = step === 'mode-hook-pick' || step === 'options' || step === 'results';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative flex flex-col h-screen" style={{ background: BG }}>
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes ririOrbFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .riri-orb-float {
          animation: ririOrbFloat 3.5s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200/60 bg-white/70 backdrop-blur-sm">
        {!isWelcome && (
          <button
            onClick={goHome}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
            aria-label="В начало"
          >
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold leading-tight text-slate-900">ИИ-сценарист</h1>
          <p className="text-[11px] text-slate-500">RiRi · отвечает обычно меньше минуты</p>
        </div>
      </div>

      {/* Welcome state — большой орб + 3 mode cards по центру */}
      {isWelcome && (
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-md flex flex-col items-center text-center">
            <RiriOrb size={140} floating />
            <h2 className="mt-8 text-[22px] font-semibold text-slate-900 leading-tight">
              Привет! Я RiRi
            </h2>
            <p className="mt-2 text-[15px] text-slate-600 leading-relaxed max-w-sm">
              Помогу собрать вирусный сценарий за минуту. С чего начнём?
            </p>

            <div className="mt-8 w-full space-y-2.5">
              <ModeCard
                icon={<Wand2 size={18} />}
                title="Подобрать хук"
                desc="Не знаю про что снимать — покажи топ хуки из моей ниши"
                onClick={() => pickMode('hook')}
              />
              <ModeCard
                icon={<LinkIcon size={18} />}
                title="По ссылке"
                desc="Возьми чужой залётный рилс и перепиши под мою тему"
                onClick={() => pickMode('link')}
              />
              <ModeCard
                icon={<Type size={18} />}
                title="По теме"
                desc="У меня уже есть идея, опишу текстом"
                onClick={() => pickMode('text')}
              />
            </div>
          </div>
        </div>
      )}

      {/* Chat state — лента сообщений */}
      {!isWelcome && (
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <AnimatePresence initial={false}>
            {messages.map((m) => {
              if (m.role === 'riri') return <RiriBubble key={m.id} text={m.text || ''} />;
              if (m.role === 'user') return <UserBubble key={m.id} text={m.text || ''} />;
              if (m.role === 'typing') return <TypingIndicator key={m.id} />;
              if (m.role === 'rich' && m.rich) {
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={iosSpringSoft}
                  >
                    {renderRich(m.rich)}
                  </motion.div>
                );
              }
              return null;
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Bottom input — chips + textarea */}
      {showInput && (
        <div className="flex-shrink-0 border-t border-slate-200/60 bg-white/80 backdrop-blur-sm">
          {/* Suggestion chips НАД полем ввода */}
          {suggestions && suggestions.length > 0 && (
            <div className="px-3 pt-3 flex gap-2 overflow-x-auto no-scrollbar">
              {suggestions.map((s) => (
                <Chip key={s} onClick={() => onSuggest(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          )}

          <div className="px-3 py-3">
            {step === 'mode-hook-input' && (
              <div className="flex items-end gap-2">
                <textarea
                  value={hookSeed}
                  onChange={(e) => setHookSeed(e.target.value)}
                  placeholder="например: про продажи в b2b..."
                  rows={2}
                  className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[14px] focus:border-slate-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !hooksLoading) {
                      e.preventDefault();
                      fetchHooks();
                    }
                  }}
                />
                <PrimaryBtn
                  onClick={fetchHooks}
                  cost={getTokenCost('ai_hook')}
                  loading={hooksLoading}
                  disabled={hookSeed.trim().length < 3}
                >
                  <Send size={14} />
                </PrimaryBtn>
              </div>
            )}

            {step === 'mode-link-input' && (
              <div className="flex items-end gap-2">
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  className="flex-1 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] focus:border-slate-400 focus:outline-none"
                  disabled={linkTranscribing}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !hooksLoading && !linkTranscribing) {
                      e.preventDefault();
                      submitLink();
                    }
                  }}
                />
                <PrimaryBtn
                  onClick={submitLink}
                  loading={hooksLoading || linkTranscribing}
                  disabled={!linkUrl.trim()}
                >
                  <Send size={14} />
                </PrimaryBtn>
              </div>
            )}

            {step === 'mode-text-input' && (
              <div className="flex items-end gap-2">
                <textarea
                  value={textIdea}
                  onChange={(e) => setTextIdea(e.target.value)}
                  placeholder="например: хочу рассказать как я перестал прокрастинировать..."
                  rows={3}
                  className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[14px] focus:border-slate-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitTextIdea();
                    }
                  }}
                />
                <PrimaryBtn onClick={submitTextIdea} disabled={textIdea.trim().length < 5}>
                  <Send size={14} />
                </PrimaryBtn>
              </div>
            )}

            {/* На "не-input" шагах (выбор хука / опции / результаты) показываем
                то же поле ввода — submit запускает новый text-mode flow */}
            {isFreeFormStep && (
              <div className="flex items-end gap-2">
                <textarea
                  value={textIdea}
                  onChange={(e) => setTextIdea(e.target.value)}
                  placeholder="напиши новую тему — начнём заново..."
                  rows={2}
                  className="flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[14px] focus:border-slate-400 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submitFromAny();
                    }
                  }}
                />
                <PrimaryBtn onClick={submitFromAny} disabled={textIdea.trim().length < 5}>
                  <Send size={14} />
                </PrimaryBtn>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full-screen лоадер поверх всего */}
      <AnimatePresence>
        {step === 'generating' && <FullScreenLoader />}
      </AnimatePresence>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function ModeCard({
  icon, title, desc, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <GlassCard className="p-3 hover:shadow-md transition-shadow text-left" onClick={onClick}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold leading-tight text-slate-900">{title}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{desc}</p>
        </div>
        <ChevronRight size={16} className="mt-2 text-slate-300 flex-shrink-0" />
      </div>
    </GlassCard>
  );
}

function VariantDetail({ v, onBack, onSave }: { v: Variant; onBack: () => void; onSave: () => Promise<boolean> }) {
  const fullText = `${v.hook}\n\n${v.body}\n\n${v.ending}`;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(fullText).then(
      () => toast.success('Сценарий скопирован'),
      () => toast.error('Не получилось скопировать'),
    );
  }, [fullText]);

  const save = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      const ok = await onSave();
      if (ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }, [saving, saved, onSave]);

  return (
    <div className="h-screen overflow-y-auto pb-24" style={{ background: BG }}>
      <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/85 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
            aria-label="К списку"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-[12px]">~{v.total_seconds}с</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{v.format_type}</span>
            {v.source_reference?.owner_username && (
              <a
                href={v.source_reference.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => { if (!v.source_reference.url) e.preventDefault(); }}
                className="rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-emerald-700 hover:bg-emerald-100 font-medium"
              >
                @{v.source_reference.owner_username} · {formatViews(v.source_reference.view_count)}
              </a>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving || saved}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              saved ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700',
            )}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Bookmark size={12} />}
            {saved ? 'В черновиках' : saving ? '...' : 'Сохранить'}
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 text-xs font-medium"
          >
            <Copy size={12} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-3">
        <GlassCard className="p-4">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Хук</div>
          <p className="text-[15px] font-medium leading-snug text-slate-900">{v.hook}</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Тело</div>
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-800">{v.body}</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">Концовка</div>
          <p className="text-[14px] leading-relaxed text-slate-800">{v.ending}</p>
        </GlassCard>

        {v.shot_list?.length > 0 && (
          <GlassCard className="p-4">
            <div className="mb-3 text-[11px] uppercase tracking-wide text-slate-400">Шот-лист</div>
            <div className="space-y-3">
              {v.shot_list.map((s, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">{s.section} · речь</div>
                    <p className="text-[13px] leading-snug text-slate-900">{s.speech}</p>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">в кадре</div>
                    <p className="text-[13px] leading-snug text-slate-600">{s.on_screen}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Что было в оригинале — для сравнения */}
        {v.original && (v.original.hook || v.original.body || v.original.ending) && (
          <OriginalCard original={v.original} src={v.source_reference} />
        )}
      </div>
    </div>
  );
}

function OriginalCard({ original, src }: { original: OriginalScript; src: SourceReference }) {
  const [open, setOpen] = useState(false);
  return (
    <GlassCard className="p-4 border-emerald-100" onClick={() => setOpen((o) => !o)}>
      <div className="flex items-center justify-between cursor-pointer">
        <div>
          <div className="mb-0.5 text-[11px] uppercase tracking-wide text-emerald-600">
            Оригинал из вирала
          </div>
          <div className="text-[13px] text-slate-700">
            @{src.owner_username || '?'} · {src.view_count != null ? formatViews(src.view_count) : ''} views
            <span className="text-slate-400 ml-2">{open ? 'скрыть' : 'показать транскрипт'}</span>
          </div>
        </div>
        <ChevronRight
          size={18}
          className={cn('text-slate-400 transition-transform', open && 'rotate-90')}
        />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              {original.hook && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">оригинальный хук</div>
                  <p className="text-[13px] leading-snug text-slate-700 whitespace-pre-line">{original.hook}</p>
                </div>
              )}
              {original.body && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">оригинальное тело</div>
                  <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">{original.body}</p>
                </div>
              )}
              {original.ending && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">оригинальная концовка</div>
                  <p className="text-[13px] leading-snug text-slate-700 whitespace-pre-line">{original.ending}</p>
                </div>
              )}
              {src.url && (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[12px] text-emerald-700 hover:text-emerald-900"
                >
                  <LinkIcon size={12} /> Открыть оригинал в Instagram
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
