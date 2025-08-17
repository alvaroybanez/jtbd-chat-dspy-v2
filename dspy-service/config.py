import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # OpenAI Configuration
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    
    # API Security
    API_KEY = os.getenv("API_KEY")
    
    # DSPy Configuration
    DSPY_CONFIG = os.getenv("DSPY_CONFIG", "default")
    
    # Server Configuration
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = int(os.getenv("PORT", 8000))
    
    @classmethod
    def validate(cls):
        """Validate required configuration"""
        required = ["OPENAI_API_KEY", "API_KEY"]
        missing = [var for var in required if not getattr(cls, var)]
        
        if missing:
            raise ValueError(f"Missing required environment variables: {', '.join(missing)}")

config = Config()