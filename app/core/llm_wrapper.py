"""
LLM wrapper for centralized AI interactions with trace logging.
Supports OpenAI direct calls with proper retry logic and error handling.
"""

import os
import time
import random
from typing import Dict, Any, List, Optional, Union
from openai import OpenAI
from dotenv import load_dotenv

from .constants import (
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_CHAT_MODEL,
    MAX_RETRIES,
    BASE_RETRY_DELAY_MS,
    MAX_RETRY_DELAY_MS,
    BACKOFF_MULTIPLIER,
    DEFAULT_TEMPERATURE,
    PROMPT_TRUNCATE_LENGTH,
    RESPONSE_TRUNCATE_LENGTH,
    PROMPT_SUMMARY_LENGTH,
    RESPONSE_SUMMARY_LENGTH,
    ENV_OPENAI_API_KEY,
    TABLE_LLM_TRACES
)
from .exceptions import (
    LLMClientNotInitializedError,
    APIKeyNotFoundError,
    RateLimitExceededError,
    LLMTimeoutError,
    TokenLimitExceededError,
    ModelNotAvailableError,
    handle_llm_exception
)

# Load environment variables
load_dotenv()


class LLMWrapper:
    """Centralized wrapper for all LLM interactions with automatic trace logging."""

    def __init__(self, database_manager=None):
        """Initialize LLM wrapper with optional database manager for logging."""
        self.client: Optional[OpenAI] = None
        self.db = database_manager
        self._initialize_client()

    def _initialize_client(self):
        """Initialize OpenAI client with proper error handling."""
        api_key = os.getenv(ENV_OPENAI_API_KEY)
        if not api_key:
            raise APIKeyNotFoundError(f"{ENV_OPENAI_API_KEY} must be set in environment")

        try:
            self.client = OpenAI(api_key=api_key)
        except Exception as e:
            raise LLMClientNotInitializedError(f"Failed to initialize OpenAI client: {e}")

    def _calculate_retry_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay with jitter."""
        base_delay = BASE_RETRY_DELAY_MS / 1000.0  # Convert to seconds
        exponential_delay = base_delay * (BACKOFF_MULTIPLIER ** attempt)
        max_delay = MAX_RETRY_DELAY_MS / 1000.0
        
        # Cap the delay and add jitter to prevent thundering herd
        delay = min(exponential_delay, max_delay)
        jitter = random.uniform(0.1, 0.3) * delay
        
        return delay + jitter

    def _should_retry(self, exception: Exception) -> bool:
        """Determine if an exception warrants a retry."""
        error_msg = str(exception).lower()
        
        # Retry on rate limits and temporary errors
        if any(keyword in error_msg for keyword in [
            "rate limit", "timeout", "connection", "server error", 
            "503", "502", "500", "429"
        ]):
            return True
            
        return False

    def _execute_with_retry(self, operation_func, *args, **kwargs):
        """Execute an operation with exponential backoff retry logic."""
        last_exception = None
        
        for attempt in range(MAX_RETRIES + 1):  # +1 for initial attempt
            try:
                return operation_func(*args, **kwargs)
            
            except Exception as e:
                last_exception = e
                
                if attempt >= MAX_RETRIES:
                    # Out of retries
                    break
                
                if not self._should_retry(e):
                    # Don't retry on non-retriable errors
                    break
                
                delay = self._calculate_retry_delay(attempt)
                time.sleep(delay)
        
        # Re-raise the last exception if all retries failed
        raise last_exception

    def _log_trace(
        self,
        template_key: str,
        model: str,
        prompt: str,
        response: Optional[str] = None,
        tokens_used: Optional[int] = None,
        latency_ms: Optional[int] = None,
        error: Optional[str] = None,
        retry_count: int = 0,
    ) -> None:
        """Log LLM interaction to database if available with structured logging."""
        if not self.db or not hasattr(self.db, 'client') or not self.db.client:
            return

        try:
            trace_data = {
                "template_key": template_key,
                "model": model,
                "prompt": prompt[:PROMPT_TRUNCATE_LENGTH] if prompt else None,
                "response": response[:RESPONSE_TRUNCATE_LENGTH] if response else None,
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
                "error": error[:RESPONSE_TRUNCATE_LENGTH] if error else None,
                "retry_count": retry_count,
            }
            
            self.db.client.table(TABLE_LLM_TRACES).insert(trace_data).execute()
            
        except Exception as e:
            # Use structured logging instead of print for production readiness
            import logging
            logging.getLogger(__name__).warning(f"Failed to log LLM trace: {e}")

    def _generate_embeddings_call(
        self, text_list: List[str], model: str
    ) -> Dict[str, Any]:
        """Internal method to make embedding API call without retry logic."""
        response = self.client.embeddings.create(input=text_list, model=model)
        
        embeddings = [item.embedding for item in response.data]
        tokens_used = response.usage.total_tokens if response.usage else None
        
        return {
            "embeddings": embeddings,
            "tokens_used": tokens_used,
        }

    def generate_embeddings(
        self,
        texts: Union[str, List[str]],
        model: str = DEFAULT_EMBEDDING_MODEL,
        template_key: str = "generate_embeddings",
    ) -> Dict[str, Any]:
        """
        Generate embeddings for single text or batch of texts with retry logic.

        Args:
            texts: Single text string or list of texts
            model: OpenAI embedding model to use
            template_key: Key for trace logging

        Returns:
            Dict with success status, embeddings data, and metadata
        """
        if not self.client:
            return LLMClientNotInitializedError("OpenAI client not initialized").to_dict()

        # Normalize input to list
        text_list = [texts] if isinstance(texts, str) else texts
        if not text_list:
            return {"success": False, "error": "No texts provided"}

        start_time = time.time()
        retry_count = 0

        try:
            # Execute with retry logic
            def embedding_operation():
                return self._generate_embeddings_call(text_list, model)

            result = self._execute_with_retry(embedding_operation)
            
            embeddings = result["embeddings"]
            tokens_used = result["tokens_used"]
            latency_ms = int((time.time() - start_time) * 1000)

            # Log successful interaction
            prompt_summary = f"Embedding {len(text_list)} texts"[:PROMPT_SUMMARY_LENGTH]
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=prompt_summary,
                response=f"Generated {len(embeddings)} embeddings",
                tokens_used=tokens_used,
                latency_ms=latency_ms,
                retry_count=retry_count,
            )

            # Return single embedding for string input, list for list input
            embedding_result = embeddings[0] if isinstance(texts, str) else embeddings

            return {
                "success": True,
                "embedding": embedding_result,  # Changed key name for consistency
                "embeddings": embeddings,  # Keep both for backward compatibility
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
                "model": model,
                "retry_count": retry_count,
            }

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            
            # Log failed interaction
            prompt_summary = f"Embedding {len(text_list)} texts"[:PROMPT_SUMMARY_LENGTH]
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=prompt_summary,
                latency_ms=latency_ms,
                error=str(e),
                retry_count=retry_count,
            )

            return handle_llm_exception(e)

    def _generate_chat_completion_call(
        self, messages: List[Dict[str, str]], model: str, max_tokens: Optional[int], temperature: float
    ) -> Dict[str, Any]:
        """Internal method to make chat completion API call without retry logic."""
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        content = response.choices[0].message.content
        tokens_used = response.usage.total_tokens if response.usage else None
        
        return {
            "content": content,
            "tokens_used": tokens_used,
        }

    def generate_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = DEFAULT_CHAT_MODEL,
        template_key: str = "chat_completion",
        max_tokens: Optional[int] = None,
        temperature: float = DEFAULT_TEMPERATURE,
    ) -> Dict[str, Any]:
        """
        Generate chat completion with retry logic and trace logging.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: OpenAI model to use
            template_key: Key for trace logging
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            Dict with success status, response, and metadata
        """
        if not self.client:
            return LLMClientNotInitializedError("OpenAI client not initialized").to_dict()

        if not messages:
            return {"success": False, "error": "No messages provided"}

        start_time = time.time()
        retry_count = 0

        try:
            # Execute with retry logic
            def chat_operation():
                return self._generate_chat_completion_call(messages, model, max_tokens, temperature)

            result = self._execute_with_retry(chat_operation)
            
            content = result["content"]
            tokens_used = result["tokens_used"]
            latency_ms = int((time.time() - start_time) * 1000)

            # Create prompt summary for logging
            last_message_preview = messages[-1]['content'][:PROMPT_SUMMARY_LENGTH] if messages else ""
            prompt_summary = f"{len(messages)} messages, last: {last_message_preview}..."

            # Log successful interaction
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=prompt_summary,
                response=content[:RESPONSE_SUMMARY_LENGTH] if content else None,
                tokens_used=tokens_used,
                latency_ms=latency_ms,
                retry_count=retry_count,
            )

            return {
                "success": True,
                "content": content,
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
                "model": model,
                "retry_count": retry_count,
            }

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)

            # Log failed interaction
            prompt_summary = f"{len(messages)} messages"
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=prompt_summary,
                latency_ms=latency_ms,
                error=str(e),
                retry_count=retry_count,
            )

            return handle_llm_exception(e)


# Global LLM instance (initialized when database is available)
llm = None


def initialize_llm(database_manager=None):
    """Initialize global LLM instance with database manager."""
    global llm
    llm = LLMWrapper(database_manager)
    return llm


def get_llm() -> Optional[LLMWrapper]:
    """Get the global LLM instance."""
    return llm
