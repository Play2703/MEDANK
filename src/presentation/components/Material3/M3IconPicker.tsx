import React, { useState, useRef, useEffect, useId } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, Check } from 'lucide-react';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { MEDICAL_DECK_ICONS, MedicalIconOption } from '../../../data/curriculumTopics';
import {
  HeartPulse,
  Pill,
  Brain,
  Baby,
  Stethoscope,
  Bone,
  Eye,
  Ear,
  Wind,
  Droplet,
  Microscope,
  Dna,
  Syringe,
  Thermometer,
  Activity,
  Shield,
  FlaskConical,
  BookOpen,
  UserCheck,
  Scissors,
  Sparkles,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  HeartPulse,
  Pill,
  Brain,
  Baby,
  Stethoscope,
  Bone,
  Eye,
  Ear,
  Wind,
  Droplet,
  Microscope,
  Dna,
  Syringe,
  Thermometer,
  Activity,
  Shield,
  FlaskConical,
  BookOpen,
  UserCheck,
  Scissors,
  Sparkles,
};

interface M3IconPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const M3IconPicker: React.FC<M3IconPickerProps> = ({
  value,
  onChange,
  label = 'Ícone Representativo',
  className = '',
}) => {
  const { colors } = useDevice();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerId = useId();

  // Selected icon component & label
  const SelectedIconComp = ICON_MAP[value] || Stethoscope;
  const selectedObj = MEDICAL_DECK_ICONS.find((i) => i.value === value);
  const selectedLabel = selectedObj ? selectedObj.label : value;

  // Close on outside click or Escape
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

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && <label className="block text-xs font-bold mb-1 opacity-80">{label}</label>}

      {/* Trigger Button */}
      <button
        type="button"
        id={`${pickerId}-button`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${pickerId}-grid`}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2 text-sm rounded-xl border outline-none transition-all flex items-center justify-between gap-2 text-left ${
          isOpen ? 'ring-2 ring-indigo-500/40 border-indigo-500' : 'hover:border-white/20'
        }`}
        style={{
          backgroundColor: colors.surface,
          borderColor: isOpen ? colors.primary : colors.outline,
          color: colors.onSurface,
        }}
      >
        <div className="flex items-center gap-2 truncate">
          <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400">
            <SelectedIconComp className="w-4 h-4" />
          </div>
          <span className="truncate font-medium text-xs">{selectedLabel}</span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
        </motion.div>
      </button>

      {/* Dropdown Panel with Grid */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id={`${pickerId}-grid`}
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 left-0 z-50 rounded-2xl border shadow-2xl p-3 max-h-64 overflow-y-auto"
            style={{
              top: '100%',
              backgroundColor: colors.surfaceContainerHigh || '#161619',
              borderColor: colors.outlineVariant || 'rgba(255, 255, 255, 0.15)',
            }}
          >
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {MEDICAL_DECK_ICONS.map((ico) => {
                const IconComp = ICON_MAP[ico.value] || Stethoscope;
                const isSelected = ico.value === value;

                return (
                  <motion.button
                    key={ico.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    title={ico.label}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      onChange(ico.value);
                      setIsOpen(false);
                    }}
                    className={`aspect-square p-2 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border relative ${
                      isSelected
                        ? 'bg-indigo-600/30 border-indigo-500 ring-2 ring-indigo-500/40 text-indigo-300'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-white/80'
                    }`}
                  >
                    <IconComp className="w-5 h-5" />
                    <span className="text-[9px] truncate max-w-full text-center opacity-70 leading-none">
                      {ico.value}
                    </span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-indigo-400" />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
