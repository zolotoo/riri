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

interface Variant {
  skeleton_index: number;
  total_seconds: number;
  format_type: string;
  hook: string;
  body: string;
  ending: string;
  shot_list: ShotListItem[];
  source_reference: SourceReference;
}

type RichKind = 'modes' | 'hooks' | 'options' | 'results';

interface ChatMsg {
  id: string;
  role: 'riri' | 'user' | 'rich' | 'typing';
  text?: string;
  rich?: RichKind;
}

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
        {text && <p className="text-[15px] text-[#1a1a18] leading-[1.55] whitespace-pre-wrap">{text}</p>}
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
          background: '#1a1a18',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}
      >
        <p className="text-[15px] text-white/90 leading-[1.55] whitespace-pre-wrap">{text}</p>
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

function CostBtn({
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
        'flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-[#1a1a18] text-white hover:bg-[#1a1a18]/85',
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
      {cost != null && cost > 0 && !loading && <TokenBadge tokens={cost} size="sm" />}
    </button>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
        active ? 'bg-[#1a1a18] text-white' : 'bg-black/5 text-black/70 hover:bg-black/10',
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

// ─── Main component ──────────────────────────────────────────────────────────

export function ScriptStudio() {
  const { currentProject } = useProjectContext();
  const { canAfford, deduct } = useTokenBalance();
  const { createDraft } = useScriptDrafts();

  const [step, setStep] = useState<Step>('home');
  const [mode, setMode] = useState<Mode | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 'init-greet', role: 'riri', text: 'Привет! Я RiRi. Помогу тебе собрать вирусный сценарий за минуту. С чего начнём?' },
    { id: 'init-modes', role: 'rich', rich: 'modes' },
  ]);

  // Inputs
  const [hookSeed, setHookSeed] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [textIdea, setTextIdea] = useState('');
  const [linkTranscript, setLinkTranscript] = useState<string | null>(null);
  const [linkTranscribing, setLinkTranscribing] = useState(false);

  // Hook selection (mode='hook')
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
    setMessages([
      { id: 'init-greet', role: 'riri', text: 'Привет! Я RiRi. Помогу тебе собрать вирусный сценарий за минуту. С чего начнём?' },
      { id: 'init-modes', role: 'rich', rich: 'modes' },
    ]);
  }, []);

  // ─── Mode selection ───────────────────────────────────────────────────────

  const pickMode = useCallback((m: Mode) => {
    setMode(m);
    if (m === 'hook') {
      addMsg({ role: 'user', text: 'Подбери мне хук' });
      addMsg({ role: 'riri', text: 'Окей. Расскажи про что хочешь снять — нишу или идею. Можешь в свободной форме, я всё пойму.' });
      setStep('mode-hook-input');
    } else if (m === 'link') {
      addMsg({ role: 'user', text: 'Хочу по ссылке на чужой рилс' });
      addMsg({ role: 'riri', text: `Кидай ссылку на Instagram-рилс. Если он уже у нас в базе (через Радар) — бесплатно, иначе транскрибируем за ${getTokenCost('transcribe_video')} коина.` });
      setStep('mode-link-input');
    } else {
      addMsg({ role: 'user', text: 'У меня есть своя идея' });
      addMsg({ role: 'riri', text: 'Отлично. Расскажи про что хочешь снять — нишу или идею. Можешь в свободной форме, я всё пойму.' });
      setStep('mode-text-input');
    }
  }, [addMsg]);

  // ─── Mode: hook (подбери хук) ─────────────────────────────────────────────

  const fetchHooks = useCallback(async () => {
    const seed = hookSeed.trim();
    if (seed.length < 3) {
      toast.error('Опиши тему хотя бы парой слов');
      return;
    }
    const cost = getTokenCost('ai_hook');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    addMsg({ role: 'user', text: seed });
    addMsg({ role: 'typing' });
    setHooksLoading(true);
    try {
      await deduct(cost, { action: 'ai_hook', section: 'script-studio', label: 'Подобрать хуки' });
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-ai-hook',
          script: seed,
          min_views: 50000,
        }),
      });
      const raw = await res.text();
      let data: { success?: boolean; hooks?: AiHook[]; error?: string };
      try { data = JSON.parse(raw); }
      catch { removeTyping(); toast.error('RiRi не смог ответить. Попробуй ещё раз'); return; }
      if (!data.success) {
        removeTyping();
        toast.error(data.error || 'Не удалось подобрать хуки');
        return;
      }
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
        replaceTyping({ role: 'riri', text: `Этот рилс уже у нас — взял транскрипт бесплатно. Какая цель концовки?` });
        addMsg({ role: 'rich', rich: 'options' });
        setStep('options');
        return;
      }

      // Транскрибируем
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
      if (!transcript) {
        removeTyping();
        toast.error(td.error || 'Не удалось транскрибировать видео');
        return;
      }
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

  // ─── Mode: text idea ──────────────────────────────────────────────────────

  const submitTextIdea = useCallback(() => {
    const idea = textIdea.trim();
    if (idea.length < 5) { toast.error('Опиши идею хоть немного подробнее'); return; }
    addMsg({ role: 'user', text: idea });
    addMsg({ role: 'riri', text: 'Принято. Какая цель концовки? Можешь оставить на моё усмотрение.' });
    addMsg({ role: 'rich', rich: 'options' });
    setStep('options');
  }, [textIdea, addMsg]);

  // ─── Generate full script ─────────────────────────────────────────────────

  const generate = useCallback(async () => {
    const cost = getTokenCost('sw_full_script');
    if (!canAfford(cost)) { toast.error('Недостаточно коинов'); return; }

    const ctaLabel = ctaIntent === 'save_bait' ? 'на сохранение'
      : ctaIntent === 'comment_bait' ? 'на комментарий'
      : ctaIntent === 'profile_visit' ? 'на подписку'
      : 'на твоё усмотрение';
    addMsg({ role: 'user', text: `Цель концовки: ${ctaLabel}. Поехали` });
    addMsg({ role: 'typing' });
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
        body.topic = hookSeed.trim();
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
        removeTyping();
        if (res.status === 504) {
          addMsg({ role: 'riri', text: 'Не успел уложиться за минуту. Попробуй ещё раз — обычно со второго раза получается.' });
          addMsg({ role: 'rich', rich: 'options' });
        } else {
          addMsg({ role: 'riri', text: 'Что-то сломалось на сервере. Попробуй ещё раз.' });
          addMsg({ role: 'rich', rich: 'options' });
        }
        setStep('options');
        return;
      }
      if (!data.success) {
        removeTyping();
        addMsg({ role: 'riri', text: data.message || data.error || 'Не получилось сгенерировать. Попробуй ещё раз.' });
        addMsg({ role: 'rich', rich: 'options' });
        setStep('options');
        return;
      }
      const vs: Variant[] = Array.isArray(data.variants) ? data.variants : [];
      if (!vs.length) {
        replaceTyping({ role: 'riri', text: data.message || 'По этой теме пока нет похожих структур в базе. Попробуй другую тему.' });
        addMsg({ role: 'rich', rich: 'options' });
        setStep('options');
        return;
      }
      setVariants(vs);
      replaceTyping({ role: 'riri', text: `Готово, вот ${vs.length} варианта на разных структурах. Тапни любой чтобы открыть полный сценарий и шот-лист.` });
      addMsg({ role: 'rich', rich: 'results' });
      setStep('results');
    } catch (e) {
      console.error(e);
      removeTyping();
      addMsg({ role: 'riri', text: 'Ошибка сети. Попробуй ещё раз.' });
      addMsg({ role: 'rich', rich: 'options' });
      setStep('options');
    } finally {
      setGenLoading(false);
    }
  }, [mode, selectedHook, hookSeed, linkTranscript, textIdea, toneProfile, ctaIntent, canAfford, deduct, addMsg, replaceTyping, removeTyping]);

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

  // ─── Render rich blocks ───────────────────────────────────────────────────

  const renderRich = useCallback((kind: RichKind) => {
    if (kind === 'modes') {
      return (
        <div className="mt-2 space-y-2 max-w-[88%] pl-9">
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
      );
    }
    if (kind === 'hooks') {
      return (
        <div className="mt-2 space-y-2 max-w-[88%] pl-9">
          {hooksList.map((h, i) => (
            <GlassCard key={i} className="p-3 hover:shadow-md transition-shadow" onClick={() => pickHook(h)}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-[14px] font-medium leading-snug">{h.adapted || h.original}</p>
                  {h.explanation && (
                    <p className="mt-1.5 text-[12px] text-black/55 leading-relaxed">{h.explanation}</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-black/45">
                    {h.views && <span>{h.views} views</span>}
                    {h.owner_username && <span>· @{h.owner_username}</span>}
                  </div>
                </div>
                <ChevronRight size={16} className="mt-1 text-black/30" />
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
          <CostBtn onClick={generate} cost={getTokenCost('sw_full_script')} loading={genLoading}>
            Сгенерировать 5 вариантов
          </CostBtn>
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
              <div className="mb-1 flex items-center gap-2 text-[11px] text-black/50">
                <span className="rounded-full bg-black/5 px-2 py-0.5 font-medium">~{v.total_seconds}с</span>
                <span className="rounded-full bg-black/5 px-2 py-0.5">{v.format_type}</span>
              </div>
              <p className="text-[14px] font-medium leading-snug line-clamp-2">{v.hook}</p>
              <p className="mt-1 text-[12px] text-black/50 line-clamp-2">{v.body.slice(0, 110)}...</p>
              {v.source_reference?.owner_username && (
                <div className="mt-1.5 text-[11px] text-black/40">
                  на основе @{v.source_reference.owner_username} · {formatViews(v.source_reference.view_count)} views
                </div>
              )}
            </GlassCard>
          ))}
          <button
            onClick={regenerate}
            disabled={genLoading}
            className="flex items-center gap-1 text-xs text-black/50 hover:text-black/80 transition-colors disabled:opacity-50"
          >
            <RefreshCcw size={12} /> Дай ещё варианты
          </button>
        </div>
      );
    }
    return null;
  }, [hooksList, variants, ctaIntent, genLoading, pickMode, pickHook, generate, regenerate]);

  // ─── Bottom bar (input depending on step) ─────────────────────────────────

  const showInput = step === 'mode-hook-input' || step === 'mode-link-input' || step === 'mode-text-input';

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

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-[#fafaf9]">
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-black/5 bg-white/80 backdrop-blur-sm">
        {step !== 'home' ? (
          <button
            onClick={goHome}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 hover:bg-black/10 transition-colors"
            aria-label="В начало"
          >
            <ArrowLeft size={18} />
          </button>
        ) : (
          <RiriOrb size={32} />
        )}
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold leading-tight">ИИ-сценарист</h1>
          <p className="text-[11px] text-black/50">RiRi · отвечает обычно меньше минуты</p>
        </div>
      </div>

      {/* Messages */}
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

      {/* Bottom input */}
      {showInput && (
        <div className="flex-shrink-0 border-t border-black/5 bg-white/90 backdrop-blur-sm px-4 py-3">
          {step === 'mode-hook-input' && (
            <div className="flex items-end gap-2">
              <textarea
                value={hookSeed}
                onChange={(e) => setHookSeed(e.target.value)}
                placeholder="например: про продажи в b2b, утренние привычки, тренировки дома..."
                rows={2}
                className="flex-1 resize-none rounded-2xl border border-black/10 bg-white px-3 py-2 text-[14px] focus:border-black/30 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !hooksLoading) {
                    e.preventDefault();
                    fetchHooks();
                  }
                }}
              />
              <CostBtn
                onClick={fetchHooks}
                cost={getTokenCost('ai_hook')}
                loading={hooksLoading}
                disabled={hookSeed.trim().length < 3}
              >
                <Send size={14} />
              </CostBtn>
            </div>
          )}

          {step === 'mode-link-input' && (
            <div className="flex items-end gap-2">
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/..."
                className="flex-1 rounded-2xl border border-black/10 bg-white px-3 py-2.5 text-[14px] focus:border-black/30 focus:outline-none"
                disabled={linkTranscribing}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !hooksLoading && !linkTranscribing) {
                    e.preventDefault();
                    submitLink();
                  }
                }}
              />
              <CostBtn
                onClick={submitLink}
                loading={hooksLoading || linkTranscribing}
                disabled={!linkUrl.trim()}
              >
                <Send size={14} />
              </CostBtn>
            </div>
          )}

          {step === 'mode-text-input' && (
            <div className="flex items-end gap-2">
              <textarea
                value={textIdea}
                onChange={(e) => setTextIdea(e.target.value)}
                placeholder="например: хочу рассказать как я перестал прокрастинировать, или 3 факта про мой ремонт..."
                rows={3}
                className="flex-1 resize-none rounded-2xl border border-black/10 bg-white px-3 py-2 text-[14px] focus:border-black/30 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitTextIdea();
                  }
                }}
              />
              <CostBtn onClick={submitTextIdea} disabled={textIdea.trim().length < 5}>
                <Send size={14} />
              </CostBtn>
            </div>
          )}
        </div>
      )}
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
    <GlassCard className="p-3 hover:shadow-md transition-shadow" onClick={onClick}>
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1a1a18] text-white flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold leading-tight">{title}</h3>
          <p className="mt-0.5 text-[12px] leading-snug text-black/55">{desc}</p>
        </div>
        <ChevronRight size={16} className="mt-1.5 text-black/30 flex-shrink-0" />
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
    <div className="min-h-screen bg-[#fafaf9] pb-24">
      <div className="sticky top-0 z-10 border-b border-black/5 bg-white/85 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 hover:bg-black/10"
            aria-label="К списку"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 flex flex-wrap items-center gap-2 text-[11px] text-black/50">
            <span className="rounded-full bg-black/5 px-2 py-0.5 font-medium text-[12px]">~{v.total_seconds}с</span>
            <span className="rounded-full bg-black/5 px-2 py-0.5">{v.format_type}</span>
            {v.source_reference?.owner_username && (
              <span className="text-[11px] text-black/40">
                @{v.source_reference.owner_username} · {formatViews(v.source_reference.view_count)}
              </span>
            )}
          </div>
          <button
            onClick={save}
            disabled={saving || saved}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              saved ? 'bg-emerald-100 text-emerald-700' : 'bg-black/5 hover:bg-black/10',
            )}
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Bookmark size={12} />}
            {saved ? 'В черновиках' : saving ? '...' : 'Сохранить'}
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-medium hover:bg-black/10"
          >
            <Copy size={12} />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 py-4 space-y-3">
        <GlassCard className="p-4">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-black/40">Хук</div>
          <p className="text-[15px] font-medium leading-snug">{v.hook}</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-black/40">Тело</div>
          <p className="whitespace-pre-line text-[14px] leading-relaxed">{v.body}</p>
        </GlassCard>

        <GlassCard className="p-4">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-black/40">Концовка</div>
          <p className="text-[14px] leading-relaxed">{v.ending}</p>
        </GlassCard>

        {v.shot_list?.length > 0 && (
          <GlassCard className="p-4">
            <div className="mb-3 text-[11px] uppercase tracking-wide text-black/40">Шот-лист</div>
            <div className="space-y-3">
              {v.shot_list.map((s, i) => (
                <div key={i} className="grid grid-cols-2 gap-3 border-t border-black/5 pt-3 first:border-t-0 first:pt-0">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-black/40">{s.section} · речь</div>
                    <p className="text-[13px] leading-snug">{s.speech}</p>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-black/40">в кадре</div>
                    <p className="text-[13px] leading-snug text-black/70">{s.on_screen}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
