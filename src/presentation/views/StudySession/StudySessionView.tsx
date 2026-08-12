import React from 'react';
import { useStudyViewModel } from '../../viewmodels/useStudyViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { parseClozeText } from '../../../core/utils/clozeParser';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Volume2,
  Sparkles,
  RotateCw,
  CheckCircle2,
  Flame,
  Lightbulb,
  Tag,
  Loader2,
  HelpCircle,
} from 'lucide-react';

interface StudySessionViewProps {
  deckId: string;
  onBack: () => void;
}

export const StudySessionView: React.FC<StudySessionViewProps> = ({ deckId, onBack }) => {
  const { colors } = useDevice();
  const {
    deck,
    currentCard,
    dueCards,
    currentIndex,
    isFlipped,
    loading,
    completed,
    reviewedCount,
    generatedMnemonic,
    isGeneratingMnemonic,
    speaking,
    flipCard,
    handleRating,
    handleGenerateMnemonic,
    speakCardText,
    getIntervalPreview,
    restartSession,
  } = useStudyViewModel(deckId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
        <p className="text-sm font-medium opacity-80">Carregando sessão de repetição espaçada...</p>
      </div>
    );
  }

  if (completed || !currentCard) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center space-y-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg"
          style={{ backgroundColor: colors.primaryContainer, color: colors.onPrimaryContainer }}
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-500" />
        </motion.div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black">Parabéns! Sessão Concluída</h2>
          <p className="text-sm opacity-80">
            Você revisou <span className="font-bold text-cyan-600">{reviewedCount}</span> flashcards do baralho{' '}
            <span className="font-bold">{deck?.title}</span> hoje.
          </p>
        </div>

        <M3Card variant="filled" className="p-6 text-left space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Flame className="w-5 h-5 text-amber-500" />
            <span>Resumo de Retenção Médica</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5">
              <div className="text-2xl font-bold">{reviewedCount}</div>
              <div className="text-xs opacity-70">Cards Concluídos</div>
            </div>
            <div className="p-3 rounded-xl bg-black/5 dark:bg-white/5">
              <div className="text-2xl font-bold text-emerald-500">100%</div>
              <div className="text-xs opacity-70">Grau de Foco</div>
            </div>
          </div>
        </M3Card>

        <div className="flex items-center justify-center gap-3 pt-2">
          <M3Button variant="outlined" icon={<ArrowLeft className="w-4 h-4" />} onClick={onBack}>
            Voltar aos Baralhos
          </M3Button>
          <M3Button variant="filled" icon={<RotateCw className="w-4 h-4" />} onClick={restartSession}>
            Estudar Novamente
          </M3Button>
        </div>
      </div>
    );
  }

  const renderFrontContent = () => {
    if (currentCard.type === 'image_occlusion' && currentCard.imageUrl) {
      const rects = currentCard.occlusionRects || [];
      return (
        <div className="space-y-3">
          <div className="text-base md:text-lg font-medium">{currentCard.front}</div>
          <div className="relative w-full rounded-2xl overflow-hidden border bg-black/5 dark:bg-white/5" style={{ borderColor: colors.outlineVariant }}>
            <img src={currentCard.imageUrl} alt="Oclusão" className="w-full h-auto max-h-80 object-contain block" />
            {rects.map((rect) => (
              <div
                key={rect.id}
                className="absolute rounded bg-amber-500 text-white font-black text-xs flex items-center justify-center border border-amber-600 shadow-md"
                style={{
                  left: `${rect.x}%`,
                  top: `${rect.y}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                }}
              >
                {rect.id.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (currentCard.type === 'cloze') {
      const tokens = parseClozeText(currentCard.front);
      return (
        <div className="text-lg md:text-xl font-medium leading-relaxed">
          {tokens.map((token, i) => {
            if (token.type === 'text') {
              return <span key={i}>{token.content}</span>;
            }
            return (
              <span
                key={i}
                className="inline-block px-2 py-0.5 mx-1 rounded-md font-bold text-cyan-600 dark:text-cyan-300 bg-cyan-500/15 border border-cyan-500/30"
              >
                [{token.hint ? `dica: ${token.hint}` : '...'}]
              </span>
            );
          })}
        </div>
      );
    }

    return <div className="text-lg md:text-xl font-medium leading-relaxed">{currentCard.front}</div>;
  };

  const renderBackContent = () => {
    if (currentCard.type === 'image_occlusion' && currentCard.imageUrl) {
      const rects = currentCard.occlusionRects || [];
      return (
        <div className="space-y-4">
          <div className="text-base md:text-lg font-medium">{currentCard.front}</div>
          <div className="relative w-full rounded-2xl overflow-hidden border bg-black/5 dark:bg-white/5" style={{ borderColor: colors.outlineVariant }}>
            <img src={currentCard.imageUrl} alt="Oclusão" className="w-full h-auto max-h-80 object-contain block" />
            {rects.map((rect) => (
              <div
                key={rect.id}
                className="absolute rounded bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 font-bold text-xs flex items-center justify-center border border-emerald-500 shadow-xs"
                style={{
                  left: `${rect.x}%`,
                  top: `${rect.y}%`,
                  width: `${rect.width}%`,
                  height: `${rect.height}%`,
                }}
              >
                {rect.label || rect.id.toUpperCase()}
              </div>
            ))}
          </div>
          {currentCard.back && (
            <div className="space-y-1 border-t pt-3" style={{ borderColor: colors.outlineVariant }}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-600">Explicação:</h4>
              <p className="text-sm opacity-90 leading-relaxed whitespace-pre-line">{currentCard.back}</p>
            </div>
          )}
        </div>
      );
    }

    if (currentCard.type === 'cloze') {
      const tokens = parseClozeText(currentCard.front);
      return (
        <div className="space-y-4">
          <div className="text-lg md:text-xl font-medium leading-relaxed border-b pb-4" style={{ borderColor: colors.outlineVariant }}>
            {tokens.map((token, i) => {
              if (token.type === 'text') {
                return <span key={i}>{token.content}</span>;
              }
              return (
                <span
                  key={i}
                  className="inline-block px-2 py-0.5 mx-1 rounded-md font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-500/20 border border-emerald-500/40"
                >
                  {token.answer}
                </span>
              );
            })}
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-600">Explicação Clínica:</h4>
            <p className="text-sm opacity-90 leading-relaxed whitespace-pre-line">{currentCard.back}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="text-base md:text-lg font-normal opacity-80 border-b pb-3" style={{ borderColor: colors.outlineVariant }}>
          {currentCard.front}
        </div>
        <div className="text-lg md:text-xl font-bold leading-relaxed">{currentCard.back}</div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24 md:pb-6">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>

        {/* Progress Pill */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold opacity-80">
            Card {currentIndex + 1} de {dueCards.length}
          </span>
          <div className="w-24 h-2 rounded-full overflow-hidden bg-black/10 dark:bg-white/10">
            <div
              className="h-full bg-cyan-600 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / dueCards.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Flashcard Container with Motion Flip */}
      <div className="relative min-h-[360px] cursor-pointer perspective-1000" onClick={flipCard}>
        <AnimatePresence mode="wait">
          {!isFlipped ? (
            <motion.div
              key="front"
              initial={{ rotateY: -90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: 90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <M3Card variant="elevated" className="min-h-[360px] p-6 flex flex-col justify-between space-y-4 border shadow-lg relative overflow-hidden">
                {/* High yield banner */}
                {currentCard.highYield && (
                  <div className="absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[10px] font-extrabold flex items-center gap-1 shadow-xs" style={{ backgroundColor: colors.highYieldContainer, color: colors.highYield }}>
                    <Flame className="w-3 h-3 fill-current" />
                    <span>HIGH YIELD RESIDÊNCIA</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-md" style={{ backgroundColor: colors.secondaryContainer, color: colors.onSecondaryContainer }}>
                      {currentCard.type.toUpperCase()}
                    </span>
                    {currentCard.tags.map((tag) => (
                      <span key={tag} className="text-[10px] opacity-70 flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {tag}
                      </span>
                    ))}
                  </div>

                  {renderFrontContent()}
                </div>

                {/* Card Hint & Flip Prompt */}
                <div className="pt-4 border-t flex items-center justify-between text-xs opacity-70" style={{ borderColor: colors.outlineVariant }}>
                  <div className="flex items-center gap-1">
                    <HelpCircle className="w-4 h-4 text-cyan-600" />
                    <span>{currentCard.hint ? `Dica: ${currentCard.hint}` : 'Toque no card para revelar a resposta'}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      speakCardText(currentCard.front);
                    }}
                    className={`p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 ${speaking ? 'text-cyan-500 animate-pulse' : ''}`}
                    title="Ouvir pronunciar"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </M3Card>
            </motion.div>
          ) : (
            <motion.div
              key="back"
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              <M3Card variant="elevated" className="min-h-[360px] p-6 flex flex-col justify-between space-y-4 border shadow-lg border-cyan-500/30">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-600">
                      RESPOSTA & ANÁLISE
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakCardText(currentCard.back);
                      }}
                      className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                  </div>

                  {renderBackContent()}

                  {/* Existing Mnemonic if available */}
                  {currentCard.mnemonic && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                        <Lightbulb className="w-4 h-4" />
                        <span>Mnemônico Clínico:</span>
                      </div>
                      <p className="font-medium opacity-90">{currentCard.mnemonic}</p>
                    </div>
                  )}

                  {/* Dynamically Generated AI Mnemonic */}
                  {generatedMnemonic && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border border-purple-500/30 text-xs space-y-1.5"
                    >
                      <div className="font-bold flex items-center gap-1.5 text-purple-600 dark:text-purple-300">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <span>Mnemônico Gerado por IA Gemini:</span>
                      </div>
                      <div className="font-bold text-sm text-purple-700 dark:text-purple-200">
                        "{generatedMnemonic.mnemonic}"
                      </div>
                      <p className="opacity-80">{generatedMnemonic.explanation}</p>
                      {generatedMnemonic.clinicalTip && (
                        <div className="font-semibold text-[11px] text-amber-600 dark:text-amber-400">
                          ⚡ Pulo do gato: {generatedMnemonic.clinicalTip}
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* AI Mnemonic Button */}
                {!generatedMnemonic && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateMnemonic();
                      }}
                      disabled={isGeneratingMnemonic}
                      className="w-full py-2 px-3 rounded-xl border border-dashed border-purple-500/40 hover:bg-purple-500/5 text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center justify-center gap-2 transition-colors"
                    >
                      {isGeneratingMnemonic ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Criando Mnemônico Médico com IA...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Gerar Mnemônico com IA Gemini</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </M3Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* SM-2 Review Rating Action Buttons */}
      {isFlipped ? (
        <div className="grid grid-cols-4 gap-1.5 sm:gap-2 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <button
            onClick={() => handleRating(1)}
            className="flex flex-col items-center justify-center py-2.5 sm:py-3 px-1 sm:px-2 rounded-2xl font-bold transition-transform active:scale-95 text-white shadow-sm"
            style={{ backgroundColor: colors.againColor }}
          >
            <span className="text-[11px] sm:text-xs md:text-sm truncate max-w-full">De Novo</span>
            <span className="text-[9px] sm:text-[10px] opacity-80 font-normal truncate">{getIntervalPreview(1)}</span>
          </button>

          <button
            onClick={() => handleRating(2)}
            className="flex flex-col items-center justify-center py-2.5 sm:py-3 px-1 sm:px-2 rounded-2xl font-bold transition-transform active:scale-95 text-white shadow-sm"
            style={{ backgroundColor: colors.hardColor }}
          >
            <span className="text-[11px] sm:text-xs md:text-sm truncate max-w-full">Difícil</span>
            <span className="text-[9px] sm:text-[10px] opacity-80 font-normal truncate">{getIntervalPreview(2)}</span>
          </button>

          <button
            onClick={() => handleRating(3)}
            className="flex flex-col items-center justify-center py-2.5 sm:py-3 px-1 sm:px-2 rounded-2xl font-bold transition-transform active:scale-95 text-white shadow-sm"
            style={{ backgroundColor: colors.goodColor }}
          >
            <span className="text-[11px] sm:text-xs md:text-sm truncate max-w-full">Bom</span>
            <span className="text-[9px] sm:text-[10px] opacity-80 font-normal truncate">{getIntervalPreview(3)}</span>
          </button>

          <button
            onClick={() => handleRating(4)}
            className="flex flex-col items-center justify-center py-2.5 sm:py-3 px-1 sm:px-2 rounded-2xl font-bold transition-transform active:scale-95 text-white shadow-sm"
            style={{ backgroundColor: colors.easyColor }}
          >
            <span className="text-[11px] sm:text-xs md:text-sm truncate max-w-full">Fácil</span>
            <span className="text-[9px] sm:text-[10px] opacity-80 font-normal truncate">{getIntervalPreview(4)}</span>
          </button>
        </div>
      ) : (
        <M3Button variant="filled" size="lg" className="w-full py-4" onClick={flipCard}>
          Mostrar Resposta (Espaço)
        </M3Button>
      )}
    </div>
  );
};
