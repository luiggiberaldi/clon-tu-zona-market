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
  const [override, setOverride] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const isControlled = value !== undefined;

  useEffect(() => {
    setOverride(null);
  }, [value]);

  // Modo no controlado: si el valor interno no está entre las opciones
  // (inicial o porque la lista cambió), se usa defaultValue o la primera
  // opción — igual que hacía el <select> nativo que reemplaza.
  const fallback = defaultValue ?? options[0]?.value ?? '';
  const current = override ?? (isControlled ? value! : internal && options.some(option => option.value === internal) ? internal : fallback);
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
    if (inputRef.current) inputRef.current.value = next;
    setOverride(next);
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
      {name && <input ref={inputRef} type="hidden" name={name} value={current} onChange={() => {}} />}
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
        className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm shadow-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ECA700] disabled:opacity-50 ${tone === 'onDark' ? 'max-h-9 min-h-0 border-transparent bg-transparent py-1 text-xs font-semibold text-[#14191D] hover:bg-black/5' : 'bg-white'} ${open ? (tone === 'onDark' ? 'border-[#14191D]/50' : 'border-[#ECA700] ring-2 ring-[#ECA700]/25') : tone === 'onDark' ? '' : 'border-[#EAE4D5] hover:border-[#C68500]'}`}
      >
        <span className={`truncate ${selected ? '' : tone === 'onDark' ? '' : 'text-muted-foreground'}`}>{label}</span>
        <ChevronDown size={tone === 'onDark' ? 13 : 16} className={`shrink-0 ${tone === 'onDark' ? 'text-[#14191D]' : 'text-muted-foreground'} transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[#EAE4D5] bg-white p-1.5 shadow-lg"
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
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${isSelected ? 'bg-[#ECA700] font-semibold text-[#14191D]' : isActive ? 'bg-[#FFF4D1] text-[#14191D]' : 'bg-white text-[#14191D] hover:bg-[#FFF4D1]/50'}`}
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
