"""
Structured logging utility for the JTBD Intelligence Service.

Provides JSON and text-based logging with proper request/response tracking
and error handling for monitoring and debugging.
"""

import json
import logging
import sys
import time
from datetime import datetime
from typing import Any, Dict, Optional
from contextlib import contextmanager

from config import config


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        # Base log entry
        log_entry = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Add extra fields if present
        if hasattr(record, 'request_id'):
            log_entry['request_id'] = record.request_id
        
        if hasattr(record, 'endpoint'):
            log_entry['endpoint'] = record.endpoint
            
        if hasattr(record, 'method'):
            log_entry['method'] = record.method
            
        if hasattr(record, 'duration_ms'):
            log_entry['duration_ms'] = record.duration_ms
            
        if hasattr(record, 'status_code'):
            log_entry['status_code'] = record.status_code
            
        if hasattr(record, 'error_code'):
            log_entry['error_code'] = record.error_code
            
        if hasattr(record, 'user_agent'):
            log_entry['user_agent'] = record.user_agent
            
        # Add exception info if present
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
            
        # Add extra context data
        if hasattr(record, 'extra'):
            log_entry.update(record.extra)
            
        return json.dumps(log_entry, ensure_ascii=False)


class TextFormatter(logging.Formatter):
    """Text formatter for human-readable logging."""
    
    def __init__(self):
        super().__init__(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )


def setup_logging() -> logging.Logger:
    """
    Setup structured logging based on configuration.
    
    Returns:
        Configured logger instance
    """
    # Create logger
    logger = logging.getLogger("jtbd_intelligence")
    logger.setLevel(getattr(logging, config.LOG_LEVEL, logging.INFO))
    
    # Clear any existing handlers
    logger.handlers.clear()
    
    # Create console handler
    handler = logging.StreamHandler(sys.stdout)
    
    # Set formatter based on config
    if config.LOG_FORMAT == "json":
        formatter = JSONFormatter()
    else:
        formatter = TextFormatter()
    
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    # Prevent duplicate logging
    logger.propagate = False
    
    return logger


# Create global logger instance
logger = setup_logging()


def log_request(
    endpoint: str,
    method: str = "POST",
    request_id: Optional[str] = None,
    user_agent: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None
) -> None:
    """
    Log incoming request information.
    
    Args:
        endpoint: API endpoint path
        method: HTTP method
        request_id: Unique request identifier
        user_agent: Client user agent string
        extra: Additional context data
    """
    logger.info(
        f"Request received: {method} {endpoint}",
        extra={
            "endpoint": endpoint,
            "method": method,
            "request_id": request_id,
            "user_agent": user_agent,
            "event_type": "request_received",
            **(extra or {})
        }
    )


def log_response(
    endpoint: str,
    method: str = "POST",
    status_code: int = 200,
    duration_ms: Optional[float] = None,
    request_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None
) -> None:
    """
    Log response information.
    
    Args:
        endpoint: API endpoint path
        method: HTTP method
        status_code: HTTP response status code
        duration_ms: Request duration in milliseconds
        request_id: Unique request identifier
        extra: Additional context data
    """
    logger.info(
        f"Response sent: {method} {endpoint} - {status_code}",
        extra={
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "request_id": request_id,
            "event_type": "response_sent",
            **(extra or {})
        }
    )


def log_error(
    message: str,
    error: Optional[Exception] = None,
    endpoint: Optional[str] = None,
    method: Optional[str] = None,
    request_id: Optional[str] = None,
    error_code: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None
) -> None:
    """
    Log error information.
    
    Args:
        message: Error message
        error: Exception instance
        endpoint: API endpoint path
        method: HTTP method
        request_id: Unique request identifier
        error_code: Standardized error code
        extra: Additional context data
    """
    logger.error(
        message,
        exc_info=error,
        extra={
            "endpoint": endpoint,
            "method": method,
            "request_id": request_id,
            "error_code": error_code,
            "event_type": "error_occurred",
            **(extra or {})
        }
    )


@contextmanager
def log_execution_time(
    operation: str,
    request_id: Optional[str] = None,
    extra: Optional[Dict[str, Any]] = None
):
    """
    Context manager to log execution time of operations.
    
    Args:
        operation: Name of the operation being timed
        request_id: Unique request identifier
        extra: Additional context data
        
    Yields:
        Dict with timing information
    """
    start_time = time.time()
    timing_info = {"start_time": start_time}
    
    logger.debug(
        f"Starting operation: {operation}",
        extra={
            "operation": operation,
            "request_id": request_id,
            "event_type": "operation_start",
            **(extra or {})
        }
    )
    
    try:
        yield timing_info
        
        end_time = time.time()
        duration_ms = (end_time - start_time) * 1000
        timing_info["end_time"] = end_time
        timing_info["duration_ms"] = duration_ms
        
        logger.info(
            f"Operation completed: {operation} ({duration_ms:.2f}ms)",
            extra={
                "operation": operation,
                "request_id": request_id,
                "duration_ms": duration_ms,
                "event_type": "operation_complete",
                **(extra or {})
            }
        )
        
    except Exception as e:
        end_time = time.time()
        duration_ms = (end_time - start_time) * 1000
        timing_info["end_time"] = end_time
        timing_info["duration_ms"] = duration_ms
        timing_info["error"] = str(e)
        
        logger.error(
            f"Operation failed: {operation} ({duration_ms:.2f}ms)",
            exc_info=e,
            extra={
                "operation": operation,
                "request_id": request_id,
                "duration_ms": duration_ms,
                "event_type": "operation_failed",
                **(extra or {})
            }
        )
        raise


def log_dspy_call(
    module_name: str,
    input_data: Dict[str, Any],
    output_data: Optional[Dict[str, Any]] = None,
    duration_ms: Optional[float] = None,
    request_id: Optional[str] = None,
    error: Optional[Exception] = None
) -> None:
    """
    Log DSPy module calls for debugging and monitoring.
    
    Args:
        module_name: Name of the DSPy module
        input_data: Input data (sanitized)
        output_data: Output data (sanitized)
        duration_ms: Call duration in milliseconds
        request_id: Unique request identifier
        error: Exception if call failed
    """
    if error:
        logger.error(
            f"DSPy call failed: {module_name}",
            exc_info=error,
            extra={
                "module_name": module_name,
                "request_id": request_id,
                "duration_ms": duration_ms,
                "event_type": "dspy_call_failed",
                "input_data": input_data
            }
        )
    else:
        logger.info(
            f"DSPy call completed: {module_name}",
            extra={
                "module_name": module_name,
                "request_id": request_id,
                "duration_ms": duration_ms,
                "event_type": "dspy_call_complete",
                "input_data": input_data,
                "output_data": output_data
            }
        )