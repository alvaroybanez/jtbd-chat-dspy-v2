"""
HMW Generator module using DSPy for generating How Might We questions.

This module will be implemented in Task 6.2. For now, it provides the
basic structure and interface that will be used by the FastAPI endpoints.
"""

import dspy
import asyncio
import re
from typing import List, Dict, Any, Optional
from .signatures import HMWGenerationSignature, ContextSummarySignature
from models.requests import GenerateHMWRequest
from models.responses import HMWResult, SourceReferences
from config import config
from utils.logger import logger


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
        try:
            # Step 1: Summarize context
            summary_result = self.context_summarizer(
                insights=insights,
                metrics=metrics,
                jtbds=jtbds
            )
            
            # Step 2: Generate HMWs with context summary
            hmw_result = self.hmw_generator(
                context_summary=summary_result.summary,
                insights=insights,
                metrics=metrics,
                jtbds=jtbds,
                count=count
            )
            
            # Step 3: Normalize and score
            return self._normalize_and_score_results(hmw_result, insights, metrics, jtbds)
            
        except Exception as e:
            logger.error(f"DSPy HMW generation failed: {e}")
            # Return fallback results
            return self._create_fallback_results(insights, metrics, jtbds, count)
    
    async def aforward(
        self,
        insights: List[str],
        metrics: List[str], 
        jtbds: List[str],
        count: int = 5
    ) -> Dict[str, Any]:
        """
        Generate HMW questions (asynchronous version using DSPy acall()).
        
        Args:
            insights: List of insight strings
            metrics: List of metric descriptions  
            jtbds: List of JTBD statements
            count: Number of HMWs to generate
            
        Returns:
            Dictionary with generated HMWs and metadata
        """
        try:
            # Step 1: Summarize context asynchronously
            summary_result = await self.context_summarizer.acall(
                insights=insights,
                metrics=metrics,
                jtbds=jtbds
            )
            
            # Step 2: Generate HMWs with context summary asynchronously
            hmw_result = await self.hmw_generator.acall(
                context_summary=summary_result.summary,
                insights=insights,
                metrics=metrics,
                jtbds=jtbds,
                count=count
            )
            
            # Step 3: Normalize and score
            return self._normalize_and_score_results(hmw_result, insights, metrics, jtbds)
            
        except Exception as e:
            logger.error(f"DSPy async HMW generation failed: {e}")
            # Return fallback results
            return self._create_fallback_results(insights, metrics, jtbds, count)
    
    def _normalize_and_score_results(
        self, 
        hmw_result: Any, 
        insights: List[str], 
        metrics: List[str], 
        jtbds: List[str]
    ) -> Dict[str, Any]:
        """
        Normalize HMW questions and calculate relevance scores.
        
        Args:
            hmw_result: Raw DSPy generation result
            insights: Original insights for scoring
            metrics: Original metrics for scoring
            jtbds: Original JTBDs for scoring
            
        Returns:
            Dictionary with normalized HMWs and scores
        """
        questions = getattr(hmw_result, 'hmw_questions', [])
        raw_scores = getattr(hmw_result, 'relevance_scores', [])
        reasoning = getattr(hmw_result, 'reasoning', 'Generated using DSPy ChainOfThought')
        
        # Normalize questions
        normalized_questions = []
        for question in questions:
            normalized = self._normalize_hmw_question(question)
            normalized_questions.append(normalized)
        
        # Calculate or validate scores
        scores = []
        for i, question in enumerate(normalized_questions):
            if i < len(raw_scores):
                # Use DSPy-provided score, but clamp to valid range
                score = max(0.0, min(10.0, float(raw_scores[i])))
            else:
                # Calculate score based on context alignment
                score = self._calculate_relevance_score(question, insights, metrics, jtbds)
            scores.append(score)
        
        return {
            "hmw_questions": normalized_questions,
            "relevance_scores": scores,
            "reasoning": reasoning
        }
    
    def _normalize_hmw_question(self, question: str) -> str:
        """
        Normalize HMW question to ensure proper format.
        
        Args:
            question: Raw question string
            
        Returns:
            Normalized question starting with "How might we"
        """
        question = question.strip()
        
        # Check if already starts with "How might we"
        if question.lower().startswith('how might we'):
            # Ensure proper capitalization
            return re.sub(r'^how might we', 'How might we', question, flags=re.IGNORECASE)
        
        # Remove common prefixes and add "How might we"
        prefixes_to_remove = [
            r'^we could\s+',
            r'^we might\s+',
            r'^what if we\s+',
            r'^could we\s+',
            r'^might we\s+'
        ]
        
        for prefix in prefixes_to_remove:
            question = re.sub(prefix, '', question, flags=re.IGNORECASE)
        
        # Add "How might we" prefix
        question = question.lower().strip()
        if not question.endswith('?'):
            question += '?'
            
        return f"How might we {question}"
    
    def _calculate_relevance_score(
        self, 
        question: str, 
        insights: List[str], 
        metrics: List[str], 
        jtbds: List[str]
    ) -> float:
        """
        Calculate relevance score for an HMW question based on context alignment.
        
        Args:
            question: The HMW question
            insights: Original insights
            metrics: Original metrics  
            jtbds: Original JTBDs
            
        Returns:
            Relevance score from 0.0 to 10.0
        """
        score = 5.0  # Base score
        question_lower = question.lower()
        
        # Score based on keyword alignment
        total_context = insights + metrics + jtbds
        keyword_matches = 0
        total_keywords = 0
        
        for context_item in total_context:
            if context_item:
                words = context_item.lower().split()
                total_keywords += len(words)
                for word in words:
                    if len(word) > 3 and word in question_lower:
                        keyword_matches += 1
        
        # Calculate alignment score
        if total_keywords > 0:
            alignment_ratio = keyword_matches / total_keywords
            score += alignment_ratio * 3.0  # Max 3 bonus points for alignment
        
        # Bonus for question quality indicators
        quality_indicators = [
            'improve', 'enhance', 'increase', 'reduce', 'optimize', 
            'solve', 'address', 'help', 'enable', 'support'
        ]
        
        for indicator in quality_indicators:
            if indicator in question_lower:
                score += 0.5
        
        # Ensure score is in valid range
        return max(0.0, min(10.0, score))
    
    def _create_fallback_results(
        self, 
        insights: List[str], 
        metrics: List[str], 
        jtbds: List[str], 
        count: int
    ) -> Dict[str, Any]:
        """
        Create fallback results when DSPy generation fails.
        
        Args:
            insights: Original insights
            metrics: Original metrics
            jtbds: Original JTBDs
            count: Number of HMWs requested
            
        Returns:
            Dictionary with fallback HMWs
        """
        fallback_questions = []
        
        # Generate based on available context
        if insights:
            fallback_questions.append("How might we leverage the key insights to improve our solution?")
        if metrics:
            fallback_questions.append("How might we improve our metrics and measurable outcomes?")
        if jtbds:
            fallback_questions.append("How might we better address the jobs-to-be-done?")
        
        # Add generic questions to reach requested count
        while len(fallback_questions) < count:
            fallback_questions.append(f"How might we explore additional opportunities in area {len(fallback_questions) + 1}?")
        
        # Trim to requested count
        fallback_questions = fallback_questions[:count]
        
        return {
            "hmw_questions": fallback_questions,
            "relevance_scores": [6.0] * len(fallback_questions),  # Moderate fallback scores
            "reasoning": "Generated using fallback logic due to DSPy generation failure"
        }


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