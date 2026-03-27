import { forwardRef } from 'react';
import type { CarouselTemplate, SlideData, SlideTemplate } from './templates';
import { cn } from '../../utils/cn';

interface SlidePreviewProps {
  template: CarouselTemplate;
  slideTemplate: SlideTemplate;
  slideData: SlideData;
  slideIndex: number;
  totalSlides: number;
  className?: string;
}

export const SlidePreview = forwardRef<HTMLDivElement, SlidePreviewProps>(
  ({ template, slideTemplate, slideData, slideIndex, totalSlides, className }, ref) => {
    const isFirst = slideIndex === 0;
    const isLast = slideIndex === totalSlides - 1;

    return (
      <div
        ref={ref}
        className={cn(
          // Instagram carousel = 1080x1080, we render at fixed aspect ratio
          'aspect-[3/4] w-full select-none overflow-hidden',
          template.bgClass,
          template.textColorClass,
          template.fontClass,
          className,
        )}
        style={{ maxWidth: 540 }}
      >
        <div className="flex h-full w-full flex-col justify-between p-8 sm:p-12">
          {/* Slide number indicator */}
          <div className={cn('text-xs opacity-40 font-medium tracking-wider uppercase')}>
            {slideIndex + 1} / {totalSlides}
          </div>

          {/* Content area */}
          <div className="flex flex-1 flex-col justify-center gap-3 sm:gap-4">
            {slideTemplate.fields.map((field) => {
              const value = slideData[field.id] || '';
              if (!value && field.type !== 'title') return null;

              if (field.type === 'tag') {
                return (
                  <span
                    key={field.id}
                    className={cn(
                      'text-sm sm:text-base font-semibold tracking-wide',
                      template.accentColorClass,
                    )}
                  >
                    {value || field.placeholder}
                  </span>
                );
              }

              if (field.type === 'title') {
                return (
                  <h2
                    key={field.id}
                    className={cn(
                      'font-bold leading-tight whitespace-pre-wrap',
                      isFirst || isLast ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-3xl',
                    )}
                  >
                    {value || (
                      <span className="opacity-25">{field.placeholder}</span>
                    )}
                  </h2>
                );
              }

              if (field.type === 'subtitle') {
                return (
                  <p
                    key={field.id}
                    className={cn(
                      'text-sm sm:text-lg opacity-70 leading-relaxed whitespace-pre-wrap',
                    )}
                  >
                    {value}
                  </p>
                );
              }

              // body
              return (
                <p
                  key={field.id}
                  className="text-sm sm:text-base opacity-80 leading-relaxed whitespace-pre-wrap"
                >
                  {value}
                </p>
              );
            })}
          </div>

          {/* Swipe hint */}
          {!isLast && (
            <div className="flex items-center justify-end gap-1 opacity-30">
              <span className="text-xs">Свайп</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SlidePreview.displayName = 'SlidePreview';
