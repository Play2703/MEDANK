import React, { useState, useEffect } from 'react';
import { FlashCard, CardDifficulty, CardType } from '../../../domain/entities/Card';
import { Deck } from '../../../domain/entities/Deck';
import { DeckRepositoryImpl } from '../../../data/repositories_impl/DeckRepositoryImpl';
import { useCardViewModel } from '../../viewmodels/useCardViewModel';
import { useDevice } from '../../../core/responsive/DeviceContext';
import { M3Card } from '../../components/Material3/M3Card';
import { M3Button } from '../../components/Material3/M3Button';
import { M3Chip } from '../../components/Material3/M3Chip';
import { ManualCardEditor } from '../AIGenerator/ManualCardEditor';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit2,
  Flame,
  Search,
  Copy,
  Image as ImageIcon,
  Volume2,
  Calendar,
  History,
  Info,
  Layers,
  Sparkles,
  Tag as TagIcon,
  ChevronRight,
  Filter,
} from 'lucide-react';

const deckRepo = new DeckRepositoryImpl();

interface CardManagerViewProps {
  deckId: string;
  onBack: () => void;
}

export const CardManagerView: React.FC<CardManagerViewProps> = ({ deckId, onBack }) => {
  const { colors } = useDevice();
  const [deck, setDeck] = useState<Deck | null>(null);

  const {
    cards,
    allCards,
    loading,
    searchQuery,
    selectedDifficulty,
    setSearchQuery,
    setDifficultyFilter,
    loadCards,
    createCard,
    updateCard,
    deleteCard,
    duplicateCard,
  } = useCardViewModel(deckId);

  // Form State
  const [isEditing, setIsEditing] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  const [cardType, setCardType] = useState<CardType>('cloze');
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioText, setAudioText] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [subject, setSubject] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<CardDifficulty>('Médio');
  const [highYield, setHighYield] = useState(true);
  const [hint, setHint] = useState('');
  const [mnemonic, setMnemonic] = useState('');

  // Selected Card Details Modal State
  const [selectedDetailCard, setSelectedDetailCard] = useState<FlashCard | null>(null);

  useEffect(() => {
    loadCards(deckId);
    deckRepo.getDeckById(deckId).then((d) => setDeck(d));
  }, [deckId]);

  const insertClozeSnippet = () => {
    setFront((prev) => `${prev} {{c1::termo::dica}}`);
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!front.trim()) return;

    const tagsArr = tagInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingCardId) {
      await updateCard(editingCardId, {
        type: cardType,
        front,
        back,
        imageUrl: imageUrl.trim() || undefined,
        audioUrl: audioUrl.trim() || undefined,
        audioText: audioText.trim() || undefined,
        tags: tagsArr.length > 0 ? tagsArr : ['MedAnki'],
        subject: subject.trim() || undefined,
        subtopic: subtopic.trim() || undefined,
        topic: topic.trim() || undefined,
        difficulty,
        highYield,
        hint: hint.trim() || undefined,
        mnemonic: mnemonic.trim() || undefined,
      });
    } else {
      await createCard({
        deckId,
        type: cardType,
        front,
        back,
        imageUrl: imageUrl.trim() || undefined,
        audioUrl: audioUrl.trim() || undefined,
        audioText: audioText.trim() || undefined,
        tags: tagsArr.length > 0 ? tagsArr : [deck?.category || 'Medicina'],
        subject: subject.trim() || deck?.category || undefined,
        subtopic: subtopic.trim() || undefined,
        topic: topic.trim() || undefined,
        difficulty,
        highYield,
        hint: hint.trim() || undefined,
        mnemonic: mnemonic.trim() || undefined,
      });
    }

    resetForm();
  };

  const resetForm = () => {
    setEditingCardId(null);
    setCardType('cloze');
    setFront('');
    setBack('');
    setImageUrl('');
    setAudioUrl('');
    setAudioText('');
    setTagInput('');
    setSubject('');
    setSubtopic('');
    setTopic('');
    setDifficulty('Médio');
    setHighYield(true);
    setHint('');
    setMnemonic('');
    setIsEditing(false);
  };

  const handleEditClick = (card: FlashCard) => {
    setEditingCardId(card.id);
    setCardType(card.type);
    setFront(card.front);
    setBack(card.back);
    setImageUrl(card.imageUrl || '');
    setAudioUrl(card.audioUrl || '');
    setAudioText(card.audioText || '');
    setTagInput(card.tags.join(', '));
    setSubject(card.subject || '');
    setSubtopic(card.subtopic || '');
    setTopic(card.topic || '');
    setDifficulty(card.difficulty || 'Médio');
    setHighYield(card.highYield ?? true);
    setHint(card.hint || '');
    setMnemonic(card.mnemonic || '');
    setIsEditing(true);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Voltar aos Baralhos</span>
          <span className="sm:hidden">Voltar</span>
        </button>

        <h2 className="text-base sm:text-xl font-bold truncate text-center flex-1 min-w-0" title={deck?.title}>
          {deck?.title || 'Gerenciador de Flashcards'}
        </h2>

        <M3Button
          variant="filled"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => {
            resetForm();
            setIsEditing(true);
          }}
          className="shrink-0"
        >
          Novo Card
        </M3Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Field */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-full border flex-1"
          style={{
            backgroundColor: colors.surfaceContainer,
            borderColor: colors.outlineVariant,
          }}
        >
          <Search className="w-4 h-4 opacity-70" />
          <input
            type="text"
            placeholder="Buscar por frente, verso, assunto ou tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-sm border-none outline-none w-full"
            style={{ color: colors.onSurface }}
          />
        </div>

        {/* Difficulty Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(['Todas', 'Fácil', 'Médio', 'Difícil'] as const).map((diff) => (
            <M3Chip
              key={diff}
              label={diff === 'Todas' ? 'Todas Dificuldades' : diff}
              selected={selectedDifficulty === diff}
              onClick={() => setDifficultyFilter(diff)}
            />
          ))}
        </div>
      </div>

      {/* Card Editor / Form */}
      {isEditing && !editingCardId && (
        <ManualCardEditor
          initialDeckId={deckId}
          onClose={resetForm}
          onCardSaved={() => {
            resetForm();
            loadCards(deckId);
          }}
        />
      )}

      {isEditing && editingCardId && (
        <M3Card variant="elevated" className="p-6 border space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-cyan-600" />
              <span>Editar Flashcard Médico</span>
            </h3>
            <span className="text-xs font-semibold text-cyan-500 bg-cyan-500/10 px-2.5 py-0.5 rounded-full">
              Riverpod Reactive CRUD
            </span>
          </div>

          <form onSubmit={handleSaveCard} className="space-y-4">
            {/* Type, Difficulty & High-Yield */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Tipo de Card</label>
                <select
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value as CardType)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                >
                  <option value="cloze">Cloze (Ocultação de Lacuna {"{{c1::...}}"})</option>
                  <option value="basic">Básico (Pergunta / Resposta)</option>
                  <option value="image_occlusion">Ocultação de Imagem</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Grau de Dificuldade</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as CardDifficulty)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                >
                  <option value="Fácil">Fácil</option>
                  <option value="Médio">Médio</option>
                  <option value="Difícil">Difícil</option>
                </select>
              </div>

              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold select-none">
                  <input
                    type="checkbox"
                    checked={highYield}
                    onChange={(e) => setHighYield(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-600 focus:ring-cyan-500"
                  />
                  <Flame className="w-4 h-4 text-amber-500 fill-current" />
                  <span>High-Yield (Residência Médica)</span>
                </label>
              </div>
            </div>

            {/* Subject, Topic, Subtopic */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Assunto</label>
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

            {/* Front / Question */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold opacity-80">Frente / Texto do Card</label>
                {cardType === 'cloze' && (
                  <button
                    type="button"
                    onClick={insertClozeSnippet}
                    className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/20 cursor-pointer"
                  >
                    + Inserir Cloze &#123;&#123;c1::termo::dica&#125;&#125;
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                required
                placeholder={
                  cardType === 'cloze'
                    ? 'Ex: O sopro da estenose aórtica é {{c1::mesossistólico em diamante::característica}} com irradiação para {{c2::carótidas::local}}.'
                    : 'Ex: Qual o achado auscultatório clássico na Estenose Aórtica severa?'
                }
                value={front}
                onChange={(e) => setFront(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none font-sans"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              />
            </div>

            {/* Back / Explanation */}
            <div>
              <label className="block text-xs font-bold mb-1 opacity-80">Verso / Explicação Clínica</label>
              <textarea
                rows={3}
                placeholder="Explicação detalhada da fisiopatologia, diagnóstico e condutas clínicas."
                value={back}
                onChange={(e) => setBack(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border outline-none font-sans"
                style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
              />
            </div>

            {/* Image & Audio Media URLs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                  <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                  <span>URL da Imagem</span>
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/ecg-imagem.png"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80 flex items-center gap-1">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>URL do Áudio ou Texto para Pronúncia</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: Texto para sintese TTS ou URL .mp3"
                  value={audioText}
                  onChange={(e) => setAudioText(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>
            </div>

            {/* Tags & Hint */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Tags (Separadas por vírgula)</label>
                <input
                  type="text"
                  placeholder="Ex: ECG, ENARE2025, Emergencia"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 opacity-80">Dica ou Macete (Mnemônico)</label>
                <input
                  type="text"
                  placeholder="Ex: Dica: 'Sopro em diamante'"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border outline-none"
                  style={{ backgroundColor: colors.surface, borderColor: colors.outline, color: colors.onSurface }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: colors.outlineVariant }}>
              <M3Button type="button" variant="text" onClick={resetForm}>
                Cancelar
              </M3Button>
              <M3Button type="submit" variant="filled">
                {editingCardId ? 'Salvar Alterações' : 'Adicionar Flashcard'}
              </M3Button>
            </div>
          </form>
        </M3Card>
      )}

      {/* Cards List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold opacity-80">Flashcards no Baralho ({cards.length})</h3>
          <span className="text-xs opacity-60">Exibindo {cards.length} de {allCards.length}</span>
        </div>

        {cards.length === 0 ? (
          <M3Card className="text-center py-10 opacity-70 space-y-2">
            <Layers className="w-10 h-10 mx-auto opacity-40" />
            <p className="text-sm font-semibold">Nenhum flashcard encontrado.</p>
            <p className="text-xs opacity-70">Clique em "Novo Card" para adicionar a esta coleção.</p>
          </M3Card>
        ) : (
          cards.map((card) => (
            <M3Card key={card.id} variant="outlined" className="p-4 space-y-3 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  {/* Badges Bar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600">
                      {card.type}
                    </span>

                    {card.difficulty && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          card.difficulty === 'Fácil'
                            ? 'bg-emerald-500/10 text-emerald-600'
                            : card.difficulty === 'Difícil'
                            ? 'bg-rose-500/10 text-rose-600'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}
                      >
                        {card.difficulty}
                      </span>
                    )}

                    {card.highYield && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"
                        style={{ backgroundColor: colors.highYieldContainer, color: colors.highYield }}
                      >
                        <Flame className="w-3 h-3 fill-current" />
                        HIGH YIELD
                      </span>
                    )}

                    {card.subject && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                        {card.subject}
                      </span>
                    )}
                  </div>

                  {/* Front & Back Preview */}
                  <div className="text-sm font-bold">{card.front}</div>
                  <div className="text-xs opacity-80 line-clamp-2">{card.back}</div>

                  {/* Metadata Chips: SM-2 State Stats */}
                  <div className="pt-2 flex flex-wrap items-center gap-3 text-[11px] opacity-75 border-t border-white/5">
                    <span>
                      📅 <strong>Próxima Revisão:</strong> {new Date(card.sm2State.dueDate).toLocaleDateString('pt-BR')}
                    </span>
                    <span>
                      ⚡ <strong>Ease Factor:</strong> {card.sm2State.easeFactor}
                    </span>
                    <span>
                      🔄 <strong>Repetições:</strong> {card.sm2State.repetitions}
                    </span>
                    <span>
                      ⏱️ <strong>Intervalo:</strong> {card.sm2State.interval}d
                    </span>
                  </div>
                </div>

                {/* Card Action Icons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setSelectedDetailCard(card)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-colors cursor-pointer"
                    title="Ver Detalhes e Histórico"
                  >
                    <Info className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => duplicateCard(card.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-white/5 transition-colors cursor-pointer"
                    title="Duplicar Card"
                  >
                    <Copy className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleEditClick(card)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-white/5 transition-colors cursor-pointer"
                    title="Editar Card"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => deleteCard(card.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Excluir Card"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </M3Card>
          ))
        )}
      </div>

      {/* Card Details & History Modal */}
      {selectedDetailCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div
            className="w-full max-w-lg rounded-3xl p-6 space-y-4 shadow-xl border animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
              color: colors.onSurface,
            }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Info className="w-5 h-5 text-cyan-500" />
                <span>Detalhes do Flashcard Médico</span>
              </h3>
              <button
                onClick={() => setSelectedDetailCard(null)}
                className="text-xs font-bold px-2 py-1 rounded bg-white/10 hover:bg-white/20"
              >
                Fechar
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="p-3 rounded-xl bg-black/10 dark:bg-white/5 space-y-1">
                <span className="text-xs font-bold opacity-60 uppercase">Frente (Pergunta)</span>
                <p className="font-semibold">{selectedDetailCard.front}</p>
              </div>

              <div className="p-3 rounded-xl bg-black/10 dark:bg-white/5 space-y-1">
                <span className="text-xs font-bold opacity-60 uppercase">Verso (Resposta / Explicação)</span>
                <p>{selectedDetailCard.back}</p>
              </div>

              {/* Taxonomy */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2 rounded bg-white/5">
                  <span className="opacity-60 block">Assunto</span>
                  <strong className="truncate block">{selectedDetailCard.subject || 'N/A'}</strong>
                </div>
                <div className="p-2 rounded bg-white/5">
                  <span className="opacity-60 block">Tópico</span>
                  <strong className="truncate block">{selectedDetailCard.topic || 'N/A'}</strong>
                </div>
                <div className="p-2 rounded bg-white/5">
                  <span className="opacity-60 block">Subtema</span>
                  <strong className="truncate block">{selectedDetailCard.subtopic || 'N/A'}</strong>
                </div>
              </div>

              {/* SM-2 & Creation Timestamps */}
              <div className="p-3 rounded-xl border border-white/10 space-y-2 text-xs">
                <div className="font-bold text-cyan-400">Métricas & Estado SM-2</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>Criação: {new Date(selectedDetailCard.createdAt).toLocaleString('pt-BR')}</div>
                  <div>Última Revisão: {selectedDetailCard.sm2State.lastReviewedAt ? new Date(selectedDetailCard.sm2State.lastReviewedAt).toLocaleString('pt-BR') : 'Nunca'}</div>
                  <div>Próxima Revisão: {new Date(selectedDetailCard.sm2State.dueDate).toLocaleString('pt-BR')}</div>
                  <div>Ease Factor: {selectedDetailCard.sm2State.easeFactor}</div>
                  <div>Intervalo Atual: {selectedDetailCard.sm2State.interval} dias</div>
                  <div>Repetições: {selectedDetailCard.sm2State.repetitions}</div>
                </div>
              </div>

              {/* Review History */}
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs font-bold text-slate-300">
                  <History className="w-4 h-4 text-emerald-400" />
                  <span>Histórico de Revisões ({selectedDetailCard.history?.length || 0})</span>
                </div>

                {!selectedDetailCard.history || selectedDetailCard.history.length === 0 ? (
                  <p className="text-xs opacity-60 italic">Nenhuma revisão gravada ainda.</p>
                ) : (
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {selectedDetailCard.history.map((log, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 rounded bg-white/5">
                        <span>{new Date(log.reviewedAt).toLocaleString('pt-BR')}</span>
                        <span className="font-bold">Avaliação: {log.rating}/4</span>
                        <span>{log.timeSpentSeconds}s</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
