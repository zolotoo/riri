import { AnimatePresence, motion } from 'framer-motion';
import { CopyPlus, RefreshCw, X } from 'lucide-react';
import type { DuplicateVideoChoice, DuplicateVideoPromptState } from '../../hooks/useInboxVideos';

interface DuplicateVideoModalProps {
  prompt: DuplicateVideoPromptState | null;
  onResolve: (choice: DuplicateVideoChoice) => void;
}

export function DuplicateVideoModal({ prompt, onResolve }: DuplicateVideoModalProps) {
  const isOpen = Boolean(prompt?.isOpen);
  const scopeText = prompt?.scopeLabel === 'project' ? 'в проекте' : 'в приложении';

  return (
    <AnimatePresence>
      {isOpen && prompt ? (
        <motion.div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onResolve('cancel')}
        >
          <motion.div
            className="w-full max-w-md rounded-[2rem] border border-white/60 bg-white/88 backdrop-blur-2xl shadow-[0_24px_80px_rgba(15,23,42,0.25)] overflow-hidden"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative p-6 pb-4">
              <button
                type="button"
                onClick={() => onResolve('cancel')}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/60 bg-white/80 text-slate-500 transition-colors hover:bg-white hover:text-slate-700"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 text-white shadow-lg shadow-orange-500/25">
                <RefreshCw className="h-6 w-6" />
              </div>

              <h3 className="pr-12 text-xl font-semibold text-slate-900">
                У нас уже есть это видео {scopeText}.
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Можно обновить текущую запись или добавить копию. В обоих случаях мы подтянем свежие данные у уже сохраненного видео.
              </p>

              <div className="mt-4 rounded-[1.25rem] border border-white/60 bg-white/82 px-4 py-3 shadow-sm">
                <p className="line-clamp-2 text-sm font-medium text-slate-800">
                  {prompt.title || 'Видео из Instagram'}
                </p>
              </div>

              {prompt.ownerUsername ? (
                <div className="mt-3 inline-flex items-center rounded-full border border-white/60 bg-white/82 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
                  @{prompt.ownerUsername}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 bg-slate-50/55 px-6 pb-6 pt-2">
              <button
                type="button"
                onClick={() => onResolve('update')}
                className="flex min-h-[56px] items-center justify-center gap-2 rounded-[1.25rem] bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-slate-800 active:scale-[0.99]"
              >
                <RefreshCw className="h-4 w-4" />
                Обновить существующее
              </button>

              <button
                type="button"
                onClick={() => onResolve('copy')}
                className="flex min-h-[56px] items-center justify-center gap-2 rounded-[1.25rem] border border-white/70 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition-all hover:bg-slate-50 active:scale-[0.99]"
              >
                <CopyPlus className="h-4 w-4" />
                Добавить копию
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
