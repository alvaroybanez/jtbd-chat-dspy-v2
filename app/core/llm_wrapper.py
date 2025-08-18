"""
LLM wrapper for centralized AI interactions with trace logging.
Supports OpenAI direct calls with optional DSPy enhancement.
"""

import os
import time
from typing import Dict, Any, List, Optional, Union
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Constants
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_CHAT_MODEL = "gpt-4o-mini"
MAX_RETRIES = 3
RETRY_DELAY_MS = 1000


class LLMWrapper:
    """Centralized wrapper for all LLM interactions with automatic trace logging."""

    def __init__(self, database_manager=None):
        """Initialize LLM wrapper with optional database manager for logging."""
        self.client: Optional[OpenAI] = None
        self.db = database_manager
        self._initialize_client()

    def _initialize_client(self):
        """Initialize OpenAI client."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY must be set in environment")

        self.client = OpenAI(api_key=api_key)

    def _log_trace(
        self,
        template_key: str,
        model: str,
        prompt: str,
        response: Optional[str] = None,
        tokens_used: Optional[int] = None,
        latency_ms: Optional[int] = None,
        error: Optional[str] = None,
    ) -> None:
        """Log LLM interaction to database if available."""
        if not self.db or not self.db.client:
            return

        try:
            self.db.client.table("llm_traces").insert(
                {
                    "template_key": template_key,
                    "model": model,
                    "prompt": prompt[:2000],  # Truncate for storage
                    "response": response[:5000] if response else None,
                    "tokens_used": tokens_used,
                    "latency_ms": latency_ms,
                    "error": error,
                }
            ).execute()
        except Exception as e:
            # Don't fail the main operation if logging fails
            print(f"Warning: Failed to log LLM trace: {e}")

    def generate_embeddings(
        self,
        texts: Union[str, List[str]],
        model: str = DEFAULT_EMBEDDING_MODEL,
        template_key: str = "generate_embeddings",
    ) -> Dict[str, Any]:
        """
        Generate embeddings for single text or batch of texts.

        Args:
            texts: Single text string or list of texts
            model: OpenAI embedding model to use
            template_key: Key for trace logging

        Returns:
            Dict with success status, embeddings data, and metadata
        """
        if not self.client:
            return {"success": False, "error": "OpenAI client not initialized"}

        # Normalize input to list
        text_list = [texts] if isinstance(texts, str) else texts
        if not text_list:
            return {"success": False, "error": "No texts provided"}

        start_time = time.time()

        try:
            # OpenAI API call
            response = self.client.embeddings.create(input=text_list, model=model)

            # Extract embeddings
            embeddings = [item.embedding for item in response.data]
            tokens_used = response.usage.total_tokens if response.usage else None
            latency_ms = int((time.time() - start_time) * 1000)

            # Log successful interaction
            prompt_summary = f"Embedding {len(text_list)} texts"
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=prompt_summary,
                response=f"Generated {len(embeddings)} embeddings",
                tokens_used=tokens_used,
                latency_ms=latency_ms,
            )

            return {
                "success": True,
                "embeddings": embeddings[0] if isinstance(texts, str) else embeddings,
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
                "model": model,
            }

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e)

            # Log failed interaction
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=f"Embedding {len(text_list)} texts",
                latency_ms=latency_ms,
                error=error_msg,
            )

            return {"success": False, "error": error_msg, "latency_ms": latency_ms}

    def generate_chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = DEFAULT_CHAT_MODEL,
        template_key: str = "chat_completion",
        max_tokens: Optional[int] = None,
        temperature: float = 0.7,
    ) -> Dict[str, Any]:
        """
        Generate chat completion with trace logging.

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
            return {"success": False, "error": "OpenAI client not initialized"}

        if not messages:
            return {"success": False, "error": "No messages provided"}

        start_time = time.time()

        try:
            # OpenAI API call
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )

            # Extract response
            content = response.choices[0].message.content
            tokens_used = response.usage.total_tokens if response.usage else None
            latency_ms = int((time.time() - start_time) * 1000)

            # Create prompt summary for logging
            prompt_summary = (
                f"{len(messages)} messages, last: {messages[-1]['content'][:100]}..."
            )

            # Log successful interaction
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=prompt_summary,
                response=content[:500] if content else None,
                tokens_used=tokens_used,
                latency_ms=latency_ms,
            )

            return {
                "success": True,
                "content": content,
                "tokens_used": tokens_used,
                "latency_ms": latency_ms,
                "model": model,
            }

        except Exception as e:
            latency_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e)

            # Log failed interaction
            prompt_summary = f"{len(messages)} messages"
            self._log_trace(
                template_key=template_key,
                model=model,
                prompt=prompt_summary,
                latency_ms=latency_ms,
                error=error_msg,
            )

            return {"success": False, "error": error_msg, "latency_ms": latency_ms}


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
