import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, ArrowLeft, Loader2, Link as LinkIcon,
  Type, Wand2, ChevronRight, Eye, RefreshCcw, Copy,
} from 'lucide-react';
import { useProjectContext } from '../contexts/ProjectContext';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { getTokenCost } from '../constants/tokenCosts';
import { TokenBadge } from './ui/TokenBadge';
import { cn } from '../utils/cn';
import { iosSpringSoft } from '../utils/motionPresets';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Step =
  | 'home'
  | 'mode-hook'
  | 'mode-link'
  | 'mode-text'
  | 'options'
  | 'generating'
  | 'results'
  | 'detail';

type Mode = 'hook' | 'link' | 'text';

type LengthPreference = 15 | 30 | 60 | null;
type CtaIntent = 'soft_loop' | 'save_bait' | 'comment_bait' | 'profile_visit' | null;

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

// ─── Local UI helpers ────────────────────────────────────────────────────────

function GlassCard({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn('rounded-[18px]', onClick && 'cursor-pointer', className)}
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
  onClick, disabled, loading, cost, children, variant = 'primary', className,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  cost?: number;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary'
          ? 'bg-black text-white hover:bg-black/85'
          : 'bg-black/5 text-black hover:bg-black/10',
        className,
      )}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
      {cost != null && cost > 0 && !loading && <TokenBadge tokens={cost} size="sm" />}
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

// ─── Main component ──────────────────────────────────────────────────────────

export function ScriptStudio() {
  const { currentProject } = useProjectContext();
  const { canAfford, deduct } = useTokenBalance();

  const [step, setStep] = useState<Step>('home');
  const [mode, setMode] = useState<Mode | null>(null);

  // Inputs per mode
  const [hookSeed, setHookSeed] = useState(''); // что-нибудь про тему для retrieval хуков
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTranscript, setLinkTranscript] = useState<string | null>(null);
  const [textIdea, setTextIdea] = useState('');

  // Hook selection (mode='hook')
  const [hooksList, setHooksList] = useState<AiHook[]>([]);
  const [selectedHook, setSelectedHook] = useState<AiHook | null>(null);
  const [hooksLoading, setHooksLoading] = useState(false);

  // Options
  const [lengthPref, setLengthPref] = useState<LengthPreference>(null);
  const [ctaIntent, setCtaIntent] = useState<CtaIntent>(null);

  // Generation
  const [variants, setVariants] = useState<Variant[]>([]);
  const [openVariantIdx, setOpenVariantIdx] = useState<number | null>(null);
  const [genLoading, setGenLoading] = useState(false);

  // Tone profile из текущего стиля проекта (если есть) — передадим в промпт.
  const toneProfile = useMemo(() => {
    const styles = currentProject?.projectStyles ?? [];
    if (!styles.length) return null;
    return styles[0]?.prompt ?? null;
  }, [currentProject]);

  // ─── Reset / навигация ────────────────────────────────────────────────────

  const goHome = useCallback(() => {
    setStep('home');
    setMode(null);
    setHookSeed('');
    setLinkUrl('');
    setLinkTranscript(null);
    setTextIdea('');
    setHooksList([]);
    setSelectedHook(null);
    setLengthPref(null);
    setCtaIntent(null);
    setVariants([]);
    setOpenVariantIdx(null);
  }, []);

  const goBack = useCallback(() => {
    if (step === 'detail') return setStep('results');
    if (step === 'results') return setStep('options');
    if (step === 'options') {
      if (mode === 'hook') return setStep('mode-hook');
      if (mode === 'link') return setStep('mode-link');
      return setStep('mode-text');
    }
    if (step === 'mode-hook' || step === 'mode-link' || step === 'mode-text') return goHome();
    goHome();
  }, [step, mode, goHome]);

  // ─── Mode: hook (подбери хук) ─────────────────────────────────────────────

  const fetchHooks = useCallback(async () => {
    const cost = getTokenCost('ai_hook');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    if (!hookSeed.trim() || hookSeed.trim().length < 3) {
      toast.error('Опиши тему хотя бы парой слов');
      return;
    }
    setHooksLoading(true);
    try {
      await deduct(cost, { action: 'ai_hook', section: 'script-studio', label: 'Подобрать хуки' });
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-ai-hook',
          script: hookSeed.trim(),
          min_views: 50000,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || 'Не удалось подобрать хуки');
        return;
      }
      const hooks: AiHook[] = (data.hooks || []).slice(0, 5);
      if (!hooks.length) {
        toast.info('По этой теме хуков пока нет в базе');
        return;
      }
      setHooksList(hooks);
    } catch (e) {
      console.error(e);
      toast.error('Ошибка запроса');
    } finally {
      setHooksLoading(false);
    }
  }, [hookSeed, canAfford, deduct]);

  const pickHook = useCallback((h: AiHook) => {
    setSelectedHook(h);
    setStep('options');
  }, []);

  // ─── Mode: link (по ссылке на чужой рилс) ─────────────────────────────────

  const submitLink = useCallback(async () => {
    const url = linkUrl.trim();
    if (!url) {
      toast.error('Вставь ссылку на Instagram-рилс');
      return;
    }
    const code = extractShortcode(url);
    if (!code) {
      toast.error('Не похоже на ссылку Instagram');
      return;
    }
    setHooksLoading(true);
    try {
      // ищем видео в нашей базе по shortcode
      const { supabase } = await import('../utils/supabase');
      const { data, error } = await supabase
        .from('videos')
        .select('transcript_text, translation_text, owner_username')
        .eq('shortcode', code)
        .maybeSingle();
      if (error) throw error;
      const t = (data?.translation_text?.trim() || data?.transcript_text?.trim()) ?? '';
      if (!t) {
        toast.error('Этого рилса пока нет в нашей базе. Полная транскрибация по ссылке будет в следующей версии — а пока попробуй вставить уже проанализированный ролик из Радара.');
        return;
      }
      setLinkTranscript(t);
      setStep('options');
    } catch (e) {
      console.error(e);
      toast.error('Не удалось загрузить ссылку');
    } finally {
      setHooksLoading(false);
    }
  }, [linkUrl]);

  // ─── Generate full script ─────────────────────────────────────────────────

  const generate = useCallback(async () => {
    const cost = getTokenCost('sw_full_script');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setGenLoading(true);
    setStep('generating');
    try {
      await deduct(cost, { action: 'sw_full_script', section: 'script-studio', label: 'Полный сценарий' });
      const body: Record<string, unknown> = {
        action: 'generate-full-script',
        tone_profile: toneProfile,
        length_preference: lengthPref,
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
      const data = await res.json();
      if (!data.success) {
        toast.error(data.message || data.error || 'Не удалось сгенерировать');
        setStep('options');
        return;
      }
      const vs: Variant[] = Array.isArray(data.variants) ? data.variants : [];
      if (!vs.length) {
        toast.info(data.message || 'Не нашлось похожих скелетов');
        setStep('options');
        return;
      }
      setVariants(vs);
      setStep('results');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка генерации');
      setStep('options');
    } finally {
      setGenLoading(false);
    }
  }, [mode, selectedHook, hookSeed, linkTranscript, textIdea, toneProfile, lengthPref, ctaIntent, canAfford, deduct]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#fafaf9] pb-24">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4">
          {step !== 'home' ? (
            <button
              onClick={goBack}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 hover:bg-black/10"
              aria-label="Назад"
            >
              <ArrowLeft size={18} />
            </button>
          ) : null}
          <div className="flex items-center gap-2">
            <Sparkles size={20} />
            <h1 className="text-lg font-semibold">ИИ-сценарист</h1>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={iosSpringSoft}
              className="space-y-3"
            >
              <p className="px-2 pb-2 text-sm text-black/60">
                Как поедем? Выбери с чего начать — Реми сам подберёт скелет вирусного видео и адаптирует под тебя.
              </p>

              <ModeCard
                icon={<Wand2 size={20} />}
                title="Подобрать хук"
                desc="Не знаю про что снимать. Покажи 5 хуков из топа в моей теме — выберу один и развернём в сценарий."
                onClick={() => { setMode('hook'); setStep('mode-hook'); }}
              />
              <ModeCard
                icon={<LinkIcon size={20} />}
                title="По ссылке"
                desc="Кину ссылку на чужой залётный рилс — Реми разберёт его структуру и перепишет под мою тему."
                onClick={() => { setMode('link'); setStep('mode-link'); }}
              />
              <ModeCard
                icon={<Type size={20} />}
                title="По теме"
                desc="У меня в голове идея — текстом опишу, Реми соберёт 5 вариантов сценария по разным структурам."
                onClick={() => { setMode('text'); setStep('mode-text'); }}
              />
            </motion.div>
          )}

          {step === 'mode-hook' && (
            <motion.div
              key="mode-hook"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={iosSpringSoft}
              className="space-y-4"
            >
              <GlassCard className="p-4">
                <label className="mb-2 block text-sm font-medium">О чём хочешь снять? Пара слов или предложение</label>
                <textarea
                  value={hookSeed}
                  onChange={(e) => setHookSeed(e.target.value)}
                  placeholder="например: про продажи в b2b, или про утренние привычки, или про тренировки дома"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:border-black/30 focus:outline-none"
                />
                <div className="mt-3 flex justify-end">
                  <CostBtn
                    onClick={fetchHooks}
                    cost={getTokenCost('ai_hook')}
                    loading={hooksLoading}
                    disabled={hookSeed.trim().length < 3}
                  >
                    Подобрать 5 хуков
                  </CostBtn>
                </div>
              </GlassCard>

              {hooksList.length > 0 && (
                <div className="space-y-2">
                  <div className="px-2 text-sm font-medium text-black/70">Выбери хук — продолжим от него</div>
                  {hooksList.map((h, i) => (
                    <GlassCard key={i} className="p-4 hover:shadow-md transition-shadow" onClick={() => pickHook(h)}>
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium leading-snug">{h.adapted || h.original}</p>
                          {h.adapted && h.original && h.adapted !== h.original && (
                            <p className="mt-1 text-xs text-black/50">оригинал: {h.original}</p>
                          )}
                          {h.explanation && (
                            <p className="mt-2 text-xs text-black/60 leading-relaxed">{h.explanation}</p>
                          )}
                          <div className="mt-2 flex items-center gap-2 text-xs text-black/50">
                            {h.views && <span>{h.views} views</span>}
                            {h.owner_username && <span>· @{h.owner_username}</span>}
                            {h.niche && <span>· {h.niche}</span>}
                          </div>
                        </div>
                        <ChevronRight size={18} className="mt-1 text-black/30" />
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {step === 'mode-link' && (
            <motion.div
              key="mode-link"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={iosSpringSoft}
              className="space-y-4"
            >
              <GlassCard className="p-4">
                <label className="mb-2 block text-sm font-medium">Ссылка на чужой Reel</label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://www.instagram.com/reel/..."
                  className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:border-black/30 focus:outline-none"
                />
                <p className="mt-2 text-xs text-black/50">
                  Сейчас работает с рилсами, которые уже в нашей базе (например, разобранные через Радар). Полный приём любой ссылки добавим в следующей версии.
                </p>
                <div className="mt-3 flex justify-end">
                  <CostBtn onClick={submitLink} loading={hooksLoading} disabled={!linkUrl.trim()}>
                    Дальше
                  </CostBtn>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {step === 'mode-text' && (
            <motion.div
              key="mode-text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={iosSpringSoft}
              className="space-y-4"
            >
              <GlassCard className="p-4">
                <label className="mb-2 block text-sm font-medium">Идея сценария</label>
                <textarea
                  value={textIdea}
                  onChange={(e) => setTextIdea(e.target.value)}
                  placeholder="опиши: про что хочешь снять, что главное хочешь донести, какой угол"
                  rows={5}
                  className="w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2 text-sm focus:border-black/30 focus:outline-none"
                />
                <div className="mt-3 flex justify-end">
                  <CostBtn onClick={() => setStep('options')} disabled={textIdea.trim().length < 5}>
                    Дальше
                  </CostBtn>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {step === 'options' && (
            <motion.div
              key="options"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={iosSpringSoft}
              className="space-y-4"
            >
              {/* Сводка ввода */}
              <GlassCard className="p-4">
                <div className="text-xs uppercase tracking-wide text-black/40">Что у нас есть</div>
                {mode === 'hook' && selectedHook && (
                  <p className="mt-2 text-sm font-medium leading-snug">«{selectedHook.adapted || selectedHook.original}»</p>
                )}
                {mode === 'link' && linkTranscript && (
                  <p className="mt-2 text-sm leading-snug text-black/70 line-clamp-3">{linkTranscript.slice(0, 240)}...</p>
                )}
                {mode === 'text' && (
                  <p className="mt-2 text-sm leading-snug text-black/80">{textIdea}</p>
                )}
              </GlassCard>

              {/* Длина (опц) */}
              <GlassCard className="p-4">
                <div className="mb-3 text-sm font-medium">Длина (опционально)</div>
                <div className="flex flex-wrap gap-2">
                  {([null, 15, 30, 60] as LengthPreference[]).map((v) => (
                    <Chip key={String(v)} active={lengthPref === v} onClick={() => setLengthPref(v)}>
                      {v == null ? 'Авто' : `~${v}с`}
                    </Chip>
                  ))}
                </div>
                <p className="mt-2 text-xs text-black/50">
                  Авто — Реми предложит варианты разной длины из похожих вирусных видео.
                </p>
              </GlassCard>

              {/* CTA intent (опц) */}
              <GlassCard className="p-4">
                <div className="mb-3 text-sm font-medium">Цель концовки (опционально)</div>
                <div className="flex flex-wrap gap-2">
                  <Chip active={ctaIntent === null} onClick={() => setCtaIntent(null)}>Авто</Chip>
                  <Chip active={ctaIntent === 'soft_loop'} onClick={() => setCtaIntent('soft_loop')}>Возврат к хуку</Chip>
                  <Chip active={ctaIntent === 'save_bait'} onClick={() => setCtaIntent('save_bait')}>На сохранение</Chip>
                  <Chip active={ctaIntent === 'comment_bait'} onClick={() => setCtaIntent('comment_bait')}>На коммент</Chip>
                  <Chip active={ctaIntent === 'profile_visit'} onClick={() => setCtaIntent('profile_visit')}>В профиль</Chip>
                </div>
              </GlassCard>

              <div className="flex justify-end pt-2">
                <CostBtn onClick={generate} cost={getTokenCost('sw_full_script')} loading={genLoading}>
                  Сгенерировать 5 вариантов
                </CostBtn>
              </div>
            </motion.div>
          )}

          {step === 'generating' && (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center gap-4 py-24"
            >
              <Loader2 size={32} className="animate-spin text-black/40" />
              <p className="text-sm text-black/60">Реми подбирает скелеты и пишет 5 вариантов...</p>
            </motion.div>
          )}

          {step === 'results' && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={iosSpringSoft}
              className="space-y-3"
            >
              <div className="flex items-center justify-between px-2 pb-1">
                <div className="text-sm font-medium text-black/70">5 вариантов — выбирай свой</div>
                <button
                  onClick={generate}
                  className="flex items-center gap-1 text-xs text-black/50 hover:text-black"
                >
                  <RefreshCcw size={12} /> Перегенерировать
                </button>
              </div>
              {variants.map((v, i) => (
                <GlassCard
                  key={i}
                  className="p-4 hover:shadow-md transition-shadow"
                  onClick={() => { setOpenVariantIdx(i); setStep('detail'); }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2 text-xs text-black/50">
                        <span className="rounded-full bg-black/5 px-2 py-0.5 font-medium">~{v.total_seconds}с</span>
                        <span className="rounded-full bg-black/5 px-2 py-0.5">{v.format_type}</span>
                      </div>
                      <p className="text-sm font-medium leading-snug line-clamp-2">{v.hook}</p>
                      <p className="mt-1 text-xs text-black/50 line-clamp-2">{v.body.slice(0, 120)}...</p>
                      {v.source_reference?.owner_username && (
                        <div className="mt-2 text-xs text-black/40">
                          скелет от @{v.source_reference.owner_username} · {formatViews(v.source_reference.view_count)} views
                        </div>
                      )}
                    </div>
                    <Eye size={16} className="mt-1 text-black/30" />
                  </div>
                </GlassCard>
              ))}
            </motion.div>
          )}

          {step === 'detail' && openVariantIdx !== null && variants[openVariantIdx] && (
            <VariantDetail
              v={variants[openVariantIdx]}
              onBack={() => setStep('results')}
            />
          )}
        </AnimatePresence>
      </div>
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
    <GlassCard className="p-5 hover:shadow-md transition-shadow" onClick={onClick}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-black/60">{desc}</p>
        </div>
        <ChevronRight size={18} className="mt-2 text-black/30" />
      </div>
    </GlassCard>
  );
}

function Chip({
  children, active, onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-all',
        active ? 'bg-black text-white' : 'bg-black/5 text-black/70 hover:bg-black/10',
      )}
    >
      {children}
    </button>
  );
}

function VariantDetail({ v, onBack }: { v: Variant; onBack: () => void }) {
  const fullText = `${v.hook}\n\n${v.body}\n\n${v.ending}`;

  const copy = useCallback(() => {
    navigator.clipboard.writeText(fullText).then(
      () => toast.success('Сценарий скопирован'),
      () => toast.error('Не получилось скопировать'),
    );
  }, [fullText]);

  return (
    <motion.div
      key="detail"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={iosSpringSoft}
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center gap-2 px-2">
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium">~{v.total_seconds}с</span>
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs">{v.format_type}</span>
        {v.source_reference?.owner_username && (
          <span className="text-xs text-black/40">
            на основе @{v.source_reference.owner_username} · {formatViews(v.source_reference.view_count)}
          </span>
        )}
        <button
          onClick={copy}
          className="ml-auto flex items-center gap-1 rounded-full bg-black/5 px-3 py-1.5 text-xs font-medium hover:bg-black/10"
        >
          <Copy size={12} /> Скопировать
        </button>
      </div>

      <GlassCard className="p-4">
        <div className="mb-1 text-xs uppercase tracking-wide text-black/40">Хук</div>
        <p className="text-sm font-medium leading-snug">{v.hook}</p>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-1 text-xs uppercase tracking-wide text-black/40">Тело</div>
        <p className="whitespace-pre-line text-sm leading-relaxed">{v.body}</p>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-1 text-xs uppercase tracking-wide text-black/40">Концовка</div>
        <p className="text-sm leading-relaxed">{v.ending}</p>
      </GlassCard>

      {v.shot_list?.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-3 text-xs uppercase tracking-wide text-black/40">Шот-лист</div>
          <div className="space-y-3">
            {v.shot_list.map((s, i) => (
              <div key={i} className="grid grid-cols-2 gap-3 border-t border-black/5 pt-3 first:border-t-0 first:pt-0">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-black/40">{s.section} · речь</div>
                  <p className="text-sm leading-snug">{s.speech}</p>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-black/40">в кадре</div>
                  <p className="text-sm leading-snug text-black/70">{s.on_screen}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <div className="flex justify-end pt-2">
        <button
          onClick={onBack}
          className="rounded-full bg-black/5 px-5 py-2.5 text-sm font-medium hover:bg-black/10"
        >
          К списку
        </button>
      </div>
    </motion.div>
  );
}
