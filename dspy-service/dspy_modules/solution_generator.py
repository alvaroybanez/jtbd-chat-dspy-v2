"""
Solution Generator module using DSPy for creating prioritized solutions.

This module will be implemented in Task 6.3. For now, it provides the
basic structure and interface that will be used by the FastAPI endpoints.
"""

import dspy
import asyncio
from typing import List, Dict, Any, Optional
from .signatures import SolutionGenerationSignature
from models.requests import CreateSolutionsRequest
from models.responses import SolutionResult, SourceReferences
from config import config


class SolutionGenerator(dspy.Module):
    """DSPy module for generating prioritized solutions."""
    
    def __init__(self):
        super().__init__()
        # Initialize DSPy predictors
        self.solution_generator = dspy.ChainOfThought(SolutionGenerationSignature)
    
    def forward(
        self,
        hmw_questions: List[str],
        available_metrics: List[str],
        context_insights: List[str],
        context_jtbds: List[str],
        count: int = 5
    ) -> Dict[str, Any]:
        """
        Generate solutions (synchronous version).
        
        Args:
            hmw_questions: List of HMW questions to solve
            available_metrics: List of available metrics for assignment
            context_insights: Supporting insights
            context_jtbds: Related JTBDs
            count: Number of solutions to generate
            
        Returns:
            Dictionary with generated solutions and metadata
        """
        # This is a stub implementation for Task 6.1
        # Full implementation will be added in Task 6.3
        
        solutions = []
        for i in range(min(count, len(hmw_questions) or 1)):
            hmw = hmw_questions[i] if i < len(hmw_questions) else "How might we improve?"
            solutions.append({
                "title": f"Solution for HMW {i+1}",
                "description": f"Detailed solution addressing: {hmw[:100]}...",
                "impact_score": 7,
                "effort_score": 5,
                "assigned_metric_indices": [0] if available_metrics else []
            })
        
        return {
            "solution_titles": [s["title"] for s in solutions],
            "solution_descriptions": [s["description"] for s in solutions],
            "impact_scores": [s["impact_score"] for s in solutions],
            "effort_scores": [s["effort_score"] for s in solutions],
            "assigned_metric_indices": [s["assigned_metric_indices"] for s in solutions],
            "reasoning": "Stub implementation - full DSPy generation in Task 6.3"
        }
    
    async def aforward(
        self,
        hmw_questions: List[str],
        available_metrics: List[str], 
        context_insights: List[str],
        context_jtbds: List[str],
        count: int = 5
    ) -> Dict[str, Any]:
        """
        Generate solutions (asynchronous version).
        
        Args:
            hmw_questions: List of HMW questions to solve
            available_metrics: List of available metrics for assignment
            context_insights: Supporting insights
            context_jtbds: Related JTBDs  
            count: Number of solutions to generate
            
        Returns:
            Dictionary with generated solutions and metadata
        """
        # For now, run synchronous version in thread pool
        # Task 6.3 will implement proper async DSPy calls
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self.forward,
            hmw_questions,
            available_metrics, 
            context_insights,
            context_jtbds,
            count
        )


def format_context_for_solution_generation(request: CreateSolutionsRequest) -> Dict[str, Any]:
    """
    Format request context for solution generation.
    
    Args:
        request: The solution creation request
        
    Returns:
        Dictionary with formatted context
    """
    context = request.context
    
    # Extract HMW questions
    hmw_questions = [hmw.question for hmw in request.hmws]
    
    # Extract metrics
    available_metrics = []
    metric_ids = []
    for item in context.get('metrics', []):
        if isinstance(item, dict):
            name = item.get('name', 'Unknown Metric')
            desc = item.get('description', '')
            metric_str = f"{name}"
            if desc:
                metric_str += f": {desc}"
            available_metrics.append(metric_str)
            metric_ids.append(item.get('id', f'metric_{len(metric_ids)}'))
        elif isinstance(item, str):
            available_metrics.append(item)
            metric_ids.append(f'metric_{len(metric_ids)}')
    
    # Extract insights
    context_insights = []
    for item in context.get('insights', []):
        if isinstance(item, dict) and 'content' in item:
            context_insights.append(item['content'])
        elif isinstance(item, str):
            context_insights.append(item)
    
    # Extract JTBDs
    context_jtbds = []
    for item in context.get('jtbds', []):
        if isinstance(item, dict) and 'statement' in item:
            context_jtbds.append(item['statement'])
        elif isinstance(item, str):
            context_jtbds.append(item)
    
    return {
        'hmw_questions': hmw_questions,
        'available_metrics': available_metrics,
        'metric_ids': metric_ids,
        'context_insights': context_insights,
        'context_jtbds': context_jtbds
    }


def format_solution_results(
    raw_results: Dict[str, Any],
    request: CreateSolutionsRequest,
    metric_ids: List[str]
) -> List[SolutionResult]:
    """
    Format raw DSPy results into SolutionResult objects.
    
    Args:
        raw_results: Raw results from DSPy generation
        request: Original request for context tracking
        metric_ids: List of available metric IDs
        
    Returns:
        List of formatted SolutionResult objects
    """
    titles = raw_results.get('solution_titles', [])
    descriptions = raw_results.get('solution_descriptions', [])
    impact_scores = raw_results.get('impact_scores', [])
    effort_scores = raw_results.get('effort_scores', [])
    metric_indices = raw_results.get('assigned_metric_indices', [])
    
    results = []
    for i in range(len(titles)):
        title = titles[i] if i < len(titles) else f"Solution {i+1}"
        description = descriptions[i] if i < len(descriptions) else "Solution description"
        impact = impact_scores[i] if i < len(impact_scores) else 5
        effort = effort_scores[i] if i < len(effort_scores) else 5
        
        # Convert metric indices to IDs
        indices = metric_indices[i] if i < len(metric_indices) else [0]
        assigned_metrics = []
        for idx in indices:
            if 0 <= idx < len(metric_ids):
                assigned_metrics.append(metric_ids[idx])
        
        # Ensure at least one metric is assigned (fallback)
        if not assigned_metrics and metric_ids:
            assigned_metrics = [metric_ids[0]]
        elif not assigned_metrics:
            assigned_metrics = ["default-metric-id"]  # Fallback for no metrics case
        
        # Create source references
        source_refs = SourceReferences(
            insight_ids=[item.get('id', f'insight_{j}') 
                        for j, item in enumerate(request.context.get('insights', []))],
            metric_ids=assigned_metrics,
            jtbd_ids=[item.get('id', f'jtbd_{j}') 
                     for j, item in enumerate(request.context.get('jtbds', []))]
        )
        
        results.append(SolutionResult(
            title=title,
            description=description,
            impact_score=max(1, min(10, int(impact))),
            effort_score=max(1, min(10, int(effort))),
            assigned_metrics=assigned_metrics,
            source_references=source_refs,
            confidence=0.8  # Stub confidence
        ))
    
    # Sort by final score (impact/effort ratio) descending
    results.sort(key=lambda x: x.final_score, reverse=True)
    
    return results