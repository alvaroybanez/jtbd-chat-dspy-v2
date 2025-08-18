# Configuration Reference

Complete configuration guide for the JTBD Assistant Platform services.

## Environment Variables

### TypeScript Service (Next.js)

#### Required Variables
```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-proj-...                    # OpenAI API key for chat and embeddings

# Supabase Configuration  
SUPABASE_URL=https://xxx.supabase.co          # Supabase project URL
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiI...      # Supabase anonymous/public key

# Python Service Communication
DSPY_API_KEY=your-secure-api-key              # API key for Python service authentication
```

#### Optional Variables
```bash
# Python Service URL (defaults to localhost in development)
DSPY_SERVICE_URL=http://localhost:8000        # Default: http://localhost:8000
```

### Python Service (FastAPI)

#### Required Variables
```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-proj-...                    # OpenAI API key for DSPy operations

# API Security
API_KEY=your-secure-api-key                   # Must match DSPY_API_KEY from TypeScript service
```

#### Optional Variables
```bash
# DSPy Configuration
DSPY_CONFIG=default                           # DSPy configuration profile

# Server Configuration
HOST=0.0.0.0                                  # Server host (default: 0.0.0.0)
PORT=8000                                     # Server port (default: 8000)
```

## Configuration Files

### TypeScript Configuration (`src/lib/config.ts`)

```typescript
export const config = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-5-nano',                     // Primary chat model
    embeddingModel: 'text-embedding-3-small'  // 1536-dimension embeddings
  },
  supabase: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!
  },
  dspy: {
    serviceUrl: process.env.DSPY_SERVICE_URL || 'http://localhost:8000',
    apiKey: process.env.DSPY_API_KEY!,
    timeout: 30000                            // 30-second timeout with fallback
  }
} as const

export function validateConfig() {
  const required = [
    'OPENAI_API_KEY',
    'SUPABASE_URL', 
    'SUPABASE_ANON_KEY',
    'DSPY_API_KEY'
  ]
  
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
```

### Python Configuration (`dspy-service/config.py`)

```python
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
```

## Development Setup

### Local Development Environment

1. **Create environment files**:

```bash
# Project root (.env.local for Next.js)
cat > .env.local << EOF
OPENAI_API_KEY=sk-proj-your-openai-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
DSPY_API_KEY=development-api-key-123
DSPY_SERVICE_URL=http://localhost:8000
EOF

# Python service directory (.env)
cat > dspy-service/.env << EOF
OPENAI_API_KEY=sk-proj-your-openai-key
API_KEY=development-api-key-123
HOST=0.0.0.0
PORT=8000
EOF
```

2. **Validate configuration**:

```bash
# TypeScript service
npm run dev    # Will validate config on startup

# Python service  
cd dspy-service
python -c "from config import config; config.validate(); print('Config valid')"
```

### Production Environment

#### Deployment Checklist
- [ ] Generate secure API keys (not development keys)
- [ ] Configure production Supabase project
- [ ] Set proper CORS origins for production domains
- [ ] Use HTTPS URLs for all service communication
- [ ] Enable proper logging and monitoring

#### Security Considerations
- **API Keys**: Use strong, unique keys for each environment
- **CORS**: Restrict to specific domains in production
- **HTTPS**: All inter-service communication should use HTTPS
- **Key Rotation**: Plan for regular API key rotation

## Model Configuration

### OpenAI Models
```typescript
const models = {
  chat: 'gpt-5-nano',              // Primary chat model (fast, cost-effective)
  embedding: 'text-embedding-3-small', // 1536 dimensions, optimal for our use case
  fallback: 'gpt-5-nano'           // Fallback when DSPy unavailable
}
```

### Vector Search Configuration
```typescript
const vectorConfig = {
  dimensions: 1536,                 // OpenAI text-embedding-3-small
  similarityThreshold: 0.7,         // Minimum similarity for relevance
  maxResults: 100,                  // Maximum results per search
  indexType: 'ivfflat'              // PostgreSQL pgvector index type
}
```

### Timeout Configuration
```typescript
const timeouts = {
  dspyService: 30000,               // 30s timeout for DSPy calls
  openaiApi: 30000,                 // 30s timeout for OpenAI direct calls
  database: 10000,                  // 10s timeout for database operations
  vectorSearch: 5000                // 5s timeout for vector searches
}
```

## Service Communication

### TypeScript → Python Authentication
```typescript
// HTTP client configuration
const headers = {
  'Content-Type': 'application/json',
  'x-api-key': config.dspy.apiKey
}

// Timeout and retry configuration
const fetchConfig = {
  timeout: 30000,                   // 30-second timeout
  retries: 1,                       // Single retry on failure
  fallback: true                    // Enable OpenAI direct fallback
}
```

### CORS Configuration
```python
# Python service CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Development
    # allow_origins=["https://your-domain.com"],  # Production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Error Handling Configuration

### Standard Error Codes
```typescript
const errorCodes = {
  // Configuration errors
  MISSING_CONFIG: 'Required environment variable missing',
  INVALID_API_KEY: 'API key validation failed',
  
  // Service communication
  DSPY_MODULE_ERROR: 'Python service unavailable',
  CHAIN_TIMEOUT: 'Processing timeout exceeded',
  
  // Data validation
  INVALID_CONTEXT: 'Insufficient input data',
  FILE_TOO_LARGE: 'File exceeds size limit',
  
  // Database
  DATABASE_ERROR: 'Database operation failed'
}
```

### Fallback Configuration
```typescript
const fallbackConfig = {
  enableDspyFallback: true,         // Use OpenAI direct when DSPy fails
  fallbackTimeout: 15000,           // Shorter timeout for fallback calls
  logFallbackUsage: true,           // Track fallback activation
  defaultMetricId: 'uuid-of-default-metric' // From seed data
}
```

## Development Tools

### Configuration Validation Script
```bash
#!/bin/bash
# validate-config.sh

echo "Validating TypeScript service configuration..."
npm run typecheck

echo "Validating Python service configuration..."  
cd dspy-service
python -c "from config import config; config.validate()"

echo "Testing service communication..."
curl -H "x-api-key: $API_KEY" http://localhost:8000/health

echo "All configurations valid!"
```

### Environment Template
```bash
# .env.template - Copy to .env.local and .env
OPENAI_API_KEY=your-openai-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
DSPY_API_KEY=your-secure-api-key
DSPY_SERVICE_URL=http://localhost:8000
API_KEY=your-secure-api-key  # Must match DSPY_API_KEY
```

---
*Configuration is centralized and validated at startup to prevent runtime issues.*