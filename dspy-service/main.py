import asyncio
import time
import uuid
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException, Depends, Security, Request
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

# Local imports
from config import config
from models import (
    GenerateHMWRequest, CreateSolutionsRequest,
    GenerateHMWResponse, CreateSolutionsResponse, HealthResponse,
    ErrorResponse, ValidationErrorDetail,
    MetaInfo
)
from dspy_modules import initialize_dspy, is_initialized
from dspy_modules.hmw_generator import HMWGenerator, format_context_for_generation, format_generation_results
from dspy_modules.solution_generator import SolutionGenerator, format_context_for_solution_generation, format_solution_results
from utils import logger, log_request, log_response, log_error, log_execution_time

# Service startup time for uptime calculation
SERVICE_START_TIME = datetime.utcnow()

# Initialize DSPy on startup
if not initialize_dspy():
    logger.error("Failed to initialize DSPy - service may not function properly")

app = FastAPI(
    title="JTBD Intelligence Service",
    description="DSPy-powered HMW and solution generation for the JTBD Assistant Platform",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # TypeScript service
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# API Key validation
api_key_header = APIKeyHeader(name="x-api-key", auto_error=False)

async def validate_api_key(api_key: str = Security(api_key_header)):
    """Validate API key from header."""
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing API key header"
        )
    
    if api_key != config.API_KEY:
        log_error(
            "Invalid API key provided",
            error_code="INVALID_API_KEY",
            extra={"provided_key_prefix": api_key[:8] + "..." if len(api_key) > 8 else api_key}
        )
        raise HTTPException(
            status_code=403,
            detail="Invalid API key"
        )
    
    return api_key

def generate_request_id() -> str:
    """Generate unique request ID for tracking."""
    return str(uuid.uuid4())

@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    """Handle Pydantic validation errors."""
    request_id = getattr(request.state, 'request_id', generate_request_id())
    
    # Convert Pydantic errors to our format
    validation_errors = []
    for error in exc.errors():
        validation_errors.append(ValidationErrorDetail(
            field=".".join(str(loc) for loc in error["loc"]),
            message=error["msg"],
            invalid_value=error.get("input")
        ))
    
    error_response = ErrorResponse.validation_error(
        validation_errors,
        details={"request_id": request_id}
    )
    
    log_error(
        "Request validation failed",
        error_code="VALIDATION_ERROR",
        request_id=request_id,
        extra={
            "validation_errors": [e.model_dump() for e in validation_errors],
            "endpoint": str(request.url.path)
        }
    )
    
    return JSONResponse(
        status_code=422,
        content=error_response.model_dump()
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle HTTP exceptions with structured logging."""
    request_id = getattr(request.state, 'request_id', generate_request_id())
    
    # Map HTTP status to error response
    if exc.status_code == 401:
        error_response = ErrorResponse(
            code="UNAUTHORIZED",
            message="Authentication required",
            action="NONE",
            details={"request_id": request_id}
        )
    elif exc.status_code == 403:
        error_response = ErrorResponse.invalid_api_key(
            details={"request_id": request_id}
        )
    elif exc.status_code == 500:
        error_response = ErrorResponse.internal_server_error(
            str(exc.detail),
            details={"request_id": request_id}
        )
    else:
        error_response = ErrorResponse(
            code="HTTP_ERROR",
            message=str(exc.detail),
            action="RETRY" if exc.status_code >= 500 else "NONE",
            details={"request_id": request_id, "status_code": exc.status_code}
        )
    
    log_error(
        f"HTTP exception: {exc.status_code} - {exc.detail}",
        error_code=error_response.code,
        request_id=request_id,
        endpoint=str(request.url.path)
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content=error_response.model_dump()
    )

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    """Log all requests and responses."""
    request_id = generate_request_id()
    request.state.request_id = request_id
    
    start_time = time.time()
    
    # Log incoming request
    log_request(
        endpoint=str(request.url.path),
        method=request.method,
        request_id=request_id,
        user_agent=request.headers.get("user-agent"),
        extra={
            "client_ip": request.client.host if request.client else None,
            "content_length": request.headers.get("content-length")
        }
    )
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration_ms = (time.time() - start_time) * 1000
    
    # Log response
    log_response(
        endpoint=str(request.url.path),
        method=request.method,
        status_code=response.status_code,
        duration_ms=duration_ms,
        request_id=request_id
    )
    
    # Add request ID to response headers
    response.headers["x-request-id"] = request_id
    
    return response

# Enhanced health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Enhanced health check with DSPy and OpenAI validation."""
    dspy_configured = is_initialized()
    openai_accessible = True
    
    # Test OpenAI accessibility if DSPy is configured
    if dspy_configured:
        try:
            # Simple test call to validate OpenAI connectivity
            import dspy
            lm = dspy.LM(f"openai/{config.OPENAI_MODEL}", **config.get_openai_lm_config())
            # Just check configuration, don't make actual call
            openai_accessible = lm is not None
        except Exception as e:
            logger.warning(f"OpenAI accessibility check failed: {e}")
            openai_accessible = False
    
    # Calculate uptime
    uptime = (datetime.utcnow() - SERVICE_START_TIME).total_seconds()
    
    # Determine overall status
    if dspy_configured and openai_accessible:
        status = "healthy"
    elif dspy_configured:
        status = "degraded"  # DSPy works but OpenAI issues
    else:
        status = "unhealthy"  # DSPy not configured
    
    return HealthResponse(
        status=status,
        dspy_configured=dspy_configured,
        openai_accessible=openai_accessible,
        uptime_seconds=uptime
    )

# HMW generation endpoint
@app.post("/api/intelligence/generate_hmw", response_model=GenerateHMWResponse)
async def generate_hmw(
    request: GenerateHMWRequest,
    api_key: str = Depends(validate_api_key),
    http_request: Request = None
):
    """Generate How Might We questions using DSPy."""
    request_id = getattr(http_request.state, 'request_id', generate_request_id()) if http_request else generate_request_id()
    
    # Validate DSPy is initialized
    if not is_initialized():
        error_response = ErrorResponse.configuration_error(
            "DSPy not properly initialized",
            details={"request_id": request_id}
        )
        raise HTTPException(status_code=503, detail=error_response.model_dump())
    
    try:
        with log_execution_time("hmw_generation", request_id) as timing:
            # Format context for generation
            formatted_context = format_context_for_generation(request)
            
            # Initialize generator
            generator = HMWGenerator()
            
            # Generate HMWs (async)
            raw_results = await generator.acall(
                insights=formatted_context['insights'],
                metrics=formatted_context['metrics'], 
                jtbds=formatted_context['jtbds'],
                count=request.count
            )
            
            # Format results
            hmw_results = format_generation_results(raw_results, request)
            
            # Create response
            meta = MetaInfo(
                duration_ms=int(timing.get("duration_ms", 0)),
                retries=0,
                model_used=config.OPENAI_MODEL,
                generation_method="dspy"
            )
            
            response = GenerateHMWResponse(
                hmws=hmw_results,
                meta=meta
            )
            
            logger.info(
                f"HMW generation completed successfully: {len(hmw_results)} questions",
                extra={
                    "request_id": request_id,
                    "hmw_count": len(hmw_results),
                    "duration_ms": timing.get("duration_ms")
                }
            )
            
            return response
            
    except Exception as e:
        log_error(
            "HMW generation failed",
            error=e,
            endpoint="/api/intelligence/generate_hmw",
            request_id=request_id,
            error_code="DSPY_GENERATION_ERROR"
        )
        
        error_response = ErrorResponse.dspy_generation_error(
            str(e),
            details={"request_id": request_id}
        )
        raise HTTPException(status_code=500, detail=error_response.model_dump())

# Solution creation endpoint
@app.post("/api/intelligence/create_solutions", response_model=CreateSolutionsResponse)
async def create_solutions(
    request: CreateSolutionsRequest,
    api_key: str = Depends(validate_api_key),
    http_request: Request = None
):
    """Create prioritized solutions using DSPy."""
    request_id = getattr(http_request.state, 'request_id', generate_request_id()) if http_request else generate_request_id()
    
    # Validate DSPy is initialized
    if not is_initialized():
        error_response = ErrorResponse.configuration_error(
            "DSPy not properly initialized",
            details={"request_id": request_id}
        )
        raise HTTPException(status_code=503, detail=error_response.model_dump())
    
    try:
        with log_execution_time("solution_creation", request_id) as timing:
            # Format context for generation
            formatted_context = format_context_for_solution_generation(request)
            
            # Initialize generator
            generator = SolutionGenerator()
            
            # Generate solutions (async)
            raw_results = await generator.acall(
                hmw_questions=formatted_context['hmw_questions'],
                available_metrics=formatted_context['available_metrics'],
                context_insights=formatted_context['context_insights'],
                context_jtbds=formatted_context['context_jtbds'],
                count=request.count
            )
            
            # Format results
            solution_results = format_solution_results(
                raw_results, 
                request,
                formatted_context['metric_ids']
            )
            
            # Create response
            meta = MetaInfo(
                duration_ms=int(timing.get("duration_ms", 0)),
                retries=0,
                model_used=config.OPENAI_MODEL,
                generation_method="dspy"
            )
            
            response = CreateSolutionsResponse(
                solutions=solution_results,
                meta=meta,
                fallback_metric_used=False  # Will be true when fallback is implemented
            )
            
            logger.info(
                f"Solution creation completed successfully: {len(solution_results)} solutions",
                extra={
                    "request_id": request_id,
                    "solution_count": len(solution_results),
                    "duration_ms": timing.get("duration_ms")
                }
            )
            
            return response
            
    except Exception as e:
        log_error(
            "Solution creation failed",
            error=e,
            endpoint="/api/intelligence/create_solutions",
            request_id=request_id,
            error_code="DSPY_GENERATION_ERROR"
        )
        
        error_response = ErrorResponse.dspy_generation_error(
            str(e),
            details={"request_id": request_id}
        )
        raise HTTPException(status_code=500, detail=error_response.model_dump())

@app.on_event("startup")
async def startup_event():
    """Application startup event."""
    try:
        config.validate()
        logger.info("Configuration validated successfully")
        
        if is_initialized():
            logger.info("DSPy initialized successfully")
        else:
            logger.error("DSPy initialization failed")
            
        logger.info(
            f"JTBD Intelligence Service started",
            extra={
                "version": "0.1.0",
                "dspy_configured": is_initialized(),
                "openai_model": config.OPENAI_MODEL,
                "log_level": config.LOG_LEVEL
            }
        )
    except Exception as e:
        logger.error(f"Startup validation failed: {e}")
        # Don't prevent startup, but log the issue

@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown event."""
    logger.info("JTBD Intelligence Service shutting down")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=config.HOST,
        port=config.PORT,
        log_level=config.LOG_LEVEL.lower()
    )