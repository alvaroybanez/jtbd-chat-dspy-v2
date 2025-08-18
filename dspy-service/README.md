# JTBD Intelligence Service

DSPy-powered intelligence service for generating How Might We questions and prioritized solutions for the JTBD Assistant Platform.

## Task 6.1 Status: ✅ COMPLETED

This service provides the FastAPI foundation with DSPy integration, comprehensive Pydantic models, structured logging, and async support for high-throughput production use.

## Features Implemented (Task 6.1)

### 🔧 Core Infrastructure
- **Enhanced Configuration**: Complete config system with DSPy settings, validation, and environment variable support
- **DSPy Integration**: Proper DSPy initialization with OpenAI LM configuration
- **Async Support**: FastAPI with async endpoints using DSPy's `acall()` methods for high throughput
- **Structured Logging**: JSON/text logging with request tracking, performance monitoring, and error handling

### 📊 API Models
- **Request Models**: Comprehensive Pydantic validation for HMW and solution generation requests
- **Response Models**: Structured responses with computed fields, metadata, and source references
- **Error Models**: Standardized error responses matching platform specification

### 🛡️ Production Features
- **Authentication**: x-api-key validation with proper error responses
- **Error Handling**: Comprehensive exception handling with structured error responses
- **Request Tracking**: UUID-based request tracking with middleware logging
- **Health Checks**: Enhanced health endpoint with DSPy and OpenAI validation
- **CORS Support**: Configured for TypeScript service integration

### 📝 API Documentation
- **OpenAPI Schema**: Auto-generated documentation at `/docs`
- **ReDoc**: Alternative documentation at `/redoc`
- **Type Safety**: Full TypeScript-compatible API specification

## Quick Start

### Prerequisites
- Python 3.8+
- OpenAI API key
- API key for service authentication

### Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Set environment variables
export OPENAI_API_KEY="your-openai-api-key"
export API_KEY="your-secure-api-key"

# Optional: Configure additional settings
export OPENAI_MODEL="gpt-5-nano"  # Default
export LOG_LEVEL="INFO"            # Default
export LOG_FORMAT="json"           # Default
export PORT="8000"                 # Default
```

### Running the Service

```bash
# Development mode
python main.py

# Or with uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The service will be available at:
- **API**: http://localhost:8000
- **Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## API Endpoints

### Core Endpoints

#### Health Check
```http
GET /health
```

Returns service health status with DSPy and OpenAI validation.

#### Generate HMW Questions
```http
POST /api/intelligence/generate_hmw
Headers: x-api-key: your-api-key
Content-Type: application/json

{
  "context": {
    "insights": [{"id": "i1", "content": "Users struggle with motivation"}],
    "metrics": [{"id": "m1", "name": "Engagement", "unit": "score"}],
    "jtbds": [{"id": "j1", "statement": "Help users stay motivated"}]
  },
  "count": 5,
  "temperature": 0.7
}
```

#### Create Solutions
```http
POST /api/intelligence/create_solutions
Headers: x-api-key: your-api-key
Content-Type: application/json

{
  "hmws": [
    {"id": "h1", "question": "How might we improve user engagement?"}
  ],
  "context": {
    "metrics": [{"id": "m1", "name": "Engagement", "unit": "score"}],
    "insights": [{"id": "i1", "content": "Users need motivation"}]
  },
  "count": 3
}
```

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *Required* | OpenAI API key for DSPy |
| `API_KEY` | *Required* | Service authentication key |
| `OPENAI_MODEL` | `gpt-5-nano` | OpenAI model for generation |
| `OPENAI_TEMPERATURE` | `0.7` | Generation temperature (0.0-2.0) |
| `OPENAI_MAX_TOKENS` | `3000` | Maximum tokens per request |
| `HOST` | `0.0.0.0` | Server host |
| `PORT` | `8000` | Server port |
| `LOG_LEVEL` | `INFO` | Logging level (DEBUG/INFO/WARNING/ERROR/CRITICAL) |
| `LOG_FORMAT` | `json` | Log format (json/text) |
| `REQUEST_TIMEOUT` | `30` | Request timeout in seconds |
| `DEFAULT_HMW_COUNT` | `5` | Default HMW questions to generate |
| `DEFAULT_SOLUTION_COUNT` | `5` | Default solutions to generate |

## Testing

### Core Validation
```bash
# Run core validation tests (no dependencies required)
python validate_core.py
```

### Unit Tests (when dependencies are installed)
```bash
# Install test dependencies
pip install -r requirements.txt

# Run unit tests
python -m pytest tests/ -v
```

## Project Structure

```
dspy-service/
├── main.py                 # FastAPI application with DSPy integration
├── config.py              # Configuration management and validation
├── requirements.txt       # Python dependencies
├── validate_core.py      # Core validation script
├── models/                # Pydantic models
│   ├── __init__.py
│   ├── requests.py       # Request models with validation
│   ├── responses.py      # Response models with computed fields
│   └── errors.py         # Standard error models
├── dspy_modules/          # DSPy integration
│   ├── __init__.py       # DSPy initialization
│   ├── signatures.py     # DSPy signature definitions
│   ├── hmw_generator.py  # HMW generation (stub for Task 6.2)
│   └── solution_generator.py # Solution generation (stub for Task 6.3)
├── utils/                # Utilities
│   ├── __init__.py
│   └── logger.py         # Structured logging
└── tests/                # Unit tests
    ├── __init__.py
    ├── test_config.py
    ├── test_models.py
    └── test_auth.py
```

## Development Status

### ✅ Task 6.1: FastAPI Application with Authentication (COMPLETED)
- [x] FastAPI app with x-api-key authentication
- [x] Pydantic models for request/response validation
- [x] DSPy configuration with OpenAI integration
- [x] Structured logging and error handling
- [x] Health check endpoint
- [x] Comprehensive unit tests
- [x] API documentation

### 🚧 Task 6.2: HMW Generation Endpoint with DSPy (PENDING)
- [ ] Implement DSPy ChainOfThought for HMW generation
- [ ] "How might we" prefix normalization
- [ ] Generate scored HMWs with source references

### 🚧 Task 6.3: Solution Creation Endpoint with Intelligent Metric Assignment (PENDING)
- [ ] Implement DSPy ChainOfThought for solution generation
- [ ] Intelligent metric selection logic
- [ ] Solutions with impact/effort scoring
- [ ] Calculate final scores and ensure metric assignment

## Error Handling

The service uses standardized error responses with these codes:
- `INVALID_API_KEY` - Authentication failed
- `DSPY_GENERATION_ERROR` - DSPy generation failed
- `TIMEOUT_ERROR` - Request timeout
- `VALIDATION_ERROR` - Request validation failed
- `CONFIGURATION_ERROR` - Service configuration issue

## Monitoring

The service provides structured logging with:
- Request/response tracking with unique request IDs
- Performance timing for all operations
- Error tracking with context
- DSPy call monitoring
- JSON or text log formats

## Contributing

When implementing Tasks 6.2 and 6.3:

1. **DSPy Integration**: Use the existing signatures in `dspy_modules/signatures.py`
2. **Error Handling**: Use the established error patterns
3. **Testing**: Add tests following the existing patterns
4. **Logging**: Use the structured logging utilities
5. **Validation**: Ensure all models follow the API specification

## License

This is part of the JTBD Assistant Platform project.