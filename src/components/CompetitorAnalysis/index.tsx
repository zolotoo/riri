import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Telescope, ArrowRight, Sparkles, Clock, Trash2, Loader2 } from 'lucide-react';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useAuth } from '../../hooks/useAuth';
import {
  useCompetitorAnalysis,
  parseInstagramUsername,
  type CompetitorAnalysis,
} from '../../hooks/useCompetitorAnalysis';
import { cn } from '../../utils/cn';
import { toast } from 'sonner';
import { RiriOrb } from './RiriOrb';
import { GlassCard } from './GlassCard';
import { LoadingStage } from './LoadingStage';
import { ResultView } from './ResultView';

type Step = 'landing' | 'competitor-input' | 'competitor-loading' | 'user-input' | 'user-loading' | 'result';

export function CompetitorAnalysisPage({ onNavigateToScriptwriter }: { onNavigateToScriptwriter?: () => void } = {}) {
  const { currentProjectId } = useProjectContext();
  const { user } = useAuth();
  const { analyses, loading, reload, remove } = useCompetitorAnalysis(
    currentProjectId || undefined,
    user?.id,
  );

  const [step, setStep] = useState<Step>('landing');
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [competitorInput, setCompetitorInput] = useState('');
  const [userInput, setUserInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeAnalysis = useMemo<CompetitorAnalysis | null>(
    () => analyses.find(a => a.id === activeAnalysisId) ?? null,
    [analyses, activeAnalysisId],
  );

  const resetFlow = () => {
    setStep('landing');
    setActiveAnalysisId(null);
    setCompetitorInput('');
    setUserInput('');
  };

  const handleStartCompetitor = async () => {
    const username = parseInstagramUsername(competitorInput);
    if (!username) {
      toast.error('Похоже на неверную ссылку. Попробуй @username или ссылку на Instagram.');
      return;
    }
    if (!currentProjectId || !user?.id) {
      toast.error('Сначала выбери проект.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/competitor-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          projectId: currentProjectId,
          userId: user.id,
          competitorUsername: username,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.analysisId) {
        throw new Error(json.error || 'Не получилось запустить разбор');
      }
      setActiveAnalysisId(json.analysisId);
      setStep('competitor-loading');
      reload();
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка запуска');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompetitorLoadingDone = (noVirals: boolean) => {
    if (noVirals) {
      // остаёмся в том же шаге — LoadingStage сам покажет экран "нет залётных"
      return;
    }
    setStep('user-input');
  };

  const handleStartUser = async () => {
    const username = parseInstagramUsername(userInput);
    if (!username) {
      toast.error('Проверь ссылку на свой аккаунт.');
      return;
    }
    if (!activeAnalysisId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/competitor-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start-user',
          analysisId: activeAnalysisId,
          userUsername: username,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Не получилось проанализировать тебя');
      setStep('user-loading');
      reload();
    } catch (e: any) {
      toast.error(e?.message || 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  const openExisting = (id: string) => {
    setActiveAnalysisId(id);
    const a = analyses.find(x => x.id === id);
    if (!a) return;
    if (a.status === 'ready') setStep('result');
    else if (a.status === 'no_virals') setStep('competitor-loading');
    else if (['analyzing_user', 'transcribing_user', 'fetching_user', 'generating_ideas'].includes(a.status)) setStep('user-loading');
    else setStep('competitor-loading');
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-[#fafafa] to-[#f2f3f6]">
      <div className="max-w-4xl mx-auto px-4 py-8 md:py-12 safe-x">
        <AnimatePresence mode="wait">
          {step === 'landing' && (
            <motion.div key="landing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <LandingHeader onStart={() => setStep('competitor-input')} />
              <PastAnalysesList
                analyses={analyses}
                loading={loading}
                onOpen={openExisting}
                onRemove={async (id) => { await remove(id); toast.success('Разбор удалён'); }}
              />
            </motion.div>
          )}

          {step === 'competitor-input' && (
            <motion.div key="c-input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <InputStep
                orbTitle="Кто конкурент?"
                subtitle="Скинь ссылку на инст-аккаунт, у которого сейчас залетает. Я возьму 24 последних ролика и вытащу самые виральные хуки."
                placeholder="@username или instagram.com/username"
                value={competitorInput}
                setValue={setCompetitorInput}
                onSubmit={handleStartCompetitor}
                submitting={submitting}
                cta="Разобрать конкурента"
                onBack={resetFlow}
              />
            </motion.div>
          )}

          {step === 'competitor-loading' && activeAnalysis && (
            <motion.div key="c-loading" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <LoadingStage
                analysis={activeAnalysis}
                phase="competitor"
                onReady={() => handleCompetitorLoadingDone(false)}
                onNoVirals={() => handleCompetitorLoadingDone(true)}
                onContinueWithFallback={() => { /* handled by LoadingStage itself */ }}
                onAnalysisUpdate={reload}
                onGoUserInput={() => setStep('user-input')}
              />
            </motion.div>
          )}

          {step === 'user-input' && activeAnalysis && (
            <motion.div key="u-input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <InputStep
                orbTitle="Теперь ты"
                subtitle={`Готово — хуки ${activeAnalysis.competitor_username} у меня. Скинь свой инст, я разберу твой голос и стиль и соберу 10 идей.`}
                placeholder="@username или instagram.com/username"
                value={userInput}
                setValue={setUserInput}
                onSubmit={handleStartUser}
                submitting={submitting}
                cta="Проанализировать меня"
                onBack={() => setStep('competitor-loading')}
              />
            </motion.div>
          )}

          {step === 'user-loading' && activeAnalysis && (
            <motion.div key="u-loading" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <LoadingStage
                analysis={activeAnalysis}
                phase="user"
                onReady={() => setStep('result')}
                onNoVirals={() => { /* не применимо на этапе юзера */ }}
                onContinueWithFallback={() => { /* не применимо */ }}
                onAnalysisUpdate={reload}
              />
            </motion.div>
          )}

          {step === 'result' && activeAnalysis && (
            <motion.div key="result" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
              <ResultView
                analysis={activeAnalysis}
                onBack={resetFlow}
                onUseIdea={(idea) => {
                  try {
                    sessionStorage.setItem('riri:competitor-idea', JSON.stringify({
                      idea,
                      competitor_username: activeAnalysis.competitor_username,
                      analysis_id: activeAnalysis.id,
                    }));
                  } catch { /* ignore */ }
                  onNavigateToScriptwriter?.();
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LandingHeader({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center text-center mb-10">
      <RiriOrb size={108} floating />
      <h1 className="mt-6 text-[28px] md:text-[32px] font-semibold text-[#1a1a18] tracking-tight">
        Анализ конкурента
      </h1>
      <p className="mt-3 text-[15px] text-slate-500 max-w-xl leading-relaxed">
        Скинь аккаунт конкурента — RiRi возьмёт его залётные ролики, разберёт твой стиль и предложит 10 идей сценариев под тебя.
      </p>
      <button
        onClick={onStart}
        className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-600 hover:bg-slate-700 text-white text-sm font-medium shadow-glass transition-all active:scale-[0.97]"
      >
        <Telescope className="w-4 h-4" strokeWidth={2.5} />
        Начать разбор
        <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function InputStep({
  orbTitle, subtitle, placeholder, value, setValue, onSubmit, submitting, cta, onBack,
}: {
  orbTitle: string; subtitle: string; placeholder: string;
  value: string; setValue: (v: string) => void;
  onSubmit: () => void; submitting: boolean; cta: string; onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center mt-4">
      <RiriOrb size={92} floating />
      <h2 className="mt-5 text-[22px] md:text-[26px] font-semibold text-[#1a1a18]">{orbTitle}</h2>
      <p className="mt-2 text-[14px] text-slate-500 max-w-lg leading-relaxed">{subtitle}</p>

      <div className="w-full max-w-md mt-7 space-y-3">
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) onSubmit(); }}
          placeholder={placeholder}
          className="w-full px-4 py-3.5 rounded-2xl bg-white border border-slate-200 text-[15px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300/50 focus:border-slate-400 transition-all shadow-[0_1px_6px_rgba(0,0,0,0.04)]"
        />
        <button
          onClick={onSubmit}
          disabled={submitting || !value.trim()}
          className={cn(
            'w-full flex items-center justify-center gap-2 min-h-[48px] rounded-2xl font-medium text-sm transition-all active:scale-[0.98]',
            'bg-slate-600 hover:bg-slate-700 text-white shadow-glass disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" strokeWidth={2.5} />}
          {cta}
        </button>
        <button
          onClick={onBack}
          className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors py-2"
        >
          Назад
        </button>
      </div>
    </div>
  );
}

function PastAnalysesList({
  analyses, loading, onOpen, onRemove,
}: {
  analyses: CompetitorAnalysis[];
  loading: boolean;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  if (loading && analyses.length === 0) {
    return <div className="text-center text-sm text-slate-400 py-10">Загружаю прошлые разборы…</div>;
  }
  if (analyses.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-3 px-1">
        <Clock className="w-4 h-4 text-slate-400" strokeWidth={2.5} />
        <h3 className="text-sm font-medium text-slate-500">Прошлые разборы</h3>
      </div>
      <div className="space-y-2">
        {analyses.map((a) => (
          <GlassCard key={a.id} className="p-4 flex items-center justify-between gap-3">
            <button onClick={() => onOpen(a.id)} className="flex-1 text-left">
              <p className="text-[15px] font-medium text-[#1a1a18]">@{a.competitor_username}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {a.status === 'ready' ? 'готово' : a.status === 'error' ? 'ошибка' : a.status === 'no_virals' ? 'нет залётных' : 'в процессе'}
                {' · '}{new Date(a.created_at).toLocaleDateString('ru-RU')}
              </p>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(a.id); }}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Удалить"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
