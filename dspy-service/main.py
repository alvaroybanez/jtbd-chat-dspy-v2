from fastapi import FastAPI, HTTPException, Depends, Security
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="JTBD Intelligence Service",
    description="DSPy-powered HMW and solution generation",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Key validation
api_key_header = APIKeyHeader(name="x-api-key", auto_error=False)

async def validate_api_key(api_key: str = Security(api_key_header)):
    if api_key != os.getenv("API_KEY"):
        raise HTTPException(status_code=403, detail="Invalid API key")
    return api_key

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "intelligence"}

# HMW generation endpoint stub
@app.post("/api/intelligence/generate_hmw")
async def generate_hmw(
    request: Dict[str, Any],
    api_key: str = Depends(validate_api_key)
):
    return {
        "hmws": [],
        "meta": {"duration_ms": 0, "retries": 0}
    }

# Solution creation endpoint stub
@app.post("/api/intelligence/create_solutions")
async def create_solutions(
    request: Dict[str, Any],
    api_key: str = Depends(validate_api_key)
):
    return {
        "solutions": [],
        "meta": {"duration_ms": 0, "retries": 0}
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000))
    )