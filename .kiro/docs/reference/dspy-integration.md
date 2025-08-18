# DSPy Integration Reference

Complete reference for DSPy integration patterns, architecture, and best practices in the JTBD Assistant Platform.

## Overview

The JTBD Assistant Platform uses DSPy (Declarative Self-improving Python) for intelligent generation of How Might We questions and prioritized solutions. DSPy provides a framework for programming language models declaratively rather than through prompt engineering.

## Architecture Integration

### Service Layer Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    TypeScript Service                       │
│              (Next.js + AI SDK v5)                         │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP + x-api-key
┌─────────────────────────────▼───────────────────────────────┐
│                 Python Intelligence Service                │
│                   (FastAPI + DSPy)                         │
└─────────────────────────────┬───────────────────────────────┘
                              │ LiteLLM
┌─────────────────────────────▼───────────────────────────────┐
│                      OpenAI API                            │
│                  (gpt-5-nano default)                     │
└─────────────────────────────────────────────────────────────┘
```

## DSPy Configuration

### Initialization Pattern

```python
# dspy_modules/__init__.py
import dspy
from config import config

def initialize_dspy() -> bool:
    """Initialize DSPy with OpenAI language model."""
    try:
        # Create OpenAI LM instance using latest DSPy patterns
        lm_config = config.get_openai_lm_config()
        lm = dspy.LM(f"openai/{config.OPENAI_MODEL}", **lm_config)
        
        # Configure DSPy globally (thread-safe)
        dspy.configure(lm=lm)
        
        return True
    except Exception as e:
        logger.error(f"DSPy initialization failed: {e}")
        return False

# Auto-initialize on import
initialize_dspy()
```

### Configuration Options

| Setting | Default | Purpose |
|---------|---------|---------|
| `OPENAI_MODEL` | `gpt-5-nano` | Primary model for generation |
| `OPENAI_TEMPERATURE` | `0.7` | Generation creativity (0.0-2.0) |
| `OPENAI_MAX_TOKENS` | `3000` | Maximum tokens per request |
| `DSPY_CACHE` | `true` | Enable LRU caching for repeated calls |
| `DSPY_ASYNC_MAX_WORKERS` | `8` | Async worker pool size |
| `OPENAI_TIMEOUT` | `30` | Request timeout in seconds |

## DSPy Signatures

### Class-Based Signatures (Recommended)

Following DSPy best practices, we use class-based signatures for clarity and validation:

```python
# dspy_modules/signatures.py
import dspy
from typing import List, Dict

class HMWGenerationSignature(dspy.Signature):
    """Generate How Might We questions from provided context."""
    
    # Input fields with descriptions for better LM understanding
    context_summary: str = dspy.InputField(
        desc="Summary of insights, metrics, and JTBDs provided as context"
    )
    insights: List[str] = dspy.InputField(
        desc="Key insights from user research and data analysis"
    )
    metrics: List[str] = dspy.InputField(
        desc="Available metrics that solutions could impact"
    )
    jtbds: List[str] = dspy.InputField(
        desc="Jobs-to-be-Done statements representing user goals"
    )
    count: int = dspy.InputField(
        desc="Number of HMW questions to generate (1-20)"
    )
    
    # Output fields with constraints
    hmw_questions: List[str] = dspy.OutputField(
        desc="Generated 'How might we...' questions that are specific, actionable, and relevant"
    )
    relevance_scores: List[float] = dspy.OutputField(
        desc="Relevance scores for each question from 0.0 to 10.0"
    )
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of the generation approach and key considerations"
    )
```

### Why Class-Based Over Inline Signatures

**Inline signatures** (simple):
```python
"context, insights -> how_might_we_questions: list[str]"
```

**Class-based signatures** (recommended):
- Better documentation and field descriptions
- Type validation and constraints
- Easier maintenance and debugging  
- Better LM performance through clear field descriptions

## DSPy Modules

### Base Module Pattern

```python
# dspy_modules/hmw_generator.py
import dspy
from .signatures import HMWGenerationSignature

class HMWGenerator(dspy.Module):
    """DSPy module for generating How Might We questions."""
    
    def __init__(self):
        super().__init__()
        # Use ChainOfThought for reasoning-heavy tasks
        self.hmw_generator = dspy.ChainOfThought(HMWGenerationSignature)
    
    def forward(self, insights: List[str], metrics: List[str], 
                jtbds: List[str], count: int = 5) -> Dict[str, Any]:
        """Synchronous generation."""
        # Context preparation
        context_summary = self._prepare_context_summary(insights, metrics, jtbds)
        
        # DSPy generation
        result = self.hmw_generator(
            context_summary=context_summary,
            insights=insights,
            metrics=metrics,
            jtbds=jtbds,
            count=count
        )
        
        return {
            "hmw_questions": result.hmw_questions,
            "relevance_scores": result.relevance_scores,
            "reasoning": result.reasoning
        }
    
    async def aforward(self, insights: List[str], metrics: List[str],
                       jtbds: List[str], count: int = 5) -> Dict[str, Any]:
        """Asynchronous generation using acall()."""
        context_summary = self._prepare_context_summary(insights, metrics, jtbds)
        
        # Use acall() for async DSPy execution
        result = await self.hmw_generator.acall(
            context_summary=context_summary,
            insights=insights,
            metrics=metrics,
            jtbds=jtbds,
            count=count
        )
        
        return {
            "hmw_questions": result.hmw_questions,
            "relevance_scores": result.relevance_scores,
            "reasoning": result.reasoning
        }
```

### Module Design Patterns

#### 1. ChainOfThought for Reasoning Tasks
```python
# For complex reasoning (HMW generation, solution creation)
self.generator = dspy.ChainOfThought(YourSignature)
```

#### 2. Predict for Simple Tasks  
```python
# For straightforward prediction tasks
self.predictor = dspy.Predict(YourSignature)
```

#### 3. Custom Multi-Step Modules
```python
class MultiStepGenerator(dspy.Module):
    def __init__(self):
        super().__init__()
        self.summarizer = dspy.ChainOfThought(SummarySignature)
        self.generator = dspy.ChainOfThought(GenerationSignature)
    
    async def aforward(self, input_data):
        # Step 1: Summarize context
        summary = await self.summarizer.acall(raw_data=input_data)
        
        # Step 2: Generate based on summary
        result = await self.generator.acall(summary=summary.summary)
        
        return result
```

## FastAPI Integration

### Async Endpoint Pattern

```python
# main.py
@app.post("/api/intelligence/generate_hmw", response_model=GenerateHMWResponse)
async def generate_hmw(
    request: GenerateHMWRequest,
    api_key: str = Depends(validate_api_key)
):
    """Generate HMW questions using DSPy."""
    
    try:
        with log_execution_time("hmw_generation", request_id) as timing:
            # Initialize DSPy module
            generator = HMWGenerator()
            
            # Async DSPy call
            raw_results = await generator.acall(
                insights=formatted_context['insights'],
                metrics=formatted_context['metrics'],
                jtbds=formatted_context['jtbds'],
                count=request.count
            )
            
            # Format results
            hmw_results = format_generation_results(raw_results, request)
            
            return GenerateHMWResponse(hmws=hmw_results, meta=meta)
            
    except Exception as e:
        # Structured error handling
        error_response = ErrorResponse.dspy_generation_error(str(e))
        raise HTTPException(status_code=500, detail=error_response.model_dump())
```

### Error Handling Patterns

#### DSPy-Specific Errors
```python
# Common DSPy error scenarios
try:
    result = await dspy_module.acall(...)
except Exception as e:
    if "rate limit" in str(e).lower():
        error = ErrorResponse.openai_api_error("Rate limit exceeded")
    elif "timeout" in str(e).lower():
        error = ErrorResponse.timeout_error(config.OPENAI_TIMEOUT)
    else:
        error = ErrorResponse.dspy_generation_error(str(e))
    
    raise HTTPException(status_code=500, detail=error.model_dump())
```

#### Fallback Strategy (Future Implementation)
```python
async def generate_with_fallback(dspy_module, **kwargs):
    """Try DSPy, fallback to direct OpenAI on failure."""
    try:
        return await dspy_module.acall(**kwargs)
    except Exception as e:
        logger.warning(f"DSPy failed, using fallback: {e}")
        return await direct_openai_generation(**kwargs)
```

## Performance Optimization

### Async Best Practices

#### When to Use Sync vs Async

**Use Synchronous** (`forward()`) when:
- Prototyping and development
- Simple scripts and notebooks
- Single-threaded applications

**Use Asynchronous** (`aforward()`, `acall()`) when:
- Production services with high throughput
- Multiple concurrent requests
- FastAPI endpoints (our use case)

#### Async Performance Tips

```python
# 1. Use acall() for individual calls
result = await module.acall(input_data)

# 2. Use asyncio.gather() for parallel processing
import asyncio

async def parallel_generation(modules, inputs):
    tasks = [module.acall(input_data) for module, input_data in zip(modules, inputs)]
    results = await asyncio.gather(*tasks)
    return results

# 3. Configure worker pools for high throughput
# Set DSPY_ASYNC_MAX_WORKERS environment variable
```

### Caching Strategy

```python
# DSPy provides built-in caching
lm = dspy.LM('openai/gpt-5-nano', cache=True)  # Default: True

# Cache is LRU-based and persistent across requests
# Same inputs = cached outputs (reduces costs and latency)
```

### Memory Management

```python
# For large-scale processing
class EfficientGenerator(dspy.Module):
    def __init__(self):
        super().__init__()
        self.predictor = dspy.ChainOfThought(YourSignature)
    
    async def process_batch(self, items: List[Dict], batch_size: int = 10):
        """Process items in batches to manage memory."""
        results = []
        
        for i in range(0, len(items), batch_size):
            batch = items[i:i + batch_size]
            batch_tasks = [self.predictor.acall(**item) for item in batch]
            batch_results = await asyncio.gather(*batch_tasks)
            results.extend(batch_results)
            
            # Optional: Add delay between batches
            if i + batch_size < len(items):
                await asyncio.sleep(0.1)
        
        return results
```

## Testing DSPy Modules

### Unit Testing Pattern

```python
# tests/test_dspy_modules.py
import pytest
from unittest.mock import AsyncMock, patch
from dspy_modules.hmw_generator import HMWGenerator

class TestHMWGenerator:
    @pytest.fixture
    def mock_dspy_result(self):
        """Mock DSPy module result."""
        mock_result = AsyncMock()
        mock_result.hmw_questions = [
            "How might we improve user engagement?",
            "How might we reduce friction in the process?"
        ]
        mock_result.relevance_scores = [8.5, 7.2]
        mock_result.reasoning = "Generated based on user insights"
        return mock_result
    
    @pytest.mark.asyncio
    async def test_hmw_generation(self, mock_dspy_result):
        """Test HMW generation with mocked DSPy."""
        with patch('dspy.ChainOfThought') as mock_chain:
            mock_chain.return_value.acall = AsyncMock(return_value=mock_dspy_result)
            
            generator = HMWGenerator()
            result = await generator.aforward(
                insights=["Users need motivation"],
                metrics=["Engagement score"],
                jtbds=["Help users stay motivated"],
                count=2
            )
            
            assert len(result['hmw_questions']) == 2
            assert result['hmw_questions'][0].startswith('How might we')
            assert len(result['relevance_scores']) == 2
```

### Integration Testing

```python
# tests/test_integration.py
@pytest.mark.asyncio
@pytest.mark.integration
async def test_dspy_integration_with_real_api():
    """Integration test with real OpenAI API (requires API key)."""
    if not os.getenv('OPENAI_API_KEY'):
        pytest.skip("OPENAI_API_KEY not set")
    
    from dspy_modules import initialize_dspy
    from dspy_modules.hmw_generator import HMWGenerator
    
    # Initialize DSPy
    assert initialize_dspy() == True
    
    # Test real generation
    generator = HMWGenerator()
    result = await generator.aforward(
        insights=["Users abandon shopping carts"],
        metrics=["Conversion rate"],
        jtbds=["Complete purchases easily"],
        count=1
    )
    
    assert len(result['hmw_questions']) == 1
    assert 'how might we' in result['hmw_questions'][0].lower()
```

## Monitoring and Observability

### DSPy Call Logging

```python
# utils/logger.py
def log_dspy_call(
    module_name: str,
    input_data: Dict[str, Any],
    output_data: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    error: Optional[Exception] = None
):
    """Log DSPy module calls for monitoring."""
    if error:
        logger.error(f"DSPy call failed: {module_name}", extra={
            "module_name": module_name,
            "duration_ms": duration_ms,
            "event_type": "dspy_call_failed",
            "input_data": sanitize_for_logging(input_data)
        })
    else:
        logger.info(f"DSPy call completed: {module_name}", extra={
            "module_name": module_name,
            "duration_ms": duration_ms,
            "event_type": "dspy_call_complete",
            "token_usage": extract_token_usage(output_data)
        })
```

### Performance Monitoring

```python
# Monitor DSPy performance
with log_execution_time("dspy_hmw_generation") as timing:
    result = await hmw_generator.acall(...)
    
    # Log performance metrics
    logger.info("DSPy generation completed", extra={
        "duration_ms": timing["duration_ms"],
        "output_count": len(result.hmw_questions),
        "avg_score": sum(result.relevance_scores) / len(result.relevance_scores)
    })
```

## Troubleshooting

### Common Issues

#### 1. DSPy Initialization Failures
```python
# Problem: "No module named 'packaging'"
# Solution: Add to requirements.txt
packaging==24.2

# Problem: "OpenAI API key not found"  
# Solution: Set environment variable
export OPENAI_API_KEY="your-key-here"
```

#### 2. Async/Sync Mixing
```python
# Problem: "RuntimeError: no running event loop"
# Solution: Use proper async patterns

# ❌ Wrong
def sync_function():
    result = await dspy_module.acall()  # Can't await in sync function

# ✅ Correct  
async def async_function():
    result = await dspy_module.acall()

# ✅ Also correct (run in thread pool)
import asyncio
loop = asyncio.get_event_loop()
result = await loop.run_in_executor(None, dspy_module.forward, inputs)
```

#### 3. Memory Issues with Large Batches
```python
# Problem: Out of memory with large batches
# Solution: Process in smaller batches
async def process_large_dataset(items):
    batch_size = 10  # Adjust based on memory
    results = []
    
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        batch_results = await process_batch(batch)
        results.extend(batch_results)
        
        # Optional: Force garbage collection
        import gc
        gc.collect()
    
    return results
```

## Best Practices Summary

### 1. Architecture
- ✅ Use class-based signatures for clarity
- ✅ Implement both sync and async methods
- ✅ Use ChainOfThought for reasoning tasks
- ✅ Implement proper error handling and fallbacks

### 2. Performance  
- ✅ Use async/await for production endpoints
- ✅ Enable caching for repeated calls
- ✅ Process large datasets in batches
- ✅ Monitor performance and token usage

### 3. Development
- ✅ Test with mocked DSPy calls
- ✅ Add integration tests with real API
- ✅ Use structured logging for observability
- ✅ Validate inputs and outputs thoroughly

### 4. Production
- ✅ Configure proper timeouts
- ✅ Implement retry logic with exponential backoff
- ✅ Use fallback strategies when DSPy fails
- ✅ Monitor costs and usage patterns

## Future Enhancements

### Advanced DSPy Features (Future Tasks)

#### 1. DSPy Optimizers
```python
# Automatically optimize prompts and examples
from dspy.optimizers import LabeledFewShot

# This could be useful for future optimization of existing modules
optimizer = LabeledFewShot()
optimized_module = optimizer.compile(
    hmw_generator,
    trainset=training_examples
)
```

#### 2. DSPy Evaluation
```python
# Evaluate generation quality
from dspy.evaluate import Evaluate

def hmw_quality_metric(example, prediction):
    """Custom metric for HMW quality."""
    return (
        prediction.question.lower().startswith('how might we') and
        len(prediction.question.split()) >= 5 and
        prediction.score >= 6.0
    )

evaluate = Evaluate(
    devset=evaluation_examples,
    metric=hmw_quality_metric,
    num_threads=4
)

score = evaluate(hmw_generator)
```

#### 3. Multi-Model Support
```python
# Support multiple models for different tasks
fast_lm = dspy.LM('openai/gpt-5-nano')  # Fast, cheaper
powerful_lm = dspy.LM('openai/gpt-5-mini')   # More capable

# Use context switching
with dspy.context(lm=powerful_lm):
    complex_result = await complex_module.acall(...)
```

---

*This DSPy integration provides a complete foundation for the JTBD Assistant Platform's AI-powered intelligence features with both HMW generation (Task 6.2) and solution creation (Task 6.3) implemented using production-ready patterns for performance, monitoring, and reliability.*