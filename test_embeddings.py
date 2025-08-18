"""
Comprehensive tests for embedding functionality.
Tests LLM wrapper, embedding manager, text utils, and database integration.
"""

import os
import pytest
from unittest.mock import Mock, patch, MagicMock
from typing import List, Dict, Any

# Import modules to test
from llm_wrapper import LLMWrapper, initialize_llm, get_llm
from embeddings import EmbeddingManager, initialize_embedding_manager
from text_utils import TextProcessor, get_text_processor, chunk_text, count_tokens


class TestLLMWrapper:
    """Test suite for LLM wrapper functionality."""

    def setup_method(self):
        """Set up test environment."""
        self.mock_db = Mock()
        self.mock_db.client = Mock()
        self.llm_wrapper = LLMWrapper(self.mock_db)

    @patch("llm_wrapper.OpenAI")
    def test_initialization_success(self, mock_openai):
        """Test successful LLM wrapper initialization."""
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            wrapper = LLMWrapper()
            assert wrapper.client is not None
            mock_openai.assert_called_once_with(api_key="test-key")

    def test_initialization_no_api_key(self):
        """Test initialization fails without API key."""
        with patch.dict(os.environ, {}, clear=True):
            with pytest.raises(ValueError, match="OPENAI_API_KEY must be set"):
                LLMWrapper()

    @patch("llm_wrapper.OpenAI")
    def test_generate_embeddings_single_text(self, mock_openai):
        """Test embedding generation for single text."""
        # Mock OpenAI response
        mock_response = Mock()
        mock_response.data = [Mock(embedding=[0.1] * 1536)]
        mock_response.usage.total_tokens = 10

        mock_client = Mock()
        mock_client.embeddings.create.return_value = mock_response
        mock_openai.return_value = mock_client

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            wrapper = LLMWrapper(self.mock_db)

            result = wrapper.generate_embeddings("test text")

            assert result["success"] is True
            assert len(result["embedding"]) == 1536
            assert result["tokens_used"] == 10
            assert "latency_ms" in result

    @patch("llm_wrapper.OpenAI")
    def test_generate_embeddings_batch(self, mock_openai):
        """Test embedding generation for batch of texts."""
        # Mock OpenAI response
        mock_response = Mock()
        mock_response.data = [
            Mock(embedding=[0.1] * 1536),
            Mock(embedding=[0.2] * 1536),
        ]
        mock_response.usage.total_tokens = 20

        mock_client = Mock()
        mock_client.embeddings.create.return_value = mock_response
        mock_openai.return_value = mock_client

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            wrapper = LLMWrapper(self.mock_db)

            result = wrapper.generate_embeddings(["text1", "text2"])

            assert result["success"] is True
            assert len(result["embeddings"]) == 2
            assert len(result["embeddings"][0]) == 1536

    def test_generate_embeddings_empty_input(self):
        """Test embedding generation with empty input."""
        result = self.llm_wrapper.generate_embeddings("")
        assert result["success"] is False
        assert "No texts provided" in result["error"]

    @patch("llm_wrapper.OpenAI")
    def test_generate_embeddings_api_error(self, mock_openai):
        """Test embedding generation API error handling."""
        mock_client = Mock()
        mock_client.embeddings.create.side_effect = Exception("API Error")
        mock_openai.return_value = mock_client

        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-key"}):
            wrapper = LLMWrapper(self.mock_db)

            result = wrapper.generate_embeddings("test text")

            assert result["success"] is False
            assert "API Error" in result["error"]

    def test_log_trace_success(self):
        """Test successful trace logging."""
        self.mock_db.client.table.return_value.insert.return_value.execute.return_value = (
            Mock()
        )

        # This should not raise an exception
        self.llm_wrapper._log_trace(
            template_key="test",
            model="test-model",
            prompt="test prompt",
            response="test response",
            tokens_used=10,
            latency_ms=100,
        )

        self.mock_db.client.table.assert_called_with("llm_traces")

    def test_log_trace_failure(self):
        """Test trace logging failure handling."""
        self.mock_db.client.table.return_value.insert.side_effect = Exception(
            "DB Error"
        )

        # Should not raise exception, just print warning
        self.llm_wrapper._log_trace(
            template_key="test", model="test-model", prompt="test prompt"
        )


class TestEmbeddingManager:
    """Test suite for embedding manager functionality."""

    def setup_method(self):
        """Set up test environment."""
        self.mock_llm = Mock()
        self.mock_db = Mock()
        self.embedding_manager = EmbeddingManager(self.mock_llm, self.mock_db)

    def test_initialization(self):
        """Test embedding manager initialization."""
        assert self.embedding_manager.llm == self.mock_llm
        assert self.embedding_manager.db == self.mock_db
        assert self.embedding_manager._embedding_cache == {}

    def test_generate_single_embedding_success(self):
        """Test successful single embedding generation."""
        mock_embedding = [0.1] * 1536
        self.mock_llm.generate_embeddings.return_value = {
            "success": True,
            "embedding": mock_embedding,
            "tokens_used": 10,
            "latency_ms": 100,
        }

        result = self.embedding_manager.generate_single_embedding("test text")

        assert result["success"] is True
        assert result["embedding"] == mock_embedding
        assert result["from_cache"] is False
        assert result["dimension"] == 1536

    def test_generate_single_embedding_cache_hit(self):
        """Test single embedding with cache hit."""
        text = "test text"
        mock_embedding = [0.1] * 1536

        # First call - should call LLM
        self.mock_llm.generate_embeddings.return_value = {
            "success": True,
            "embedding": mock_embedding,
            "tokens_used": 10,
        }

        result1 = self.embedding_manager.generate_single_embedding(text)
        assert result1["from_cache"] is False

        # Second call - should use cache
        result2 = self.embedding_manager.generate_single_embedding(text)
        assert result2["from_cache"] is True
        assert result2["embedding"] == mock_embedding

        # LLM should only be called once
        assert self.mock_llm.generate_embeddings.call_count == 1

    def test_generate_single_embedding_invalid_dimension(self):
        """Test single embedding with invalid dimension."""
        self.mock_llm.generate_embeddings.return_value = {
            "success": True,
            "embedding": [0.1] * 1000,  # Wrong dimension
        }

        result = self.embedding_manager.generate_single_embedding("test text")

        assert result["success"] is False
        assert "Invalid embedding dimension" in result["error"]

    def test_generate_batch_embeddings_success(self):
        """Test successful batch embedding generation."""
        mock_embeddings = [[0.1] * 1536, [0.2] * 1536]
        self.mock_llm.generate_embeddings.return_value = {
            "success": True,
            "embeddings": mock_embeddings,
            "tokens_used": 20,
            "latency_ms": 200,
        }

        result = self.embedding_manager.generate_batch_embeddings(["text1", "text2"])

        assert result["success"] is True
        assert len(result["embeddings"]) == 2
        assert result["generated_count"] == 2
        assert result["cache_hits"] == 0

    def test_generate_batch_embeddings_max_size_exceeded(self):
        """Test batch embedding with size limit exceeded."""
        texts = ["text"] * 101  # Exceed MAX_BATCH_SIZE

        result = self.embedding_manager.generate_batch_embeddings(texts)

        assert result["success"] is False
        assert "exceeds maximum" in result["error"]

    def test_embed_document_chunks_success(self):
        """Test successful document chunk embedding."""
        chunks = [(0, "chunk1"), (1, "chunk2")]
        mock_embeddings = [[0.1] * 1536, [0.2] * 1536]

        self.mock_llm.generate_embeddings.return_value = {
            "success": True,
            "embeddings": mock_embeddings,
            "tokens_used": 20,
        }

        self.mock_db.client.table.return_value.insert.return_value.execute.return_value = (
            Mock()
        )

        result = self.embedding_manager.embed_document_chunks(
            "doc-123", chunks, store_in_db=True
        )

        assert result["success"] is True
        assert result["chunks_processed"] == 2
        assert result["chunks_stored"] == 2

    def test_embed_insights_success(self):
        """Test successful insight embedding."""
        insights = [("insight1", "doc1", None), ("insight2", "doc2", None)]
        mock_embeddings = [[0.1] * 1536, [0.2] * 1536]

        self.mock_llm.generate_embeddings.return_value = {
            "success": True,
            "embeddings": mock_embeddings,
            "tokens_used": 20,
        }

        self.mock_db.client.table.return_value.insert.return_value.execute.return_value = (
            Mock()
        )

        result = self.embedding_manager.embed_insights(insights, store_in_db=True)

        assert result["success"] is True
        assert result["insights_processed"] == 2

    def test_embed_jtbds_success(self):
        """Test successful JTBD embedding."""
        jtbds = [("statement1", "context1", "outcome1", None)]
        mock_embeddings = [[0.1] * 1536]

        self.mock_llm.generate_embeddings.return_value = {
            "success": True,
            "embeddings": mock_embeddings,
            "tokens_used": 10,
        }

        self.mock_db.client.table.return_value.insert.return_value.execute.return_value = (
            Mock()
        )

        result = self.embedding_manager.embed_jtbds(jtbds, store_in_db=True)

        assert result["success"] is True
        assert result["jtbds_processed"] == 1

    def test_cache_operations(self):
        """Test cache operations."""
        # Test cache stats
        stats = self.embedding_manager.get_cache_stats()
        assert stats["cache_size"] == 0
        assert stats["cache_dimension"] == 1536

        # Add to cache
        embedding = [0.1] * 1536
        self.embedding_manager._store_cache("test", embedding)

        stats = self.embedding_manager.get_cache_stats()
        assert stats["cache_size"] == 1

        # Clear cache
        self.embedding_manager.clear_cache()
        stats = self.embedding_manager.get_cache_stats()
        assert stats["cache_size"] == 0


class TestTextProcessor:
    """Test suite for text processor functionality."""

    def setup_method(self):
        """Set up test environment."""
        self.processor = TextProcessor()

    def test_initialization(self):
        """Test text processor initialization."""
        assert self.processor.encoding is not None

    def test_count_tokens(self):
        """Test token counting."""
        # Test with simple text
        tokens = self.processor.count_tokens("Hello world")
        assert isinstance(tokens, int)
        assert tokens > 0

        # Test with empty text
        assert self.processor.count_tokens("") == 0
        assert self.processor.count_tokens(None) == 0

    def test_clean_text(self):
        """Test text cleaning."""
        # Test normal cleaning
        dirty_text = "  Hello    world!  \n\n  "
        clean = self.processor.clean_text(dirty_text)
        assert clean == "Hello world!"

        # Test empty text
        assert self.processor.clean_text("") == ""
        assert self.processor.clean_text(None) == ""

    def test_split_into_sentences(self):
        """Test sentence splitting."""
        text = "Hello world. How are you? I'm fine!"
        sentences = self.processor.split_into_sentences(text)

        assert len(sentences) >= 2
        assert isinstance(sentences, list)

        # Test empty text
        assert self.processor.split_into_sentences("") == []

    def test_chunk_text_by_tokens_small(self):
        """Test chunking with small text."""
        text = "Hello world"
        chunks = self.processor.chunk_text_by_tokens(text, chunk_size=1000)

        assert len(chunks) == 1
        assert chunks[0][0] == 0  # chunk index
        assert chunks[0][1] == text  # chunk text
        assert chunks[0][2] > 0  # token count

    def test_chunk_text_by_tokens_large(self):
        """Test chunking with large text."""
        # Create large text
        text = "This is a test sentence. " * 200  # Should exceed chunk size
        chunks = self.processor.chunk_text_by_tokens(text, chunk_size=100)

        assert len(chunks) > 1

        # Check chunk structure
        for i, (chunk_idx, chunk_text, token_count) in enumerate(chunks):
            assert chunk_idx == i
            assert isinstance(chunk_text, str)
            assert token_count > 0

    def test_chunk_document(self):
        """Test document chunking with title."""
        title = "Test Document"
        content = "This is the content of the test document."

        chunks = self.processor.chunk_document(content, title)

        assert len(chunks) >= 1
        # First chunk should contain both title and content
        assert title in chunks[0][1]
        assert content in chunks[0][1]

    def test_extract_keywords(self):
        """Test keyword extraction."""
        text = (
            "machine learning artificial intelligence data science python programming"
        )
        keywords = self.processor.extract_keywords(text, max_keywords=3)

        assert isinstance(keywords, list)
        assert len(keywords) <= 3

        # Test empty text
        assert self.processor.extract_keywords("") == []

    def test_estimate_reading_time(self):
        """Test reading time estimation."""
        text = "This is a test text. " * 100  # ~300 words
        reading_time = self.processor.estimate_reading_time(text, words_per_minute=200)

        assert isinstance(reading_time, int)
        assert reading_time > 0

        # Test empty text
        assert self.processor.estimate_reading_time("") == 0


class TestDatabaseIntegration:
    """Test suite for database integration."""

    def setup_method(self):
        """Set up test environment."""
        self.mock_client = Mock()
        self.mock_response = Mock()
        self.mock_response.data = [{"id": "test-id"}]

        # Mock database manager
        self.db = Mock()
        self.db.client = self.mock_client
        self.db.client.table.return_value.insert.return_value.execute.return_value = (
            self.mock_response
        )

    def test_store_document_with_embedding(self):
        """Test storing document with embedding in database."""
        from database import DatabaseManager

        db_manager = DatabaseManager.__new__(DatabaseManager)
        db_manager.client = self.mock_client

        embedding = [0.1] * 1536
        result = db_manager.store_document_with_embedding(
            "Test Title", "Test Content", embedding
        )

        # Verify the method was called correctly
        self.mock_client.table.assert_called_with("documents")

    def test_store_document_chunks(self):
        """Test storing document chunks with embeddings."""
        from database import DatabaseManager

        db_manager = DatabaseManager.__new__(DatabaseManager)
        db_manager.client = self.mock_client

        chunks = [(0, "chunk1", [0.1] * 1536), (1, "chunk2", [0.2] * 1536)]
        result = db_manager.store_document_chunks("doc-123", chunks)

        # Verify the method was called correctly
        self.mock_client.table.assert_called_with("document_chunks")

    def test_search_similar_chunks(self):
        """Test vector similarity search for chunks."""
        from database import DatabaseManager

        db_manager = DatabaseManager.__new__(DatabaseManager)
        db_manager.client = self.mock_client
        db_manager.client.rpc.return_value.execute.return_value = self.mock_response

        query_embedding = [0.1] * 1536
        result = db_manager.search_similar_chunks(query_embedding)

        # Verify RPC call was made correctly
        self.mock_client.rpc.assert_called_with(
            "search_chunks",
            {
                "query_embedding": query_embedding,
                "match_count": 10,
                "similarity_threshold": 0.7,
            },
        )


class TestGlobalInstances:
    """Test suite for global instance management."""

    def test_llm_initialization(self):
        """Test LLM global instance initialization."""
        mock_db = Mock()

        llm_instance = initialize_llm(mock_db)
        assert llm_instance is not None

        retrieved_instance = get_llm()
        assert retrieved_instance == llm_instance

    def test_embedding_manager_initialization(self):
        """Test embedding manager global instance initialization."""
        mock_llm = Mock()
        mock_db = Mock()

        em_instance = initialize_embedding_manager(mock_llm, mock_db)
        assert em_instance is not None

    def test_text_processor_global(self):
        """Test text processor global instance."""
        processor1 = get_text_processor()
        processor2 = get_text_processor()

        # Should return same instance
        assert processor1 == processor2

    def test_convenience_functions(self):
        """Test convenience functions."""
        # Test chunk_text function
        chunks = chunk_text("Hello world", chunk_size=1000)
        assert len(chunks) == 1

        # Test count_tokens function
        tokens = count_tokens("Hello world")
        assert isinstance(tokens, int)
        assert tokens > 0


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])
