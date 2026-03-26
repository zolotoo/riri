import { useRef, useState, useCallback, useEffect, forwardRef } from 'react';
import { cn } from '../../utils/cn';
import type {
  Slide, SlideElement, TextElement, ImageElement,
} from './types';
import { SHADOW_MAP } from './types';

// ─── Draggable wrapper ──────────────────────────────────────

interface DraggableProps {
  element: SlideElement;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onDoubleClick?: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

function Draggable({ element, selected, onSelect, onMove, onDoubleClick, containerRef, children }: DraggableProps) {
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    dragging.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    // offset from element's top-left corner
    const elX = (element.position.x / 100) * rect.width;
    const elY = (element.position.y / 100) * rect.height;
    offset.current = { x: e.clientX - rect.left - elX, y: e.clientY - rect.top - elY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [element.position, onSelect, containerRef]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left - offset.current.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - offset.current.y) / rect.height) * 100;
    onMove(Math.max(0, Math.min(95, x)), Math.max(0, Math.min(95, y)));
  }, [onMove, containerRef]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      className={cn(
        'absolute cursor-move touch-none',
        selected && 'ring-2 ring-indigo-500 ring-offset-1',
      )}
      style={{
        left: `${element.position.x}%`,
        top: `${element.position.y}%`,
        width: element.type === 'text'
          ? `${(element as TextElement).width}%`
          : `${(element as ImageElement).size.width}%`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(); }}
    >
      {children}
    </div>
  );
}

// ─── Text renderer ──────────────────────────────────────────

interface TextRendererProps {
  el: TextElement;
  editing: boolean;
  onTextChange: (text: string) => void;
  onBlur: () => void;
  scale: number;
}

function TextRenderer({ el, editing, onTextChange, onBlur, scale }: TextRendererProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      // Place cursor at end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  return (
    <div
      ref={ref}
      contentEditable={editing}
      suppressContentEditableWarning
      className="outline-none whitespace-pre-wrap break-words"
      style={{
        fontSize: el.fontSize * scale,
        fontWeight: el.fontWeight,
        color: el.color,
        fontStyle: el.fontStyle,
        textAlign: el.textAlign,
        lineHeight: 1.2,
        minHeight: el.fontSize * scale,
      }}
      onBlur={() => {
        if (ref.current) onTextChange(ref.current.innerText);
        onBlur();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
      }}
    >
      {el.text}
    </div>
  );
}

// ─── Image renderer ─────────────────────────────────────────

interface ImageRendererProps {
  el: ImageElement;
  scale: number;
}

function ImageRenderer({ el, scale }: ImageRendererProps) {
  return (
    <div
      style={{
        width: '100%',
        paddingBottom: `${(el.size.height / el.size.width) * 100}%`,
        borderRadius: el.borderRadius * scale,
        boxShadow: SHADOW_MAP[el.shadow],
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <img
        src={el.src}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: el.objectFit,
        }}
      />
    </div>
  );
}

// ─── Resize handle for images ───────────────────────────────

interface ResizeHandleProps {
  element: ImageElement;
  onResize: (w: number, h: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ResizeHandle({ element, onResize, containerRef }: ResizeHandleProps) {
  const dragging = useRef(false);
  const startSize = useRef({ w: 0, h: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    startSize.current = { w: element.size.width, h: element.size.height };
    startPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [element.size]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - startPos.current.x) / rect.width) * 100;
    const dy = ((e.clientY - startPos.current.y) / rect.height) * 100;
    const w = Math.max(5, Math.min(90, startSize.current.w + dx));
    const h = Math.max(5, Math.min(90, startSize.current.h + dy));
    onResize(w, h);
  }, [onResize, containerRef]);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-indigo-500 rounded-full cursor-se-resize touch-none z-10"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
}

// ─── Main SlideCanvas ───────────────────────────────────────

interface SlideCanvasProps {
  slide: Slide;
  selectedId: string | null;
  editingTextId: string | null;
  onSelectElement: (id: string | null) => void;
  onStartEditText: (id: string) => void;
  onStopEditText: () => void;
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void;
  onUpdateTextContent: (id: string, text: string) => void;
  className?: string;
}

export const SlideCanvas = forwardRef<HTMLDivElement, SlideCanvasProps>(
  ({ slide, selectedId, editingTextId, onSelectElement, onStartEditText, onStopEditText, onUpdateElement, onUpdateTextContent, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(540);

    // Track container size for scaling
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          setContainerWidth(entry.contentRect.width);
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    // Scale factor: canvas renders at some width, but represents 1080px
    const scale = containerWidth / 1080;

    // Background style
    const bgStyle: React.CSSProperties = {};
    if (slide.background.type === 'solid') {
      bgStyle.backgroundColor = slide.background.color;
    } else if (slide.background.type === 'gradient') {
      bgStyle.background = `linear-gradient(${slide.background.direction}, ${slide.background.from}, ${slide.background.to})`;
    } else if (slide.background.type === 'image') {
      bgStyle.backgroundImage = `url(${slide.background.src})`;
      bgStyle.backgroundSize = 'cover';
      bgStyle.backgroundPosition = 'center';
    }

    return (
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn('aspect-square w-full relative overflow-hidden select-none', className)}
        style={{ ...bgStyle, maxWidth: 540 }}
        onClick={() => onSelectElement(null)}
      >
        {slide.elements.map((el) => (
          <Draggable
            key={el.id}
            element={el}
            selected={selectedId === el.id}
            onSelect={() => onSelectElement(el.id)}
            onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
            onDoubleClick={() => el.type === 'text' && onStartEditText(el.id)}
            containerRef={containerRef}
          >
            {el.type === 'text' && (
              <TextRenderer
                el={el}
                editing={editingTextId === el.id}
                onTextChange={(text) => onUpdateTextContent(el.id, text)}
                onBlur={onStopEditText}
                scale={scale}
              />
            )}
            {el.type === 'image' && (
              <>
                <ImageRenderer el={el} scale={scale} />
                {selectedId === el.id && (
                  <ResizeHandle
                    element={el}
                    onResize={(w, h) => onUpdateElement(el.id, { size: { width: w, height: h } } as Partial<ImageElement>)}
                    containerRef={containerRef}
                  />
                )}
              </>
            )}
          </Draggable>
        ))}
      </div>
    );
  }
);

SlideCanvas.displayName = 'SlideCanvas';
