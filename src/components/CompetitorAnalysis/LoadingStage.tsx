import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, HelpCircle } from 'lucide-react';
import { RiriOrb } from './RiriOrb';
import { GlassCard } from './GlassCard';
import { supabase } from '../../utils/supabase';
import type { CompetitorAnalysis, CompetitorAnalysisStatus } from '../../hooks/useCompetitorAnalysis';

const COMPETITOR_PHASES: Record<CompetitorAnalysisStatus, { title: string; sub: string } | undefined> = {
  pending: { title: 'Просыпаюсь…', sub: 'Заряжаюсь зелёным чаем' },
  fetching_competitor: { title: 'Листаю его ленту…', sub: 'Беру 24 последних ролика' },
  transcribing_competitor: { title: 'Слушаю виральные ролики…', sub: 'Транскрибирую, чтобы понять хуки' },
  extracting_hooks: { title: 'Собираю хуки…', sub: 'Что цепляет — запоминаю' },
  fetching_user: undefined,
  transcribing_user: undefined,
  analyzing_user: undefined,
  generating_ideas: undefined,
  ready: undefined,
  error: undefined,
  no_virals: undefined,
};

const USER_PHASES: Record<CompetitorAnalysisStatus, { title: string; sub: string } | undefined> = {
  pending: undefined,
  fetching_competitor: undefined,
  transcribing_competitor: undefined,
  extracting_hooks: undefined,
  fetching_user: { title: 'Смотрю на твой аккаунт…', sub: 'Собираю последние 12 роликов' },
  transcribing_user: { title: 'Слушаю тебя…', sub: 'Ловлю твой тон и манеру' },
  analyzing_user: { title: 'Думаю о твоём стиле…', sub: 'Что у тебя в ДНК контента' },
  generating_ideas: { title: 'Склеиваю идеи…', sub: 'Его хуки + твой голос' },
  ready: undefined,
  error: undefined,
  no_virals: undefined,
};

export function LoadingStage({
  analysis,
  phase,
  onReady,
  onNoVirals,
  onAnalysisUpdate,
  onGoUserInput,
}: {
  analysis: CompetitorAnalysis;
  phase: 'competitor' | 'user';
  onReady: () => void;
  onNoVirals: () => void;
  onContinueWithFallback: () => void;
  onAnalysisUpdate: () => void;
  onGoUserInput?: () => void;
}) {
  const [current, setCurrent] = useState<CompetitorAnalysis>(analysis);
  const [showWhy, setShowWhy] = useState(false);
  const [continuing, setContinuing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const { data } = await supabase.from('competitor_analyses').select('*').eq('id', analysis.id).maybeSingle();
      if (cancelled || !data) return;
      setCurrent(data as CompetitorAnalysis);
      onAnalysisUpdate();
      const st = (data as CompetitorAnalysis).status;
      // Прогрессируем state-machine на бэке
      const nonTerminal = ['transcribing_competitor', 'extracting_hooks', 'transcribing_user', 'analyzing_user', 'generating_ideas'];
      if (nonTerminal.includes(st)) {
        fetch('/api/competitor-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tick', analysisId: analysis.id }),
        }).catch(() => {});
      }
      if (phase === 'competitor') {
        if (st === 'fetching_user' || st === 'ready') { onGoUserInput?.(); return; }
        if (st === 'no_virals') { onNoVirals(); return; }
        if (st === 'error') return;
      } else {
        if (st === 'ready') { onReady(); return; }
        if (st === 'error') return;
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [analysis.id, phase]);

  if (current.status === 'error') {
    return (
      <ErrorPanel
        title="Что-то пошло не так"
        message={current.error_message || 'Попробуй ещё раз через минуту.'}
      />
    );
  }

  if (current.status === 'no_virals') {
    return (
      <NoViralsPanel
        username={current.competitor_username}
        showWhy={showWhy}
        setShowWhy={setShowWhy}
        continuing={continuing}
        onContinueAnyway={async () => {
          setContinuing(true);
          try {
            await fetch('/api/competitor-analyze', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'force-fallback', analysisId: current.id }),
            });
          } finally {
            setContinuing(false);
          }
        }}
      />
    );
  }

  const phaseMap = phase === 'competitor' ? COMPETITOR_PHASES : USER_PHASES;
  const info = phaseMap[current.status] || { title: 'Работаю…', sub: 'Секунду' };

  return (
    <div className="relative flex flex-col items-center text-center pt-10">
      {/* мягкое фоновое сияние */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[340px] opacity-70 -z-0"
        animate={{
          background: [
            'radial-gradient(500px 220px at 30% 40%, rgba(250,204,21,0.18), transparent 60%)',
            'radial-gradient(500px 220px at 70% 40%, rgba(99,102,241,0.18), transparent 60%)',
            'radial-gradient(500px 220px at 30% 40%, rgba(250,204,21,0.18), transparent 60%)',
          ],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <RiriOrb size={148} floating />

        {/* Большой мерцающий бренд RiRi AI */}
        <motion.div
          className="mt-6 text-[44px] md:text-[56px] font-bold tracking-tight leading-none bg-clip-text text-transparent bg-[linear-gradient(110deg,#1a1a18_35%,#cbd5e1_50%,#1a1a18_65%)] bg-[length:200%_100%]"
          animate={{ backgroundPosition: ['200% 0%', '-200% 0%'] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
        >
          RiRi AI
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.h2
            key={info.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3 }}
            className="mt-4 text-[20px] md:text-[24px] font-semibold text-[#1a1a18]"
          >
            {info.title}
          </motion.h2>
        </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.p
          key={info.sub}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-2 text-[14px] text-slate-500 max-w-md leading-relaxed"
        >
          {info.sub}
        </motion.p>
      </AnimatePresence>
        {current.status_message && (
          <p className="mt-3 text-xs text-slate-400">{current.status_message}</p>
        )}
      </div>
    </div>
  );
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <GlassCard className="p-6 mt-8">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-[15px] font-medium text-[#1a1a18]">{title}</h3>
          <p className="mt-1 text-sm text-slate-500">{message}</p>
        </div>
      </div>
    </GlassCard>
  );
}

function NoViralsPanel({
  username, showWhy, setShowWhy, continuing, onContinueAnyway,
}: {
  username: string; showWhy: boolean; setShowWhy: (v: boolean) => void;
  continuing: boolean; onContinueAnyway: () => void;
}) {
  return (
    <div className="max-w-lg mx-auto pt-6">
      <GlassCard className="p-6">
        <h3 className="text-[18px] font-semibold text-[#1a1a18]">
          У @{username} нет залётных роликов
        </h3>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">
          По нашей метрике ни один из последних 24 роликов не превысил средние просмотры профиля в 5 раз. Попробуй другого конкурента — или покажу топ-3 по просмотрам из того, что есть.
        </p>

        {showWhy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed"
          >
            <p className="font-medium text-slate-700 mb-1">Как считаем «залётный»</p>
            <p>Берём 3 ролика с минимальными просмотрами за последние 24 — это «базовая аудитория». Виральный = тот, у которого просмотров больше в 5+ раз. Если таких нет — аккаунт либо стабильно растёт без взлётов, либо мало роликов.</p>
          </motion.div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={onContinueAnyway}
            disabled={continuing}
            className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-2xl bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium shadow-glass disabled:opacity-50 transition-all active:scale-[0.97]"
          >
            Всё равно показать топ-3 по просмотрам
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowWhy(!showWhy)}
            className="w-full flex items-center justify-center gap-2 min-h-[40px] rounded-2xl text-slate-500 hover:text-slate-700 hover:bg-slate-50 text-sm transition-colors"
          >
            <HelpCircle className="w-4 h-4" />
            {showWhy ? 'Свернуть' : 'Почему у него нет залётных?'}
          </button>
        </div>
      </GlassCard>
    </div>
  );
}
