'use client';

import { motion } from 'framer-motion';
import { Link, Radar, LayoutGrid, FileText, Users, ArrowRight } from 'lucide-react';
import { cn } from '../utils/cn';

const DISPLAY_NAME_KEY = 'riri-display-name';
const ONBOARDING_DONE_KEY = 'riri-onboarding-done';

export function getDisplayName(): string | null {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY);
  } catch {
    return null;
  }
}

/** Имя для приветствия: из localStorage или telegram_username (если залогинен) */
export function getEffectiveDisplayName(telegramUsername?: string | null): string {
  const stored = getDisplayName();
  if (stored?.trim()) return stored.trim();
  if (telegramUsername?.trim()) return telegramUsername.trim();
  return 'друг';
}

export function setDisplayName(name: string): void {
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name.trim());
    localStorage.setItem(ONBOARDING_DONE_KEY, '1');
  } catch {
    // Ignore storage write errors in restricted environments.
  }
}

export function isOnboardingDone(): boolean {
  try {
    return !!localStorage.getItem(ONBOARDING_DONE_KEY);
  } catch {
    return false;
  }
}

/** Приветствие по времени МСК */
function getGreeting(): string {
  const msk = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', hour: 'numeric' });
  const h = parseInt(msk, 10);
  if (h >= 5 && h < 12) return 'Доброе утро';
  if (h >= 12 && h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

interface DashboardProps {
  onOpenSearch: (tab: 'link' | 'radar') => void;
  onOpenFeed: () => void;
  onOpenTeam: () => void;
  videosCount?: number;
  telegramUsername?: string | null;
}

const GRADIENT_CARDS = [
  {
    id: 'link',
    title: 'Найти ролик по ссылке',
    accent: 'по ссылке',
    subtitle: 'Вставь ссылку на Instagram — получи данные и сохрани',
    icon: Link,
    gradient: 'from-[#8bc3ff] via-[#6cafff] to-[#5b99f6]',
    cta: 'Открыть →',
    onAction: (fn: (t: 'link') => void) => fn('link'),
  },
  {
    id: 'radar',
    title: 'Добавить в радар',
    accent: 'радар',
    subtitle: 'Отслеживай новые видео с профилей',
    icon: Radar,
    gradient: 'from-[#8be7cf] via-[#67d8b9] to-[#4bc7a5]',
    cta: 'Открыть →',
    onAction: (fn: (t: 'radar') => void) => fn('radar'),
  },
];

const WHITE_CARDS = [
  { id: 'feed', title: 'Лента', accent: null, subtitle: 'Твои сохранённые видео по папкам', icon: LayoutGrid, onAction: (fn: () => void) => fn() },
  { id: 'script', title: 'ИИ-сценарист', accent: 'ИИ', subtitle: 'Сценарии по подчерку и примерам', icon: FileText, onAction: (fn: () => void) => fn() },
  { id: 'team', title: 'Команда', accent: null, subtitle: 'Участники проекта и приглашения', icon: Users, onAction: (fn: () => void) => fn() },
];

function renderTitleWithAccent(title: string, accent: string | null) {
  if (!accent || !title.includes(accent)) return title;
  const [before, after] = title.split(accent);
  return (
    <>
      {before}<span className="font-heading italic text-inherit">{accent}</span>{after}
    </>
  );
}

export function Dashboard({ onOpenSearch, onOpenFeed, onOpenTeam, videosCount = 0, telegramUsername }: DashboardProps) {
  const greeting = getGreeting();
  const name = getEffectiveDisplayName(telegramUsername);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-[#fafafa] safe-top safe-bottom safe-left safe-right custom-scrollbar-light">
      {/* Main content card — iOS 26: компактнее на мобильных */}
      <div className="mx-4 md:mx-6 lg:mx-8 py-4 md:py-8 lg:py-10 pb-24 md:pb-16">
        <div className="max-w-5xl mx-auto">
          <div
            className="bg-white rounded-2xl md:rounded-3xl p-4 md:p-8 lg:p-10"
            style={{
              boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            {/* Greeting — friendly headline (phrase lighter, name bolder like reference) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="mb-6 md:mb-10"
            >
              <h1 className="text-2xl md:text-3xl font-bold leading-tight font-heading">
                <span className="text-slate-500">{greeting},</span>{' '}
                <span className="text-slate-800 italic">{name}</span>
              </h1>
              <p className="text-slate-500 text-base md:text-lg font-normal leading-tight mt-1.5 font-heading">
                Что хочешь сделать сегодня?
              </p>
            </motion.div>

            {/* Two main gradient action cards — compact height, layered shadows, visible gradient */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
              {GRADIENT_CARDS.map((card, i) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.05 }}
                  className={cn(
                    'relative rounded-2xl md:rounded-3xl overflow-hidden',
                    'bg-gradient-to-br text-white border border-white/35',
                    card.gradient
                  )}
                  style={{
                    boxShadow:
                      '0 2px 10px rgba(0, 0, 0, 0.08), 0 12px 28px rgba(45, 92, 145, 0.14)',
                  }}
                >
                  {/* Subtle 3D-style decorative shape — размыты чтобы не выделялись */}
                  <div
                    className="absolute -right-8 -bottom-8 w-32 h-32 rounded-full bg-white/12 blur-3xl"
                    aria-hidden
                  />
                  <div
                    className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/7 blur-3xl"
                    aria-hidden
                  />
                  <div className="relative p-4 md:p-6 flex flex-col min-h-[120px] md:min-h-[160px]">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-11 h-11 rounded-xl bg-white/25 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <card.icon className="w-5 h-5" strokeWidth={2.5} />
                      </div>
                    </div>
                    <h3 className="text-base md:text-lg font-bold mb-[0.6em] font-heading">{renderTitleWithAccent(card.title, card.accent)}</h3>
                    <p className="text-white/90 text-sm mb-4 flex-1 leading-snug">
                      {card.subtitle}
                    </p>
                    <button
                      type="button"
                      onClick={() => card.onAction(onOpenSearch)}
                      className="self-start px-4 py-2.5 min-h-[44px] rounded-xl bg-white/30 hover:bg-white/38 active:bg-white/45 border border-white/35 text-white font-semibold text-sm transition-colors touch-manipulation"
                    >
                      {card.cta}
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Three white cards below — iOS 26: 1 col на мобильных */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-5">
              {WHITE_CARDS.map((card, i) => (
                <motion.button
                  key={card.id}
                  type="button"
                  onClick={() => (card.id === 'team' ? onOpenTeam() : onOpenFeed())}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: 0.1 + i * 0.05 }}
                  className="relative bg-white rounded-2xl p-4 md:p-6 text-left border border-slate-100/80 hover:border-slate-200 hover:shadow-lg transition-all duration-200 group overflow-hidden active:scale-[0.99] touch-manipulation"
                  style={{
                    boxShadow:
                      '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.05), 0 2px 6px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* Subtle underlay */}
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent pointer-events-none"
                    aria-hidden
                  />
                  <div className="relative flex flex-col h-full">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <card.icon className="w-5 h-5 text-slate-600" strokeWidth={2.5} />
                      </div>
                      {card.id === 'feed' && videosCount > 0 && (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold tabular-nums">
                          {videosCount}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-sm md:text-base mb-[0.6em] font-heading">
                      {renderTitleWithAccent(card.title, card.accent)}
                    </h3>
                    <p className="text-slate-600 text-xs md:text-sm mb-4 leading-relaxed">
                      {card.subtitle}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-slate-600 font-medium text-sm group-hover:text-slate-800 mt-auto transition-colors">
                      Перейти
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
