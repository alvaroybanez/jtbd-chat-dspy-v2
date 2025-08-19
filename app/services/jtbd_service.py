"""
JTBD service for managing Jobs-to-be-Done creation and operations.
Handles individual JTBD creation with automatic embedding generation.
"""

from typing import Dict, List, Any, Optional
import logging

from ..core.database.connection import get_database_manager
from ..core.embeddings import get_embedding_manager

logger = logging.getLogger(__name__)


class JTBDService:
    """Service for managing JTBD creation and operations."""

    def __init__(self, database_manager=None, embedding_manager=None):
        """Initialize JTBD service with database and embedding managers."""
        self.db = database_manager or get_database_manager()
        self.embeddings = embedding_manager or get_embedding_manager()
        
        if not self.db:
            raise ValueError("Database manager is required for JTBDService")
        if not self.embeddings:
            raise ValueError("Embedding manager is required for JTBDService")

    def create_jtbd(
        self,
        statement: str,
        context: Optional[str] = None,
        outcome: Optional[str] = None,
        generate_embedding: bool = True
    ) -> Dict[str, Any]:
        """
        Create a new JTBD with automatic embedding generation.

        Args:
            statement: The main JTBD statement (required)
            context: Additional context for the JTBD (optional)
            outcome: Desired outcome for the JTBD (optional)
            generate_embedding: Whether to generate embeddings automatically

        Returns:
            Dict with success status and created JTBD data
        """
        try:
            # Validate inputs
            if not statement or not statement.strip():
                return {"success": False, "error": "JTBD statement is required"}

            # Prepare combined text for embedding (similar to existing pattern)
            embedding_text = statement.strip()
            if context and context.strip():
                embedding_text += f" | Context: {context.strip()}"
            if outcome and outcome.strip():
                embedding_text += f" | Outcome: {outcome.strip()}"

            embedding = None
            if generate_embedding:
                # Generate embedding using the embedding manager
                embedding_result = self.embeddings.generate_batch_embeddings([embedding_text])
                
                if not embedding_result.get("success"):
                    logger.warning(f"Failed to generate embedding for JTBD: {embedding_result.get('error')}")
                    return {
                        "success": False,
                        "error": f"Failed to generate embedding: {embedding_result.get('error')}"
                    }
                
                embeddings_data = embedding_result.get("embeddings", [])
                if embeddings_data:
                    embedding = embeddings_data[0]

            # Create JTBD in database
            if hasattr(self.db, 'ops') and self.db.ops:
                result = self.db.ops.create_jtbd(
                    statement=statement,
                    context=context,
                    outcome=outcome,
                    embedding=embedding
                )
            else:
                result = self.db.create_jtbd(
                    statement=statement,
                    context=context,
                    outcome=outcome,
                    embedding=embedding
                )

            if result.get("success"):
                logger.info(f"Created JTBD: {statement[:50]}...")
                return {
                    "success": True,
                    "jtbd": result.get("jtbd"),
                    "message": "JTBD created successfully"
                }
            else:
                logger.error(f"Failed to create JTBD: {result.get('error')}")
                return result

        except Exception as e:
            logger.error(f"Error creating JTBD: {e}")
            return {"success": False, "error": f"Failed to create JTBD: {str(e)}"}

    def validate_jtbd_input(
        self,
        statement: str,
        context: Optional[str] = None,
        outcome: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validate JTBD input data.

        Args:
            statement: The main JTBD statement
            context: Additional context
            outcome: Desired outcome

        Returns:
            Dict with validation results
        """
        errors = []

        if not statement or not statement.strip():
            errors.append("Statement is required")
        elif len(statement.strip()) < 10:
            errors.append("Statement should be at least 10 characters long")
        elif len(statement.strip()) > 1000:
            errors.append("Statement should be less than 1000 characters")

        if context and len(context.strip()) > 1000:
            errors.append("Context should be less than 1000 characters")

        if outcome and len(outcome.strip()) > 1000:
            errors.append("Outcome should be less than 1000 characters")

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": []
        }

    def get_recent_jtbds(self, limit: int = 10) -> Dict[str, Any]:
        """
        Get recently created JTBDs.

        Args:
            limit: Maximum number of JTBDs to return

        Returns:
            Dict with recent JTBDs
        """
        try:
            # Use existing database operations
            if hasattr(self.db, 'ops') and self.db.ops:
                # For now, use existing batch methods as foundation
                # Future: extend with specific recent JTBDs query
                return {"success": True, "jtbds": [], "count": 0}
            else:
                return {"success": True, "jtbds": [], "count": 0}

        except Exception as e:
            logger.error(f"Error getting recent JTBDs: {e}")
            return {"success": False, "error": f"Failed to get recent JTBDs: {str(e)}"}


# Global service instance management
_jtbd_service = None


def initialize_jtbd_service(database_manager=None, embedding_manager=None) -> JTBDService:
    """Initialize the global JTBD service instance."""
    global _jtbd_service
    _jtbd_service = JTBDService(database_manager, embedding_manager)
    return _jtbd_service


def get_jtbd_service() -> Optional[JTBDService]:
    """Get the global JTBD service instance."""
    global _jtbd_service
    return _jtbd_service


def reset_jtbd_service() -> None:
    """Reset the global JTBD service instance (for testing)."""
    global _jtbd_service
    _jtbd_service = None