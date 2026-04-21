import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ExternalLink, Flame, Sparkles, Eye, Lightbulb, Volume2,
  Copy, Check, TrendingUp, ChevronDown, Wand2, Zap, Telescope,
} from 'lucide-react';
import { GlassCard } from './GlassCard';
import { RiriOrb } from './RiriOrb';
import { supabase } from '../../utils/supabase';
import { cn } from '../../utils/cn';
import { toast } from 'sonner';
import type { CompetitorAnalysis, CompetitorHook, GeneratedIdea, UserToneProfile } from '../../hooks/useCompetitorAnalysis';

export function ResultView({ analysis, onBack, onUseIdea, onAddAnother }: {
  analysis: CompetitorAnalysis;
  onBack: () => void;
  onUseIdea?: (idea: GeneratedIdea) => void;
  onAddAnother?: () => void;
}) {
  const [hooks, setHooks] = useState<CompetitorHook[]>([]);
  const [loadingHooks, setLoadingHooks] = useState(true);
  const [liveAnalysis, setLiveAnalysis] = useState<CompetitorAnalysis>(analysis);
  const ideasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('competitor_hooks')
        .select('*')
        .eq('analysis_id', analysis.id)
        .order('view_count', { ascending: false });
      if (!cancelled) {
        setHooks((data || []) as CompetitorHook[]);
        setLoadingHooks(false);
      }
    })();
    return () => { cancelled = true; };
  }, [analysis.id]);

  const ideas = (liveAnalysis.generated_ideas?.ideas || []) as GeneratedIdea[];
  const tone = liveAnalysis.user_tone_profile || {};

  // индексация хуков по shortcode, чтобы идеи могли ссылаться на источник
  const hooksByShortcode = useMemo(() => {
    const m = new Map<string, CompetitorHook>();
    hooks.forEach((h) => { if (h.shortcode) m.set(h.shortcode, h); });
    return m;
  }, [hooks]);

  // Полим аналитику (только READ!) пока идей нет — без tick'ов, чтобы не
  // плодить параллельные вызовы Gemini Pro. За прогрессом следит LoadingStage.
  useEffect(() => {
    if (ideas.length > 0) return;
    let cancelled = false;
    const poll = async () => {
      const { data } = await supabase
        .from('competitor_analyses')
        .select('*')
        .eq('id', analysis.id)
        .maybeSingle();
      if (cancelled || !data) return;
      setLiveAnalysis(data as CompetitorAnalysis);
    };
    poll();
    const interval = setInterval(poll, 6000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [analysis.id, ideas.length]);

  // автоскролл к лоадеру
  useEffect(() => {
    if (ideas.length === 0 && ideasRef.current) {
      const t = setTimeout(() => {
        ideasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [ideas.length]);

  const topHook = hooks[0];
  const avg = liveAnalysis.competitor_avg_views || 0;
  const maxMult = hooks.reduce((m, h) => Math.max(m, h.viral_multiplier || 0), 0);
  const isFallback = !!hooks[0]?.is_fallback;

  // Форматируем мультипликатор: x26227 — бессмысленное число (артефакт малого
  // avg_bottom3), ограничиваем сверху «x100+» для читаемости
  const formatMult = (m: number | null | undefined): string | null => {
    if (!m || m < 2) return null;
    if (m >= 100) return 'x100+';
    return `x${Math.round(m)}`;
  };

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> К списку разборов
      </button>

      {/* ─── HERO ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">
        <Sparkles className="w-3.5 h-3.5" /> RIRI AI · Разбор
      </div>
      <h1 className="mt-1 text-[24px] md:text-[32px] font-semibold text-[#1a1a18] tracking-tight leading-tight">
        @{liveAnalysis.competitor_username}
        <span className="text-slate-400 font-normal"> → </span>
        @{liveAnalysis.user_username}
      </h1>

      {/* KPI-плитки — конкурент vs ты */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5">
        <Kpi
          label="В среднем просмотров"
          value={avg ? formatViews(avg) : '—'}
          hint="у конкурента"
        />
        <Kpi
          label="Топ залётного"
          value={topHook?.view_count ? formatViews(topHook.view_count) : '—'}
          hint={formatMult(maxMult) ? `${formatMult(maxMult)} к обычному` : undefined}
          accent="orange"
        />
        <Kpi
          label="Виральных роликов"
          value={isFallback ? '0' : String(hooks.length)}
          hint={isFallback ? 'топ-3 по просмотрам' : 'из 24 последних'}
        />
        <Kpi
          label="Идей под тебя"
          value={ideas.length ? String(ideas.length) : '…'}
          hint="готовы к съёмке"
          accent="violet"
        />
      </div>

      {/* Инсайт-строка */}
      {tone.summary && (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-amber-50 via-white to-indigo-50 border border-slate-100 p-4 md:p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-white border border-slate-100 flex items-center justify-center">
              <Zap className="w-4 h-4 text-amber-500" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-medium mb-1">
                Твой стиль
              </p>
              <p className="text-[14px] text-[#1a1a18] leading-relaxed">
                {tone.summary}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Два блока рядом: хуки + tone (детали) ─────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <HooksPanel hooks={hooks} loading={loadingHooks} isFallback={isFallback} />
        <TonePanel tone={tone} />
      </div>

      {/* ─── Идеи ───────────────────────────────────────────────────── */}
      <div className="mt-10" ref={ideasRef}>
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" strokeWidth={2.5} />
            <h2 className="text-[18px] md:text-[20px] font-semibold text-[#1a1a18]">
              Идеи под твой голос
            </h2>
            {ideas.length > 0 && (
              <span className="text-sm text-slate-400">· {ideas.length}</span>
            )}
          </div>
          {ideas.length > 0 && (
            <span className="hidden md:inline text-xs text-slate-400">
              Тапни «В сценарист» — RiRi соберёт полный сценарий за 30 сек
            </span>
          )}
        </div>

        {ideas.length === 0 ? (
          <IdeasLoader status={liveAnalysis.status} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ideas.map((idea, i) => (
              <IdeaCard
                key={i}
                idea={idea}
                index={i}
                sourceHook={idea.based_on_competitor_shortcode
                  ? hooksByShortcode.get(idea.based_on_competitor_shortcode) || null
                  : null}
                onUse={onUseIdea}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Что делать дальше ──────────────────────────────────────── */}
      {ideas.length > 0 && (
        <NextSteps
          onAddAnother={onAddAnother}
          hasIdeas={ideas.length > 0}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */

function Kpi({ label, value, hint, accent }: {
  label: string; value: string; hint?: string; accent?: 'orange' | 'violet';
}) {
  const accentColor =
    accent === 'orange' ? 'text-orange-600' :
    accent === 'violet' ? 'text-violet-600' : 'text-[#1a1a18]';
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-3 md:p-4 shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
      <p className="text-[10.5px] uppercase tracking-wide text-slate-400 font-medium leading-none">
        {label}
      </p>
      <p className={cn('mt-2 text-[20px] md:text-[24px] font-semibold leading-none', accentColor)}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11px] text-slate-400 leading-tight">{hint}</p>}
    </div>
  );
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

/* ─── Хуки ───────────────────────────────────────────────────────── */

function HooksPanel({ hooks, loading, isFallback }: {
  hooks: CompetitorHook[]; loading: boolean; isFallback?: boolean;
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-orange-500" strokeWidth={2.5} />
        <h3 className="text-[15px] font-semibold text-[#1a1a18]">
          {isFallback ? 'Топ-3 по просмотрам' : 'Залётные хуки'}
        </h3>
        {!isFallback && !loading && hooks.length > 0 && (
          <span className="ml-auto text-[11px] text-slate-400">
            {hooks.length} {hooks.length === 1 ? 'штука' : 'штук'}
          </span>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-slate-400">Загружаю…</p>
      ) : hooks.length === 0 ? (
        <p className="text-sm text-slate-400">Пока пусто.</p>
      ) : (
        <div className="space-y-2.5">
          {hooks.map((h) => (
            <HookRow key={h.id} hook={h} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function HookRow({ hook }: { hook: CompetitorHook }) {
  const [copied, setCopied] = useState(false);
  const rawTranscript = hook.transcript_text && !hook.transcript_text.startsWith('__ERR__')
    ? hook.transcript_text
    : '';
  const text = hook.hook_text || (rawTranscript ? rawTranscript.slice(0, 140) : '');
  const mult = hook.viral_multiplier ? Math.round(hook.viral_multiplier) : null;

  const copy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Хук скопирован');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group rounded-xl border border-slate-100 p-3 bg-slate-50/40 hover:bg-white hover:border-slate-200 transition-all">
      <div className="flex items-start gap-3">
        {hook.thumbnail_url ? (
          <div className="relative flex-shrink-0">
            <img
              src={hook.thumbnail_url}
              alt=""
              className="w-16 h-20 rounded-lg object-cover bg-slate-200"
              loading="lazy"
            />
            {mult && mult >= 3 && (
              <div className="absolute -top-1.5 -right-1.5 bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-sm">
                {mult >= 100 ? 'x100+' : `x${mult}`}
              </div>
            )}
          </div>
        ) : (
          <div className="w-16 h-20 rounded-lg bg-slate-100 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] text-[#1a1a18] leading-snug line-clamp-3">
            {text || <span className="text-slate-400 italic">Без речи (музыкальный ролик)</span>}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Eye className="w-3 h-3" />
              {hook.view_count?.toLocaleString('ru-RU') || '—'}
            </span>
            {hook.niche && (
              <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                {hook.niche}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {text && (
                <button
                  onClick={copy}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Скопировать хук"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
              {hook.url && (
                <a
                  href={hook.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title="Открыть в Instagram"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Tone ──────────────────────────────────────────────────────── */

function TonePanel({ tone }: { tone: UserToneProfile }) {
  const isEmpty = !tone || Object.keys(tone).length === 0;
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Volume2 className="w-4 h-4 text-slate-600" strokeWidth={2.5} />
        <h3 className="text-[15px] font-semibold text-[#1a1a18]">Твой голос и стиль</h3>
      </div>
      {isEmpty ? (
        <p className="text-sm text-slate-400">Анализирую…</p>
      ) : (
        <div className="space-y-3 text-[13px]">
          {tone.voice && (
            <TagRow
              title="Подача"
              tags={[tone.voice.tempo, tone.voice.energy, tone.voice.formality].filter(Boolean) as string[]}
            />
          )}
          {tone.recurring_topics && tone.recurring_topics.length > 0 && (
            <TagRow title="Темы" tags={tone.recurring_topics} />
          )}
          {tone.signature_phrases && tone.signature_phrases.length > 0 && (
            <TagRow title="Фирменные фразы" tags={tone.signature_phrases} />
          )}
          {tone.hook_patterns && tone.hook_patterns.length > 0 && (
            <TagRow title="Как начинает" tags={tone.hook_patterns} />
          )}
          {tone.humor && <TagRow title="Юмор" tags={[tone.humor]} />}
          {tone.structure && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Структура ролика</p>
              <p className="text-slate-700 leading-relaxed">{tone.structure}</p>
            </div>
          )}
          {tone.stop_words && tone.stop_words.length > 0 && (
            <TagRow title="Избегает" tags={tone.stop_words} variant="danger" />
          )}
        </div>
      )}
    </GlassCard>
  );
}

function TagRow({ title, tags, variant }: { title: string; tags: string[]; variant?: 'danger' }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1.5">{title}</p>
      <div className="flex gap-1.5 flex-wrap">
        {tags.map((t, i) => (
          <span
            key={i}
            className={cn(
              'text-[12px] rounded-full px-2.5 py-1',
              variant === 'danger'
                ? 'bg-red-50 text-red-600'
                : 'bg-slate-100 text-slate-700'
            )}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Loader ───────────────────────────────────────────────────── */

function IdeasLoader({ status }: { status: string }) {
  const label =
    status === 'transcribing_user' ? 'Слушаю твои ролики'
    : status === 'analyzing_user' ? 'Думаю о твоём стиле'
    : status === 'generating_ideas' ? 'Склеиваю идеи'
    : status === 'fetching_user' ? 'Смотрю на твой аккаунт'
    : 'Собираю идеи';

  return (
    <GlassCard className="relative overflow-hidden p-8 md:p-10">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        animate={{
          background: [
            'radial-gradient(600px 200px at 20% 50%, rgba(250,204,21,0.12), transparent 60%)',
            'radial-gradient(600px 200px at 80% 50%, rgba(99,102,241,0.14), transparent 60%)',
            'radial-gradient(600px 200px at 20% 50%, rgba(250,204,21,0.12), transparent 60%)',
          ],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative flex flex-col items-center text-center">
        <RiriOrb size={72} floating />
        <motion.div
          className="mt-5 text-[34px] md:text-[44px] font-bold tracking-tight leading-none bg-clip-text text-transparent bg-[linear-gradient(110deg,#1a1a18_35%,#cbd5e1_50%,#1a1a18_65%)] bg-[length:200%_100%]"
          animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
        >
          RiRi AI
        </motion.div>
        <div className="mt-3 flex items-center gap-2 text-[13px] text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
          <motion.span
            key={label}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-medium"
          >
            {label}…
          </motion.span>
        </div>
        <p className="mt-2 text-xs text-slate-400 max-w-sm">
          Генерю 10 идей под твой голос. Обычно 40–90 секунд — страницу обновлять не надо.
        </p>
        <div className="mt-6 w-full grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <motion.div
              key={i}
              className="rounded-2xl border border-slate-100 bg-white/60 p-4 space-y-2"
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.25, ease: 'easeInOut' }}
            >
              <div className="h-3 w-2/3 bg-slate-200/80 rounded" />
              <div className="h-2 w-full bg-slate-100 rounded" />
              <div className="h-2 w-5/6 bg-slate-100 rounded" />
              <div className="h-2 w-4/6 bg-slate-100 rounded" />
            </motion.div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

/* ─── Idea card ──────────────────────────────────────────────── */

function IdeaCard({ idea, index, sourceHook, onUse }: {
  idea: GeneratedIdea;
  index: number;
  sourceHook: CompetitorHook | null;
  onUse?: (idea: GeneratedIdea) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const diff = idea.difficulty;
  const diffLabel = diff === 'easy' ? 'Просто снять' : diff === 'medium' ? 'Средне' : diff === 'hard' ? 'Сложно' : null;
  const diffColor = diff === 'easy' ? 'emerald' : diff === 'medium' ? 'amber' : diff === 'hard' ? 'rose' : 'slate';

  const copyHook = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(idea.adapted_hook || '');
    setCopied(true);
    toast.success('Хук скопирован');
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="relative rounded-2xl bg-white border border-slate-100 shadow-[0_1px_6px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:border-slate-200 transition-all flex flex-col overflow-hidden"
    >
      {/* top meta strip */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2 flex-wrap">
        <span className="text-[11px] font-mono text-slate-400">#{index + 1}</span>
        {idea.format && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
            {idea.format}
          </span>
        )}
        {idea.hook_pattern && (
          <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-600 rounded-full px-2 py-0.5">
            {idea.hook_pattern}
          </span>
        )}
        {diffLabel && (
          <span className={cn(
            'inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 ml-auto',
            diffColor === 'emerald' && 'bg-emerald-50 text-emerald-700',
            diffColor === 'amber' && 'bg-amber-50 text-amber-700',
            diffColor === 'rose' && 'bg-rose-50 text-rose-700',
          )}>
            {diffLabel}
          </span>
        )}
      </div>

      {/* title */}
      <div className="px-4">
        <h3 className="text-[15px] md:text-[16px] font-semibold text-[#1a1a18] leading-snug">
          {idea.title}
        </h3>
      </div>

      {/* adapted hook — главный акцент */}
      <div className="mx-4 mt-3 rounded-xl bg-gradient-to-br from-amber-50/70 to-white border border-amber-100/80 p-3">
        <div className="flex items-start gap-2">
          <Wand2 className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-amber-600/80 font-semibold leading-none mb-1">
              Твой хук
            </p>
            <p className="text-[13.5px] text-[#1a1a18] leading-relaxed">
              {idea.adapted_hook}
            </p>
          </div>
          <button
            onClick={copyHook}
            className="p-1 rounded-md hover:bg-white/80 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
            title="Скопировать"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Source hook mini-ref */}
      {sourceHook && (
        <a
          href={sourceHook.url || undefined}
          target="_blank"
          rel="noreferrer"
          className="mx-4 mt-2.5 flex items-center gap-2 text-[11.5px] text-slate-500 hover:text-slate-800 transition-colors group/src"
        >
          {sourceHook.thumbnail_url && (
            <img
              src={sourceHook.thumbnail_url}
              alt=""
              className="w-6 h-8 rounded-md object-cover bg-slate-100 flex-shrink-0"
              loading="lazy"
            />
          )}
          <span className="inline-flex items-center gap-1 truncate">
            <TrendingUp className="w-3 h-3 text-orange-500 flex-shrink-0" strokeWidth={2.5} />
            <span>По мотивам</span>
            <span className="font-medium text-slate-700">
              {sourceHook.view_count?.toLocaleString('ru-RU')} просмотров
            </span>
            {sourceHook.viral_multiplier && sourceHook.viral_multiplier >= 3 && (
              <span className="text-orange-600 font-semibold">
                · {sourceHook.viral_multiplier >= 100 ? 'x100+' : `x${Math.round(sourceHook.viral_multiplier)}`}
              </span>
            )}
          </span>
          {sourceHook.url && (
            <ExternalLink className="w-3 h-3 text-slate-300 group-hover/src:text-slate-600 transition-colors" />
          )}
        </a>
      )}

      {/* expandable body */}
      <div className="px-4 mt-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between text-[11.5px] text-slate-500 hover:text-slate-700 transition-colors py-1.5"
        >
          <span>{expanded ? 'Свернуть' : 'Структура и почему зайдёт'}</span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.div>
        </button>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pb-2 space-y-2.5">
                {idea.structure_outline && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                      Структура
                    </p>
                    <p className="text-[12.5px] text-slate-700 leading-relaxed whitespace-pre-line">
                      {idea.structure_outline}
                    </p>
                  </div>
                )}
                {idea.why_it_works && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
                      Почему зайдёт
                    </p>
                    <p className="text-[12px] text-slate-500 italic leading-relaxed">
                      «{idea.why_it_works}»
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* CTA */}
      <div className="mt-3 px-3 pb-3">
        {onUse && (
          <button
            onClick={() => onUse(idea)}
            className="w-full inline-flex items-center justify-center gap-2 min-h-[42px] rounded-xl bg-slate-900 hover:bg-black text-white text-[13.5px] font-semibold shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition-all active:scale-[0.98]"
          >
            <Sparkles className="w-4 h-4" strokeWidth={2.5} />
            Превратить в сценарий
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Что делать дальше ─────────────────────────────────────── */

function NextSteps({ onAddAnother, hasIdeas }: { onAddAnother?: () => void; hasIdeas: boolean }) {
  return (
    <div className="mt-10 mb-4">
      <div className="flex items-center gap-2 mb-4 px-1">
        <Telescope className="w-4 h-4 text-slate-500" strokeWidth={2.5} />
        <h2 className="text-[16px] font-semibold text-[#1a1a18]">Что дальше</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {hasIdeas && (
          <NextStepCard
            icon={<Sparkles className="w-4 h-4 text-amber-500" strokeWidth={2.5} />}
            title="Выбери 2–3 идеи на неделю"
            desc="Не хватайся за все 10 сразу. Бери ту, что резонирует и её легче снять — остальные не пропадут, разбор сохранён."
          />
        )}
        {onAddAnother && (
          <NextStepCard
            icon={<Telescope className="w-4 h-4 text-indigo-500" strokeWidth={2.5} />}
            title="Добавь ещё конкурента"
            desc="Чем больше залётных хуков в твоей базе — тем точнее RiRi попадает в тебя. Разбери 2–3 аккаунтов из ниши."
            cta="Новый разбор"
            onClick={onAddAnother}
          />
        )}
        <NextStepCard
          icon={<Lightbulb className="w-4 h-4 text-emerald-500" strokeWidth={2.5} />}
          title="После съёмки — верни результат"
          desc="Через неделю заглянешь в аналитику: залетело или нет. Это сигнал для RiRi — какие хуки тебе ближе."
        />
      </div>
    </div>
  );
}

function NextStepCard({ icon, title, desc, cta, onClick }: {
  icon: React.ReactNode; title: string; desc: string; cta?: string; onClick?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[14px] font-semibold text-[#1a1a18] leading-snug">{title}</h3>
          <p className="text-[12.5px] text-slate-500 mt-1 leading-relaxed">{desc}</p>
        </div>
      </div>
      {cta && onClick && (
        <button
          onClick={onClick}
          className="mt-3 self-start inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-700 hover:text-black transition-colors"
        >
          {cta} →
        </button>
      )}
    </div>
  );
}
