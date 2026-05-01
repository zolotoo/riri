import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Loader2, ArrowLeft, Copy, Bookmark, Check, ChevronRight,
  Link as LinkIcon, RefreshCcw,
} from 'lucide-react';
import { useTokenBalance } from '../contexts/TokenBalanceContext';
import { useScriptDrafts } from '../hooks/useScriptDrafts';
import { useProjectContext } from '../contexts/ProjectContext';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../utils/supabase';
import { getTokenCost } from '../constants/tokenCosts';
import { TokenBadge } from './ui/TokenBadge';
import { cn } from '../utils/cn';
import { iosSpringSoft } from '../utils/motionPresets';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

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

type CtaIntent = 'soft_loop' | 'save_bait' | 'comment_bait' | 'profile_visit' | null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatViews(n?: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1000) return `${Math.round(n / 1000)}К`;
  return String(n);
}

const LOADING_LINES = [
  'Я как Шерлок Холмс — ищу самые залётные рилсы по теме...',
  'Перебираю тысячу сценариев со всего мира...',
  'Считаю какая структура сейчас работает в этой нише...',
  'Подбираю самые сочные приёмы от топов...',
  'Сшиваю всё это в твой голос...',
  'Ещё пара секунд — почти готово',
];

// Анимированный RiRi-орб для loading-стейта: пульсация + 3 echo-волны +
// 6 искорок крутятся по орбите + плавающее движение вверх-вниз.
// Делаем максимально запоминающимся — чтобы юзер скриншотил и постил.
function RiriOrb({ size = 100 }: { size?: number }) {
  const s = size;
  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: s * 2, height: s * 2 }}
    >
      {/* Echo волны вокруг орба */}
      {[0, 1, 2].map((i) => (
        <div
          key={`echo-${i}`}
          className="absolute rounded-full"
          style={{
            width: s,
            height: s,
            border: '1.5px solid rgba(120, 130, 160, 0.4)',
            animation: `ririOrbEcho 3.2s ease-out ${i * 1.07}s infinite`,
          }}
        />
      ))}

      {/* Сам орб */}
      <div
        className="rounded-full flex-shrink-0 relative"
        style={{
          width: s,
          height: s,
          background: `radial-gradient(circle at 36% 28%, #ffffff 0%, #eceef4 18%, #c8ccd9 42%, #8b91a3 68%, #5a6070 92%)`,
          boxShadow: `
            inset ${-s * 0.07}px ${-s * 0.07}px ${s * 0.18}px rgba(40,44,60,0.32),
            inset ${s * 0.07}px ${s * 0.055}px ${s * 0.16}px rgba(255,255,255,0.85),
            0 ${s * 0.1}px ${s * 0.42}px rgba(80,88,120,0.25),
            0 0 ${s * 0.5}px rgba(140,150,180,0.18)
          `,
          animation: 'ririOrbModalFloat 3.5s ease-in-out infinite, ririOrbPulse 2.4s ease-in-out infinite',
        }}
      />

      {/* Орбитальные искорки — 6 штук, разный delay и radius */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const angle = (i * 60); // градусы
        const radius = s * 0.85;
        return (
          <div
            key={`spark-${i}`}
            className="absolute"
            style={{
              width: 6,
              height: 6,
              animation: `ririOrbSpark 4s linear ${i * 0.4}s infinite`,
              transform: `rotate(${angle}deg) translateX(${radius}px)`,
            }}
          >
            <div
              className="rounded-full"
              style={{
                width: 6,
                height: 6,
                background: 'radial-gradient(circle, #ffffff 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
                boxShadow: '0 0 8px rgba(255,255,255,0.9)',
              }}
            />
          </div>
        );
      })}
    </div>
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

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap',
        active ? 'bg-slate-900 text-white shadow-[0_2px_8px_rgba(15,23,42,0.15)]' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}

// ─── Loading screen ──────────────────────────────────────────────────────────

function LoadingState() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % LOADING_LINES.length), 3200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <RiriOrb size={100} />
      <div className="mt-8 h-12 max-w-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-[14px] leading-relaxed text-slate-600"
          >
            {LOADING_LINES[idx]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
  videoUrl?: string | null;
  videoOwner?: string | null;
  transcript: string; // оригинал или translation
  initialVariants?: Variant[]; // если уже сохранены в saved_videos.ai_script_variants
  onVariantsGenerated?: (variants: Variant[]) => void;
}

export function AiScriptVideoModal({
  isOpen, onClose, transcript, videoUrl, videoOwner,
  initialVariants, onVariantsGenerated,
}: Props) {
  const { canAfford, deduct } = useTokenBalance();
  const { createDraft } = useScriptDrafts();
  const { currentProject } = useProjectContext();
  const { user } = useAuth();
  const cachedToneRef = useRef<string | null>(null);

  const [variants, setVariants] = useState<Variant[]>(initialVariants || []);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [ctaIntent, setCtaIntent] = useState<CtaIntent>(null);
  const [showCtaPicker, setShowCtaPicker] = useState(!initialVariants?.length);

  const projectStylePrompt = useMemo(() => {
    return currentProject?.projectStyles?.[0]?.prompt ?? null;
  }, [currentProject]);

  // Подгружаем tone profile из последнего анализа конкурента юзера, если он
  // ранее делал анализ — там в user_tone_profile лежит JSON со стилем по 12
  // последним рилсам. Это даёт автоматическую персонализацию без ручного
  // обучения подчерка.
  const fetchUserToneProfile = useCallback(async (): Promise<string | null> => {
    if (cachedToneRef.current) return cachedToneRef.current;
    if (!user?.id) return null;
    try {
      const { data } = await supabase
        .from('competitor_analyses')
        .select('user_tone_profile')
        .eq('user_id', user.id)
        .not('user_tone_profile', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!data?.user_tone_profile) return null;
      const tp = typeof data.user_tone_profile === 'string'
        ? data.user_tone_profile
        : JSON.stringify(data.user_tone_profile);
      cachedToneRef.current = tp;
      return tp;
    } catch (e) {
      console.warn('fetchUserToneProfile:', e);
      return null;
    }
  }, [user?.id]);

  // Reset когда модалка открывается заново
  useEffect(() => {
    if (isOpen) {
      setOpenIdx(null);
      if (initialVariants?.length) {
        setVariants(initialVariants);
        setShowCtaPicker(false);
      } else {
        setVariants([]);
        setShowCtaPicker(true);
      }
    }
  }, [isOpen, initialVariants]);

  const generate = useCallback(async () => {
    if (!transcript?.trim()) {
      toast.error('Нет транскрипта для разбора');
      return;
    }
    const cost = getTokenCost('sw_full_script');
    if (!canAfford(cost)) {
      toast.error('Недостаточно коинов');
      return;
    }
    setLoading(true);
    setShowCtaPicker(false);
    try {
      // Tone profile: project style → user tone profile из анализа инсты → null
      const userTone = await fetchUserToneProfile();
      const tone_profile = projectStylePrompt || userTone || null;

      await deduct(cost, { action: 'sw_full_script', section: 'video-detail', label: 'ИИ-сценарий по видео' });
      const res = await fetch('/api/scriptwriter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-full-script',
          reference_transcript: transcript.trim(),
          tone_profile,
          cta_intent: ctaIntent,
        }),
      });
      const raw = await res.text();
      let data: { success?: boolean; variants?: Variant[]; error?: string; message?: string };
      try { data = JSON.parse(raw); }
      catch {
        toast.error(res.status === 504
          ? 'RiRi не успел за минуту. Попробуй ещё раз — обычно со второго раза получается.'
          : 'Что-то сломалось на сервере. Попробуй ещё раз.');
        setShowCtaPicker(true);
        return;
      }
      if (!data.success) {
        toast.error(data.message || data.error || 'Не удалось сгенерировать');
        setShowCtaPicker(true);
        return;
      }
      const vs: Variant[] = Array.isArray(data.variants) ? data.variants : [];
      if (!vs.length) {
        toast.info(data.message || 'Похожих структур не найдено');
        setShowCtaPicker(true);
        return;
      }
      setVariants(vs);
      onVariantsGenerated?.(vs);
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сети');
      setShowCtaPicker(true);
    } finally {
      setLoading(false);
    }
  }, [transcript, ctaIntent, projectStylePrompt, fetchUserToneProfile, canAfford, deduct, onVariantsGenerated]);

  const saveVariant = useCallback(async (v: Variant): Promise<boolean> => {
    const fullText = `${v.hook}\n\n${v.body}\n\n${v.ending}`;
    const titleSeed = (v.hook || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'ИИ-сценарий';
    const draft = await createDraft({
      title: titleSeed,
      script_text: fullText,
      source_type: 'reference',
      source_data: {
        mode: 'video-detail',
        sourceVideo: { url: videoUrl, owner: videoOwner },
        ctaIntent,
        variant: v,
      },
    });
    if (draft) toast.success('Сохранено в черновики');
    else toast.error('Не получилось сохранить');
    return Boolean(draft);
  }, [createDraft, videoUrl, videoOwner, ctaIntent]);

  if (!isOpen) return null;

  const openVariant = openIdx !== null ? variants[openIdx] : null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)' }}
          onClick={onClose}
        >
          <style>{`
            @keyframes ririOrbModalFloat {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-8px); }
            }
            @keyframes ririOrbPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.04); }
            }
            @keyframes ririOrbEcho {
              0% { transform: scale(1); opacity: 0.55; }
              100% { transform: scale(2.2); opacity: 0; }
            }
            @keyframes ririOrbSpark {
              0% { transform: rotate(0deg) translateX(var(--r, 85px)) scale(1); opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { transform: rotate(360deg) translateX(var(--r, 85px)) scale(0.6); opacity: 0; }
            }
          `}</style>
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={iosSpringSoft}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[20px] overflow-hidden bg-[#f5f6f8] shadow-2xl"
          >
            {/* Header */}
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200/60 bg-white">
              {openVariant ? (
                <button
                  onClick={() => setOpenIdx(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
                  aria-label="Назад"
                >
                  <ArrowLeft size={18} />
                </button>
              ) : null}
              <div className="flex-1">
                <h2 className="text-[15px] font-semibold text-slate-900">
                  {openVariant ? 'Сценарий' : 'ИИ-сценарий по этому видео'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {openVariant
                    ? `Адаптировано из @${openVariant.source_reference?.owner_username || '?'}`
                    : 'RiRi найдёт похожие виралы и адаптирует под твоё видео'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {/* CTA picker (перед генерацией) */}
              {showCtaPicker && !loading && !variants.length && (
                <div className="px-4 py-6 space-y-4">
                  <GlassCard className="p-4">
                    <div className="mb-3 text-[13px] font-medium text-slate-700">
                      Цель концовки (опционально)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Chip active={ctaIntent === null} onClick={() => setCtaIntent(null)}>Авто</Chip>
                      <Chip active={ctaIntent === 'save_bait'} onClick={() => setCtaIntent('save_bait')}>На сохранение</Chip>
                      <Chip active={ctaIntent === 'comment_bait'} onClick={() => setCtaIntent('comment_bait')}>На комментарий</Chip>
                      <Chip active={ctaIntent === 'profile_visit'} onClick={() => setCtaIntent('profile_visit')}>На подписку</Chip>
                    </div>
                  </GlassCard>

                  <button
                    onClick={generate}
                    disabled={!canAfford(getTokenCost('sw_full_script'))}
                    className="w-full flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed shadow-[0_2px_8px_rgba(15,23,42,0.18)]"
                  >
                    Сгенерировать варианты
                    <TokenBadge tokens={getTokenCost('sw_full_script')} size="sm" />
                  </button>

                  <p className="text-[12px] text-slate-500 text-center">
                    Возьму это видео как референс и подберу 3 близких виральных рилса по похожей теме — каждый перепишу под твою.
                  </p>
                </div>
              )}

              {/* Loading */}
              {loading && <LoadingState />}

              {/* Список вариантов */}
              {!loading && !openVariant && variants.length > 0 && (
                <div className="px-4 py-4 space-y-3">
                  <p className="text-[12px] text-slate-500 px-1">
                    {variants.length} {variants.length === 1 ? 'вариант' : variants.length < 5 ? 'варианта' : 'вариантов'} — тапни любой
                  </p>
                  {variants.map((v, i) => (
                    <GlassCard
                      key={i}
                      className="p-3 hover:shadow-md transition-shadow"
                      onClick={() => setOpenIdx(i)}
                    >
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
                    onClick={() => { setShowCtaPicker(true); setVariants([]); }}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
                  >
                    <RefreshCcw size={12} /> Перегенерировать
                  </button>
                </div>
              )}

              {/* Detail */}
              {openVariant && <DetailView v={openVariant} onSave={() => saveVariant(openVariant)} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Detail subview ──────────────────────────────────────────────────────────

function DetailView({ v, onSave }: { v: Variant; onSave: () => Promise<boolean> }) {
  const fullText = `${v.hook}\n\n${v.body}\n\n${v.ending}`;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

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
    <div className="px-4 py-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-[12px] text-slate-600">~{v.total_seconds}с</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{v.format_type}</span>
        {v.source_reference?.owner_username && v.source_reference.url && (
          <a
            href={v.source_reference.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100 font-medium"
          >
            @{v.source_reference.owner_username} · {formatViews(v.source_reference.view_count)}
          </a>
        )}
        <div className="ml-auto flex gap-2">
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

      {v.original && (v.original.hook || v.original.body || v.original.ending) && (
        <GlassCard className="p-4 border-emerald-100" onClick={() => setShowOriginal((o) => !o)}>
          <div className="flex items-center justify-between cursor-pointer">
            <div>
              <div className="mb-0.5 text-[11px] uppercase tracking-wide text-emerald-600">Оригинал из вирала</div>
              <div className="text-[12px] text-slate-600">
                {showOriginal ? 'скрыть' : 'показать что было в виральном видео'}
              </div>
            </div>
            <ChevronRight size={18} className={cn('text-slate-400 transition-transform', showOriginal && 'rotate-90')} />
          </div>
          <AnimatePresence>
            {showOriginal && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  {v.original.hook && (
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">оригинальный хук</div>
                      <p className="text-[13px] leading-snug text-slate-700 whitespace-pre-line">{v.original.hook}</p>
                    </div>
                  )}
                  {v.original.body && (
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">оригинальное тело</div>
                      <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-line">{v.original.body}</p>
                    </div>
                  )}
                  {v.original.ending && (
                    <div>
                      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">оригинальная концовка</div>
                      <p className="text-[13px] leading-snug text-slate-700 whitespace-pre-line">{v.original.ending}</p>
                    </div>
                  )}
                  {v.source_reference?.url && (
                    <a
                      href={v.source_reference.url}
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
      )}
    </div>
  );
}
