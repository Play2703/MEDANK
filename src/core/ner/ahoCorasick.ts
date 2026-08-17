/**
 * Generic Aho-Corasick Automaton for multi-pattern exact string matching in O(N + M).
 *
 * NOTE ON DEPENDENCIES:
 * Existing npm packages for Aho-Corasick (such as `ahocorasick`, `modern-ahocorasick`,
 * and `@monyone/aho-corasick`) were evaluated and discarded due to low adoption,
 * lack of maintenance, or absence of native TypeScript generic payload support per pattern.
 * This standalone implementation provides full type-safety and zero external dependencies.
 */

export interface AhoCorasickMatch<T> {
  startIndex: number;
  endIndex: number;
  keyword: string;
  value: T;
}

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  fail: TrieNode<T> | null;
  outputs: Array<{ keyword: string; value: T }>;
  outputLink: TrieNode<T> | null;
}

export class AhoCorasick<T> {
  private root: TrieNode<T>;
  private isBuilt: boolean = false;

  constructor() {
    this.root = this.createNode();
  }

  private createNode(): TrieNode<T> {
    return {
      children: new Map(),
      fail: null,
      outputs: [],
      outputLink: null,
    };
  }

  /**
   * Adds a keyword and associated metadata to the Trie.
   */
  add(keyword: string, value: T): void {
    if (!keyword) return;
    let node = this.root;
    for (let i = 0; i < keyword.length; i++) {
      const char = keyword[i];
      let child = node.children.get(char);
      if (!child) {
        child = this.createNode();
        node.children.set(char, child);
      }
      node = child;
    }
    node.outputs.push({ keyword, value });
  }

  /**
   * Compiles failure links and output links using Breadth-First Search (BFS).
   */
  build(): void {
    const queue: TrieNode<T>[] = [];

    // Root children's failure links point to root
    for (const child of this.root.children.values()) {
      child.fail = this.root;
      queue.push(child);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const [char, child] of current.children.entries()) {
        let failCandidate = current.fail;
        while (failCandidate !== null && !failCandidate.children.has(char)) {
          failCandidate = failCandidate.fail;
        }

        const failNode = failCandidate ? failCandidate.children.get(char)! : this.root;
        child.fail = failNode;
        child.outputLink = failNode.outputs.length > 0 ? failNode : failNode.outputLink;
        queue.push(child);
      }
    }

    this.isBuilt = true;
  }

  /**
   * Searches the text for all occurrences of registered keywords in a single pass O(N + M).
   */
  search(text: string): AhoCorasickMatch<T>[] {
    if (!this.isBuilt) {
      this.build();
    }

    const matches: AhoCorasickMatch<T>[] = [];
    let current: TrieNode<T> = this.root;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      while (current !== this.root && !current.children.has(char)) {
        current = current.fail || this.root;
      }

      if (current.children.has(char)) {
        current = current.children.get(char)!;
      }

      let outNode: TrieNode<T> | null = current.outputs.length > 0 ? current : current.outputLink;
      while (outNode !== null) {
        for (const out of outNode.outputs) {
          matches.push({
            startIndex: i - out.keyword.length + 1,
            endIndex: i + 1,
            keyword: out.keyword,
            value: out.value,
          });
        }
        outNode = outNode.outputLink;
      }
    }

    return matches;
  }
}
