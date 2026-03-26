import { useCallback, useRef } from 'react';
import {
  Type, Image as ImageIcon, Trash2, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import type {
  Slide, SlideElement, TextElement, ImageElement, SlideBackground,
} from './types';
import { createDefaultTextElement, createDefaultImageElement } from './types';

// ─── Background picker ──────────────────────────────────────

const PRESET_COLORS = [
  '#ffffff', '#f5f5f4', '#e7e5e4', '#1a1a2e', '#0f172a',
  '#000000', '#fef2f2', '#fdf4ff', '#f0f9ff', '#f0fdf4',
];

const PRESET_GRADIENTS: { from: string; to: string; dir: string }[] = [
  { from: '#fce4ec', to: '#f3e5f5', dir: 'to bottom right' },
  { from: '#e3f2fd', to: '#e8eaf6', dir: 'to bottom right' },
  { from: '#1a1a2e', to: '#16213e', dir: 'to bottom' },
  { from: '#0f172a', to: '#1e293b', dir: 'to bottom right' },
  { from: '#f0fdf4', to: '#ecfdf5', dir: 'to bottom' },
  { from: '#fef9c3', to: '#fef3c7', dir: 'to bottom right' },
];

interface BackgroundPickerProps {
  background: SlideBackground;
  onChange: (bg: SlideBackground) => void;
}

function BackgroundPicker({ background, onChange }: BackgroundPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onChange({ type: 'image', src: reader.result as string });
    };
    reader.readAsDataURL(file);
  }, [onChange]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Фон</p>

      {/* Solid colors */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange({ type: 'solid', color })}
            className={cn(
              'w-7 h-7 rounded-lg border-2 transition-all',
              background.type === 'solid' && background.color === color
                ? 'border-indigo-500 scale-110'
                : 'border-gray-200 hover:border-gray-400',
            )}
            style={{ backgroundColor: color }}
          />
        ))}
        {/* Custom color input */}
        <label className="w-7 h-7 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-gray-400">
          <span className="text-[10px] text-gray-400">+</span>
          <input
            type="color"
            className="sr-only"
            value={background.type === 'solid' ? background.color : '#ffffff'}
            onChange={(e) => onChange({ type: 'solid', color: e.target.value })}
          />
        </label>
      </div>

      {/* Gradients */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_GRADIENTS.map((g, i) => (
          <button
            key={i}
            onClick={() => onChange({ type: 'gradient', from: g.from, to: g.to, direction: g.dir })}
            className={cn(
              'w-7 h-7 rounded-lg border-2 transition-all',
              background.type === 'gradient' && background.from === g.from
                ? 'border-indigo-500 scale-110'
                : 'border-gray-200 hover:border-gray-400',
            )}
            style={{ background: `linear-gradient(${g.dir}, ${g.from}, ${g.to})` }}
          />
        ))}
      </div>

      {/* Image background */}
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 transition-colors"
      >
        <ImageIcon size={12} />
        Загрузить фон
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
    </div>
  );
}

// ─── Text properties ────────────────────────────────────────

interface TextPropsEditorProps {
  el: TextElement;
  onUpdate: (updates: Partial<TextElement>) => void;
}

const FONT_SIZES = [24, 32, 40, 48, 64, 80, 96];

function TextPropsEditor({ el, onUpdate }: TextPropsEditorProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Текст</p>

      {/* Font size */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-12">Размер</span>
        <div className="flex gap-1">
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => onUpdate({ fontSize: size })}
              className={cn(
                'px-1.5 py-0.5 text-[10px] rounded transition-all',
                el.fontSize === size
                  ? 'bg-indigo-100 text-indigo-700 font-bold'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Style buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onUpdate({ fontWeight: el.fontWeight === 700 ? 400 : 700 })}
          className={cn(
            'p-1.5 rounded-lg transition-all',
            el.fontWeight === 700 ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100',
          )}
        >
          <Bold size={14} />
        </button>
        <button
          onClick={() => onUpdate({ fontStyle: el.fontStyle === 'italic' ? 'normal' : 'italic' })}
          className={cn(
            'p-1.5 rounded-lg transition-all',
            el.fontStyle === 'italic' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100',
          )}
        >
          <Italic size={14} />
        </button>

        <div className="w-px h-5 bg-gray-200 mx-1" />

        <button
          onClick={() => onUpdate({ textAlign: 'left' })}
          className={cn('p-1.5 rounded-lg transition-all', el.textAlign === 'left' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100')}
        >
          <AlignLeft size={14} />
        </button>
        <button
          onClick={() => onUpdate({ textAlign: 'center' })}
          className={cn('p-1.5 rounded-lg transition-all', el.textAlign === 'center' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100')}
        >
          <AlignCenter size={14} />
        </button>
        <button
          onClick={() => onUpdate({ textAlign: 'right' })}
          className={cn('p-1.5 rounded-lg transition-all', el.textAlign === 'right' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-400 hover:bg-gray-100')}
        >
          <AlignRight size={14} />
        </button>
      </div>

      {/* Color */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-12">Цвет</span>
        <input
          type="color"
          value={el.color}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="w-7 h-7 rounded-lg border border-gray-200 cursor-pointer"
        />
        <div className="flex gap-1">
          {['#1a1a2e', '#ffffff', '#ef4444', '#3b82f6', '#10b981'].map((c) => (
            <button
              key={c}
              onClick={() => onUpdate({ color: c })}
              className={cn(
                'w-5 h-5 rounded border transition-all',
                el.color === c ? 'border-indigo-500 scale-110' : 'border-gray-200',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Image properties ───────────────────────────────────────

interface ImagePropsEditorProps {
  el: ImageElement;
  onUpdate: (updates: Partial<ImageElement>) => void;
}

function ImagePropsEditor({ el, onUpdate }: ImagePropsEditorProps) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Фото</p>

      {/* Border radius */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16">Скругление</span>
        <input
          type="range"
          min={0}
          max={60}
          value={el.borderRadius}
          onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
          className="flex-1 h-1 accent-indigo-500"
        />
        <span className="text-[10px] text-gray-500 w-8 text-right">{el.borderRadius}px</span>
      </div>

      {/* Shadow */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16">Тень</span>
        <div className="flex gap-1">
          {(['none', 'sm', 'md', 'lg'] as const).map((s) => (
            <button
              key={s}
              onClick={() => onUpdate({ shadow: s })}
              className={cn(
                'px-2 py-0.5 text-[10px] rounded transition-all',
                el.shadow === s
                  ? 'bg-indigo-100 text-indigo-700 font-bold'
                  : 'text-gray-500 hover:bg-gray-100',
              )}
            >
              {s === 'none' ? 'Нет' : s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Object fit */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-400 w-16">Обрезка</span>
        <div className="flex gap-1">
          <button
            onClick={() => onUpdate({ objectFit: 'cover' })}
            className={cn('px-2 py-0.5 text-[10px] rounded transition-all', el.objectFit === 'cover' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-100')}
          >
            Заполнить
          </button>
          <button
            onClick={() => onUpdate({ objectFit: 'contain' })}
            className={cn('px-2 py-0.5 text-[10px] rounded transition-all', el.objectFit === 'contain' ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-100')}
          >
            Вписать
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────

interface PropertiesPanelProps {
  slide: Slide;
  selectedElement: SlideElement | null;
  onUpdateBackground: (bg: SlideBackground) => void;
  onAddElement: (el: SlideElement) => void;
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void;
  onDeleteElement: (id: string) => void;
}

export function PropertiesPanel({
  slide,
  selectedElement,
  onUpdateBackground,
  onAddElement,
  onUpdateElement,
  onDeleteElement,
}: PropertiesPanelProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleAddImage = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      onAddElement(createDefaultImageElement(reader.result as string));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, [onAddElement]);

  return (
    <div className="flex flex-col gap-5">
      {/* Add elements */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Добавить</p>
        <div className="flex gap-2">
          <button
            onClick={() => onAddElement(createDefaultTextElement())}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Type size={14} />
            Текст
          </button>
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <ImageIcon size={14} />
            Фото
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddImage} />
        </div>
      </div>

      {/* Background */}
      <BackgroundPicker background={slide.background} onChange={onUpdateBackground} />

      {/* Selected element properties */}
      {selectedElement && (
        <>
          <div className="border-t border-gray-100 pt-4">
            {selectedElement.type === 'text' && (
              <TextPropsEditor
                el={selectedElement}
                onUpdate={(updates) => onUpdateElement(selectedElement.id, updates)}
              />
            )}
            {selectedElement.type === 'image' && (
              <ImagePropsEditor
                el={selectedElement}
                onUpdate={(updates) => onUpdateElement(selectedElement.id, updates)}
              />
            )}
          </div>

          {/* Delete */}
          <button
            onClick={() => onDeleteElement(selectedElement.id)}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            <Trash2 size={14} />
            Удалить элемент
          </button>
        </>
      )}
    </div>
  );
}
