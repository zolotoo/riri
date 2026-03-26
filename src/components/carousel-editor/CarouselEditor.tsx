import { useState, useRef, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Download, Plus, Trash2,
  ArrowLeft, PenLine, LayoutTemplate,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { SlideCanvas } from './SlideCanvas';
import { PropertiesPanel } from './PropertiesPanel';
import { SlidePreview } from './SlidePreview';
import type { Slide, SlideElement, SlideBackground } from './types';
import { createDefaultSlide } from './types';
import {
  CAROUSEL_TEMPLATES,
  createEmptySlidesData,
  createEmptySlideData,
  type CarouselTemplate,
  type SlideData,
} from './templates';

// ─── Mode selector (home screen) ───────────────────────────

type EditorMode = 'home' | 'create' | 'template';

function HomeScreen({ onMode }: { onMode: (m: EditorMode) => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h2 className="mb-2 text-xl font-bold text-gray-900">ИИ-Карусели</h2>
      <p className="mb-8 text-sm text-gray-500">Создавай карусели для Instagram</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <button
          onClick={() => onMode('create')}
          className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-8 transition-all hover:border-indigo-400 hover:shadow-lg active:scale-[0.98]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 transition-colors">
            <PenLine size={28} />
          </div>
          <span className="text-sm font-semibold text-gray-900">Создать с нуля</span>
          <span className="text-xs text-gray-500 text-center">Пустой холст, добавляй текст и фото</span>
        </button>

        <button
          onClick={() => onMode('template')}
          className="group flex flex-col items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-8 transition-all hover:border-indigo-400 hover:shadow-lg active:scale-[0.98]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
            <LayoutTemplate size={28} />
          </div>
          <span className="text-sm font-semibold text-gray-900">Выбрать шаблон</span>
          <span className="text-xs text-gray-500 text-center">Готовые стили, заполни текст</span>
        </button>
      </div>
    </div>
  );
}

// ─── Free-form editor (create from scratch) ─────────────────

function FreeEditor({ onBack }: { onBack: () => void }) {
  const [slides, setSlides] = useState<Slide[]>([createDefaultSlide()]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const slide = slides[currentIdx];

  const updateSlide = useCallback((idx: number, updater: (s: Slide) => Slide) => {
    setSlides((prev) => prev.map((s, i) => (i === idx ? updater(s) : s)));
  }, []);

  const onUpdateBackground = useCallback((bg: SlideBackground) => {
    updateSlide(currentIdx, (s) => ({ ...s, background: bg }));
  }, [currentIdx, updateSlide]);

  const onAddElement = useCallback((el: SlideElement) => {
    updateSlide(currentIdx, (s) => ({ ...s, elements: [...s.elements, el] }));
    setSelectedId(el.id);
  }, [currentIdx, updateSlide]);

  const onUpdateElement = useCallback((id: string, updates: Partial<SlideElement>) => {
    updateSlide(currentIdx, (s) => ({
      ...s,
      elements: s.elements.map((el) =>
        el.id === id ? { ...el, ...updates } as SlideElement : el
      ),
    }));
  }, [currentIdx, updateSlide]);

  const onUpdateTextContent = useCallback((id: string, text: string) => {
    updateSlide(currentIdx, (s) => ({
      ...s,
      elements: s.elements.map((el) =>
        el.id === id && el.type === 'text' ? { ...el, text } : el
      ),
    }));
  }, [currentIdx, updateSlide]);

  const onDeleteElement = useCallback((id: string) => {
    updateSlide(currentIdx, (s) => ({
      ...s,
      elements: s.elements.filter((el) => el.id !== id),
    }));
    setSelectedId(null);
  }, [currentIdx, updateSlide]);

  const addSlide = useCallback(() => {
    if (slides.length >= 10) return;
    const newSlide = createDefaultSlide();
    // Copy background from current slide
    newSlide.background = { ...slide.background };
    setSlides((prev) => [...prev, newSlide]);
    setCurrentIdx(slides.length);
    setSelectedId(null);
  }, [slides.length, slide.background]);

  const removeSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setSlides((prev) => prev.filter((_, i) => i !== currentIdx));
    setCurrentIdx((prev) => Math.min(prev, slides.length - 2));
    setSelectedId(null);
  }, [currentIdx, slides.length]);

  const exportSlides = useCallback(async () => {
    if (!canvasRef.current) return;
    setExporting(true);
    setSelectedId(null);
    setEditingTextId(null);

    try {
      for (let i = 0; i < slides.length; i++) {
        setCurrentIdx(i);
        await new Promise((r) => setTimeout(r, 150));

        const dataUrl = await toPng(canvasRef.current, {
          width: 1080,
          height: 1080,
          pixelRatio: 2,
          style: { width: '1080px', height: '1080px', maxWidth: '1080px' },
        });

        const link = document.createElement('a');
        link.download = `slide-${i + 1}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [slides]);

  const selectedElement = slide.elements.find((el) => el.id === selectedId) || null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {slides.length} слайд{slides.length > 1 ? (slides.length < 5 ? 'а' : 'ов') : ''}
          </span>
          <button
            onClick={exportSlides}
            disabled={exporting}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all',
              exporting ? 'bg-gray-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95',
            )}
          >
            <Download size={16} />
            {exporting ? 'Экспорт...' : 'Скачать PNG'}
          </button>
        </div>
      </div>

      {/* Main: canvas + panel */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col items-center gap-4">
          {/* Canvas */}
          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 shadow-lg">
            <SlideCanvas
              ref={canvasRef}
              slide={slide}
              selectedId={selectedId}
              editingTextId={editingTextId}
              onSelectElement={setSelectedId}
              onStartEditText={setEditingTextId}
              onStopEditText={() => setEditingTextId(null)}
              onUpdateElement={onUpdateElement}
              onUpdateTextContent={onUpdateTextContent}
            />
          </div>

          {/* Slide strip */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))}
              disabled={currentIdx === 0}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex items-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => { setCurrentIdx(i); setSelectedId(null); }}
                  className={cn(
                    'h-2 rounded-full transition-all duration-200',
                    i === currentIdx ? 'w-6 bg-indigo-500' : 'w-2 bg-gray-300 hover:bg-gray-400',
                  )}
                />
              ))}
            </div>

            <button
              onClick={() => setCurrentIdx((p) => Math.min(slides.length - 1, p + 1))}
              disabled={currentIdx === slides.length - 1}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* Add / remove slide */}
          <div className="flex gap-2">
            {slides.length < 10 && (
              <button
                onClick={addSlide}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors"
              >
                <Plus size={14} />
                Слайд
              </button>
            )}
            {slides.length > 1 && (
              <button
                onClick={removeSlide}
                className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 size={14} />
                Удалить
              </button>
            )}
          </div>
        </div>

        {/* Properties panel */}
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <PropertiesPanel
            slide={slide}
            selectedElement={selectedElement}
            onUpdateBackground={onUpdateBackground}
            onAddElement={onAddElement}
            onUpdateElement={onUpdateElement}
            onDeleteElement={onDeleteElement}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Template-based editor (kept from MVP) ──────────────────

function TemplateEditor({ onBack }: { onBack: () => void }) {
  const [template, setTemplate] = useState<CarouselTemplate | null>(null);
  const [slidesData, setSlidesData] = useState<SlideData[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [exporting, setExporting] = useState(false);
  const slideRef = useRef<HTMLDivElement>(null);

  const handleSelectTemplate = useCallback((t: CarouselTemplate) => {
    setTemplate(t);
    setSlidesData(createEmptySlidesData(t));
    setCurrentSlide(0);
  }, []);

  const updateField = useCallback((slideIdx: number, fieldId: string, value: string) => {
    setSlidesData((prev) => {
      const next = [...prev];
      next[slideIdx] = { ...next[slideIdx], [fieldId]: value };
      return next;
    });
  }, []);

  const addSlide = useCallback(() => {
    if (!template) return;
    if (slidesData.length >= template.maxSlides) return;
    const standardSlide = template.slides[1] || template.slides[0];
    setSlidesData((prev) => {
      const next = [...prev];
      next.splice(next.length - 1, 0, createEmptySlideData(standardSlide));
      return next;
    });
    setCurrentSlide(slidesData.length - 1);
  }, [template, slidesData.length]);

  const removeSlide = useCallback((idx: number) => {
    if (slidesData.length <= 2) return;
    setSlidesData((prev) => prev.filter((_, i) => i !== idx));
    setCurrentSlide((prev) => Math.min(prev, slidesData.length - 2));
  }, [slidesData.length]);

  const exportSlides = useCallback(async () => {
    if (!slideRef.current || !template) return;
    setExporting(true);
    try {
      for (let i = 0; i < slidesData.length; i++) {
        setCurrentSlide(i);
        await new Promise((r) => setTimeout(r, 100));
        const dataUrl = await toPng(slideRef.current, {
          width: 1080, height: 1080, pixelRatio: 2,
          style: { width: '1080px', height: '1080px', maxWidth: '1080px' },
        });
        const link = document.createElement('a');
        link.download = `slide-${i + 1}.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  }, [slidesData, template]);

  // Template picker
  if (!template) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <h2 className="mb-6 text-xl font-bold text-gray-900">Выбери шаблон</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {CAROUSEL_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelectTemplate(t)}
              className={cn(
                'group relative aspect-square rounded-2xl overflow-hidden border-2 border-transparent',
                'hover:border-indigo-400 transition-all duration-200',
                t.bgClass,
              )}
            >
              <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
                <span className="text-3xl">{t.previewEmoji}</span>
                <span className={cn('text-sm font-semibold', t.textColorClass)}>{t.name}</span>
                <span className={cn('text-xs opacity-60', t.textColorClass)}>{t.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const slideTemplate = currentSlide < template.slides.length
    ? template.slides[currentSlide]
    : template.slides[1] || template.slides[0];
  const slideData = slidesData[currentSlide] || {};

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setTemplate(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft size={16} />
          Назад к шаблонам
        </button>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{template.previewEmoji} {template.name}</span>
          <button
            onClick={exportSlides}
            disabled={exporting}
            className={cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all',
              exporting ? 'bg-gray-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95',
            )}
          >
            <Download size={16} />
            {exporting ? 'Экспорт...' : 'Скачать PNG'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col items-center gap-4">
          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 shadow-lg">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
              >
                <SlidePreview
                  ref={slideRef}
                  template={template}
                  slideTemplate={slideTemplate}
                  slideData={slideData}
                  slideIndex={currentSlide}
                  totalSlides={slidesData.length}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentSlide((p) => Math.max(0, p - 1))}
              disabled={currentSlide === 0}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex items-center gap-1.5">
              {slidesData.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={cn(
                    'h-2 rounded-full transition-all duration-200',
                    i === currentSlide ? 'w-6 bg-indigo-500' : 'w-2 bg-gray-300 hover:bg-gray-400',
                  )}
                />
              ))}
            </div>
            <button
              onClick={() => setCurrentSlide((p) => Math.min(slidesData.length - 1, p + 1))}
              disabled={currentSlide === slidesData.length - 1}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">
              Слайд {currentSlide + 1} из {slidesData.length}
              {currentSlide === 0 && ' — Обложка'}
              {currentSlide === slidesData.length - 1 && ' — Финал'}
            </h3>
            <div className="flex items-center gap-2">
              {currentSlide > 0 && currentSlide < slidesData.length - 1 && (
                <button
                  onClick={() => removeSlide(currentSlide)}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                  Удалить
                </button>
              )}
              {slidesData.length < template.maxSlides && (
                <button
                  onClick={addSlide}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-indigo-600 hover:bg-indigo-50 transition-colors"
                >
                  <Plus size={14} />
                  Слайд
                </button>
              )}
            </div>
          </div>

          {slideTemplate.fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {field.label}
              </label>
              {field.type === 'body' ? (
                <textarea
                  value={slideData[field.id] || ''}
                  onChange={(e) => updateField(currentSlide, field.id, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  rows={4}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none transition-all"
                />
              ) : (
                <input
                  type="text"
                  value={slideData[field.id] || ''}
                  onChange={(e) => updateField(currentSlide, field.id, e.target.value)}
                  placeholder={field.placeholder}
                  maxLength={field.maxLength}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                />
              )}
              {field.maxLength && (
                <span className="text-right text-[10px] text-gray-400">
                  {(slideData[field.id] || '').length}/{field.maxLength}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────

export function CarouselEditor() {
  const [mode, setMode] = useState<EditorMode>('home');

  return (
    <div className="h-full overflow-y-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.15 }}
        >
          {mode === 'home' && <HomeScreen onMode={setMode} />}
          {mode === 'create' && <FreeEditor onBack={() => setMode('home')} />}
          {mode === 'template' && <TemplateEditor onBack={() => setMode('home')} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
