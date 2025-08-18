import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

class Config:
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-nano")
    OPENAI_TEMPERATURE = float(os.getenv("OPENAI_TEMPERATURE", "0.7"))
    OPENAI_MAX_TOKENS = int(os.getenv("OPENAI_MAX_TOKENS", "3000"))
    
    # API Security
    API_KEY = os.getenv("API_KEY")
    
    # DSPy Configuration
    DSPY_CONFIG = os.getenv("DSPY_CONFIG", "default")
    DSPY_CACHE = os.getenv("DSPY_CACHE", "true").lower() == "true"
    DSPY_ASYNC_MAX_WORKERS = int(os.getenv("DSPY_ASYNC_MAX_WORKERS", "8"))
    
    # Server Configuration
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", 8000))
    
    # Request Timeouts
    REQUEST_TIMEOUT = int(os.getenv("REQUEST_TIMEOUT", "30"))  # seconds
    OPENAI_TIMEOUT = int(os.getenv("OPENAI_TIMEOUT", "30"))   # seconds
    
    # Logging Configuration
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
    LOG_FORMAT = os.getenv("LOG_FORMAT", "json")  # json or text
    
    # Generation Defaults
    DEFAULT_HMW_COUNT = int(os.getenv("DEFAULT_HMW_COUNT", "5"))
    DEFAULT_SOLUTION_COUNT = int(os.getenv("DEFAULT_SOLUTION_COUNT", "5"))
    
    @classmethod
    def validate(cls):
        """Validate required configuration"""
        required = ["OPENAI_API_KEY", "API_KEY"]
        missing = [var for var in required if not getattr(cls, var)]
        
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")
        
        # Validate numeric ranges
        if not (0.0 <= cls.OPENAI_TEMPERATURE <= 2.0):
            raise ValueError("OPENAI_TEMPERATURE must be between 0.0 and 2.0")
        
        if not (1 <= cls.OPENAI_MAX_TOKENS <= 16384):
            raise ValueError("OPENAI_MAX_TOKENS must be between 1 and 16384")
        
        if not (1 <= cls.DSPY_ASYNC_MAX_WORKERS <= 100):
            raise ValueError("DSPY_ASYNC_MAX_WORKERS must be between 1 and 100")
        
        if cls.LOG_LEVEL not in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
            raise ValueError("LOG_LEVEL must be one of: DEBUG, INFO, WARNING, ERROR, CRITICAL")
            
        if cls.LOG_FORMAT not in ["json", "text"]:
            raise ValueError("LOG_FORMAT must be either 'json' or 'text'")
    
    @classmethod
    def get_dspy_config(cls) -> dict:
        """Get DSPy configuration dictionary"""
        return {
            "model": cls.OPENAI_MODEL,
            "api_key": cls.OPENAI_API_KEY,
            "temperature": cls.OPENAI_TEMPERATURE,
            "max_tokens": cls.OPENAI_MAX_TOKENS,
            "cache": cls.DSPY_CACHE,
            "timeout": cls.OPENAI_TIMEOUT
        }
    
    @classmethod
    def get_openai_lm_config(cls) -> dict:
        """Get OpenAI LM configuration for DSPy"""
        return {
            "api_key": cls.OPENAI_API_KEY,
            "temperature": cls.OPENAI_TEMPERATURE,
            "max_tokens": cls.OPENAI_MAX_TOKENS,
            "cache": cls.DSPY_CACHE
        }

config = Config()