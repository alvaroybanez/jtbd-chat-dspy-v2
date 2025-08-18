"""
Solution Generator module using DSPy for creating prioritized solutions.

This module will be implemented in Task 6.3. For now, it provides the
basic structure and interface that will be used by the FastAPI endpoints.
"""

import dspy
import asyncio
from typing import List, Dict, Any, Optional
from .signatures import SolutionGenerationSignature, ContextSummarySignature
from models.requests import CreateSolutionsRequest
from models.responses import SolutionResult, SourceReferences
from config import config
from utils.logger import logger


class SolutionGenerator(dspy.Module):
    """DSPy module for generating prioritized solutions."""
    
    def __init__(self):
        super().__init__()
        # Initialize DSPy predictors following two-step pattern
        self.context_summarizer = dspy.ChainOfThought(ContextSummarySignature)
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
        try:
            # Step 1: Summarize context for better generation
            summary_result = self.context_summarizer(
                insights=context_insights,
                metrics=available_metrics,
                jtbds=context_jtbds
            )
            
            # Step 2: Generate solutions with context summary
            solution_result = self.solution_generator(
                hmw_questions=hmw_questions,
                available_metrics=available_metrics,
                context_insights=context_insights,
                context_jtbds=context_jtbds,
                count=count
            )
            
            # Step 3: Process and score solutions
            return self._process_and_score_solutions(
                solution_result, 
                hmw_questions,
                available_metrics, 
                context_insights, 
                context_jtbds
            )
            
        except Exception as e:
            logger.error(f"DSPy solution generation failed: {e}")
            # Return fallback results
            return self._create_fallback_solutions(
                hmw_questions, available_metrics, context_insights, context_jtbds, count
            )
    
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
        try:
            # Step 1: Summarize context asynchronously
            summary_result = await self.context_summarizer.acall(
                insights=context_insights,
                metrics=available_metrics,
                jtbds=context_jtbds
            )
            
            # Step 2: Generate solutions with context summary asynchronously
            solution_result = await self.solution_generator.acall(
                hmw_questions=hmw_questions,
                available_metrics=available_metrics,
                context_insights=context_insights,
                context_jtbds=context_jtbds,
                count=count
            )
            
            # Step 3: Process and score solutions
            return self._process_and_score_solutions(
                solution_result,
                hmw_questions,
                available_metrics,
                context_insights, 
                context_jtbds
            )
            
        except Exception as e:
            logger.error(f"DSPy async solution generation failed: {e}")
            # Return fallback results
            return self._create_fallback_solutions(
                hmw_questions, available_metrics, context_insights, context_jtbds, count
            )
    
    def _process_and_score_solutions(
        self,
        solution_result: Any,
        hmw_questions: List[str],
        available_metrics: List[str],
        context_insights: List[str],
        context_jtbds: List[str]
    ) -> Dict[str, Any]:
        """
        Process and score DSPy solution results with intelligent metric assignment.
        
        Args:
            solution_result: Raw DSPy generation result
            hmw_questions: Original HMW questions
            available_metrics: Available metrics for assignment
            context_insights: Original insights for context
            context_jtbds: Original JTBDs for context
            
        Returns:
            Dictionary with processed solutions and metadata
        """
        titles = getattr(solution_result, 'solution_titles', [])
        descriptions = getattr(solution_result, 'solution_descriptions', [])
        impact_scores = getattr(solution_result, 'impact_scores', [])
        effort_scores = getattr(solution_result, 'effort_scores', [])
        metric_indices = getattr(solution_result, 'assigned_metric_indices', [])
        reasoning = getattr(solution_result, 'reasoning', 'Generated using DSPy ChainOfThought')
        
        # Ensure we have data for processing
        if not titles and hmw_questions:
            # Generate from HMW questions if DSPy didn't provide titles
            titles = [f"Solution for: {hmw[:50]}..." for hmw in hmw_questions[:5]]
        elif not titles:
            titles = [f"Solution {i+1}" for i in range(5)]
        
        # Process each solution
        processed_titles = []
        processed_descriptions = []
        processed_impact_scores = []
        processed_effort_scores = []
        processed_metric_indices = []
        
        for i in range(len(titles)):
            # Get or generate title
            title = titles[i] if i < len(titles) else f"Solution {i+1}"
            processed_titles.append(title)
            
            # Get or generate description
            if i < len(descriptions) and descriptions[i]:
                desc = descriptions[i]
            elif i < len(hmw_questions):
                desc = f"A comprehensive solution addressing: {hmw_questions[i]}"
            else:
                desc = f"Strategic solution based on available insights and context"
            processed_descriptions.append(desc)
            
            # Get or calculate impact score (1-10)
            impact = impact_scores[i] if i < len(impact_scores) else 5
            impact = max(1, min(10, int(impact))) if isinstance(impact, (int, float)) else 7
            processed_impact_scores.append(impact)
            
            # Get or calculate effort score (1-10)
            effort = effort_scores[i] if i < len(effort_scores) else 5
            effort = max(1, min(10, int(effort))) if isinstance(effort, (int, float)) else 5
            processed_effort_scores.append(effort)
            
            # Process metric assignment with intelligence
            assigned_indices = self._assign_metrics_intelligently(
                title + " " + desc,
                available_metrics,
                metric_indices[i] if i < len(metric_indices) else []
            )
            processed_metric_indices.append(assigned_indices)
        
        return {
            "solution_titles": processed_titles,
            "solution_descriptions": processed_descriptions,
            "impact_scores": processed_impact_scores,
            "effort_scores": processed_effort_scores,
            "assigned_metric_indices": processed_metric_indices,
            "reasoning": reasoning
        }
    
    def _assign_metrics_intelligently(
        self,
        solution_text: str,
        available_metrics: List[str],
        dspy_indices: List[int]
    ) -> List[int]:
        """
        Intelligently assign metrics to a solution based on relevance.
        
        Args:
            solution_text: Combined title and description
            available_metrics: List of available metrics
            dspy_indices: Indices suggested by DSPy
            
        Returns:
            List of metric indices (at least 1)
        """
        if not available_metrics:
            return [0]  # Fallback to first metric if none available
        
        # If DSPy provided valid indices, use them
        valid_indices = [idx for idx in dspy_indices if 0 <= idx < len(available_metrics)]
        if valid_indices:
            return valid_indices
        
        # Calculate relevance scores for each metric
        relevance_scores = []
        solution_lower = solution_text.lower()
        
        for i, metric in enumerate(available_metrics):
            score = 0.0
            metric_lower = metric.lower()
            
            # Keyword matching
            metric_words = metric_lower.split()
            for word in metric_words:
                if len(word) > 3 and word in solution_lower:
                    score += 1.0
            
            # Bonus for common metric terms
            metric_terms = {
                'engagement': 0.8, 'conversion': 0.9, 'revenue': 0.9,
                'satisfaction': 0.7, 'retention': 0.8, 'growth': 0.9,
                'efficiency': 0.7, 'performance': 0.7, 'quality': 0.6,
                'cost': 0.8, 'time': 0.6, 'usage': 0.7
            }
            
            for term, weight in metric_terms.items():
                if term in metric_lower and term in solution_lower:
                    score += weight
            
            relevance_scores.append((i, score))
        
        # Sort by relevance and return top metric(s)
        relevance_scores.sort(key=lambda x: x[1], reverse=True)
        
        # Return the most relevant metric, minimum 1
        return [relevance_scores[0][0]]
    
    def _create_fallback_solutions(
        self,
        hmw_questions: List[str],
        available_metrics: List[str],
        context_insights: List[str],
        context_jtbds: List[str],
        count: int
    ) -> Dict[str, Any]:
        """
        Create fallback solutions when DSPy generation fails.
        
        Args:
            hmw_questions: HMW questions to base solutions on
            available_metrics: Available metrics
            context_insights: Available insights
            context_jtbds: Available JTBDs
            count: Number of solutions to generate
            
        Returns:
            Dictionary with fallback solutions
        """
        titles = []
        descriptions = []
        impact_scores = []
        effort_scores = []
        metric_indices = []
        
        # Generate solutions based on available context
        for i in range(count):
            if i < len(hmw_questions):
                # Base on HMW question
                hmw = hmw_questions[i]
                title = f"Solution for: {hmw[12:62]}..."  # Remove "How might we " prefix
                desc = f"A strategic approach to address the challenge: {hmw}"
            elif context_insights:
                # Base on insights
                insight_idx = i % len(context_insights)
                insight = context_insights[insight_idx]
                title = f"Insight-driven Solution {i+1}"
                desc = f"Leveraging the insight: '{insight[:100]}...' to create value"
            elif context_jtbds:
                # Base on JTBDs
                jtbd_idx = i % len(context_jtbds)
                jtbd = context_jtbds[jtbd_idx]
                title = f"JTBD-focused Solution {i+1}"
                desc = f"Addressing the job-to-be-done: '{jtbd[:100]}...'"
            else:
                # Generic fallback
                title = f"Strategic Solution {i+1}"
                desc = f"A comprehensive solution addressing identified opportunities and challenges"
            
            titles.append(title)
            descriptions.append(desc)
            
            # Default scores with some variation
            impact_scores.append(7 if i % 2 == 0 else 6)
            effort_scores.append(5 if i % 3 == 0 else 4)
            
            # Assign first metric or distribute evenly
            if available_metrics:
                assigned_metric = [i % len(available_metrics)]
            else:
                assigned_metric = [0]
            metric_indices.append(assigned_metric)
        
        return {
            "solution_titles": titles,
            "solution_descriptions": descriptions,
            "impact_scores": impact_scores,
            "effort_scores": effort_scores,
            "assigned_metric_indices": metric_indices,
            "reasoning": "Generated using fallback logic due to DSPy generation failure"
        }


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