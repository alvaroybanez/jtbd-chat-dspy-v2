/**
 * Text Chunking Strategies
 * Different approaches to splitting text while preserving semantic coherence
 */

import type { TextChunk, ChunkingOptions } from '../types'
import type { TokenCounter } from './tokenizer'
import { ChunkingError } from '../types'

/**
 * Collection of text chunking strategies
 */
export class ChunkingStrategies {
  constructor(private tokenCounter: TokenCounter) {}

  /**
   * Token-based chunking: Split by target token count
   * Simple but may break semantic boundaries
   */
  async tokenBased(text: string, options: ChunkingOptions): Promise<TextChunk[]> {
    const chunks: TextChunk[] = []
    const maxTokens = options.maxTokens!
    const overlapTokens = Math.floor(maxTokens * options.overlapPercentage!)
    
    let currentPosition = 0
    let chunkIndex = 0

    while (currentPosition < text.length) {
      // Calculate approximate chunk size based on character-to-token ratio
      const estimatedCharsPerToken = 4
      const targetChars = maxTokens * estimatedCharsPerToken
      
      let endPosition = Math.min(currentPosition + targetChars, text.length)
      let chunkText = text.slice(currentPosition, endPosition)
      
      // Adjust to fit token limit
      while (this.tokenCounter.count(chunkText) > maxTokens && endPosition > currentPosition + 1) {
        endPosition = Math.floor((currentPosition + endPosition) / 2)
        chunkText = text.slice(currentPosition, endPosition)
      }

      // Try to break at word boundary if possible
      if (endPosition < text.length && options.preserveSentences) {
        const lastSpace = chunkText.lastIndexOf(' ')
        if (lastSpace > currentPosition + (chunkText.length * 0.7)) {
          endPosition = currentPosition + lastSpace
          chunkText = text.slice(currentPosition, endPosition)
        }
      }

      if (chunkText.trim().length > 0) {
        chunks.push({
          content: chunkText.trim(),
          index: chunkIndex++,
          tokenCount: this.tokenCounter.count(chunkText.trim()),
          startIndex: currentPosition,
          endIndex: endPosition,
          metadata: {
            strategy: 'token-based',
            originalLength: chunkText.length
          }
        })
      }

      // Calculate next position with overlap
      const overlapChars = overlapTokens * estimatedCharsPerToken
      currentPosition = Math.max(endPosition - overlapChars, currentPosition + 1)
    }

    return chunks
  }

  /**
   * Sentence-based chunking: Split at sentence boundaries
   * Better semantic coherence
   */
  async sentenceBased(text: string, options: ChunkingOptions): Promise<TextChunk[]> {
    const sentences = this.splitIntoSentences(text)
    const chunks: TextChunk[] = []
    const maxTokens = options.maxTokens!
    const minTokens = options.minTokens!
    const overlapPercentage = options.overlapPercentage!
    
    let currentChunk: string[] = []
    let currentTokens = 0
    let chunkIndex = 0
    let currentStartIndex = 0

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i]
      const sentenceTokens = this.tokenCounter.count(sentence)

      // If single sentence exceeds max tokens, split it
      if (sentenceTokens > maxTokens) {
        // Process any accumulated sentences first
        if (currentChunk.length > 0) {
          chunks.push(this.createChunkFromSentences(
            currentChunk,
            chunkIndex++,
            currentStartIndex,
            text,
            'sentence-based'
          ))
          currentChunk = []
          currentTokens = 0
        }

        // Split the long sentence using token-based strategy
        const longSentenceChunks = await this.tokenBased(sentence, {
          ...options,
          preserveSentences: false
        })

        for (const subChunk of longSentenceChunks) {
          chunks.push({
            ...subChunk,
            index: chunkIndex++,
            metadata: {
              ...subChunk.metadata,
              strategy: 'sentence-based',
              splitSentence: true
            }
          })
        }

        currentStartIndex = this.findTextPosition(text, sentence) + sentence.length
        continue
      }

      // Check if adding this sentence would exceed token limit
      if (currentTokens + sentenceTokens > maxTokens && currentChunk.length > 0) {
        // Create chunk from accumulated sentences
        chunks.push(this.createChunkFromSentences(
          currentChunk,
          chunkIndex++,
          currentStartIndex,
          text,
          'sentence-based'
        ))

        // Start new chunk with overlap
        const overlapSentences = this.calculateSentenceOverlap(currentChunk, overlapPercentage)
        currentChunk = overlapSentences.concat([sentence])
        currentTokens = this.tokenCounter.count(currentChunk.join(' '))
        currentStartIndex = this.findTextPosition(text, overlapSentences[0] || sentence)
      } else {
        // Add sentence to current chunk
        currentChunk.push(sentence)
        currentTokens += sentenceTokens
        
        if (currentChunk.length === 1) {
          currentStartIndex = this.findTextPosition(text, sentence)
        }
      }
    }

    // Add final chunk if it meets minimum requirements
    if (currentChunk.length > 0 && currentTokens >= minTokens) {
      chunks.push(this.createChunkFromSentences(
        currentChunk,
        chunkIndex++,
        currentStartIndex,
        text,
        'sentence-based'
      ))
    }

    return chunks
  }

  /**
   * Paragraph-based chunking: Split at paragraph boundaries
   * Good for maintaining document structure
   */
  async paragraphBased(text: string, options: ChunkingOptions): Promise<TextChunk[]> {
    const paragraphs = this.splitIntoParagraphs(text)
    const chunks: TextChunk[] = []
    const maxTokens = options.maxTokens!
    const minTokens = options.minTokens!
    
    let currentChunk: string[] = []
    let currentTokens = 0
    let chunkIndex = 0
    let currentStartIndex = 0

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i]
      const paragraphTokens = this.tokenCounter.count(paragraph)

      // If single paragraph exceeds max tokens, split it using sentences
      if (paragraphTokens > maxTokens) {
        // Process any accumulated paragraphs first
        if (currentChunk.length > 0) {
          chunks.push(this.createChunkFromParagraphs(
            currentChunk,
            chunkIndex++,
            currentStartIndex,
            text
          ))
          currentChunk = []
          currentTokens = 0
        }

        // Split the long paragraph using sentence-based strategy
        const paragraphChunks = await this.sentenceBased(paragraph, options)
        for (const subChunk of paragraphChunks) {
          chunks.push({
            ...subChunk,
            index: chunkIndex++,
            metadata: {
              ...subChunk.metadata,
              strategy: 'paragraph-based',
              splitParagraph: true
            }
          })
        }

        currentStartIndex = this.findTextPosition(text, paragraph) + paragraph.length
        continue
      }

      // Check if adding this paragraph would exceed token limit
      if (currentTokens + paragraphTokens > maxTokens && currentChunk.length > 0) {
        chunks.push(this.createChunkFromParagraphs(
          currentChunk,
          chunkIndex++,
          currentStartIndex,
          text
        ))

        // Start new chunk
        currentChunk = [paragraph]
        currentTokens = paragraphTokens
        currentStartIndex = this.findTextPosition(text, paragraph)
      } else {
        // Add paragraph to current chunk
        currentChunk.push(paragraph)
        currentTokens += paragraphTokens
        
        if (currentChunk.length === 1) {
          currentStartIndex = this.findTextPosition(text, paragraph)
        }
      }
    }

    // Add final chunk if it meets minimum requirements
    if (currentChunk.length > 0 && currentTokens >= minTokens) {
      chunks.push(this.createChunkFromParagraphs(
        currentChunk,
        chunkIndex++,
        currentStartIndex,
        text
      ))
    }

    return chunks
  }

  /**
   * Section-based chunking: Split at section headers (Markdown style)
   * Best for structured documents
   */
  async sectionBased(text: string, options: ChunkingOptions): Promise<TextChunk[]> {
    const sections = this.splitIntoSections(text)
    const chunks: TextChunk[] = []
    const maxTokens = options.maxTokens!
    const minTokens = options.minTokens!
    
    let chunkIndex = 0

    for (const section of sections) {
      const sectionTokens = this.tokenCounter.count(section.content)

      if (sectionTokens <= maxTokens && sectionTokens >= minTokens) {
        // Section fits perfectly
        chunks.push({
          content: section.content.trim(),
          index: chunkIndex++,
          tokenCount: sectionTokens,
          startIndex: section.startIndex,
          endIndex: section.endIndex,
          metadata: {
            strategy: 'section-based',
            sectionLevel: section.level,
            sectionTitle: section.title
          }
        })
      } else if (sectionTokens > maxTokens) {
        // Section too large, split using paragraph-based strategy
        const sectionChunks = await this.paragraphBased(section.content, options)
        for (const subChunk of sectionChunks) {
          chunks.push({
            ...subChunk,
            index: chunkIndex++,
            metadata: {
              ...subChunk.metadata,
              strategy: 'section-based',
              parentSection: section.title,
              sectionLevel: section.level
            }
          })
        }
      }
      // Skip sections that are too small (below minTokens)
    }

    return chunks
  }

  /**
   * Split text into sentences using multiple delimiters
   */
  private splitIntoSentences(text: string): string[] {
    // Enhanced sentence splitting with multiple patterns
    const sentenceDelimiters = /[.!?]+(?:\s+|$)/g
    
    // Split by delimiters but keep them
    const parts = text.split(sentenceDelimiters)
    const delimiters = text.match(sentenceDelimiters) || []
    
    const sentences: string[] = []
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].trim()) {
        const sentence = parts[i].trim() + (delimiters[i] || '')
        sentences.push(sentence)
      }
    }

    return sentences.filter(s => s.trim().length > 0)
  }

  /**
   * Split text into paragraphs
   */
  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
  }

  /**
   * Split text into sections based on headers
   */
  private splitIntoSections(text: string): Array<{
    content: string
    title: string
    level: number
    startIndex: number
    endIndex: number
  }> {
    const sections: Array<{
      content: string
      title: string
      level: number
      startIndex: number
      endIndex: number
    }> = []

    // Regex for Markdown headers
    const headerRegex = /^(#{1,6})\s+(.+)$/gm
    const matches = Array.from(text.matchAll(headerRegex))

    if (matches.length === 0) {
      // No headers found, treat entire text as one section
      return [{
        content: text,
        title: 'Document',
        level: 1,
        startIndex: 0,
        endIndex: text.length
      }]
    }

    let lastIndex = 0

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      const nextMatch = matches[i + 1]
      
      const headerLevel = match[1].length
      const headerTitle = match[2].trim()
      const headerStart = match.index!
      
      const contentStart = headerStart
      const contentEnd = nextMatch ? nextMatch.index! : text.length
      
      const sectionContent = text.slice(contentStart, contentEnd).trim()

      if (sectionContent.length > 0) {
        sections.push({
          content: sectionContent,
          title: headerTitle,
          level: headerLevel,
          startIndex: contentStart,
          endIndex: contentEnd
        })
      }

      lastIndex = contentEnd
    }

    return sections
  }

  /**
   * Create chunk from array of sentences
   */
  private createChunkFromSentences(
    sentences: string[],
    index: number,
    startIndex: number,
    originalText: string,
    strategy: string
  ): TextChunk {
    const content = sentences.join(' ').trim()
    const endIndex = startIndex + content.length

    return {
      content,
      index,
      tokenCount: this.tokenCounter.count(content),
      startIndex,
      endIndex,
      metadata: {
        strategy,
        sentenceCount: sentences.length,
        avgSentenceLength: content.length / sentences.length
      }
    }
  }

  /**
   * Create chunk from array of paragraphs
   */
  private createChunkFromParagraphs(
    paragraphs: string[],
    index: number,
    startIndex: number,
    originalText: string
  ): TextChunk {
    const content = paragraphs.join('\n\n').trim()
    const endIndex = startIndex + content.length

    return {
      content,
      index,
      tokenCount: this.tokenCounter.count(content),
      startIndex,
      endIndex,
      metadata: {
        strategy: 'paragraph-based',
        paragraphCount: paragraphs.length,
        avgParagraphLength: content.length / paragraphs.length
      }
    }
  }

  /**
   * Calculate sentences to include for overlap
   */
  private calculateSentenceOverlap(sentences: string[], overlapPercentage: number): string[] {
    const overlapCount = Math.floor(sentences.length * overlapPercentage)
    return sentences.slice(-overlapCount)
  }

  /**
   * Find position of text within larger text
   */
  private findTextPosition(haystack: string, needle: string): number {
    const index = haystack.indexOf(needle.trim())
    return index >= 0 ? index : 0
  }
}