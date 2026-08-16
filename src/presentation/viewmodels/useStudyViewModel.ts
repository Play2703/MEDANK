import { useState, useEffect, useCallback, useRef } from 'react';
import { FlashCard } from '../../domain/entities/Card';
import { Deck } from '../../domain/entities/Deck';
import { ReviewRating } from '../../core/algorithm/sm2';
import { medKnowledgeRepository } from '../../data/repositories_impl/MedKnowledgeRepository';
import { RepositoryFactory } from '../../data/repositories_impl/RepositoryFactory';
import { GenerateMnemonicUseCase } from '../../domain/usecases/GenerateMnemonicUseCase';
import { reviewSchedulerService } from '../../data/services/ReviewSchedulerService';
import { db } from '../../data/db/database';

const repo = medKnowledgeRepository;
const studyHistoryRepo = RepositoryFactory.getStudyHistoryRepository();
const generateMnemonicUseCase = new GenerateMnemonicUseCase();

export function useStudyViewModel(deckId: string) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [dueCards, setDueCards] = useState<FlashCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [completed, setCompleted] = useState<boolean>(false);
  const [reviewedCount, setReviewedCount] = useState<number>(0);
  const [generatedMnemonic, setGeneratedMnemonic] = useState<{ mnemonic: string; explanation: string; clinicalTip: string } | null>(null);
  const [isGeneratingMnemonic, setIsGeneratingMnemonic] = useState<boolean>(false);
  const [speaking, setSpeaking] = useState<boolean>(false);

  const startTimeRef = useRef<number>(Date.now());

  const loadStudySession = useCallback(async () => {
    setLoading(true);
    try {
      const deckData = await repo.getDeckById(deckId);
      setDeck(deckData || null);

      const cards = await repo.getCardsByDeck(deckId);
      setDueCards(cards);
      setCurrentIndex(0);
      setIsFlipped(false);
      setCompleted(cards.length === 0);
      setReviewedCount(0);
      startTimeRef.current = Date.now();
    } catch (err) {
      console.error('Erro ao iniciar sessão de estudos:', err);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    loadStudySession();
  }, [loadStudySession]);

  const currentCard = dueCards[currentIndex] || null;

  const flipCard = () => {
    setIsFlipped((prev) => !prev);
  };

  const handleRating = async (rating: ReviewRating) => {
    if (!currentCard) return;

    const elapsedMs = Date.now() - startTimeRef.current;
    const timeSpentSeconds = Math.max(1, Math.round(elapsedMs / 1000));
    const previousInterval = currentCard.sm2State?.interval ?? 0;

    const updatedCard = await repo.recordCardReview(currentCard.id, rating as any);
    const newInterval = updatedCard.sm2State?.interval ?? 0;

    try {
      await studyHistoryRepo.addReviewLog({
        cardId: currentCard.id,
        deckId: currentCard.deckId,
        rating,
        timeSpentSeconds,
        reviewedAt: new Date().toISOString(),
        previousInterval,
        newInterval,
      });

      if (rating === 1) {
        db.cardSignals.put({
          id: `sig_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          cardId: currentCard.id,
          signalType: 'wrong_review',
          weight: 1.0,
          createdAt: new Date().toISOString(),
          consumed: false,
        }).catch((err) => console.warn('[useStudyViewModel] Failed to record card signal:', err));
      }
    } catch (err) {
      console.warn('[useStudyViewModel] Failed to add review log:', err);
    }

    setReviewedCount((prev) => prev + 1);

    setGeneratedMnemonic(null);
    setIsFlipped(false);
    startTimeRef.current = Date.now();

    if (currentIndex + 1 >= dueCards.length) {
      setCompleted(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleGenerateMnemonic = async () => {
    if (!currentCard) return;
    setIsGeneratingMnemonic(true);
    try {
      const res = await generateMnemonicUseCase.execute(
        currentCard.front,
        currentCard.back,
        deck?.category
      );
      setGeneratedMnemonic(res);
    } catch (err) {
      console.error('Erro ao gerar mnemônico:', err);
    } finally {
      setIsGeneratingMnemonic(false);
    }
  };

  const speakCardText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const getIntervalPreview = (rating: ReviewRating): string => {
    if (!currentCard) return '';
    return reviewSchedulerService.getIntervalPreviewText(currentCard.sm2State, rating);
  };

  return {
    deck,
    currentCard,
    dueCards,
    currentIndex,
    totalDue: dueCards.length,
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
    restartSession: loadStudySession,
  };
}
