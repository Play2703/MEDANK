/**
 * Developer Console - BooksView Component (Phase 18.5)
 *
 * Complete CRUD for Books with Material 3 styling, search, categories, and full fields.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Search,
  Plus,
  Edit3,
  Trash2,
  FileText,
  Calendar,
  Globe,
  Award,
  Layers,
  X,
  Check,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';
import { useBookViewModel } from '../../core/books';
import { BookModel, BookCreateDTO } from '../../core/books/models/BookModel';

export const BooksView: React.FC = () => {
  const {
    books,
    allBooksCount,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    categories,
    addBook,
    updateBook,
    deleteBook,
    totalStorageFormatted,
  } = useBookViewModel();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookModel | null>(null);

  // Form states
  const [titulo, setTitulo] = useState('');
  const [autor, setAutor] = useState('');
  const [editora, setEditora] = useState('');
  const [edicao, setEdicao] = useState('1ª');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [isbn, setIsbn] = useState('');
  const [disciplina, setDisciplina] = useState('');
  const [especialidade, setEspecialidade] = useState('');
  const [volume, setVolume] = useState('Volume Único');
  const [idioma, setIdioma] = useState('Português');
  const [conteudoTexto, setConteudoTexto] = useState('');
  const [arquivo, setArquivo] = useState('');
  const [categoria, setCategoria] = useState('Clínica Médica');

  const handleOpenAdd = () => {
    setEditingBook(null);
    setTitulo('');
    setAutor('');
    setEditora('');
    setEdicao('1ª');
    setAno(new Date().getFullYear());
    setIsbn('');
    setDisciplina('');
    setEspecialidade('');
    setVolume('Volume Único');
    setIdioma('Português');
    setConteudoTexto('');
    setArquivo('livro_medico.pdf');
    setCategoria('Clínica Médica');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (book: BookModel) => {
    setEditingBook(book);
    setTitulo(book.titulo);
    setAutor(book.autor);
    setEditora(book.editora);
    setEdicao(book.edicao);
    setAno(book.ano);
    setIsbn(book.isbn);
    setDisciplina(book.disciplina);
    setEspecialidade(book.especialidade);
    setVolume(book.volume);
    setIdioma(book.idioma);
    setConteudoTexto(book.conteudoTexto || '');
    setArquivo(book.arquivo);
    setCategoria(book.categoria);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !autor.trim()) return;

    const dto: BookCreateDTO = {
      titulo,
      autor,
      editora,
      edicao,
      ano,
      isbn,
      disciplina,
      especialidade,
      volume,
      idioma,
      conteudoTexto: conteudoTexto.trim() || undefined,
      arquivo: arquivo || `${titulo.toLowerCase().replace(/\s+/g, '_')}.pdf`,
      categoria,
    };

    if (editingBook) {
      updateBook(editingBook.id, dto);
    } else {
      addBook(dto);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-950 border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-mono text-xs font-bold border border-indigo-500/30">
              Fase 18.5
            </span>
            <span className="text-xs text-slate-400 font-medium">Biblioteca de Livros & Tratados</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <BookOpen className="w-7 h-7 text-indigo-400" />
            <span>Módulo de Livros</span>
          </h2>
          <p className="text-xs text-slate-400 max-w-xl">
            Gerenciamento completo de obras literárias e tratados médicos, com suporte a metadados avançados, busca e persistência local.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-2xl bg-slate-900/90 border border-slate-800 text-right">
            <p className="text-[10px] text-slate-400 font-mono">Total Armazenado</p>
            <p className="text-sm font-bold text-indigo-400 font-mono">{totalStorageFormatted} ({allBooksCount} livros)</p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Livro</span>
          </button>
        </div>
      </div>

      {/* Search & Categories Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por título, autor, disciplina ou ISBN..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-white outline-none focus:border-indigo-500 shadow-sm"
          />
        </div>

        {/* Categories Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Books Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {books.map((book) => (
          <motion.div
            key={book.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-5 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between gap-4 group hover:border-indigo-500/50 transition-all"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="px-2.5 py-1 rounded-xl bg-indigo-500/15 text-indigo-300 font-mono text-[10px] font-bold border border-indigo-500/30">
                  {book.categoria}
                </span>
                <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                  {book.edicao} • {book.ano}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-black text-white group-hover:text-indigo-300 transition-colors line-clamp-2">
                  {book.titulo}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-medium">{book.autor}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 text-[11px] text-slate-300 border-t border-slate-800/80 font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px]">Editora</span>
                  <span className="truncate block">{book.editora}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Disciplina</span>
                  <span className="truncate block">{book.disciplina}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Volume</span>
                  <span className="truncate block">{book.volume}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Idioma</span>
                  <span className="truncate block">{book.idioma}</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-400 font-mono">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="truncate">{book.arquivo}</span>
                </div>
                {book.conteudoTexto && book.conteudoTexto.trim().length > 30 ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono border border-emerald-500/30 shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Grafo (NER)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-mono border border-amber-500/30 shrink-0">
                    Não indexado
                  </span>
                )}
              </div>
            </div>

            {/* Actions footer */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
              <span className="text-[10px] font-mono text-slate-500">ISBN: {book.isbn}</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleOpenEdit(book)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Editar"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Deseja excluir "${book.titulo}"?`)) {
                      deleteBook(book.id);
                    }
                  }}
                  className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 transition-colors"
                  title="Excluir"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}

        {books.length === 0 && (
          <div className="col-span-full py-16 text-center space-y-3 bg-slate-900/50 rounded-3xl border border-slate-800">
            <BookOpen className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-400">Nenhum livro encontrado</p>
            <p className="text-xs text-slate-500">Tente buscar por outro termo ou adicione uma nova obra.</p>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-100 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      {editingBook ? 'Editar Livro / Tratado' : 'Adicionar Novo Livro'}
                    </h3>
                    <p className="text-xs text-slate-400">Preencha os metadados bibliográficos completos.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Título do Livro *</label>
                  <input
                    type="text"
                    required
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ex: Sabiston Tratado de Cirurgia"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Autor / Organizador *</label>
                    <input
                      type="text"
                      required
                      value={autor}
                      onChange={(e) => setAutor(e.target.value)}
                      placeholder="Ex: Courtney M. Townsend Jr."
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Editora</label>
                    <input
                      type="text"
                      value={editora}
                      onChange={(e) => setEditora(e.target.value)}
                      placeholder="Ex: Elsevier"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Edição</label>
                    <input
                      type="text"
                      value={edicao}
                      onChange={(e) => setEdicao(e.target.value)}
                      placeholder="Ex: 21ª"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Ano</label>
                    <input
                      type="number"
                      value={ano}
                      onChange={(e) => setAno(parseInt(e.target.value, 10) || 2026)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">ISBN</label>
                    <input
                      type="text"
                      value={isbn}
                      onChange={(e) => setIsbn(e.target.value)}
                      placeholder="978-85..."
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Disciplina</label>
                    <input
                      type="text"
                      value={disciplina}
                      onChange={(e) => setDisciplina(e.target.value)}
                      placeholder="Ex: Cirurgia Geral"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Especialidade</label>
                    <input
                      type="text"
                      value={especialidade}
                      onChange={(e) => setEspecialidade(e.target.value)}
                      placeholder="Ex: Cirurgia"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Volume</label>
                    <input
                      type="text"
                      value={volume}
                      onChange={(e) => setVolume(e.target.value)}
                      placeholder="Ex: Volume 1"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Idioma</label>
                    <input
                      type="text"
                      value={idioma}
                      onChange={(e) => setIdioma(e.target.value)}
                      placeholder="Ex: Português"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-semibold">Categoria</label>
                    <select
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500"
                    >
                      <option value="Clínica Médica">Clínica Médica</option>
                      <option value="Cirurgia">Cirurgia</option>
                      <option value="Pediatria">Pediatria</option>
                      <option value="Ginecologia e Obstetrícia">Ginecologia e Obstetrícia</option>
                      <option value="Anatomia">Anatomia</option>
                      <option value="Cardiologia">Cardiologia</option>
                      <option value="Outros">Outros</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold flex items-center justify-between">
                    <span>Conteúdo do Livro (capítulos ou texto completo)</span>
                    <span className="text-[10px] text-indigo-400 font-mono">Alimenta RAG & Grafo NER</span>
                  </label>
                  <textarea
                    rows={5}
                    value={conteudoTexto}
                    onChange={(e) => setConteudoTexto(e.target.value)}
                    placeholder="Cole o texto ou capítulos do livro para extração de CIDs, entidades e relações no Grafo..."
                    className="w-full p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500 font-mono text-xs leading-relaxed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-semibold">Nome do Arquivo (PDF)</label>
                  <input
                    type="text"
                    value={arquivo}
                    onChange={(e) => setArquivo(e.target.value)}
                    placeholder="Ex: tratado_cirurgia.pdf"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30"
                  >
                    {editingBook ? 'Salvar Alterações' : 'Cadastrar Livro'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
