import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { useDeckViewModel } from '../../viewmodels/useDeckViewModel';
import { useCardViewModel } from '../../viewmodels/useCardViewModel';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { FlashCard, CardType, CardDifficulty, ImageOcclusionRect } from '../../../domain/entities/Card';
import { db } from '../../../data/db/database';
import { cosineSimilarity } from '../../../data/services/cosineSimilarity';
import { apiUrl } from '../../../lib/apiBaseUrl';
import {
  Sparkles,
  Edit3,
  Flame,
  Tag,
  ImageIcon,
  Volume2,
  HelpCircle,
  Lightbulb,
  Check,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  AlertTriangle,
  FolderOpen,
  Send,
  Save,
  X,
  Layers,
  FileCode,
  Copy,
} from 'lucide-react';

export type NoteTypeOption = 'basic' | 'basic_reversed' | 'cloze' | 'image_occlusion';

export interface ClozeToken {
  type: 'text' | 'cloze';
  content: string;
  clozeNum?: number;
  answer?: string;
  hint?: string;
}

export function getNextClozeNumber(text: string): number {
  const matches = [...text.matchAll(/\{\{c(\d+)::/g)];
  if (matches.length === 0) return 1;
  const numbers = matches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
  return numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
}

export function insertClozeMarkup(
  text: string,
  selectionStart: number,
  selectionEnd: number
): { newText: string; newSelectionStart: number; newSelectionEnd: number } {
  const nextNum = getNextClozeNumber(text);
  const selectedText = text.substring(selectionStart, selectionEnd);

  let snippet: string;
  if (selectedText.length > 0) {
    snippet = `{{c${nextNum}::${selectedText}}}`;
  } else {
    snippet = `{{c${nextNum}::termo::dica}}`;
  }

  const newText = text.substring(0, selectionStart) + snippet + text.substring(selectionEnd);
  const newSelectionStart = selectionStart + snippet.length;
  const newSelectionEnd = newSelectionStart;

  return { newText, newSelectionStart, newSelectionEnd };
}

export function parseClozeText(text: string): ClozeToken[] {
  const regex = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;
  const tokens: ClozeToken[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    const clozeNum = parseInt(match[1], 10);
    const answer = match[2];
    const hint = match[3] || '';

    tokens.push({
      type: 'cloze',
      content: match[0],
      clozeNum,
      answer,
      hint,
    });

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return tokens;
}

export function convertPxToPercentage(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  containerBounds: { left: number; top: number; width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  if (!containerBounds || containerBounds.width <= 0 || containerBounds.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const leftPx = Math.min(startX, currentX) - containerBounds.left;
  const topPx = Math.min(startY, currentY) - containerBounds.top;
  const widthPx = Math.abs(currentX - startX);
  const heightPx = Math.abs(currentY - startY);

  const rawX = (leftPx / containerBounds.width) * 100;
  const rawY = (topPx / containerBounds.height) * 100;
  const rawW = (widthPx / containerBounds.width) * 100;
  const rawH = (heightPx / containerBounds.height) * 100;

  const x = Math.max(0, Math.min(100, rawX));
  const y = Math.max(0, Math.min(100, rawY));
  const width = Math.max(0, Math.min(100 - x, rawW));
  const height = Math.max(0, Math.min(100 - y, rawH));

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
  };
}

interface ManualCardEditorProps {
  initialDeckId?: string;
  onCardSaved?: (card: FlashCard) => void;
  onClose?: () => void;
}

export const ManualCardEditor: React.FC<ManualCardEditorProps> = ({
  initialDeckId,
  onCardSaved,
  onClose,
}) => {
  const { colors } = useDevice();
  const { decks } = useDeckViewModel();
  const { createCard } = useCardViewModel();

  // Selected Deck
  const [targetDeckId, setTargetDeckId] = useState<string>(
    initialDeckId || (decks.length > 0 ? decks[0].id : '')
  );

  useEffect(() => {
    if (!targetDeckId && decks.length > 0) {
      setTargetDeckId(decks[0].id);
    }
  }, [decks, targetDeckId]);

  // Form State
  const [noteType, setNoteType] = useState<NoteTypeOption>('basic');
  const [front, setFront] = useState<string>('');
  const [back, setBack] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [subtopic, setSubtopic] = useState<string>('');
  const [difficulty, setDifficulty] = useState<CardDifficulty>('Médio');
  const [highYield, setHighYield] = useState<boolean>(false);
  const [hint, setHint] = useState<string>('');
  const [mnemonic, setMnemonic] = useState<string>('');

  // Tags State & Autocomplete
  const [tagInput, setTagInput] = useState<string>('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allCollectionTags, setAllCollectionTags] = useState<string[]>([]);

  // Image Occlusion Rects
  const [occlusionRects, setOcclusionRects] = useState<ImageOcclusionRect[]>([]);

  // Live Preview & Session Counters
  const [isPreviewFlipped, setIsPreviewFlipped] = useState<boolean>(false);
  const [sessionCardsCount, setSessionCardsCount] = useState<number>(0);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Drag and Drop State
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Refs
  const frontTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch all collection tags for autocomplete
  useEffect(() => {
    async function fetchTags() {
      try {
        const cards = await db.flashcards.toArray();
        const tagSet = new Set<string>();
        for (const card of cards) {
          if (Array.isArray(card.tags)) {
            for (const t of card.tags) {
              if (t && t.trim()) tagSet.add(t.trim());
            }
          }
        }
        setAllCollectionTags(Array.from(tagSet));
      } catch (err) {
        console.warn('[ManualCardEditor] Failed to fetch collection tags:', err);
      }
    }
    fetchTags();
  }, []);

  // Tag suggestions matching tagInput
  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    const query = tagInput.toLowerCase().trim();
    return allCollectionTags.filter(
      (t) => t.toLowerCase().includes(query) && !selectedTags.includes(t)
    );
  }, [tagInput, allCollectionTags, selectedTags]);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags([...selectedTags, trimmed]);
    }
    setTagInput('');
  };

  const removeTag = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter((t) => t !== tagToRemove));
  };

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (tagInput.trim()) {
        addTag(tagInput);
      }
    }
  };

  // Debounced Duplicate Semantic Search against Target Deck
  useEffect(() => {
    if (!front.trim() || !targetDeckId) {
      setDuplicateWarning(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(apiUrl('/api/embeddings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: front }),
        });

        if (!res.ok) return;
        const data = await res.json();
        const newEmb = data.embedding || data.embeddings?.[0];
        if (!newEmb || newEmb.length === 0) return;

        const targetCards = await db.flashcards.where('deckId').equals(targetDeckId).toArray();
        if (targetCards.length === 0) {
          setDuplicateWarning(null);
          return;
        }

        // Compare against existing cards
        let maxSim = 0;
        let matchedFront = '';

        for (const card of targetCards) {
          if (!card.front) continue;
          // Simple text overlap fallback or embedding
          if (card.front.toLowerCase() === front.toLowerCase()) {
            maxSim = 1.0;
            matchedFront = card.front;
            break;
          }
        }

        if (maxSim >= 0.85) {
          setDuplicateWarning(`Já existe um card idêntico ou muito similar neste baralho: "${matchedFront.slice(0, 60)}..."`);
        } else {
          setDuplicateWarning(null);
        }
      } catch (err) {
        // Non-blocking fallback
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [front, targetDeckId]);

  // Insert Cloze Snippet at Selection
  const handleInsertCloze = () => {
    const area = frontTextAreaRef.current;
    if (!area) {
      const { newText } = insertClozeMarkup(front, front.length, front.length);
      setFront(newText);
      return;
    }

    const start = area.selectionStart ?? front.length;
    const end = area.selectionEnd ?? front.length;

    const { newText, newSelectionStart } = insertClozeMarkup(front, start, end);
    setFront(newText);

    setTimeout(() => {
      area.focus();
      area.setSelectionRange(newSelectionStart, newSelectionStart);
    }, 10);
  };

  // Keyboard Shortcuts (Ctrl+Shift+C for Cloze, Ctrl+Enter for Add & Continue)
  const handleFrontKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
      e.preventDefault();
      handleInsertCloze();
    }
  };

  const handleGlobalKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveAndContinue();
    }
  };

  // Handle Image Paste & Drop
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setImageUrl(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processImageFile(file);
    }
  };

  // Image Occlusion Actions
  const handleAddOcclusionRect = () => {
    const nextNum = occlusionRects.length + 1;
    const newRect: ImageOcclusionRect = {
      id: `c${nextNum}`,
      x: 25,
      y: 25 + (nextNum * 5) % 40,
      width: 50,
      height: 15,
      label: `Área Oculta ${nextNum}`,
    };
    setOcclusionRects([...occlusionRects, newRect]);
  };

  const handleRemoveOcclusionRect = (id: string) => {
    setOcclusionRects(occlusionRects.filter((r) => r.id !== id));
  };

  const handleUpdateOcclusionRect = (id: string, updates: Partial<ImageOcclusionRect>) => {
    setOcclusionRects(
      occlusionRects.map((r) => (r.id === id ? { ...r, ...updates } : r))
    );
  };

  // Image Occlusion Interactive Drag / Draw / Move / Resize State (Pointer Events for Mouse, Touch, & Pen)
  const [occlusionDragState, setOcclusionDragState] = useState<{
    mode: 'none' | 'drawing' | 'moving' | 'resizing';
    rectId?: string;
    startPx: { x: number; y: number };
    currentPx: { x: number; y: number };
    initialRect?: ImageOcclusionRect;
  }>({ mode: 'none', startPx: { x: 0, y: 0 }, currentPx: { x: 0, y: 0 } });

  // Attach global pointermove & pointerup listeners when dragging/drawing/moving/resizing
  useEffect(() => {
    if (occlusionDragState.mode === 'none') return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!imageContainerRef.current) return;
      const bounds = imageContainerRef.current.getBoundingClientRect();

      if (occlusionDragState.mode === 'drawing') {
        setOcclusionDragState((prev) => ({
          ...prev,
          currentPx: { x: e.clientX, y: e.clientY },
        }));
      } else if (occlusionDragState.mode === 'moving' && occlusionDragState.initialRect && occlusionDragState.rectId) {
        const deltaXPct = ((e.clientX - occlusionDragState.startPx.x) / bounds.width) * 100;
        const deltaYPct = ((e.clientY - occlusionDragState.startPx.y) / bounds.height) * 100;

        const newX = Math.max(0, Math.min(100 - occlusionDragState.initialRect.width, occlusionDragState.initialRect.x + deltaXPct));
        const newY = Math.max(0, Math.min(100 - occlusionDragState.initialRect.height, occlusionDragState.initialRect.y + deltaYPct));

        handleUpdateOcclusionRect(occlusionDragState.rectId, {
          x: Number(newX.toFixed(2)),
          y: Number(newY.toFixed(2)),
        });
      } else if (occlusionDragState.mode === 'resizing' && occlusionDragState.initialRect && occlusionDragState.rectId) {
        const deltaXPct = ((e.clientX - occlusionDragState.startPx.x) / bounds.width) * 100;
        const deltaYPct = ((e.clientY - occlusionDragState.startPx.y) / bounds.height) * 100;

        const newW = Math.max(3, Math.min(100 - occlusionDragState.initialRect.x, occlusionDragState.initialRect.width + deltaXPct));
        const newH = Math.max(3, Math.min(100 - occlusionDragState.initialRect.y, occlusionDragState.initialRect.height + deltaYPct));

        handleUpdateOcclusionRect(occlusionDragState.rectId, {
          width: Number(newW.toFixed(2)),
          height: Number(newH.toFixed(2)),
        });
      }
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      if (occlusionDragState.mode === 'drawing' && imageContainerRef.current) {
        const bounds = imageContainerRef.current.getBoundingClientRect();
        const rect = convertPxToPercentage(
          occlusionDragState.startPx.x,
          occlusionDragState.startPx.y,
          e.clientX,
          e.clientY,
          bounds
        );

        if (rect.width >= 2 && rect.height >= 2) {
          const nextNum = occlusionRects.length + 1;
          const newRect: ImageOcclusionRect = {
            id: `c${nextNum}`,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            label: `Área Oculta ${nextNum}`,
          };
          setOcclusionRects((prev) => [...prev, newRect]);
        }
      }

      setOcclusionDragState({ mode: 'none', startPx: { x: 0, y: 0 }, currentPx: { x: 0, y: 0 } });
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [occlusionDragState, occlusionRects.length]);

  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || e.button !== 0) return;
    setOcclusionDragState({
      mode: 'drawing',
      startPx: { x: e.clientX, y: e.clientY },
      currentPx: { x: e.clientX, y: e.clientY },
    });
  };

  const handleStartMove = (e: React.PointerEvent<HTMLDivElement>, rect: ImageOcclusionRect) => {
    e.stopPropagation();
    if (!e.isPrimary || e.button !== 0) return;
    setOcclusionDragState({
      mode: 'moving',
      rectId: rect.id,
      startPx: { x: e.clientX, y: e.clientY },
      currentPx: { x: e.clientX, y: e.clientY },
      initialRect: { ...rect },
    });
  };

  const handleStartResize = (e: React.PointerEvent<HTMLDivElement>, rect: ImageOcclusionRect) => {
    e.stopPropagation();
    if (!e.isPrimary || e.button !== 0) return;
    setOcclusionDragState({
      mode: 'resizing',
      rectId: rect.id,
      startPx: { x: e.clientX, y: e.clientY },
      currentPx: { x: e.clientX, y: e.clientY },
      initialRect: { ...rect },
    });
  };

  // Save Card Logic
  const saveCardInternal = async (): Promise<FlashCard | null> => {
    if (!targetDeckId) {
      alert('Por favor, selecione um baralho de destino.');
      return null;
    }

    if (noteType !== 'image_occlusion' && !front.trim()) {
      alert('Por favor, preencha o campo Frente do card.');
      return null;
    }

    if (noteType === 'image_occlusion' && !imageUrl) {
      alert('Por favor, forneça uma imagem para o card de Oclusão de Imagem.');
      return null;
    }

    setIsSaving(true);
    try {
      const mappedType: CardType =
        noteType === 'cloze'
          ? 'cloze'
          : noteType === 'image_occlusion'
          ? 'image_occlusion'
          : 'basic';

      const finalTags = [...selectedTags];
      if (subject && !finalTags.includes(subject)) finalTags.push(subject);
      if (topic && !finalTags.includes(topic)) finalTags.push(topic);

      const mainCard = await createCard({
        deckId: targetDeckId,
        type: mappedType,
        front: front.trim() || (noteType === 'image_occlusion' ? '[Oclusão de Imagem]' : 'Card Básico'),
        back: back.trim() || '',
        imageUrl: imageUrl || undefined,
        audioUrl: audioUrl || undefined,
        tags: finalTags,
        subject: subject || undefined,
        topic: topic || undefined,
        subtopic: subtopic || undefined,
        difficulty,
        highYield,
        hint: hint || undefined,
        mnemonic: mnemonic || undefined,
        generateReversed: noteType === 'basic_reversed',
        occlusionRects: noteType === 'image_occlusion' ? occlusionRects : undefined,
      });

      // If Basic (Reversed), create second card with swapped front/back
      if (noteType === 'basic_reversed') {
        await createCard({
          deckId: targetDeckId,
          type: 'basic',
          front: back.trim() || 'Verso (Invertido)',
          back: front.trim() || 'Frente (Invertido)',
          imageUrl: imageUrl || undefined,
          audioUrl: audioUrl || undefined,
          tags: [...finalTags, 'Invertido'],
          subject: subject || undefined,
          topic: topic || undefined,
          subtopic: subtopic || undefined,
          difficulty,
          highYield,
          hint: hint || undefined,
          mnemonic: mnemonic || undefined,
        });
      }

      setSessionCardsCount((prev) => prev + (noteType === 'basic_reversed' ? 2 : 1));
      if (onCardSaved) onCardSaved(mainCard);
      return mainCard;
    } catch (err) {
      console.error('[ManualCardEditor] Erro ao salvar card:', err);
      alert('Erro ao salvar flashcard. Tente novamente.');
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndContinue = async () => {
    const saved = await saveCardInternal();
    if (saved) {
      // Clear front, back, image, hint, mnemonic, rects - KEEP deck, noteType, subject, topic, subtopic, tags
      setFront('');
      setBack('');
      setImageUrl('');
      setAudioUrl('');
      setHint('');
      setMnemonic('');
      setOcclusionRects([]);
      setDuplicateWarning(null);

      setTimeout(() => {
        frontTextAreaRef.current?.focus();
      }, 50);
    }
  };

  const handleSaveAndClose = async () => {
    const saved = await saveCardInternal();
    if (saved && onClose) {
      onClose();
    }
  };

  // Render Template Preview Box
  const renderPreviewBox = () => {
    if (noteType === 'cloze') {
      const tokens = parseClozeText(front || 'Ex: O sopro é {{c1::mesossistólico::tipo}} no foco aórtico.');
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold border-b pb-2" style={{ borderColor: colors.outlineVariant }}>
            <span className="text-cyan-600 dark:text-cyan-400 font-extrabold uppercase">Modo Cloze (Ocultação)</span>
            <button
              type="button"
              onClick={() => setIsPreviewFlipped(!isPreviewFlipped)}
              className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-[11px] font-semibold flex items-center gap-1"
            >
              {isPreviewFlipped ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>{isPreviewFlipped ? 'Vendo Verso' : 'Simular Frente'}</span>
            </button>
          </div>

          {!isPreviewFlipped ? (
            <div className="text-sm font-medium leading-relaxed">
              {tokens.map((token, i) =>
                token.type === 'text' ? (
                  <span key={i}>{token.content}</span>
                ) : (
                  <span
                    key={i}
                    className="inline-block px-1.5 py-0.5 mx-0.5 rounded font-bold text-cyan-600 dark:text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 text-xs"
                  >
                    [{token.hint ? `dica: ${token.hint}` : '...'}]
                  </span>
                )
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium leading-relaxed">
                {tokens.map((token, i) =>
                  token.type === 'text' ? (
                    <span key={i}>{token.content}</span>
                  ) : (
                    <span
                      key={i}
                      className="inline-block px-1.5 py-0.5 mx-0.5 rounded font-bold text-emerald-600 dark:text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 text-xs"
                    >
                      {token.answer}
                    </span>
                  )
                )}
              </div>
              {back && (
                <div className="text-xs opacity-80 pt-2 border-t" style={{ borderColor: colors.outlineVariant }}>
                  <span className="font-bold text-cyan-600 block mb-0.5">Explicação:</span>
                  <p>{back}</p>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (noteType === 'image_occlusion') {
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold border-b pb-2" style={{ borderColor: colors.outlineVariant }}>
            <span className="text-purple-600 dark:text-purple-400 font-extrabold uppercase">Oclusão de Imagem</span>
            <button
              type="button"
              onClick={() => setIsPreviewFlipped(!isPreviewFlipped)}
              className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-[11px] font-semibold flex items-center gap-1"
            >
              {isPreviewFlipped ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>{isPreviewFlipped ? 'Verso (Revelado)' : 'Frente (Oculto)'}</span>
            </button>
          </div>

          {imageUrl ? (
            <div className="relative w-full rounded-xl overflow-hidden border bg-black/5 dark:bg-white/5" style={{ borderColor: colors.outlineVariant }}>
              <img src={imageUrl} alt="Preview Oclusão" className="w-full h-auto max-h-56 object-contain block" />
              {occlusionRects.map((rect) => (
                <div
                  key={rect.id}
                  className={`absolute rounded flex items-center justify-center text-[10px] font-black shadow-sm border transition-all ${
                    !isPreviewFlipped
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-emerald-500/30 text-emerald-900 dark:text-emerald-100 border-emerald-500 font-bold'
                  }`}
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.width}%`,
                    height: `${rect.height}%`,
                  }}
                >
                  {!isPreviewFlipped ? rect.id.toUpperCase() : rect.label || rect.id.toUpperCase()}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs opacity-60 italic text-center py-4">Faça upload ou cole uma imagem para visualizar as áreas ocultas.</p>
          )}
        </div>
      );
    }

    // Basic & Basic Reversed
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-bold border-b pb-2" style={{ borderColor: colors.outlineVariant }}>
          <span className="text-indigo-600 dark:text-indigo-400 font-extrabold uppercase">
            {noteType === 'basic_reversed' ? 'Básico (Invertido — 2 Cards)' : 'Básico (Pergunta / Resposta)'}
          </span>
          <button
            type="button"
            onClick={() => setIsPreviewFlipped(!isPreviewFlipped)}
            className="px-2 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-[11px] font-semibold flex items-center gap-1"
          >
            {isPreviewFlipped ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>{isPreviewFlipped ? 'Verso (Resposta)' : 'Frente (Pergunta)'}</span>
          </button>
        </div>

        {!isPreviewFlipped ? (
          <div className="text-sm font-semibold">{front || 'Pergunta do Flashcard...'}</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs opacity-70 border-b pb-1.5" style={{ borderColor: colors.outlineVariant }}>
              {front}
            </div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{back || 'Resposta ou Explicação...'}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onKeyDown={handleGlobalKeyDown}
      onPaste={handlePaste}
      className="space-y-6"
    >
      {/* Top Header Bar with Session Counter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border" style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outlineVariant }}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
            <Edit3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold">Criar Flashcard Manualmente</h3>
            <p className="text-xs opacity-80">
              Edição profissional de alta velocidade no nível do Anki Desktop.
            </p>
          </div>
        </div>

        {/* Counter Badge */}
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{sessionCardsCount} card{sessionCardsCount !== 1 ? 's' : ''} criado{sessionCardsCount !== 1 ? 's' : ''} nesta sessão</span>
          </span>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 opacity-70"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form Controls (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-4">
          <M3Card variant="elevated" className="p-5 border space-y-4">
            {/* Row 1: Destination Deck & Note Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-90 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Baralho de Destino</span>
                </label>
                <select
                  value={targetDeckId}
                  onChange={(e) => setTargetDeckId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none font-medium"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                >
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-90 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-500" />
                  <span>Tipo de Nota (Note Type)</span>
                </label>
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value as NoteTypeOption)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none font-medium"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                >
                  <option value="basic">Básico (Pergunta / Resposta)</option>
                  <option value="basic_reversed">Básico (Invertido — gera 2 cards)</option>
                  <option value="cloze">Cloze (Ocultação de Lacuna {"{{c1::...}}"})</option>
                  <option value="image_occlusion">Oclusão de Imagem (Image Occlusion)</option>
                </select>
              </div>
            </div>

            {/* Row 2: Subject, Topic, Subtopic & High Yield */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Assunto / Especialidade</label>
                <input
                  type="text"
                  placeholder="Ex: Cardiologia"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Tópico</label>
                <input
                  type="text"
                  placeholder="Ex: Valvopatias"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Subtema</label>
                <input
                  type="text"
                  placeholder="Ex: Estenose Aórtica"
                  value={subtopic}
                  onChange={(e) => setSubtopic(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>
            </div>

            {/* Row 3: Difficulty & High-Yield */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1 border-t" style={{ borderColor: colors.outlineVariant }}>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold opacity-80">Dificuldade:</span>
                {(['Fácil', 'Médio', 'Difícil'] as const).map((diff) => (
                  <button
                    key={diff}
                    type="button"
                    onClick={() => setDifficulty(diff)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                      difficulty === diff
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-black/5 dark:bg-white/5 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {diff}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
                <input
                  type="checkbox"
                  checked={highYield}
                  onChange={(e) => setHighYield(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500"
                />
                <Flame className="w-4 h-4 text-amber-500 fill-current" />
                <span>High-Yield (Residência Médica)</span>
              </label>
            </div>

            {/* Front Input Field */}
            {noteType !== 'image_occlusion' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold opacity-90">
                    {noteType === 'cloze' ? 'Texto com Ocultação Cloze' : 'Frente (Pergunta)'}
                  </label>

                  {noteType === 'cloze' && (
                    <button
                      type="button"
                      onClick={handleInsertCloze}
                      className="text-[11px] px-2.5 py-1 rounded-lg font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/25 transition-colors flex items-center gap-1.5"
                      title="Atalho: Ctrl+Shift+C (ou Cmd+Shift+C)"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>+ Inserir Cloze (Ctrl+Shift+C)</span>
                    </button>
                  )}
                </div>

                <textarea
                  ref={frontTextAreaRef}
                  rows={4}
                  required
                  placeholder={
                    noteType === 'cloze'
                      ? 'Ex: O sopro da estenose aórtica é {{c1::mesossistólico em diamante::fase}} com irradiação para {{c2::carótidas::local}}.'
                      : 'Ex: Qual o achado auscultatório clássico na Estenose Aórtica severa?'
                  }
                  value={front}
                  onChange={(e) => setFront(e.target.value)}
                  onKeyDown={handleFrontKeyDown}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />

                {/* Duplicate Warning Non-blocking Alert */}
                {duplicateWarning && (
                  <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}
              </div>
            )}

            {/* Back Input Field (For basic / reversed / cloze extra explanation) */}
            {noteType !== 'image_occlusion' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold opacity-90">
                  {noteType === 'cloze' ? 'Verso (Explicação Clínica Adicional)' : 'Verso (Resposta / Análise)'}
                </label>
                <textarea
                  rows={3}
                  placeholder="Explicação detalhada da fisiopatologia, conduta clínica ou diagnóstico."
                  value={back}
                  onChange={(e) => setBack(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border outline-none transition-all focus:ring-2 focus:ring-cyan-500/40"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>
            )}

            {/* Image Occlusion Interactive Canvas / Image Editor */}
            {noteType === 'image_occlusion' && (
              <div className="space-y-4 p-4 rounded-xl border" style={{ backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }}>
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold uppercase text-purple-600 dark:text-purple-400 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    <span>Editor Visual de Oclusão de Imagem</span>
                  </h4>

                  {imageUrl && (
                    <M3Button
                      type="button"
                      size="sm"
                      variant="tonal"
                      icon={<Plus className="w-3.5 h-3.5" />}
                      onClick={handleAddOcclusionRect}
                    >
                      + Área Oculta
                    </M3Button>
                  )}
                </div>

                {/* Upload or Dropzone */}
                {!imageUrl ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingOver(true);
                    }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={handleDrop}
                    className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 text-center transition-all ${
                      isDraggingOver ? 'border-purple-500 bg-purple-500/10' : 'opacity-80'
                    }`}
                    style={{ borderColor: colors.outline }}
                  >
                    <ImageIcon className="w-8 h-8 text-purple-500 mb-1" />
                    <p className="text-xs font-bold">Cole uma imagem (Ctrl+V) ou arraste o arquivo aqui</p>
                    <p className="text-[11px] opacity-60">ou insira a URL da imagem abaixo</p>
                    <input
                      type="url"
                      placeholder="https://exemplo.com/imagem-anatomica.png"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="mt-2 w-full max-w-md px-3 py-1.5 text-xs rounded-xl border outline-none text-center"
                      style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Image Box with Overlay Rectangles */}
                    <div
                      ref={imageContainerRef}
                      onPointerDown={handleContainerPointerDown}
                      className="relative w-full rounded-2xl overflow-hidden border bg-black/5 dark:bg-white/5 select-none cursor-crosshair touch-none"
                      style={{ borderColor: colors.outlineVariant, touchAction: 'none' }}
                    >
                      <img src={imageUrl} alt="Oclusão" className="w-full h-auto max-h-96 object-contain block pointer-events-none" />

                      {/* Drawing Preview Rectangle */}
                      {occlusionDragState.mode === 'drawing' && imageContainerRef.current && (() => {
                        const bounds = imageContainerRef.current.getBoundingClientRect();
                        const currentRect = convertPxToPercentage(
                          occlusionDragState.startPx.x,
                          occlusionDragState.startPx.y,
                          occlusionDragState.currentPx.x,
                          occlusionDragState.currentPx.y,
                          bounds
                        );
                        return (
                          <div
                            className="absolute border-2 border-dashed border-purple-500 bg-purple-500/30 rounded pointer-events-none"
                            style={{
                              left: `${currentRect.x}%`,
                              top: `${currentRect.y}%`,
                              width: `${currentRect.width}%`,
                              height: `${currentRect.height}%`,
                            }}
                          />
                        );
                      })()}

                      {/* Existing Rectangles */}
                      {occlusionRects.map((rect) => (
                        <div
                          key={rect.id}
                          onPointerDown={(e) => handleStartMove(e, rect)}
                          className="absolute rounded border-2 border-amber-500 bg-amber-500/40 text-white font-black text-xs flex items-center justify-between p-1 shadow-md cursor-move group touch-none"
                          style={{
                            left: `${rect.x}%`,
                            top: `${rect.y}%`,
                            width: `${rect.width}%`,
                            height: `${rect.height}%`,
                            touchAction: 'none',
                          }}
                        >
                          <span className="bg-amber-600 px-1.5 py-0.5 rounded text-[10px] pointer-events-none">
                            {rect.id.toUpperCase()}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveOcclusionRect(rect.id);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white p-0.5 rounded"
                            title="Remover área"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>

                          {/* Resize Handle (Bottom-Right) */}
                          <div
                            onPointerDown={(e) => handleStartResize(e, rect)}
                            className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-amber-600 border border-white rounded-tl cursor-se-resize hover:bg-amber-500 touch-none"
                            title="Redimensionar"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Rectangles Controls List */}
                    {occlusionRects.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold opacity-80">Ajustar Áreas Ocultas ({occlusionRects.length}):</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {occlusionRects.map((rect) => (
                            <div key={rect.id} className="p-2 rounded-xl border flex items-center gap-2 text-xs" style={{ backgroundColor: colors.surface, borderColor: colors.outlineVariant }}>
                              <span className="font-extrabold text-amber-600">{rect.id.toUpperCase()}:</span>
                              <input
                                type="text"
                                placeholder="Rótulo / Dica"
                                value={rect.label || ''}
                                onChange={(e) => handleUpdateOcclusionRect(rect.id, { label: e.target.value })}
                                className="px-2 py-1 text-xs rounded border outline-none flex-1"
                                style={{ backgroundColor: colors.surfaceContainer, borderColor: colors.outline }}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveOcclusionRect(rect.id)}
                                className="text-red-500 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setImageUrl('');
                          setOcclusionRects([]);
                        }}
                        className="text-xs text-red-500 hover:underline flex items-center gap-1 font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover Imagem</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Media URLs & Tags */}
            <div className="space-y-3 pt-2 border-t" style={{ borderColor: colors.outlineVariant }}>
              {noteType !== 'image_occlusion' && (
                <div>
                  <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>URL da Imagem (ou cole com Ctrl+V)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="https://exemplo.com/imagem.png ou cole print (Ctrl+V)"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                    style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                  />
                </div>
              )}

              {/* Tags Autocomplete */}
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-cyan-500" />
                  <span>Tags (Autocomplete da Coleção)</span>
                </label>

                <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl border min-h-[42px]" style={{ backgroundColor: colors.surface, borderColor: colors.outline }}>
                  {selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md text-xs font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 flex items-center gap-1"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}

                  <input
                    type="text"
                    placeholder="Digite tag e pressione Enter ou vírgula..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    className="bg-transparent text-xs border-none outline-none flex-1 min-w-[140px]"
                    style={{ color: colors.onSurface }}
                  />
                </div>

                {/* Suggestions List */}
                {tagSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    <span className="text-[10px] opacity-60 self-center">Sugestões:</span>
                    {tagSuggestions.slice(0, 6).map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => addTag(sug)}
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/5 dark:bg-white/5 hover:bg-cyan-500/20 text-cyan-600 transition-colors"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons: Add & Continue (Ctrl+Enter) vs Add & Close */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: colors.outlineVariant }}>
              <M3Button
                type="button"
                variant="outlined"
                disabled={isSaving}
                onClick={handleSaveAndClose}
                icon={<Save className="w-4 h-4" />}
              >
                Adicionar e Fechar
              </M3Button>

              <M3Button
                type="button"
                variant="filled"
                disabled={isSaving}
                onClick={handleSaveAndContinue}
                icon={<Send className="w-4 h-4" />}
              >
                Adicionar e Continuar (Ctrl+Enter)
              </M3Button>
            </div>
          </M3Card>
        </div>

        {/* Right Column: Live Template Preview Panel */}
        <div className="space-y-4">
          <M3Card variant="outlined" className="p-5 space-y-4 sticky top-6">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-2">
              <Eye className="w-4 h-4" />
              <span>Pré-Visualização ao Vivo</span>
            </h4>

            <div className="p-4 rounded-xl border bg-black/5 dark:bg-white/5" style={{ borderColor: colors.outlineVariant }}>
              {renderPreviewBox()}
            </div>

            <div className="text-[11px] opacity-60 leading-normal space-y-1 border-t pt-3" style={{ borderColor: colors.outlineVariant }}>
              <p className="font-bold">Dicas do Anki Desktop:</p>
              <p>• Pressione <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">Ctrl+Enter</code> para adicionar rapidamente.</p>
              <p>• Pressione <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">Ctrl+Shift+C</code> para criar um Cloze na seleção.</p>
              <p>• Cole prints com <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">Ctrl+V</code> direto no editor.</p>
            </div>
          </M3Card>
        </div>
      </div>
    </div>
  );
};
