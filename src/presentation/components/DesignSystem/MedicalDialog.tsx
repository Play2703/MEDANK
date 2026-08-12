import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { medAnkiColors } from '../../../core/theme/tokens';

export interface MedicalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const MedicalDialog: React.FC<MedicalDialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  actions,
  size = 'md',
  className = '',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  }[size];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm cursor-pointer"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            style={{
              backgroundColor: medAnkiColors.surfaceElevated,
              borderColor: medAnkiColors.borderDefault,
            }}
            className={`relative w-full ${sizeClass} rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col z-10 ${className}`}
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5 flex items-start justify-between gap-4">
              <div className="space-y-1">
                {title && <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>}
                {description && <p className="text-sm text-slate-400">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            {children && (
              <div className="p-6 overflow-y-auto max-h-[65vh] text-slate-200 text-sm">
                {children}
              </div>
            )}

            {/* Actions / Footer */}
            {actions && (
              <div className="px-6 py-4 bg-[#121214] border-t border-white/5 flex items-center justify-end gap-3 flex-wrap">
                {actions}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
