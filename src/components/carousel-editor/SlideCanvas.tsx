import { useRef, useState, useCallback, useEffect, forwardRef } from 'react';
import { cn } from '../../utils/cn';
import type { Slide, SlideElement, TextElement, ImageElement, ShapeElement, PlaceholderElement } from './types';
import { SHADOW_MAP } from './types';

// ─── Shared drag logic ───────────────────────────────────────

function useDrag(
  getPosition: () => { x: number; y: number },
  onMove: (x: number, y: number) => void,
  containerRef: React.RefObject<HTMLDivElement | null>,
) {
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;
    hasMoved.current = false;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = getPosition();
    const elX = (pos.x / 100) * rect.width;
    const elY = (pos.y / 100) * rect.height;
    offset.current = { x: e.clientX - rect.left - elX, y: e.clientY - rect.top - elY };
    startPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getPosition, containerRef]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 3 || dy > 3) hasMoved.current = true;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left - offset.current.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - offset.current.y) / rect.height) * 100;
    onMove(Math.max(0, Math.min(94, x)), Math.max(0, Math.min(94, y)));
  }, [onMove, containerRef]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { onPointerDown, onPointerMove, onPointerUp, hasMoved };
}

// ─── Text element ────────────────────────────────────────────

interface TextElementProps {
  el: TextElement;
  selected: boolean;
  editing: boolean;
  scale: number;
  onSelect: () => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onTextChange: (text: string) => void;
  onMove: (x: number, y: number) => void;
  onWidthChange: (w: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function TextElementView({
  el, selected, editing, scale,
  onSelect, onStartEdit, onStopEdit, onTextChange, onMove, onWidthChange, containerRef,
}: TextElementProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const drag = useDrag(() => el.position, onMove, containerRef);

  // Width resize via bottom-right handle
  const resizing = useRef(false);
  const resizeStart = useRef({ x: 0, w: 0 });

  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizing.current = true;
    resizeStart.current = { x: e.clientX, w: el.width };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.width]);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeStart.current.x) / rect.width) * 100;
    onWidthChange(Math.max(10, Math.min(98, resizeStart.current.w + dx)));
  }, [onWidthChange, containerRef]);

  const onResizeUp = useCallback(() => { resizing.current = false; }, []);

  // Focus + cursor at end when editing starts
  useEffect(() => {
    if (editing && textRef.current) {
      textRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(textRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) {
      onSelect();
      onStartEdit();
    }
  }, [onSelect, onStartEdit, drag.hasMoved]);

  const HANDLE = 14; // handle size px

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.width}%`,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: 'top left',
        zIndex: el.zIndex ?? 1,
      }}
    >
      {/* Selection outline */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Inline format toolbar — shown when editing */}
      {editing && (
        <div
          className="absolute -top-9 left-0 flex items-center gap-0.5 px-1.5 py-1 rounded-xl z-40 select-none touch-none"
          style={{ background: 'rgba(30,30,35,0.92)', backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            className="px-2 py-0.5 text-white rounded-lg text-[12px] font-bold hover:bg-white/20 transition-colors"
            onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}
          >B</button>
          <button
            className="px-2 py-0.5 text-white rounded-lg text-[12px] italic hover:bg-white/20 transition-colors"
            onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}
          >I</button>
          <div className="w-px h-3 bg-white/20 mx-0.5" />
          <button
            className="px-1.5 py-0.5 text-white rounded-lg text-[10px] hover:bg-white/20 transition-colors"
            onMouseDown={(e) => { e.preventDefault(); document.execCommand('removeFormat'); }}
          >✕</button>
        </div>
      )}

      {/* Text content */}
      <div
        ref={textRef}
        contentEditable={editing}
        suppressContentEditableWarning
        className="outline-none whitespace-pre-wrap break-words"
        style={{
          fontSize: el.fontSize * scale,
          fontWeight: el.fontWeight,
          color: el.color,
          fontStyle: el.fontStyle,
          textAlign: el.textAlign,
          fontFamily: el.fontFamily ?? 'Inter, sans-serif',
          lineHeight: el.lineHeight ?? 1.3,
          letterSpacing: el.letterSpacing ? `${el.letterSpacing}em` : undefined,
          minHeight: el.fontSize * scale,
          userSelect: editing ? 'text' : 'none',
          cursor: editing ? 'text' : 'default',
        }}
        dangerouslySetInnerHTML={editing ? undefined : { __html: el.text }}
        onClick={handleClick}
        onBlur={() => {
          if (textRef.current) onTextChange(textRef.current.innerHTML);
          onStopEdit();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') (e.target as HTMLElement).blur();
        }}
      />

      {/* Corner handles — visible when selected and not editing */}
      {selected && !editing && (
        <>
          {/* Top-left — move handle */}
          <div
            className="absolute touch-none"
            style={{
              top: -HANDLE / 2, left: -HANDLE / 2,
              width: HANDLE, height: HANDLE,
              borderRadius: '50%',
              background: 'rgba(99,102,241,1)',
              border: '2px solid white',
              cursor: 'grab',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              zIndex: 30,
            }}
            onPointerDown={drag.onPointerDown}
            onPointerMove={drag.onPointerMove}
            onPointerUp={drag.onPointerUp}
          />
          {/* Bottom-right — width resize handle */}
          <div
            className="absolute touch-none"
            style={{
              bottom: -HANDLE / 2, right: -HANDLE / 2,
              width: HANDLE, height: HANDLE,
              borderRadius: '50%',
              background: 'rgba(99,102,241,1)',
              border: '2px solid white',
              cursor: 'ew-resize',
              boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
              zIndex: 30,
            }}
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
        </>
      )}
    </div>
  );
}

// ─── Image element ───────────────────────────────────────────

interface ImageElementProps {
  el: ImageElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ImageElementView({ el, selected, scale, onSelect, onMove, onResize, containerRef }: ImageElementProps) {
  const drag = useDrag(() => el.position, onMove, containerRef);
  const [activeDrag, setActiveDrag] = useState(false);

  // Corner resize (both dimensions)
  const resizeDragging = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeDragging.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: el.size.width, h: el.size.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - resizeStart.current.y) / rect.height) * 100;
    onResize(
      Math.max(8, Math.min(90, resizeStart.current.w + dx)),
      Math.max(8, Math.min(90, resizeStart.current.h + dy)),
    );
  }, [onResize, containerRef]);

  const handleResizeUp = useCallback(() => { resizeDragging.current = false; }, []);

  // Right-edge resize (width only)
  const resizeWDragging = useRef(false);
  const resizeWStart = useRef({ x: 0, w: 0 });

  const handleResizeWDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    resizeWDragging.current = true;
    resizeWStart.current = { x: e.clientX, w: el.size.width };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size.width]);

  const handleResizeWMove = useCallback((e: React.PointerEvent) => {
    if (!resizeWDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeWStart.current.x) / rect.width) * 100;
    onResize(Math.max(8, Math.min(90, resizeWStart.current.w + dx)), el.size.height);
  }, [onResize, containerRef, el.size.height]);

  const handleResizeWUp = useCallback(() => { resizeWDragging.current = false; }, []);

  // Bottom-edge resize (height only)
  const resizeHDragging = useRef(false);
  const resizeHStart = useRef({ y: 0, h: 0 });

  const handleResizeHDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    resizeHDragging.current = true;
    resizeHStart.current = { y: e.clientY, h: el.size.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size.height]);

  const handleResizeHMove = useCallback((e: React.PointerEvent) => {
    if (!resizeHDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dy = ((e.clientY - resizeHStart.current.y) / rect.height) * 100;
    onResize(el.size.width, Math.max(8, Math.min(90, resizeHStart.current.h + dy)));
  }, [onResize, containerRef, el.size.width]);

  const handleResizeHUp = useCallback(() => { resizeHDragging.current = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
  }, [onSelect]);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: activeDrag ? 'grabbing' : 'grab',
        zIndex: el.zIndex ?? 1,
      }}
      onPointerDown={(e) => { onSelect(); setActiveDrag(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setActiveDrag(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
      {/* Image */}
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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: el.objectFit }}
        />
      </div>

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Right-edge handle (width) */}
      {selected && (
        <div
          className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-7 rounded-full bg-indigo-400 touch-none z-10 border-2 border-white"
          style={{ cursor: 'e-resize' }}
          onPointerDown={handleResizeWDown}
          onPointerMove={handleResizeWMove}
          onPointerUp={handleResizeWUp}
        />
      )}

      {/* Bottom-edge handle (height) */}
      {selected && (
        <div
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-3 rounded-full bg-indigo-400 touch-none z-10 border-2 border-white"
          style={{ cursor: 's-resize' }}
          onPointerDown={handleResizeHDown}
          onPointerMove={handleResizeHMove}
          onPointerUp={handleResizeHUp}
        />
      )}

      {/* Corner handle (both) */}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 touch-none z-10 border-2 border-white"
          style={{ cursor: 'se-resize' }}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      )}
    </div>
  );
}

// ─── Shape element ───────────────────────────────────────────

interface ShapeElementProps {
  el: ShapeElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function ShapeElementView({ el, selected, scale, onSelect, onMove, onResize, containerRef }: ShapeElementProps) {
  const drag = useDrag(() => el.position, onMove, containerRef);
  const [activeDrag, setActiveDrag] = useState(false);

  const resizeDragging = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeDragging.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: el.size.width, h: el.size.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - resizeStart.current.y) / rect.height) * 100;
    onResize(
      Math.max(4, Math.min(90, resizeStart.current.w + dx)),
      Math.max(4, Math.min(90, resizeStart.current.h + dy)),
    );
  }, [onResize, containerRef]);

  const handleResizeUp = useCallback(() => { resizeDragging.current = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) onSelect();
  }, [onSelect, drag.hasMoved]);

  const shapeStyle: React.CSSProperties = {
    width: '100%',
    opacity: el.opacity,
  };

  if (el.shapeType === 'line') {
    shapeStyle.height = Math.max(el.strokeWidth * scale, 1);
    shapeStyle.background = el.stroke;
    shapeStyle.borderRadius = 2;
  } else if (el.shapeType === 'arrow') {
    shapeStyle.height = Math.max(el.strokeWidth * scale, 2);
    shapeStyle.background = el.stroke;
    shapeStyle.borderRadius = 2;
    shapeStyle.position = 'relative';
  } else {
    shapeStyle.paddingBottom = `${(el.size.height / el.size.width) * 100}%`;
    shapeStyle.position = 'relative';
    shapeStyle.background = el.fill;
    shapeStyle.border = `${el.strokeWidth * scale}px solid ${el.stroke}`;
    shapeStyle.borderRadius = el.shapeType === 'circle' ? '50%' : el.borderRadius * scale;
  }

  const arrowHeadSize = Math.max(el.strokeWidth * scale * 3, 8);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: activeDrag ? 'grabbing' : 'grab',
        zIndex: el.zIndex ?? 1,
      }}
      onPointerDown={(e) => { onSelect(); setActiveDrag(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setActiveDrag(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
      {el.shapeType === 'arrow' ? (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', opacity: el.opacity }}>
          <div style={{ flex: 1, height: Math.max(el.strokeWidth * scale, 1), background: el.stroke, borderRadius: 2 }} />
          <div style={{
            width: 0, height: 0,
            borderTop: `${arrowHeadSize / 2}px solid transparent`,
            borderBottom: `${arrowHeadSize / 2}px solid transparent`,
            borderLeft: `${arrowHeadSize}px solid ${el.stroke}`,
          }} />
        </div>
      ) : (
        <div style={shapeStyle} />
      )}

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Resize handle */}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 touch-none z-10 border-2 border-white"
          style={{ cursor: 'se-resize' }}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      )}
    </div>
  );
}

// ─── Placeholder element ─────────────────────────────────────

interface PlaceholderElementProps {
  el: PlaceholderElement;
  selected: boolean;
  scale: number;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  onReplace: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function PlaceholderElementView({ el, selected, scale, onSelect, onMove, onResize, onReplace, containerRef }: PlaceholderElementProps) {
  const drag = useDrag(() => el.position, onMove, containerRef);
  const [activeDrag, setActiveDrag] = useState(false);

  const resizeDragging = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleResizeDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeDragging.current = true;
    resizeStart.current = { x: e.clientX, y: e.clientY, w: el.size.width, h: el.size.height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [el.size]);

  const handleResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizeDragging.current) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - resizeStart.current.x) / rect.width) * 100;
    const dy = ((e.clientY - resizeStart.current.y) / rect.height) * 100;
    onResize(
      Math.max(8, Math.min(90, resizeStart.current.w + dx)),
      Math.max(8, Math.min(90, resizeStart.current.h + dy)),
    );
  }, [onResize, containerRef]);

  const handleResizeUp = useCallback(() => { resizeDragging.current = false; }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!drag.hasMoved.current) {
      onSelect();
      onReplace(el.id);
    }
  }, [onSelect, onReplace, el.id, drag.hasMoved]);

  return (
    <div
      className="absolute touch-none"
      style={{
        left: `${el.position.x}%`,
        top: `${el.position.y}%`,
        width: `${el.size.width}%`,
        cursor: activeDrag ? 'grabbing' : 'grab',
        zIndex: el.zIndex ?? 1,
      }}
      onPointerDown={(e) => { onSelect(); setActiveDrag(true); drag.onPointerDown(e); }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={() => { setActiveDrag(false); drag.onPointerUp(); }}
      onClick={handleClick}
    >
      {/* Placeholder block */}
      <div
        style={{
          width: '100%',
          paddingBottom: `${(el.size.height / el.size.width) * 100}%`,
          borderRadius: el.borderRadius * scale,
          border: '2px dashed rgba(255,255,255,0.4)',
          background: 'rgba(0,0,0,0.15)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <svg width={Math.max(16, 24 * scale)} height={Math.max(16, 24 * scale)} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span style={{ fontSize: Math.max(8, 11 * scale), color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 1.2, padding: '0 4px' }}>
            {el.label}
          </span>
        </div>
      </div>

      {/* Selection ring */}
      {selected && (
        <div
          className="absolute inset-0 pointer-events-none rounded-sm"
          style={{ outline: '2px solid rgba(99,102,241,0.7)', outlineOffset: 2 }}
        />
      )}

      {/* Resize handle */}
      {selected && (
        <div
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 rounded-full bg-indigo-500 touch-none z-10 border-2 border-white"
          style={{ cursor: 'se-resize' }}
          onPointerDown={handleResizeDown}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeUp}
        />
      )}
    </div>
  );
}

// ─── Main SlideCanvas ────────────────────────────────────────

interface SlideCanvasProps {
  slide: Slide;
  selectedId: string | null;
  editingTextId: string | null;
  onSelectElement: (id: string | null) => void;
  onStartEditText: (id: string) => void;
  onStopEditText: () => void;
  onUpdateElement: (id: string, updates: Partial<SlideElement>) => void;
  onUpdateTextContent: (id: string, text: string) => void;
  onReplacePlaceholder: (id: string) => void;
  className?: string;
}

export const SlideCanvas = forwardRef<HTMLDivElement, SlideCanvasProps>(
  ({ slide, selectedId, editingTextId, onSelectElement, onStartEditText, onStopEditText, onUpdateElement, onUpdateTextContent, onReplacePlaceholder, className }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(540);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) setContainerWidth(entry.contentRect.width);
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const scale = containerWidth / 1080;

    const bgStyle: React.CSSProperties = {};
    if (slide.background.type === 'solid') {
      bgStyle.backgroundColor = slide.background.color;
    } else if (slide.background.type === 'gradient') {
      bgStyle.background = `linear-gradient(${slide.background.direction}, ${slide.background.from}, ${slide.background.to})`;
    } else if (slide.background.type === 'image') {
      bgStyle.backgroundImage = `url(${slide.background.src})`;
      bgStyle.backgroundSize = 'cover';
      bgStyle.backgroundPosition = 'center';
      const br = slide.background.brightness ?? 1;
      if (br !== 1) bgStyle.filter = `brightness(${br})`;
    }

    return (
      <div
        ref={(node) => {
          (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }}
        className={cn('aspect-[3/4] w-full relative overflow-hidden select-none', className)}
        style={{ ...bgStyle, maxWidth: 540 }}
        onClick={() => onSelectElement(null)}
      >
        {[...slide.elements].sort((a, b) => (a.zIndex ?? 1) - (b.zIndex ?? 1)).map((el) => {
          if (el.type === 'text') {
            return (
              <TextElementView
                key={el.id}
                el={el}
                selected={selectedId === el.id}
                editing={editingTextId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onStartEdit={() => onStartEditText(el.id)}
                onStopEdit={onStopEditText}
                onTextChange={(html) => onUpdateTextContent(el.id, html)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                onWidthChange={(w) => onUpdateElement(el.id, { width: w } as Partial<TextElement>)}
                containerRef={containerRef}
              />
            );
          }
          if (el.type === 'image') {
            return (
              <ImageElementView
                key={el.id}
                el={el as ImageElement}
                selected={selectedId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                onResize={(w, h) => onUpdateElement(el.id, { size: { width: w, height: h } } as Partial<ImageElement>)}
                containerRef={containerRef}
              />
            );
          }
          if (el.type === 'shape') {
            return (
              <ShapeElementView
                key={el.id}
                el={el as ShapeElement}
                selected={selectedId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                onResize={(w, h) => onUpdateElement(el.id, { size: { width: w, height: h } } as Partial<ShapeElement>)}
                containerRef={containerRef}
              />
            );
          }
          if (el.type === 'placeholder') {
            return (
              <PlaceholderElementView
                key={el.id}
                el={el as PlaceholderElement}
                selected={selectedId === el.id}
                scale={scale}
                onSelect={() => onSelectElement(el.id)}
                onMove={(x, y) => onUpdateElement(el.id, { position: { x, y } })}
                onResize={(w, h) => onUpdateElement(el.id, { size: { width: w, height: h } } as Partial<PlaceholderElement>)}
                onReplace={onReplacePlaceholder}
                containerRef={containerRef}
              />
            );
          }
          return null;
        })}
      </div>
    );
  }
);

SlideCanvas.displayName = 'SlideCanvas';
