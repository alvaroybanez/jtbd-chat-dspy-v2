"""
Text processing utilities for the JTBD Assistant Platform.
Handles document chunking, token counting, and text preprocessing.
"""

import re
import tiktoken
from typing import List, Dict, Tuple, Optional

# Constants
DEFAULT_CHUNK_SIZE = 1000  # tokens
DEFAULT_CHUNK_OVERLAP = 200  # tokens
DEFAULT_ENCODING = "cl100k_base"  # GPT-4/GPT-3.5-turbo encoding
MIN_CHUNK_SIZE = 100  # minimum tokens for a chunk
MAX_CHUNK_SIZE = 8000  # maximum tokens per chunk


class TextProcessor:
    """Handles text processing operations including chunking and token counting."""

    def __init__(self, encoding_name: str = DEFAULT_ENCODING):
        """Initialize text processor with specified encoding."""
        try:
            self.encoding = tiktoken.get_encoding(encoding_name)
        except Exception as e:
            # Fallback to default encoding
            print(
                f"Warning: Could not load encoding {encoding_name}, using default: {e}"
            )
            self.encoding = tiktoken.get_encoding(DEFAULT_ENCODING)

    def count_tokens(self, text: str) -> int:
        """
        Count tokens in text using tiktoken.

        Args:
            text: Text to count tokens for

        Returns:
            Number of tokens in the text
        """
        if not text:
            return 0

        try:
            return len(self.encoding.encode(text))
        except Exception as e:
            # Fallback to character-based estimation
            print(f"Warning: Token counting failed, using character estimate: {e}")
            return len(text) // 4  # Rough estimation: ~4 characters per token

    def clean_text(self, text: str) -> str:
        """
        Clean and normalize text for processing.

        Args:
            text: Raw text to clean

        Returns:
            Cleaned text
        """
        if not text:
            return ""

        # Remove excessive whitespace
        text = re.sub(r"\s+", " ", text)

        # Remove or replace special characters that might cause issues
        text = re.sub(r'[^\w\s\.\,\!\?\;\:\(\)\[\]\{\}\-\'"\/]', " ", text)

        # Remove excessive punctuation
        text = re.sub(r"\.{3,}", "...", text)
        text = re.sub(r"\!{2,}", "!!", text)
        text = re.sub(r"\?{2,}", "??", text)

        # Trim and normalize
        text = text.strip()

        return text

    def split_into_sentences(self, text: str) -> List[str]:
        """
        Split text into sentences using simple regex patterns.

        Args:
            text: Text to split

        Returns:
            List of sentences
        """
        if not text:
            return []

        # Simple sentence splitting patterns
        sentence_endings = r"[.!?]+(?:\s|$)"
        sentences = re.split(sentence_endings, text)

        # Clean up sentences
        cleaned_sentences = []
        for sentence in sentences:
            sentence = sentence.strip()
            if sentence and len(sentence) > 3:  # Minimum sentence length
                cleaned_sentences.append(sentence)

        return cleaned_sentences

    def chunk_text_by_tokens(
        self,
        text: str,
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        overlap_size: int = DEFAULT_CHUNK_OVERLAP,
        preserve_sentences: bool = True,
    ) -> List[Tuple[int, str, int]]:
        """
        Split text into chunks based on token count.

        Args:
            text: Text to chunk
            chunk_size: Target tokens per chunk
            overlap_size: Overlap tokens between chunks
            preserve_sentences: Try to preserve sentence boundaries

        Returns:
            List of (chunk_index, chunk_text, token_count) tuples
        """
        if not text:
            return []

        # Validate parameters
        chunk_size = max(MIN_CHUNK_SIZE, min(chunk_size, MAX_CHUNK_SIZE))
        overlap_size = min(overlap_size, chunk_size // 2)

        # Clean text first
        text = self.clean_text(text)

        # If text is small enough, return as single chunk
        total_tokens = self.count_tokens(text)
        if total_tokens <= chunk_size:
            return [(0, text, total_tokens)]

        chunks = []

        if preserve_sentences:
            chunks = self._chunk_by_sentences(text, chunk_size, overlap_size)
        else:
            chunks = self._chunk_by_tokens_direct(text, chunk_size, overlap_size)

        # Add token counts to chunks
        final_chunks = []
        for i, chunk_text in enumerate(chunks):
            token_count = self.count_tokens(chunk_text)
            final_chunks.append((i, chunk_text, token_count))

        return final_chunks

    def _chunk_by_sentences(
        self, text: str, chunk_size: int, overlap_size: int
    ) -> List[str]:
        """
        Chunk text preserving sentence boundaries.

        Args:
            text: Text to chunk
            chunk_size: Target tokens per chunk
            overlap_size: Overlap tokens between chunks

        Returns:
            List of chunk texts
        """
        sentences = self.split_into_sentences(text)
        if not sentences:
            return [text]

        chunks = []
        current_chunk = []
        current_tokens = 0

        i = 0
        while i < len(sentences):
            sentence = sentences[i]
            sentence_tokens = self.count_tokens(sentence)

            # If single sentence exceeds chunk size, split it directly
            if sentence_tokens > chunk_size:
                if current_chunk:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = []
                    current_tokens = 0

                # Split oversized sentence
                sub_chunks = self._chunk_by_tokens_direct(
                    sentence, chunk_size, overlap_size
                )
                chunks.extend(sub_chunks)
                i += 1
                continue

            # Check if adding this sentence would exceed chunk size
            if current_tokens + sentence_tokens > chunk_size and current_chunk:
                # Save current chunk
                chunks.append(" ".join(current_chunk))

                # Start new chunk with overlap
                if overlap_size > 0:
                    overlap_chunk = []
                    overlap_tokens = 0

                    # Add sentences from end of current chunk for overlap
                    for j in range(len(current_chunk) - 1, -1, -1):
                        prev_sentence = current_chunk[j]
                        prev_tokens = self.count_tokens(prev_sentence)

                        if overlap_tokens + prev_tokens <= overlap_size:
                            overlap_chunk.insert(0, prev_sentence)
                            overlap_tokens += prev_tokens
                        else:
                            break

                    current_chunk = overlap_chunk
                    current_tokens = overlap_tokens
                else:
                    current_chunk = []
                    current_tokens = 0

            # Add current sentence to chunk
            current_chunk.append(sentence)
            current_tokens += sentence_tokens
            i += 1

        # Add final chunk if it exists
        if current_chunk:
            chunks.append(" ".join(current_chunk))

        return chunks

    def _chunk_by_tokens_direct(
        self, text: str, chunk_size: int, overlap_size: int
    ) -> List[str]:
        """
        Chunk text directly by tokens without preserving sentence boundaries.

        Args:
            text: Text to chunk
            chunk_size: Target tokens per chunk
            overlap_size: Overlap tokens between chunks

        Returns:
            List of chunk texts
        """
        tokens = self.encoding.encode(text)
        chunks = []

        start = 0
        while start < len(tokens):
            end = min(start + chunk_size, len(tokens))
            chunk_tokens = tokens[start:end]

            try:
                chunk_text = self.encoding.decode(chunk_tokens)
                chunks.append(chunk_text)
            except Exception as e:
                print(f"Warning: Failed to decode chunk tokens: {e}")
                # Fallback: use character-based chunking
                char_start = start * 4  # Rough estimation
                char_end = min(char_start + chunk_size * 4, len(text))
                chunks.append(text[char_start:char_end])

            # Move start forward, accounting for overlap
            if end >= len(tokens):
                break

            start = end - overlap_size
            if start <= 0:
                start = end

        return chunks

    def chunk_document(
        self,
        content: str,
        title: str = "",
        chunk_size: int = DEFAULT_CHUNK_SIZE,
        overlap_size: int = DEFAULT_CHUNK_OVERLAP,
    ) -> List[Tuple[int, str, int]]:
        """
        Chunk a document with optional title inclusion.

        Args:
            content: Document content
            title: Optional document title
            chunk_size: Target tokens per chunk
            overlap_size: Overlap tokens between chunks

        Returns:
            List of (chunk_index, chunk_text, token_count) tuples
        """
        if not content:
            return []

        # Combine title and content if title is provided
        if title:
            full_text = f"{title}\n\n{content}"
        else:
            full_text = content

        return self.chunk_text_by_tokens(full_text, chunk_size, overlap_size)

    def extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """
        Extract simple keywords from text using basic frequency analysis.

        Args:
            text: Text to extract keywords from
            max_keywords: Maximum number of keywords to return

        Returns:
            List of keywords sorted by frequency
        """
        if not text:
            return []

        # Clean and normalize text
        text = self.clean_text(text.lower())

        # Simple word extraction (avoiding common stop words)
        stop_words = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "in",
            "on",
            "at",
            "to",
            "for",
            "of",
            "with",
            "by",
            "from",
            "up",
            "about",
            "into",
            "through",
            "during",
            "before",
            "after",
            "above",
            "below",
            "between",
            "among",
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "being",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "may",
            "might",
            "must",
            "can",
            "this",
            "that",
            "these",
            "those",
            "i",
            "you",
            "he",
            "she",
            "it",
            "we",
            "they",
            "me",
            "him",
            "her",
            "us",
            "them",
            "my",
            "your",
            "his",
            "her",
            "its",
            "our",
            "their",
        }

        # Extract words and count frequency
        words = re.findall(r"\b[a-z]{3,}\b", text)  # Words with 3+ characters
        word_freq = {}

        for word in words:
            if word not in stop_words:
                word_freq[word] = word_freq.get(word, 0) + 1

        # Sort by frequency and return top keywords
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        keywords = [word for word, freq in sorted_words[:max_keywords]]

        return keywords

    def estimate_reading_time(self, text: str, words_per_minute: int = 200) -> int:
        """
        Estimate reading time in minutes for given text.

        Args:
            text: Text to estimate reading time for
            words_per_minute: Average reading speed

        Returns:
            Estimated reading time in minutes
        """
        if not text:
            return 0

        word_count = len(text.split())
        reading_time = max(1, round(word_count / words_per_minute))

        return reading_time


# Global text processor instance
text_processor = None


def get_text_processor(encoding_name: str = DEFAULT_ENCODING) -> TextProcessor:
    """Get or create global text processor instance."""
    global text_processor
    if text_processor is None:
        text_processor = TextProcessor(encoding_name)
    return text_processor


def chunk_text(
    text: str, chunk_size: int = DEFAULT_CHUNK_SIZE
) -> List[Tuple[int, str, int]]:
    """Convenience function for chunking text."""
    processor = get_text_processor()
    return processor.chunk_text_by_tokens(text, chunk_size)


def count_tokens(text: str) -> int:
    """Convenience function for counting tokens."""
    processor = get_text_processor()
    return processor.count_tokens(text)
