# Conversational Flow and AI System

This document describes the sophisticated conversational AI system that powers the JTBD Assistant Platform's chat interface, enabling natural language interactions for research discovery and insight generation.

## System Overview

The conversational AI system transforms the platform from a linear workflow tool into an interactive discovery platform that guides users through the JTBD research process through natural conversation.

### Key Components

- **Intent Detection**: AI-powered classification of user messages
- **Dynamic Response Generation**: Context-aware response creation
- **Follow-Up Question Generation**: Automatic conversation deepening
- **Context Integration**: Seamless integration of search results with conversation
- **Temperature Control**: Adaptive creativity based on conversation mode

## Intent Detection System

### Message Classification

The system automatically analyzes each user message to determine the most appropriate response approach.

#### Intent Types

**QUESTION Intent**
- **Purpose**: User seeks explanation, information, or guidance
- **Examples**: 
  - "What makes a good JTBD statement?"
  - "How should I interpret these survey results?"
  - "Can you explain the difference between insights and observations?"
- **Response**: Expert guidance using JTBD knowledge and expertise

**SEARCH Intent**
- **Purpose**: User wants to find specific content or data
- **Examples**:
  - "Find insights about mobile payment issues"
  - "Show me JTBDs related to checkout process"
  - "Search for metrics about conversion rates"
- **Response**: Search execution with result synthesis

**EXPLORATION Intent**
- **Purpose**: User wants to brainstorm, discover, or think through topics
- **Examples**:
  - "Let's explore opportunities in the mobile checkout space"
  - "What are some potential solutions for cart abandonment?"
  - "Help me brainstorm around customer pain points"
- **Response**: Discovery-focused conversation with creative exploration

**ACTION Intent**
- **Purpose**: User wants to perform a specific task or command
- **Examples**:
  - "Create a new JTBD for mobile users"
  - "Export these insights to CSV"
  - "Clear my current context"
- **Response**: Task execution with confirmation

### Intent Analysis Process

```python
def analyze_intent_flow(user_message: str):
    """Complete intent analysis workflow"""
    
    # 1. AI-powered intent detection
    ai_analysis = llm.generate_chat_completion(
        messages=get_intent_detection_prompt(user_message),
        temperature=0.3  # Low temperature for consistent classification
    )
    
    # 2. Parse AI response for structured data
    intent = parse_intent_response(ai_analysis, user_message)
    
    # 3. Fallback to heuristic detection if AI fails
    if not intent or intent.confidence < INTENT_CONFIDENCE_THRESHOLD:
        intent = fallback_intent_detection(user_message)
    
    return intent
```

### Confidence Scoring

**High Confidence (≥0.8)**
- Clear keyword matches
- Unambiguous sentence structure
- Strong contextual indicators

**Medium Confidence (0.6-0.79)**
- Some ambiguity in phrasing
- Multiple possible interpretations
- Context-dependent classification

**Low Confidence (<0.6)**
- Ambiguous or unclear message
- Mixed intent signals
- Triggers fallback classification

## Response Generation Modes

### Discovery Mode (EXPLORATION Intent)

**Characteristics:**
- **Temperature**: Higher (DISCOVERY_TEMPERATURE)
- **Approach**: Open-ended, encouraging exploration
- **Focus**: Brainstorming and opportunity identification
- **Follow-ups**: Questions that expand thinking

**Example Flow:**
```
User: "Let's explore opportunities in mobile checkout"

System Analysis:
- Intent: EXPLORATION
- Confidence: 0.88
- Needs Search: True

Response Strategy:
- Use discovery prompts for creative thinking
- Include relevant search context if available
- Generate follow-up questions for deeper exploration
- Encourage multiple perspectives

Generated Follow-ups:
- "What specific friction points do users encounter?"
- "How do current solutions fail to meet user needs?"
- "What would the ideal mobile checkout experience look like?"
```

### Search-Guided Mode (SEARCH Intent)

**Characteristics:**
- **Temperature**: Moderate (CONVERSATION_TEMPERATURE)
- **Approach**: Structured information synthesis
- **Focus**: Finding and presenting relevant content
- **Follow-ups**: Questions about search refinement

**Search Integration Process:**
```python
def search_guided_response_flow(message: str, search_results: Dict):
    """Generate response with search result integration"""
    
    if search_results:
        # Synthesize results into coherent narrative
        context = format_search_context(search_results)
        response = generate_synthesis_response(message, context)
    else:
        # Provide guidance for better search results
        response = generate_search_guidance(message)
    
    return response
```

### Expert Consultation Mode (QUESTION Intent)

**Characteristics:**
- **Temperature**: Balanced (CONVERSATION_TEMPERATURE)
- **Approach**: Knowledgeable, authoritative guidance
- **Focus**: Education and strategic advice
- **Follow-ups**: Questions that deepen understanding

**JTBD Expertise Integration:**
- Leverages expert system prompts
- Draws from JTBD framework knowledge
- Provides practical, actionable advice
- Maintains professional, consultative tone

## Follow-Up Question Generation

### Automatic Question Creation

The system automatically generates relevant follow-up questions to maintain conversation momentum and deepen user exploration.

#### Generation Strategy

**Context Analysis:**
```python
def generate_follow_up_questions(user_message: str, assistant_response: str):
    """Create contextually relevant follow-up questions"""
    
    # Analyze conversation context
    conversation_context = {
        "user_intent": extract_intent(user_message),
        "response_topics": extract_topics(assistant_response),
        "current_focus": determine_focus_area(user_message, assistant_response)
    }
    
    # Generate questions using specialized prompt
    follow_ups = llm.generate_chat_completion(
        messages=get_follow_up_prompt(user_message, assistant_response),
        temperature=0.8  # Higher creativity for diverse questions
    )
    
    return parse_follow_up_questions(follow_ups)
```

#### Question Characteristics

**Relevance**: Build naturally on current conversation topic
**Diversity**: Explore different angles and implications
**Actionability**: Lead to concrete insights or decisions
**Specificity**: Avoid generic or overly broad questions

**Example Follow-Up Generation:**
```
User: "How can we reduce cart abandonment?"
Assistant: "Cart abandonment typically occurs due to..."

Generated Follow-ups:
1. "What specific data do you have on where users drop off?"
2. "How does your abandonment rate compare across device types?"
3. "What incentives have you tried to encourage completion?"
```

### Follow-Up Limits and Quality

**Quantity Control:**
- Maximum of MAX_FOLLOW_UP_QUESTIONS (typically 3)
- Quality over quantity approach
- Filtered for relevance and uniqueness

**Quality Assurance:**
- Questions must end with question marks
- Minimum length requirements (avoid one-word questions)
- Pattern matching to avoid duplicates

## Context Integration Patterns

### Search Context Formatting

**Multi-Type Result Integration:**
```python
def format_search_context(search_results: Dict[str, List[Dict]]) -> str:
    """Format search results for AI consumption"""
    
    context_sections = []
    
    for content_type, items in search_results.items():
        if content_type == "chunks":
            # Document chunks with content preview
            for chunk in items[:5]:  # Top 5 results
                context_sections.append(f"Document: {chunk['content'][:300]}...")
        
        elif content_type == "insights":
            # Insight descriptions
            for insight in items[:5]:
                context_sections.append(f"Insight: {insight['description']}")
        
        elif content_type == "jtbds":
            # Full JTBD statements with context
            for jtbd in items[:5]:
                jtbd_text = f"JTBD: {jtbd['statement']}"
                if jtbd.get('context'):
                    jtbd_text += f" (Context: {jtbd['context']})"
                context_sections.append(jtbd_text)
    
    return "\n".join(context_sections)
```

### Contextual Response Enhancement

**With Search Results:**
- Responses reference specific findings
- Quotes relevant insights or data points
- Connects search results to user's question
- Provides synthesis rather than just listing results

**Without Search Results:**
- Provides general guidance and direction
- Suggests search refinement strategies
- Offers framework-based advice
- Maintains helpful tone despite limited context

## Temperature Control System

### Adaptive Temperature Settings

**Intent-Based Temperature Selection:**

| Intent Type | Temperature | Reasoning |
|-------------|-------------|-----------|
| **Intent Detection** | 0.3 | Consistent, reliable classification |
| **EXPLORATION** | DISCOVERY_TEMPERATURE | Creative, open-ended thinking |
| **QUESTION** | CONVERSATION_TEMPERATURE | Balanced expertise and creativity |
| **SEARCH** | CONVERSATION_TEMPERATURE | Structured yet engaging synthesis |
| **Follow-ups** | 0.8 | Creative question generation |

### Temperature Impact on Responses

**Low Temperature (0.1-0.4):**
- Consistent, predictable responses
- Focused on accuracy and reliability
- Used for classification and structured tasks
- Minimal creative interpretation

**Medium Temperature (0.5-0.7):**
- Balanced creativity and accuracy
- Natural conversational tone
- Appropriate for most user interactions
- Good for synthesis and explanation

**High Temperature (0.8-1.0):**
- Creative and diverse responses
- Encourages exploration and brainstorming
- Used for ideation and discovery
- May sacrifice some accuracy for creativity

## Error Handling and Fallbacks

### Graceful Degradation

**AI Service Failures:**
```python
def handle_ai_failure(message: str, error: Exception) -> Dict[str, Any]:
    """Handle AI service failures gracefully"""
    
    logger.error(f"AI service failed: {error}")
    
    # Fall back to heuristic intent detection
    fallback_intent = fallback_intent_detection(message)
    
    # Generate helpful response without AI
    response = generate_fallback_response(message, fallback_intent)
    
    return {
        "success": True,
        "content": response,
        "response_type": "fallback",
        "intent_type": fallback_intent.intent_type,
        "follow_up_questions": []  # No follow-ups in fallback mode
    }
```

### Fallback Intent Detection

**Heuristic Classification:**
- Keyword pattern matching
- Question word detection (what, how, why, etc.)
- Search term identification
- Action verb recognition

**Fallback Response Generation:**
- Generic but helpful guidance
- Framework-based advice
- Encouragement to rephrase or provide more context
- Maintains positive, supportive tone

## Conversation History Management

### Context Preservation

**History Tracking:**
- Maintains last N conversation exchanges
- Preserves user context across interactions
- Enables references to previous discussion points
- Supports conversation continuity

**Context Window Management:**
```python
def manage_conversation_history(
    new_message: str, 
    history: List[Dict[str, str]], 
    max_exchanges: int = 5
) -> List[Dict[str, str]]:
    """Manage conversation history within limits"""
    
    # Add new message to history
    history.append({"role": "user", "content": new_message})
    
    # Maintain maximum history length
    if len(history) > max_exchanges * 2:  # 2 messages per exchange
        history = history[-(max_exchanges * 2):]
    
    return history
```

### Session Continuity

**Cross-Session Context:**
- Conversation history persists within Streamlit session
- Context selections maintained across interactions
- Token budget tracked continuously
- Workflow state preserved

## Performance Optimization

### Response Caching

**Cache Strategy:**
- Intent detection results cached by message content
- Follow-up questions cached to avoid regeneration
- Search context formatted once per search operation
- Temperature settings cached per intent type

### Token Management

**Token Budget Awareness:**
- Responses consider available token budget
- Context truncation when approaching limits
- Efficient prompt construction
- Graceful handling of token limit exceeded errors

### Async Processing Opportunities

**Parallel Operations:**
- Intent detection and search execution
- Follow-up generation while user reads response
- Context formatting during response generation
- Background caching of frequently accessed content

This conversational flow system enables natural, intelligent interactions that guide users through the JTBD research process, making the platform accessible to users of all experience levels while maintaining depth and sophistication for expert users.