/**
 * MedCore Book Provider & ViewModel - Phase 18.5
 */

import { useState, useEffect, useCallback } from 'react';
import { BookModel, BookCreateDTO, BookUpdateDTO } from '../models/BookModel';
import { bookRepository } from '../repositories/BookRepository';
import { medKnowledgeRepository } from '../../../data/repositories_impl/MedKnowledgeRepository';

export function useBookViewModel() {
  const [books, setBooks] = useState<BookModel[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadBooks = useCallback(async () => {
    setIsLoading(true);
    const data = await bookRepository.getAllAsync();
    setBooks(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadBooks();
    const unsubscribe = medKnowledgeRepository.subscribe(() => {
      loadBooks();
    });
    return unsubscribe;
  }, [loadBooks]);

  const addBook = (dto: BookCreateDTO) => {
    bookRepository.create(dto);
    loadBooks();
  };

  const updateBook = (id: string, dto: BookUpdateDTO) => {
    bookRepository.update(id, dto);
    loadBooks();
  };

  const deleteBook = (id: string) => {
    bookRepository.delete(id);
    loadBooks();
  };

  const categories = ['Todas', ...Array.from(new Set(books.map((b) => b.categoria)))];

  const filteredBooks = books.filter((b) => {
    const matchesSearch =
      b.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.autor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.disciplina.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.isbn.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'Todas' || b.categoria === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const totalStorageBytes = books.reduce((acc, curr) => acc + curr.tamanhoArquivo, 0);
  const totalStorageFormatted = `${(totalStorageBytes / (1024 * 1024)).toFixed(1)} MB`;

  return {
    books: filteredBooks,
    allBooksCount: books.length,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    categories,
    isLoading,
    addBook,
    updateBook,
    deleteBook,
    totalStorageFormatted,
  };
}
