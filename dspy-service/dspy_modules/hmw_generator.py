"""
HMW Generator module using DSPy for generating How Might We questions.

This module will be implemented in Task 6.2. For now, it provides the
basic structure and interface that will be used by the FastAPI endpoints.
"""

import dspy
import asyncio
from typing import List, Dict, Any, Optional
from .signatures import HMWGenerationSignature, ContextSummarySignature
from models.requests import GenerateHMWRequest
from models.responses import HMWResult, SourceReferences
from config import config


class HMWGenerator(dspy.Module):
    """DSPy module for generating How Might We questions."""
    
    def __init__(self):
        super().__init__()
        # Initialize DSPy predictors
        self.context_summarizer = dspy.ChainOfThought(ContextSummarySignature)
        self.hmw_generator = dspy.ChainOfThought(HMWGenerationSignature)
    
    def forward(
        self, 
        insights: List[str], 
        metrics: List[str], 
        jtbds: List[str], 
        count: int = 5
    ) -> Dict[str, Any]:
        """
        Generate HMW questions (synchronous version).
        
        Args:
            insights: List of insight strings
            metrics: List of metric descriptions
            jtbds: List of JTBD statements
            count: Number of HMWs to generate
            
        Returns:
            Dictionary with generated HMWs and metadata
        """
        # This is a stub implementation for Task 6.1
        # Full implementation will be added in Task 6.2
        
        return {
            "hmw_questions": [
                f"How might we improve user experience based on insight {i+1}?"
                for i in range(min(count, len(insights) or 1))
            ],
            "relevance_scores": [7.5] * min(count, len(insights) or 1),
            "reasoning": "Stub implementation - full DSPy generation in Task 6.2"
        }
    
    async def aforward(
        self,
        insights: List[str],
        metrics: List[str], 
        jtbds: List[str],
        count: int = 5
    ) -> Dict[str, Any]:
        """
        Generate HMW questions (asynchronous version).
        
        Args:
            insights: List of insight strings
            metrics: List of metric descriptions  
            jtbds: List of JTBD statements
            count: Number of HMWs to generate
            
        Returns:
            Dictionary with generated HMWs and metadata
        """
        # For now, run synchronous version in thread pool
        # Task 6.2 will implement proper async DSPy calls
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, 
            self.forward, 
            insights, 
            metrics, 
            jtbds, 
            count
        )


def format_context_for_generation(request: GenerateHMWRequest) -> Dict[str, List[str]]:
    """
    Format request context into lists for DSPy processing.
    
    Args:
        request: The HMW generation request
        
    Returns:
        Dictionary with formatted context lists
    """
    context = request.context
    
    # Extract insights
    insights = []
    for item in context.get('insights', []):
        if isinstance(item, dict) and 'content' in item:
            insights.append(item['content'])
        elif isinstance(item, str):
            insights.append(item)
    
    # Extract metrics  
    metrics = []
    for item in context.get('metrics', []):
        if isinstance(item, dict):
            name = item.get('name', 'Unknown Metric')
            desc = item.get('description', '')
            unit = item.get('unit', '')
            metric_str = f"{name} ({unit})"
            if desc:
                metric_str += f": {desc}"
            metrics.append(metric_str)
        elif isinstance(item, str):
            metrics.append(item)
    
    # Extract JTBDs
    jtbds = []
    for item in context.get('jtbds', []):
        if isinstance(item, dict) and 'statement' in item:
            statement = item['statement']
            context_info = item.get('context', '')
            jtbd_str = statement
            if context_info:
                jtbd_str += f" (Context: {context_info})"
            jtbds.append(jtbd_str)
        elif isinstance(item, str):
            jtbds.append(item)
    
    return {
        'insights': insights,
        'metrics': metrics,
        'jtbds': jtbds
    }


def format_generation_results(
    raw_results: Dict[str, Any],
    request: GenerateHMWRequest
) -> List[HMWResult]:
    """
    Format raw DSPy results into HMWResult objects.
    
    Args:
        raw_results: Raw results from DSPy generation
        request: Original request for context tracking
        
    Returns:
        List of formatted HMWResult objects
    """
    questions = raw_results.get('hmw_questions', [])
    scores = raw_results.get('relevance_scores', [])
    
    results = []
    for i, question in enumerate(questions):
        # Ensure proper HMW format
        if not question.lower().strip().startswith('how might we'):
            question = f"How might we {question.lower().lstrip('how might we').strip()}?"
        
        # Get score or default
        score = scores[i] if i < len(scores) else 5.0
        score = max(0.0, min(10.0, float(score)))  # Clamp to valid range
        
        # Create source references (simplified for stub)
        source_refs = SourceReferences(
            insight_ids=[item.get('id', f'insight_{j}') 
                        for j, item in enumerate(request.context.get('insights', []))],
            metric_ids=[item.get('id', f'metric_{j}') 
                       for j, item in enumerate(request.context.get('metrics', []))],
            jtbd_ids=[item.get('id', f'jtbd_{j}') 
                     for j, item in enumerate(request.context.get('jtbds', []))]
        )
        
        results.append(HMWResult(
            question=question,
            score=score,
            source_references=source_refs,
            confidence=0.8  # Stub confidence
        ))
    
    return results