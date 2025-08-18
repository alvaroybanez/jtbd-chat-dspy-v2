"""
DSPy modules for the JTBD Intelligence Service.

This package contains DSPy signatures and modules for generating HMW questions
and prioritized solutions using the DSPy framework with OpenAI integration.
"""

import os
import dspy
from typing import Optional
from config import config

# Global DSPy configuration
_lm: Optional[dspy.LM] = None
_initialized: bool = False


def initialize_dspy() -> bool:
    """
    Initialize DSPy with OpenAI language model.
    
    Returns:
        bool: True if initialization successful, False otherwise
    """
    global _lm, _initialized
    
    if _initialized and _lm:
        return True
    
    try:
        # Validate configuration
        config.validate()
        
        # Create OpenAI LM instance
        lm_config = config.get_openai_lm_config()
        _lm = dspy.LM(f"openai/{config.OPENAI_MODEL}", **lm_config)
        
        # Configure DSPy globally
        dspy.configure(lm=_lm)
        
        _initialized = True
        return True
        
    except Exception as e:
        print(f"Failed to initialize DSPy: {e}")
        _initialized = False
        return False


def get_lm() -> Optional[dspy.LM]:
    """Get the configured DSPy language model."""
    return _lm


def is_initialized() -> bool:
    """Check if DSPy is properly initialized."""
    return _initialized and _lm is not None


def reset_dspy():
    """Reset DSPy configuration (useful for testing)."""
    global _lm, _initialized
    _lm = None
    _initialized = False


# Auto-initialize on import
initialize_dspy()

__all__ = [
    "initialize_dspy",
    "get_lm", 
    "is_initialized",
    "reset_dspy"
]