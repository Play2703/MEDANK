import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { medAnkiColors } from '../../../core/theme/tokens';

export interface MedicalBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxHeight?: string;
  className?: string;
}

export const MedicalBottomSheet: React.FC<MedicalBottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxHeight = '85vh',
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

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm cursor-pointer"
          />

          {/* Bottom Sheet Container */}
          <motion.div
            initial={{ y: '100%', opacity: 0.5 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            style={{
              backgroundColor: medAnkiColors.surfaceElevated,
              borderColor: medAnkiColors.borderDefault,
              maxHeight,
            }}
            className={`relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col z-10 ${className}`}
          >
            {/* Drag Handle Indicator */}
            <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto my-3 shrink-0 sm:hidden" />

            {/* Header */}
            {title && (
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
                <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Content Area */}
            <div className="p-6 overflow-y-auto flex-1 text-slate-200">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
