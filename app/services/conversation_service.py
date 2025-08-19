"""
Conversation service for handling natural language interactions and discovery conversations.
Provides conversational AI capabilities to complement the search-based interface.
"""

import json
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

from ..core.constants import (
    CONVERSATION_TEMPERATURE,
    DISCOVERY_TEMPERATURE,
    DEFAULT_CHAT_MODEL,
    MAX_CONVERSATION_HISTORY,
    MAX_FOLLOW_UP_QUESTIONS,
    INTENT_CONFIDENCE_THRESHOLD
)
from ..core.llm_wrapper import get_llm
from ..core.prompts import (
    get_discovery_prompt,
    get_jtbd_expert_prompt,
    get_synthesis_prompt,
    get_intent_detection_prompt,
    get_follow_up_prompt,
    format_search_context
)

logger = logging.getLogger(__name__)

class MessageIntent:
    """Represents the detected intent of a user message."""
    
    def __init__(self, intent_type: str, confidence: float, needs_search: bool, topics: Optional[List[str]] = None):
        self.intent_type = intent_type  # QUESTION, SEARCH, EXPLORATION, ACTION
        self.confidence = confidence
        self.needs_search = needs_search
        self.topics = topics or []
    
    @property
    def is_question(self) -> bool:
        return self.intent_type == "QUESTION"
    
    @property
    def is_search(self) -> bool:
        return self.intent_type == "SEARCH"
    
    @property
    def is_exploration(self) -> bool:
        return self.intent_type == "EXPLORATION"
    
    @property
    def is_action(self) -> bool:
        return self.intent_type == "ACTION"
    
    @property
    def is_high_confidence(self) -> bool:
        return self.confidence >= INTENT_CONFIDENCE_THRESHOLD


class ConversationService:
    """Service for handling conversational AI interactions and intent detection."""
    
    def __init__(self, llm_wrapper: Optional[Any] = None) -> None:
        """Initialize conversation service with LLM wrapper."""
        self.llm = llm_wrapper or get_llm()
        if not self.llm:
            raise ValueError("LLM wrapper is required for ConversationService")
    
    def analyze_intent(self, message: str) -> MessageIntent:
        """
        Analyze user message to determine intent and processing approach.
        
        Args:
            message: User's message text
            
        Returns:
            MessageIntent object with classification and metadata
        """
        try:
            if not message or not message.strip():
                return MessageIntent("ACTION", 1.0, False)
            
            # Generate intent detection prompt
            intent_messages = get_intent_detection_prompt(message.strip())
            
            # Get AI analysis
            result = self.llm.generate_chat_completion(
                messages=intent_messages,
                model=DEFAULT_CHAT_MODEL,
                template_key="intent_detection",
                temperature=0.3  # Lower temperature for consistent classification
            )
            
            if not result.get("success"):
                logger.warning(f"Intent detection failed: {result.get('error')}")
                return self._fallback_intent_detection(message)
            
            # Parse AI response to extract intent information
            ai_response = result["content"]
            parsed_intent = self._parse_intent_response(ai_response, message)
            
            logger.info(f"Intent detected: {parsed_intent.intent_type} (confidence: {parsed_intent.confidence:.2f})")
            return parsed_intent
            
        except Exception as e:
            logger.error(f"Intent analysis failed: {e}")
            return self._fallback_intent_detection(message)
    
    def generate_conversational_response(
        self, 
        message: str, 
        intent: MessageIntent,
        search_results: Optional[Dict[str, List[Dict[str, Any]]]] = None,
        conversation_history: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Generate a conversational AI response based on intent and context.
        
        Args:
            message: User's message
            intent: Detected message intent
            search_results: Optional search results to include as context
            conversation_history: Previous conversation messages
            
        Returns:
            Dict with response content and metadata
        """
        try:
            # Choose response approach based on intent
            if intent.is_exploration or intent.is_question:
                return self._generate_discovery_response(message, intent, search_results, conversation_history)
            elif intent.is_search:
                return self._generate_search_guided_response(message, search_results)
            else:
                return self._generate_general_response(message, conversation_history)
                
        except Exception as e:
            logger.error(f"Failed to generate conversational response: {e}")
            return {
                "success": False,
                "error": f"Failed to generate response: {str(e)}"
            }
    
    def _generate_discovery_response(
        self,
        message: str,
        intent: MessageIntent,
        search_results: Optional[Dict[str, List[Dict[str, Any]]]],
        conversation_history: Optional[List[Dict[str, str]]]
    ) -> Dict[str, Any]:
        """Generate response focused on discovery and exploration."""
        try:
            # Format search context if available
            context = None
            if search_results:
                context = format_search_context(search_results)
            
            # Choose prompt approach
            if intent.is_exploration:
                messages = get_discovery_prompt(message, context)
                temperature = DISCOVERY_TEMPERATURE
            else:
                messages = get_jtbd_expert_prompt(message, context, conversation_history)
                temperature = CONVERSATION_TEMPERATURE
            
            # Generate response
            result = self.llm.generate_chat_completion(
                messages=messages,
                model=DEFAULT_CHAT_MODEL,
                template_key="conversation",
                temperature=temperature
            )
            
            if not result.get("success"):
                return result
            
            response_content = result["content"]
            
            # Generate follow-up questions
            follow_ups = self._generate_follow_up_questions(message, response_content)
            
            return {
                "success": True,
                "content": response_content,
                "response_type": "conversational",
                "intent_type": intent.intent_type,
                "follow_up_questions": follow_ups,
                "has_context": bool(context),
                "tokens_used": result.get("tokens_used"),
                "model": result.get("model")
            }
            
        except Exception as e:
            logger.error(f"Discovery response generation failed: {e}")
            return {
                "success": False,
                "error": f"Failed to generate discovery response: {str(e)}"
            }
    
    def _generate_search_guided_response(
        self,
        message: str,
        search_results: Optional[Dict[str, List[Dict[str, Any]]]]
    ) -> Dict[str, Any]:
        """Generate response that guides the user based on search results."""
        try:
            if not search_results:
                # No search results available, provide guidance
                guidance_prompt = f"""The user is looking for: "{message}"

Since no specific search results are available, provide helpful guidance on:
1. What types of information they might be looking for
2. Suggestions for refining their search
3. Related areas they might want to explore
4. How this relates to JTBD research

Be helpful and specific while encouraging continued exploration."""
                
                messages = [
                    {"role": "system", "content": "You are a helpful JTBD research assistant providing search guidance."},
                    {"role": "user", "content": guidance_prompt}
                ]
            else:
                # Synthesize search results into helpful response
                context = format_search_context(search_results)
                synthesis_messages = get_synthesis_prompt([context], message)
                messages = synthesis_messages
            
            result = self.llm.generate_chat_completion(
                messages=messages,
                model=DEFAULT_CHAT_MODEL,
                template_key="search_guidance",
                temperature=CONVERSATION_TEMPERATURE
            )
            
            if not result.get("success"):
                return result
            
            return {
                "success": True,
                "content": result["content"],
                "response_type": "search_guided",
                "intent_type": "SEARCH",
                "has_context": bool(search_results),
                "tokens_used": result.get("tokens_used"),
                "model": result.get("model")
            }
            
        except Exception as e:
            logger.error(f"Search-guided response generation failed: {e}")
            return {
                "success": False,
                "error": f"Failed to generate search-guided response: {str(e)}"
            }
    
    def _generate_general_response(
        self,
        message: str,
        conversation_history: Optional[List[Dict[str, str]]]
    ) -> Dict[str, Any]:
        """Generate a general conversational response."""
        try:
            messages = get_jtbd_expert_prompt(message, None, conversation_history)
            
            result = self.llm.generate_chat_completion(
                messages=messages,
                model=DEFAULT_CHAT_MODEL,
                template_key="general_conversation",
                temperature=CONVERSATION_TEMPERATURE
            )
            
            if not result.get("success"):
                return result
            
            return {
                "success": True,
                "content": result["content"],
                "response_type": "general",
                "intent_type": "QUESTION",
                "tokens_used": result.get("tokens_used"),
                "model": result.get("model")
            }
            
        except Exception as e:
            logger.error(f"General response generation failed: {e}")
            return {
                "success": False,
                "error": f"Failed to generate general response: {str(e)}"
            }
    
    def _generate_follow_up_questions(self, user_message: str, assistant_response: str) -> List[str]:
        """Generate relevant follow-up questions."""
        try:
            follow_up_messages = get_follow_up_prompt(user_message, assistant_response)
            
            result = self.llm.generate_chat_completion(
                messages=follow_up_messages,
                model=DEFAULT_CHAT_MODEL,
                template_key="follow_up_questions",
                temperature=0.8
            )
            
            if not result.get("success"):
                logger.warning("Failed to generate follow-up questions")
                return []
            
            # Parse response to extract questions
            questions = self._parse_follow_up_questions(result["content"])
            return questions[:MAX_FOLLOW_UP_QUESTIONS]
            
        except Exception as e:
            logger.error(f"Follow-up question generation failed: {e}")
            return []
    
    def _parse_intent_response(self, ai_response: str, original_message: str) -> MessageIntent:
        """Parse AI response to extract structured intent information."""
        try:
            # Simple parsing approach - look for key indicators in response
            response_lower = ai_response.lower()
            
            # Determine intent type
            if "exploration" in response_lower or "brainstorm" in response_lower or "discover" in response_lower:
                intent_type = "EXPLORATION"
            elif "search" in response_lower or "find" in response_lower or "look up" in response_lower:
                intent_type = "SEARCH"
            elif "question" in response_lower or "asking" in response_lower or "explain" in response_lower:
                intent_type = "QUESTION"
            else:
                intent_type = "ACTION"
            
            # Determine if search is needed
            needs_search = ("context" in response_lower and "needed" in response_lower) or \
                          ("search" in response_lower and "helpful" in response_lower)
            
            # Simple confidence calculation
            confidence = 0.8 if any(keyword in response_lower for keyword in [intent_type.lower(), "confident", "clearly"]) else 0.6
            
            # Extract topics (simple keyword extraction)
            topics = []
            for word in original_message.split():
                if len(word) > 4 and word.lower() not in ['that', 'this', 'with', 'from', 'they', 'have', 'been', 'their']:
                    topics.append(word.lower().strip('.,!?;:'))
            
            return MessageIntent(intent_type, confidence, needs_search, topics[:5])
            
        except Exception as e:
            logger.warning(f"Failed to parse intent response: {e}")
            return self._fallback_intent_detection(original_message)
    
    def _parse_follow_up_questions(self, ai_response: str) -> List[str]:
        """Extract follow-up questions from AI response."""
        questions = []
        
        try:
            # Split by lines and look for question patterns
            lines = ai_response.strip().split('\n')
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # Remove list markers
                line = line.lstrip('- •123456789. ')
                
                # Check if line looks like a question
                if line.endswith('?') and len(line) > 10:
                    questions.append(line)
                elif '?' in line and len(line.split('?')[0]) > 10:
                    # Extract question part if there's text after the question mark
                    question_part = line.split('?')[0] + '?'
                    questions.append(question_part)
            
            return questions
            
        except Exception as e:
            logger.warning(f"Failed to parse follow-up questions: {e}")
            return []
    
    def _fallback_intent_detection(self, message: str) -> MessageIntent:
        """Fallback intent detection using simple heuristics."""
        message_lower = message.lower().strip()
        
        # Question indicators
        question_words = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'could', 'would', 'should']
        exploration_words = ['explore', 'brainstorm', 'think about', 'discover', 'understand better']
        search_words = ['find', 'search', 'look for', 'show me', 'get me']
        
        if message_lower.endswith('?') or any(word in message_lower for word in question_words):
            intent_type = "QUESTION"
        elif any(word in message_lower for word in exploration_words):
            intent_type = "EXPLORATION"
        elif any(word in message_lower for word in search_words):
            intent_type = "SEARCH"
        else:
            intent_type = "QUESTION"  # Default to question for conversational approach
        
        # Assume search is helpful for questions and exploration
        needs_search = intent_type in ["QUESTION", "EXPLORATION"]
        
        return MessageIntent(intent_type, 0.6, needs_search)


# Global service instance
_conversation_service = None

def get_conversation_service() -> Optional[ConversationService]:
    """Get the global conversation service instance."""
    global _conversation_service
    return _conversation_service

def initialize_conversation_service(llm_wrapper: Optional[Any] = None) -> ConversationService:
    """Initialize and return the global conversation service."""
    global _conversation_service
    
    try:
        _conversation_service = ConversationService(llm_wrapper)
        logger.info("ConversationService initialized successfully")
        return _conversation_service
        
    except Exception as e:
        logger.error(f"Failed to initialize ConversationService: {e}")
        raise