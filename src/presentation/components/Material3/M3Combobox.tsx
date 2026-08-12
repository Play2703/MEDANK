import React, { useState, useRef, useEffect, useId, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { useDevice } from '../../../core/responsive/DeviceContext';

export interface ComboboxGroup {
  groupName: string;
  specialties: string[];
}

export interface ComboboxOption {
  value: string;
  label: string;
}

interface M3ComboboxProps {
  groups?: ComboboxGroup[];
  options?: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  searchPlaceholder?: string;
  className?: string;
}

export const M3Combobox: React.FC<M3ComboboxProps> = ({
  groups,
  options,
  value,
  onChange,
  placeholder = 'Selecione uma opção...',
  label,
  searchPlaceholder = 'Buscar...',
  className = '',
}) => {
  const { colors } = useDevice();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const comboboxId = useId();

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Compute selected display label
  const selectedLabel = useMemo(() => {
    if (groups) {
      for (const g of groups) {
        if (g.specialties.includes(value)) return value;
      }
    }
    if (options) {
      const opt = options.find((o) => o.value === value);
      if (opt) return opt.label;
    }
    return value || placeholder;
  }, [groups, options, value, placeholder]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    if (!searchQuery.trim()) return groups;
    const lower = searchQuery.toLowerCase();

    return groups
      .map((g) => ({
        groupName: g.groupName,
        specialties: g.specialties.filter((s) => s.toLowerCase().includes(lower)),
      }))
      .filter((g) => g.specialties.length > 0);
  }, [groups, searchQuery]);

  // Filtered options
  const filteredOptions = useMemo(() => {
    if (!options) return [];
    if (!searchQuery.trim()) return options;
    const lower = searchQuery.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(lower) || o.value.toLowerCase().includes(lower)
    );
  }, [options, searchQuery]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && <label className="block text-xs font-bold mb-1 opacity-80">{label}</label>}

      {/* Trigger Button */}
      <button
        type="button"
        id={`${comboboxId}-button`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${comboboxId}-listbox`}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all flex items-center justify-between gap-2 text-left ${
          isOpen ? 'ring-2 ring-indigo-500/40 border-indigo-500' : 'hover:border-white/20'
        }`}
        style={{
          backgroundColor: colors.surface,
          borderColor: isOpen ? colors.primary : colors.outline,
          color: colors.onSurface,
        }}
      >
        <span className="truncate font-medium">{selectedLabel}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
        </motion.div>
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={`${comboboxId}-listbox`}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 z-50 rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-72"
            style={{
              top: '100%',
              backgroundColor: colors.surfaceContainerHigh || '#161619',
              borderColor: colors.outlineVariant || 'rgba(255, 255, 255, 0.15)',
            }}
          >
            {/* Search Input Filter */}
            <div className="p-2 border-b border-white/10 relative shrink-0">
              <Search className="w-3.5 h-3.5 absolute left-4 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs bg-black/30 border border-white/10 outline-none focus:border-indigo-500"
              />
            </div>

            {/* Content List */}
            <div className="overflow-y-auto p-1.5 space-y-2 no-scrollbar">
              {groups && groups.length > 0 && (
                filteredGroups.length === 0 ? (
                  <div className="p-3 text-xs opacity-60 text-center">Nenhum resultado encontrado.</div>
                ) : (
                  filteredGroups.map((group) => (
                    <div key={group.groupName} className="space-y-1">
                      <div className="sticky top-0 z-10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-slate-900/90 backdrop-blur-xs rounded-md">
                        {group.groupName}
                      </div>
                      {group.specialties.map((spec) => {
                        const isSelected = spec === value;
                        return (
                          <div
                            key={spec}
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => handleSelect(spec)}
                            className={`px-3 py-2 text-xs rounded-xl cursor-pointer flex items-center justify-between transition-colors ${
                              isSelected
                                ? 'bg-indigo-600/30 text-indigo-200 font-bold border border-indigo-500/40'
                                : 'hover:bg-white/10 opacity-90'
                            }`}
                          >
                            <span>{spec}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )
              )}

              {options && options.length > 0 && (
                filteredOptions.length === 0 ? (
                  <div className="p-3 text-xs opacity-60 text-center">Nenhum resultado encontrado.</div>
                ) : (
                  filteredOptions.map((opt) => {
                    const isSelected = opt.value === value;
                    return (
                      <div
                        key={opt.value}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(opt.value)}
                        className={`px-3 py-2 text-xs rounded-xl cursor-pointer flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-indigo-600/30 text-indigo-200 font-bold border border-indigo-500/40'
                            : 'hover:bg-white/10 opacity-90'
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                      </div>
                    );
                  })
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
