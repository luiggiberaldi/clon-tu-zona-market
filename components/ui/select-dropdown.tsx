'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export type SelectOption = { value: string; label: string };

type SelectDropdownProps = {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Nombre para formularios que envían FormData; agrega un input oculto. */
  name?: string;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  /** 'onDark' adapta el botón cerrado para fondos oscuros (encabezado). */
  tone?: 'default' | 'onDark';
};

/**
 * Dropdown de selección con bordes redondeados, incluida su lista de opciones.
 * Regla del proyecto (agent.md): no se permiten dropdowns cuadrados. El <select>
 * nativo no permite redondear la lista desplegable en todos los navegadores
 * (appearance: base-select requiere Chrome 135+), por eso existe este componente.
 * Accesible: rol listbox, navegación con flechas, Escape para cerrar, cierre al
 * hacer clic fuera y etiquetado por aria-label / aria-labelledby.
 */
export function SelectDropdown({ options, value, defaultValue, onChange, name, placeholder, ariaLabel, disabled, className, tone = 'default' }: SelectDropdownProps) {
  const [internal, setInternal] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const isControlled = value !== undefined;
  const current = isControlled ? value! : internal;
  const selected = options.find(option => option.value === current);
  const label = selected ? selected.label : placeholder ?? '';

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  function choose(next: string) {
    if (!isControlled) setInternal(next);
    onChange?.(next);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setOpen(true);
        const index = options.findIndex(option => option.value === current);
        setActiveIndex(index >= 0 ? index : 0);
      }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min((index < 0 ? 0 : index) + 1, options.length - 1)); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max((index < 0 ? 0 : index) - 1, 0)); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (activeIndex >= 0) choose(options[activeIndex]!.value);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen(next => !next)}
        onKeyDown={onKeyDown}
        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm shadow-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7046] disabled:opacity-50 ${tone === 'onDark' ? 'max-h-9 min-h-0 border-transparent bg-transparent py-1 text-xs font-semibold text-white hover:bg-white/10' : 'bg-white'} ${open ? (tone === 'onDark' ? 'border-white/60' : 'border-[#0b7046] ring-2 ring-[#0b7046]/25') : tone === 'onDark' ? '' : 'border-[#e1e7d9] hover:border-[#c9d6bd]'}`}
      >
        <span className={`truncate ${selected ? '' : tone === 'onDark' ? '' : 'text-muted-foreground'}`}>{label}</span>
        <ChevronDown size={tone === 'onDark' ? 13 : 16} className={`shrink-0 ${tone === 'onDark' ? 'text-white/80' : 'text-[#5c6f57]'} transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[#e1e7d9] bg-white p-1.5 shadow-lg"
        >
          {options.map((option, index) => {
            const isSelected = option.value === current;
            const isActive = index === activeIndex;
            return (
              <li key={option.value || `empty-${index}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option.value)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isSelected ? 'bg-[#0b7046] font-semibold text-white' : isActive ? 'bg-[#edf5ee]' : 'bg-transparent'}`}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
