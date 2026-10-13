import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface SearchableOption {
  value: string;
  /** Texto principal (el código). */
  code: string;
  /** Texto secundario (nombre o descripción). */
  label: string;
}

interface Props {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  onBlur?: () => void;
  ariaLabel?: string;
}

// Cuántas opciones se pintan como máximo (con miles, la lista se vuelve lenta
// y nadie hace scroll tanto: se afina escribiendo).
const MAX_VISIBLE = 80;

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Desplegable con buscador, igual que el buscador de productos: se escribe
 * cualquier trozo del código o del nombre, en cualquier orden ("schn", "elec
 * sch", "sch"...) y se filtra al momento. Teclado: ↑ ↓ para moverse, Intro
 * para elegir, Esc para cerrar.
 */
const SearchableSelect: React.FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = 'Escribe para buscar…',
  disabled = false,
  invalid = false,
  onBlur,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; maxHeight: number; above: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);
  const selectedText = selected ? `${selected.code} - ${selected.label}` : '';

  const filtered = useMemo(() => {
    const tokens = normalize(query).split(/[\s*]+/).filter(Boolean);
    if (tokens.length === 0) return options;
    const q = normalize(query.trim());
    return options
      .map((o) => {
        const code = normalize(o.code);
        const text = `${code} ${normalize(o.label)}`;
        if (!tokens.every((t) => text.includes(t))) return null;
        // Orden: código exacto, código que empieza por lo escrito, resto.
        const rank = code === q ? 0 : code.startsWith(tokens[0]) ? 1 : 2;
        return { o, rank };
      })
      .filter((x): x is { o: SearchableOption; rank: number } => x !== null)
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.o);
  }, [options, query]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  // La lista se coloca con position: fixed para que no la recorte el
  // contenedor con scroll del modal.
  const updatePosition = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom - 8;
    const spaceAbove = r.top - 8;
    const above = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(288, above ? spaceAbove : spaceBelow);
    setRect({ left: r.left, top: above ? r.top - 4 : r.bottom + 4, width: r.width, maxHeight, above });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = () => updatePosition();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [open]);

  useEffect(() => setHighlight(0), [query]);

  // Mantener visible la opción resaltada al moverse con el teclado.
  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.children[highlight] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const choose = (opt: SearchableOption) => {
    onChange(opt.value);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, visible.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (visible[highlight]) choose(visible[highlight]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        disabled={disabled}
        value={open ? query : selectedText}
        placeholder={open && selectedText ? selectedText : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={() => {
          // Pequeño margen para que el clic en una opción llegue antes de cerrar.
          setTimeout(close, 120);
          onBlur?.();
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        className={`w-full p-2 pr-8 border rounded outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed ${
          invalid ? 'border-red-500 bg-red-50' : 'border-gray-300'
        }`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">▾</span>

      {open && rect && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="fixed z-[70] bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto py-1"
          style={{
            left: rect.left,
            width: rect.width,
            maxHeight: rect.maxHeight,
            ...(rect.above ? { bottom: window.innerHeight - rect.top } : { top: rect.top }),
          }}
        >
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">Sin resultados para «{query}»</li>
          ) : (
            visible.map((o, idx) => (
              <li
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                onMouseDown={(e) => {
                  e.preventDefault(); // que el input no pierda el foco antes de elegir
                  choose(o);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`px-3 py-2 text-sm cursor-pointer flex gap-2 ${
                  idx === highlight ? 'bg-blue-50' : ''
                } ${o.value === value ? 'font-bold' : ''}`}
              >
                <span className="font-mono text-blue-700 shrink-0">{o.code}</span>
                <span className="text-gray-700 truncate">{o.label}</span>
              </li>
            ))
          )}
          {filtered.length > MAX_VISIBLE && (
            <li className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
              {filtered.length - MAX_VISIBLE} más… sigue escribiendo para afinar
            </li>
          )}
        </ul>
      )}
    </div>
  );
};

export default SearchableSelect;
