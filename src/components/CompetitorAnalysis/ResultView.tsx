import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink, Flame, Sparkles, Eye, Lightbulb, Volume2 } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { RiriOrb } from './RiriOrb';
import { supabase } from '../../utils/supabase';
import type { CompetitorAnalysis, CompetitorHook, GeneratedIdea, UserToneProfile } from '../../hooks/useCompetitorAnalysis';

export function ResultView({ analysis, onBack, onUseIdea }: {
  analysis: CompetitorAnalysis;
  onBack: () => void;
  onUseIdea?: (idea: GeneratedIdea) => void;
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

  // Полим аналитику, пока идей нет, и дотикиваем пайплайн на бэке
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
      const st = (data as CompetitorAnalysis).status;
      const nonTerminal = ['transcribing_user', 'analyzing_user', 'generating_ideas'];
      if (nonTerminal.includes(st)) {
        fetch('/api/competitor-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tick', analysisId: analysis.id }),
        }).catch(() => {});
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [analysis.id, ideas.length]);

  // Если идей ещё нет — автоскроллим вниз, чтобы лоадер был в поле зрения
  useEffect(() => {
    if (ideas.length === 0 && ideasRef.current) {
      const t = setTimeout(() => {
        ideasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [ideas.length]);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-5">
        <ArrowLeft className="w-4 h-4" /> К списку разборов
      </button>

      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400 font-medium">
        <Sparkles className="w-3.5 h-3.5" /> RIRI AI · Разбор
      </div>
      <h1 className="mt-1 text-[24px] md:text-[30px] font-semibold text-[#1a1a18] tracking-tight">
        @{analysis.competitor_username}
        <span className="text-slate-400 font-normal"> → </span>
        @{analysis.user_username}
      </h1>
      {analysis.competitor_avg_views && (
        <p className="text-sm text-slate-500 mt-1">
          У конкурента ~{Math.round(analysis.competitor_avg_views).toLocaleString('ru-RU')} просмотров в среднем
        </p>
      )}

      {/* Два блока рядом: хуки + tone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <HooksPanel hooks={hooks} loading={loadingHooks} isFallback={hooks[0]?.is_fallback} />
        <TonePanel username={analysis.user_username || ''} tone={tone} />
      </div>

      {/* 10 идей */}
      <div className="mt-8" ref={ideasRef}>
        <div className="flex items-center gap-2 mb-3 px-1">
          <Lightbulb className="w-4 h-4 text-slate-500" strokeWidth={2.5} />
          <h2 className="text-[16px] font-semibold text-[#1a1a18]">Идеи для сценариев</h2>
          <span className="text-xs text-slate-400">({ideas.length})</span>
        </div>
        {ideas.length === 0 ? (
          <IdeasLoader status={liveAnalysis.status} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ideas.map((idea, i) => (
              <IdeaCard key={i} idea={idea} index={i} onUse={onUseIdea} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HooksPanel({ hooks, loading, isFallback }: { hooks: CompetitorHook[]; loading: boolean; isFallback?: boolean }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-4 h-4 text-orange-500" strokeWidth={2.5} />
        <h3 className="text-[15px] font-semibold text-[#1a1a18]">
          {isFallback ? 'Топ-3 по просмотрам' : 'Залётные хуки'}
        </h3>
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
  const mult = hook.viral_multiplier ? `x${Math.round(hook.viral_multiplier)}` : null;
  return (
    <div className="rounded-xl border border-slate-100 p-3 bg-slate-50/40 hover:bg-white transition-colors">
      <div className="flex items-start gap-3">
        {hook.thumbnail_url ? (
          <img
            src={hook.thumbnail_url}
            alt=""
            className="w-14 h-14 rounded-lg object-cover flex-shrink-0 bg-slate-200"
            loading="lazy"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-slate-100 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] text-[#1a1a18] leading-snug line-clamp-3">
            {hook.hook_text
              || (hook.transcript_text ? hook.transcript_text.slice(0, 140) : null)
              || <span className="text-slate-400 italic">Без речи (музыкальный ролик)</span>}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
              <Eye className="w-3 h-3" />
              {hook.view_count?.toLocaleString('ru-RU') || '—'}
            </span>
            {mult && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-orange-600 bg-orange-50 rounded-full px-2 py-0.5">
                <Flame className="w-2.5 h-2.5" /> {mult}
              </span>
            )}
            {hook.niche && (
              <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                {hook.niche}
              </span>
            )}
            {hook.url && (
              <a
                href={hook.url}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-slate-400 hover:text-slate-700"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TonePanel({ tone }: { username: string; tone: UserToneProfile }) {
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
          {tone.summary && (
            <p className="text-slate-600 leading-relaxed">{tone.summary}</p>
          )}
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
              <p className="text-slate-700">{tone.structure}</p>
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
            className={
              variant === 'danger'
                ? 'text-[12px] bg-red-50 text-red-600 rounded-full px-2.5 py-1'
                : 'text-[12px] bg-slate-100 text-slate-700 rounded-full px-2.5 py-1'
            }
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function IdeasLoader({ status }: { status: string }) {
  const label =
    status === 'transcribing_user' ? 'Слушаю твои ролики'
    : status === 'analyzing_user' ? 'Думаю о твоём стиле'
    : status === 'generating_ideas' ? 'Склеиваю идеи'
    : status === 'fetching_user' ? 'Смотрю на твой аккаунт'
    : 'Собираю идеи';

  return (
    <GlassCard className="relative overflow-hidden p-8 md:p-10">
      {/* мягкий фоновый градиент-свечение */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        initial={{ background: 'radial-gradient(600px 200px at 20% 50%, rgba(250,204,21,0.12), transparent 60%)' }}
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

        {/* Большой, мерцающий бренд */}
        <motion.div
          className="mt-5 text-[34px] md:text-[44px] font-bold tracking-tight leading-none bg-clip-text text-transparent bg-[linear-gradient(110deg,#1a1a18_35%,#cbd5e1_50%,#1a1a18_65%)] bg-[length:200%_100%]"
          animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
        >
          RiRi AI
        </motion.div>

        {/* подпись-этап */}
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

        {/* скелетоны идей для живости */}
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

function IdeaCard({ idea, index, onUse }: { idea: GeneratedIdea; index: number; onUse?: (idea: GeneratedIdea) => void }) {
  return (
    <GlassCard className="p-4 flex flex-col">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-[11px] font-mono text-slate-400 mt-0.5">#{index + 1}</span>
        <h3 className="text-[14.5px] font-semibold text-[#1a1a18] leading-snug flex-1">{idea.title}</h3>
      </div>
      <div className="mb-2.5">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Хук</p>
        <p className="text-[13px] text-[#1a1a18] leading-relaxed">{idea.adapted_hook}</p>
      </div>
      {idea.structure_outline && (
        <div className="mb-2.5">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">Структура</p>
          <p className="text-[12.5px] text-slate-600 leading-relaxed whitespace-pre-line">{idea.structure_outline}</p>
        </div>
      )}
      {idea.why_it_works && (
        <p className="text-[12px] text-slate-500 italic leading-relaxed mb-3">«{idea.why_it_works}»</p>
      )}
      {onUse && (
        <button
          onClick={() => onUse(idea)}
          className="mt-auto inline-flex items-center justify-center gap-2 min-h-[38px] rounded-xl bg-slate-600 hover:bg-slate-700 text-white text-[13px] font-medium shadow-glass transition-all active:scale-[0.97]"
        >
          <Sparkles className="w-3.5 h-3.5" strokeWidth={2.5} />
          В сценарист
        </button>
      )}
    </GlassCard>
  );
}
