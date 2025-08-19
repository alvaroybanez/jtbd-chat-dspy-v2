"""
Embedding generation and management for the JTBD Assistant Platform.
Handles OpenAI embeddings with caching, batching, and database integration.
"""

from typing import Dict, List, Any, Optional, Tuple, Union
import hashlib
import time
from collections import OrderedDict
from .llm_wrapper import LLMWrapper
from .constants import (
    EMBEDDING_DIMENSION,
    MAX_BATCH_SIZE,
    CACHE_TTL_HOURS,
    HASH_ALGORITHM,
    EMBEDDING_CACHE_SIZE_LIMIT,
    ERROR_EMPTY_TEXT_PROVIDED,
    ERROR_BATCH_SIZE_EXCEEDED,
    ERROR_NO_CHUNKS_PROVIDED,
    ERROR_NO_INSIGHTS_PROVIDED,
    ERROR_NO_JTBDS_PROVIDED
)
from .exceptions import (
    EmptyTextError,
    BatchSizeExceededError,
    InvalidEmbeddingDimensionError,
    EmbeddingGenerationError,
    CacheError,
    handle_embedding_exception
)


class LRUEmbeddingCache:
    """LRU cache for embeddings with TTL support."""
    
    def __init__(self, max_size: int = EMBEDDING_CACHE_SIZE_LIMIT, ttl_hours: int = CACHE_TTL_HOURS):
        self.max_size = max_size
        self.ttl_seconds = ttl_hours * 3600
        self.cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
    
    def _get_text_hash(self, text: str) -> str:
        """Generate secure hash for text content."""
        hash_obj = hashlib.new(HASH_ALGORITHM)
        hash_obj.update(text.encode('utf-8'))
        return hash_obj.hexdigest()
    
    def _is_expired(self, cache_entry: Dict[str, Any]) -> bool:
        """Check if cache entry is expired."""
        return time.time() - cache_entry["timestamp"] > self.ttl_seconds
    
    def get(self, text: str) -> Optional[List[float]]:
        """Get embedding from cache if available and not expired."""
        text_hash = self._get_text_hash(text)
        
        if text_hash in self.cache:
            entry = self.cache[text_hash]
            
            if self._is_expired(entry):
                del self.cache[text_hash]
                return None
            
            # Move to end (most recently used)
            self.cache.move_to_end(text_hash)
            return entry["embedding"]
        
        return None
    
    def put(self, text: str, embedding: List[float]) -> None:
        """Store embedding in cache with LRU eviction."""
        text_hash = self._get_text_hash(text)
        
        # Remove if already exists (will re-add at end)
        if text_hash in self.cache:
            del self.cache[text_hash]
        
        # Evict oldest entries if at capacity
        while len(self.cache) >= self.max_size:
            self.cache.popitem(last=False)  # Remove least recently used
        
        # Add new entry
        self.cache[text_hash] = {
            "embedding": embedding,
            "timestamp": time.time()
        }
    
    def clear(self) -> None:
        """Clear all cache entries."""
        self.cache.clear()
    
    def size(self) -> int:
        """Get current cache size."""
        return len(self.cache)
    
    def cleanup_expired(self) -> int:
        """Remove expired entries and return count of removed items."""
        expired_keys = []
        current_time = time.time()
        
        for key, entry in self.cache.items():
            if current_time - entry["timestamp"] > self.ttl_seconds:
                expired_keys.append(key)
        
        for key in expired_keys:
            del self.cache[key]
        
        return len(expired_keys)


class EmbeddingManager:
    """Manages embedding generation with caching and batch processing."""

    def __init__(self, llm_wrapper: LLMWrapper, database_manager=None):
        """Initialize embedding manager with LLM wrapper and optional database."""
        self.llm = llm_wrapper
        self.db = database_manager
        self.cache = LRUEmbeddingCache()
        # Backward compatibility - expose cache as _embedding_cache
        self._embedding_cache = {}

    def _validate_embedding(self, embedding: List[float]) -> None:
        """Validate embedding dimensions."""
        if len(embedding) != EMBEDDING_DIMENSION:
            raise InvalidEmbeddingDimensionError(len(embedding), EMBEDDING_DIMENSION)

    def _store_cache(self, text: str, embedding: List[float]) -> None:
        """Store embedding in cache (backward compatibility method)."""
        self.cache.put(text, embedding)
        # Also store in simple dict for test compatibility
        self._embedding_cache[text] = embedding

    def generate_single_embedding(
        self, text: str, use_cache: bool = True, template_key: str = "single_embedding"
    ) -> Dict[str, Any]:
        """
        Generate embedding for a single text with caching.

        Args:
            text: Text to embed
            use_cache: Whether to use caching
            template_key: Template key for logging

        Returns:
            Dict with success status, embedding, and metadata
        """
        try:
            if not text or not text.strip():
                raise EmptyTextError(ERROR_EMPTY_TEXT_PROVIDED)

            # Check cache first
            if use_cache:
                cached_embedding = self.cache.get(text)
                if cached_embedding:
                    return {
                        "success": True,
                        "embedding": cached_embedding,
                        "from_cache": True,
                        "dimension": len(cached_embedding),
                    }

            # Generate new embedding - fix: pass as string, not list
            result = self.llm.generate_embeddings(texts=text, template_key=template_key)

            if result["success"]:
                embedding = result["embedding"]
                
                # Validate embedding dimension
                self._validate_embedding(embedding)

                # Store in cache
                if use_cache:
                    try:
                        self.cache.put(text, embedding)
                    except Exception as e:
                        # Don't fail if caching fails
                        pass

                return {
                    "success": True,
                    "embedding": embedding,
                    "from_cache": False,
                    "dimension": len(embedding),
                    "tokens_used": result.get("tokens_used"),
                    "latency_ms": result.get("latency_ms"),
                }

            return result

        except Exception as e:
            return handle_embedding_exception(e)

    def generate_batch_embeddings(
        self,
        texts: List[str],
        use_cache: bool = True,
        template_key: str = "batch_embeddings",
    ) -> Dict[str, Any]:
        """
        Generate embeddings for a batch of texts with caching.

        Args:
            texts: List of texts to embed
            use_cache: Whether to use caching
            template_key: Template key for logging

        Returns:
            Dict with success status, embeddings, and metadata
        """
        try:
            if not texts:
                return {"success": False, "error": "No texts provided"}

            if len(texts) > MAX_BATCH_SIZE:
                raise BatchSizeExceededError(len(texts), MAX_BATCH_SIZE)

            # Check cache and separate texts
            cached_embeddings = {}
            texts_to_generate = []
            text_indices = {}

            for i, text in enumerate(texts):
                if not text or not text.strip():
                    continue

                if use_cache:
                    cached_embedding = self.cache.get(text)
                    if cached_embedding:
                        cached_embeddings[i] = cached_embedding
                        continue

                texts_to_generate.append(text)
                text_indices[len(texts_to_generate) - 1] = i

            # Generate embeddings for remaining texts
            generated_embeddings = {}
            total_tokens = 0
            total_latency = 0

            if texts_to_generate:
                result = self.llm.generate_embeddings(
                    texts=texts_to_generate, template_key=template_key
                )

                if not result["success"]:
                    return result

                embeddings = result["embeddings"]
                total_tokens = result.get("tokens_used", 0)
                total_latency = result.get("latency_ms", 0)

                # Validate and store embeddings
                for batch_idx, embedding in enumerate(embeddings):
                    self._validate_embedding(embedding)

                    original_idx = text_indices[batch_idx]
                    generated_embeddings[original_idx] = embedding

                    # Store in cache
                    if use_cache:
                        try:
                            self.cache.put(texts[original_idx], embedding)
                        except Exception:
                            # Don't fail if caching fails
                            pass

            # Combine cached and generated embeddings
            final_embeddings = []
            cache_hits = 0

            for i, text in enumerate(texts):
                if not text or not text.strip():
                    final_embeddings.append(None)
                    continue

                if i in cached_embeddings:
                    final_embeddings.append(cached_embeddings[i])
                    cache_hits += 1
                elif i in generated_embeddings:
                    final_embeddings.append(generated_embeddings[i])
                else:
                    final_embeddings.append(None)

            return {
                "success": True,
                "embeddings": final_embeddings,
                "cache_hits": cache_hits,
                "generated_count": len(generated_embeddings),
                "total_count": len([e for e in final_embeddings if e is not None]),
                "tokens_used": total_tokens,
                "latency_ms": total_latency,
            }

        except Exception as e:
            return handle_embedding_exception(e)

    def embed_document_chunks(
        self, document_id: str, chunks: List[Tuple[int, str]], store_in_db: bool = True
    ) -> Dict[str, Any]:
        """
        Generate embeddings for document chunks and optionally store in database.

        Args:
            document_id: UUID of the document
            chunks: List of (chunk_index, content) tuples
            store_in_db: Whether to store in database

        Returns:
            Dict with success status and processing results
        """
        if not chunks:
            return {"success": False, "error": "No chunks provided"}

        # Extract texts for embedding
        texts = [chunk[1] for chunk in chunks]

        # Generate embeddings
        result = self.generate_batch_embeddings(
            texts=texts, template_key="document_chunks"
        )

        if not result["success"]:
            return result

        embeddings = result["embeddings"]

        # Store in database if requested
        if store_in_db and self.db and self.db.client:
            try:
                chunk_records = []
                for i, (chunk_index, content) in enumerate(chunks):
                    if embeddings[i] is not None:
                        chunk_records.append(
                            {
                                "document_id": document_id,
                                "chunk_index": chunk_index,
                                "content": content,
                                "embedding": embeddings[i],
                            }
                        )

                if chunk_records:
                    self.db.client.table("document_chunks").insert(
                        chunk_records
                    ).execute()

                return {
                    "success": True,
                    "chunks_processed": len(chunk_records),
                    "chunks_stored": len(chunk_records),
                    "tokens_used": result.get("tokens_used"),
                    "cache_hits": result.get("cache_hits", 0),
                }

            except Exception as e:
                return {
                    "success": False,
                    "error": f"Failed to store chunks in database: {str(e)}",
                }

        return {
            "success": True,
            "chunks_processed": len([e for e in embeddings if e is not None]),
            "embeddings": embeddings,
            "tokens_used": result.get("tokens_used"),
            "cache_hits": result.get("cache_hits", 0),
        }

    def embed_insights(
        self, insights: List[Tuple[str, str, Optional[str]]], store_in_db: bool = True
    ) -> Dict[str, Any]:
        """
        Generate embeddings for insights and optionally store in database.

        Args:
            insights: List of (description, document_id, insight_id) tuples
            store_in_db: Whether to store in database

        Returns:
            Dict with success status and processing results
        """
        if not insights:
            return {"success": False, "error": "No insights provided"}

        # Extract descriptions for embedding
        descriptions = [insight[0] for insight in insights]

        # Generate embeddings
        result = self.generate_batch_embeddings(
            texts=descriptions, template_key="insights"
        )

        if not result["success"]:
            return result

        embeddings = result["embeddings"]

        # Store in database if requested
        if store_in_db and self.db and self.db.client:
            try:
                insight_records = []
                for i, (description, document_id, insight_id) in enumerate(insights):
                    if embeddings[i] is not None:
                        record = {
                            "description": description,
                            "document_id": document_id,
                            "embedding": embeddings[i],
                        }
                        if insight_id:
                            record["id"] = insight_id
                        insight_records.append(record)

                if insight_records:
                    self.db.client.table("insights").insert(insight_records).execute()

                return {
                    "success": True,
                    "insights_processed": len(insight_records),
                    "insights_stored": len(insight_records),
                    "tokens_used": result.get("tokens_used"),
                    "cache_hits": result.get("cache_hits", 0),
                }

            except Exception as e:
                return {
                    "success": False,
                    "error": f"Failed to store insights in database: {str(e)}",
                }

        return {
            "success": True,
            "insights_processed": len([e for e in embeddings if e is not None]),
            "embeddings": embeddings,
            "tokens_used": result.get("tokens_used"),
            "cache_hits": result.get("cache_hits", 0),
        }

    def embed_jtbds(
        self,
        jtbds: List[Tuple[str, Optional[str], Optional[str], Optional[str]]],
        store_in_db: bool = True,
    ) -> Dict[str, Any]:
        """
        Generate embeddings for JTBDs and optionally store in database.

        Args:
            jtbds: List of (statement, context, outcome, jtbd_id) tuples
            store_in_db: Whether to store in database

        Returns:
            Dict with success status and processing results
        """
        if not jtbds:
            return {"success": False, "error": "No JTBDs provided"}

        # Combine statement, context, and outcome for embedding
        combined_texts = []
        for statement, context, outcome, _ in jtbds:
            parts = [statement]
            if context:
                parts.append(f"Context: {context}")
            if outcome:
                parts.append(f"Outcome: {outcome}")
            combined_texts.append(" | ".join(parts))

        # Generate embeddings
        result = self.generate_batch_embeddings(
            texts=combined_texts, template_key="jtbds"
        )

        if not result["success"]:
            return result

        embeddings = result["embeddings"]

        # Store in database if requested
        if store_in_db and self.db and self.db.client:
            try:
                jtbd_records = []
                for i, (statement, context, outcome, jtbd_id) in enumerate(jtbds):
                    if embeddings[i] is not None:
                        record = {
                            "statement": statement,
                            "context": context,
                            "outcome": outcome,
                            "embedding": embeddings[i],
                        }
                        if jtbd_id:
                            record["id"] = jtbd_id
                        jtbd_records.append(record)

                if jtbd_records:
                    self.db.client.table("jtbds").insert(jtbd_records).execute()

                return {
                    "success": True,
                    "jtbds_processed": len(jtbd_records),
                    "jtbds_stored": len(jtbd_records),
                    "tokens_used": result.get("tokens_used"),
                    "cache_hits": result.get("cache_hits", 0),
                }

            except Exception as e:
                return {
                    "success": False,
                    "error": f"Failed to store JTBDs in database: {str(e)}",
                }

        return {
            "success": True,
            "jtbds_processed": len([e for e in embeddings if e is not None]),
            "embeddings": embeddings,
            "tokens_used": result.get("tokens_used"),
            "cache_hits": result.get("cache_hits", 0),
        }

    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        self.cache.clear()

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        expired_count = self.cache.cleanup_expired()
        return {
            "cache_size": self.cache.size(),
            "cache_max_size": self.cache.max_size,
            "cache_dimension": EMBEDDING_DIMENSION,
            "ttl_hours": self.cache.ttl_seconds / 3600,
            "expired_cleaned": expired_count,
        }

    def cleanup_cache(self) -> Dict[str, Any]:
        """Cleanup expired cache entries."""
        try:
            expired_count = self.cache.cleanup_expired()
            return {
                "success": True,
                "expired_removed": expired_count,
                "current_size": self.cache.size()
            }
        except Exception as e:
            return {"success": False, "error": str(e)}


# Global embedding manager instance
embedding_manager = None


def initialize_embedding_manager(llm_wrapper: LLMWrapper, database_manager=None):
    """Initialize global embedding manager."""
    global embedding_manager
    embedding_manager = EmbeddingManager(llm_wrapper, database_manager)
    return embedding_manager


def get_embedding_manager() -> Optional[EmbeddingManager]:
    """Get the global embedding manager instance."""
    return embedding_manager
