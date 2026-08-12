import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useDevice } from '../../../core/responsive/DeviceContext';

interface M3ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

export const M3Modal: React.FC<M3ModalProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  children,
  maxWidth = 'max-w-md',
}) => {
  const { colors, isMobileViewport } = useDevice();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm modal-container"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop overlay click */}
          <div className="absolute inset-0" onClick={onClose} />

          {/* Modal Container: Bottom Sheet on Mobile, Centered Modal on Desktop */}
          <motion.div
            initial={isMobileViewport ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
            animate={isMobileViewport ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isMobileViewport ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`relative z-10 w-full ${maxWidth} rounded-t-3xl sm:rounded-3xl shadow-2xl border overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] bg-gradient-to-b from-slate-900 via-slate-900/98 to-slate-950`}
            style={{
              borderColor: colors.outlineVariant || 'rgba(99, 102, 241, 0.3)',
              color: colors.onSurface,
            }}
          >
            {/* Mobile Drag Handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center shrink-0">
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            {/* Modal Header */}
            <div className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                {icon && (
                  <div className="p-2.5 rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                    {icon}
                  </div>
                )}
                <h3 className="text-lg font-bold text-slate-100">{title}</h3>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
