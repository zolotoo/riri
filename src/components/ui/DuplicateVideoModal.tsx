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
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: 'rgba(10,12,20,0.38)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onResolve('cancel')}
        >
          {/* iOS 26-style backdrop blur layer */}
          <div className="absolute inset-0 backdrop-blur-[18px]" />

          <motion.div
            className="relative w-full sm:max-w-[400px] overflow-hidden"
            style={{
              borderRadius: '2rem 2rem 0 0',
              background: 'rgba(255,255,255,0.97)',
              boxShadow: '0 -2px 0 rgba(255,255,255,0.8) inset, 0 32px 96px rgba(10,12,20,0.28), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}
            // On sm+ screens use centered card shape
            // Using a wrapper trick: apply rounded on sm
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.9 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile feel) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-300/80" />
            </div>

            {/* Icon + close */}
            <div className="relative flex items-start px-6 pt-4 pb-0">
              <div
                className="flex h-[60px] w-[60px] flex-shrink-0 items-center justify-center rounded-[18px] text-white"
                style={{
                  background: 'linear-gradient(145deg, #fb923c 0%, #f97316 45%, #ef4444 100%)',
                  boxShadow: '0 8px 24px rgba(249,115,22,0.35), inset 0 1px 0 rgba(255,255,255,0.28)',
                }}
              >
                <RefreshCw className="h-6 w-6" strokeWidth={2} />
              </div>

              <button
                type="button"
                onClick={() => onResolve('cancel')}
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:text-slate-600"
                style={{
                  background: 'rgba(120,120,128,0.12)',
                }}
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 pt-4 pb-5">
              <h3 className="text-[19px] font-semibold leading-snug text-slate-900">
                У нас уже есть это видео {scopeText}.
              </h3>
              <p className="mt-2 text-[14px] leading-[1.55] text-slate-500">
                Можно обновить текущую запись или добавить копию. В обоих случаях мы подтянем свежие данные у уже сохраненного видео.
              </p>

              {/* Video preview card */}
              <div
                className="mt-4 rounded-2xl px-4 py-3"
                style={{
                  background: 'rgba(120,120,128,0.08)',
                  border: '0.5px solid rgba(0,0,0,0.07)',
                }}
              >
                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-slate-700">
                  {prompt.title || 'Видео из Instagram'}
                </p>
              </div>

              {prompt.ownerUsername ? (
                <div
                  className="mt-2.5 inline-flex items-center rounded-full px-3 py-1 text-[12px] font-medium text-slate-500"
                  style={{
                    background: 'rgba(120,120,128,0.08)',
                    border: '0.5px solid rgba(0,0,0,0.07)',
                  }}
                >
                  @{prompt.ownerUsername}
                </div>
              ) : null}
            </div>

            {/* Hairline divider */}
            <div className="mx-6 h-px bg-slate-900/[0.06]" />

            {/* Action buttons */}
            <div className="grid gap-2.5 px-5 py-5">
              <button
                type="button"
                onClick={() => onResolve('update')}
                className="flex min-h-[54px] items-center justify-center gap-2.5 rounded-[18px] text-[15px] font-semibold text-white transition-all active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)',
                  boxShadow: '0 2px 12px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                }}
              >
                <RefreshCw className="h-[17px] w-[17px]" />
                Обновить существующее
              </button>

              <button
                type="button"
                onClick={() => onResolve('copy')}
                className="flex min-h-[54px] items-center justify-center gap-2.5 rounded-[18px] text-[15px] font-semibold text-slate-700 transition-all active:scale-[0.98]"
                style={{
                  background: 'rgba(120,120,128,0.1)',
                  border: '0.5px solid rgba(0,0,0,0.08)',
                }}
              >
                <CopyPlus className="h-[17px] w-[17px]" />
                Добавить копию
              </button>
            </div>

            {/* Safe area bottom spacer (mobile) */}
            <div className="h-2 sm:hidden" />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
