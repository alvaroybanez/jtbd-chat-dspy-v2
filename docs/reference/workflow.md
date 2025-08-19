# JTBD Workflow and Data Flow

This document describes the complete Jobs-to-be-Done workflow implemented by the platform, from document ingestion to solution prioritization.

## Workflow Overview

The JTBD Assistant Platform implements a **systematic workflow** for transforming customer research into actionable solutions:

```
1. Document Ingestion → 2. Content Processing → 3. Insight Extraction →
4. JTBD Definition → 5. Context Building → 6. HMW Generation → 7. Solution Creation
```

Each stage builds upon the previous one, with **vector embeddings** enabling semantic connections throughout the process.

## Stage 1: Document Ingestion

The workflow begins with uploading and processing customer research documents.

### Input Sources

**Document Types:**
- Customer interview transcripts
- Survey results and feedback
- User research reports
- Support ticket analyses
- Product usage data
- Market research studies

**Supported Formats:**
- Text documents (`.txt`, `.md`)
- PDF reports
- CSV data files
- JSON structured data

### Processing Pipeline

```python
def ingest_document(title: str, content: str) -> Dict[str, Any]:
    """Process and store a new document with embedding generation."""
    
    # 1. Validate input
    if not validate_text_input(content):
        return {"success": False, "error": "Invalid content"}
    
    # 2. Generate full document embedding
    doc_embedding = embedding_manager.get_embedding(content)
    
    # 3. Store document in database
    document_result = db.store_document_with_embedding(title, content, doc_embedding)
    
    if not document_result["success"]:
        return document_result
    
    document_id = document_result["document_id"]
    
    # 4. Create and process chunks
    chunks = text_processor.create_chunks(content)
    chunk_results = []
    
    for i, chunk in enumerate(chunks):
        chunk_embedding = embedding_manager.get_embedding(chunk)
        chunk_result = db.store_chunk(document_id, i, chunk, chunk_embedding)
        chunk_results.append(chunk_result)
    
    return {
        "success": True,
        "document_id": document_id,
        "chunks_created": len(chunks),
        "chunks_successful": sum(1 for r in chunk_results if r["success"])
    }
```

### Text Chunking Strategy

**Chunking Parameters:**
- Maximum 1000 characters per chunk
- Preserve sentence boundaries
- Maintain paragraph structure where possible
- 100-character overlap between adjacent chunks

**Chunk Creation Logic:**
```python
def create_chunks(text: str, max_size: int = MAX_CHUNK_SIZE) -> List[str]:
    """Create overlapping chunks preserving sentence boundaries."""
    sentences = split_into_sentences(text)
    chunks = []
    current_chunk = ""
    
    for sentence in sentences:
        if len(current_chunk + sentence) > max_size:
            if current_chunk:
                chunks.append(current_chunk.strip())
                # Create overlap with last sentence
                current_chunk = get_last_sentence(current_chunk) + sentence
            else:
                # Handle very long sentences
                chunks.append(sentence[:max_size])
                current_chunk = sentence[max_size:]
        else:
            current_chunk += sentence + " "
    
    if current_chunk.strip():
        chunks.append(current_chunk.strip())
    
    return chunks
```

## Stage 2: Content Processing and Embedding

All content gets converted to vector embeddings for semantic search and relationship discovery.

### Embedding Generation

**Embedding Model**: OpenAI `text-embedding-3-small`
- **Dimensions**: 1536
- **Context Window**: 8,191 tokens
- **Performance**: High quality, cost-effective

**Embedding Process:**
```python
def generate_content_embeddings(content_items: List[str]) -> List[List[float]]:
    """Generate embeddings for content with caching and batching."""
    
    # 1. Check cache for existing embeddings
    cached_embeddings = {}
    uncached_items = []
    
    for i, item in enumerate(content_items):
        cache_key = generate_cache_key(item)
        cached = embedding_cache.get(cache_key)
        if cached:
            cached_embeddings[i] = cached
        else:
            uncached_items.append((i, item))
    
    # 2. Generate embeddings for uncached items in batches
    new_embeddings = {}
    for batch in batch_items(uncached_items, MAX_BATCH_SIZE):
        batch_texts = [item[1] for item in batch]
        batch_results = llm_wrapper.generate_embeddings(batch_texts)
        
        for (original_index, text), embedding in zip(batch, batch_results):
            new_embeddings[original_index] = embedding
            # Cache the result
            cache_key = generate_cache_key(text)
            embedding_cache.set(cache_key, embedding)
    
    # 3. Combine cached and new embeddings
    final_embeddings = []
    for i in range(len(content_items)):
        if i in cached_embeddings:
            final_embeddings.append(cached_embeddings[i])
        else:
            final_embeddings.append(new_embeddings[i])
    
    return final_embeddings
```

### Caching Strategy

**Cache Configuration:**
- **Type**: LRU Cache with 10,000 entry limit
- **TTL**: 24 hours for cache entries
- **Key Generation**: SHA-256 hash of content text
- **Storage**: In-memory for session, persistent for repeated use

## Stage 3: Insight Extraction

Insights are extracted from documents through manual annotation or AI-assisted extraction.

### Manual Insight Creation

**User Process:**
1. Review document content in UI
2. Identify key findings, pain points, opportunities
3. Create insight descriptions with clear, actionable language
4. System generates embeddings automatically

### AI-Assisted Extraction

**Extraction Prompt Pattern:**
```python
INSIGHT_EXTRACTION_PROMPT = """
Analyze the following customer research content and extract key insights.
Focus on:
- Pain points and frustrations
- Unmet needs and desires  
- Behavioral patterns
- Improvement opportunities
- Feature requests and suggestions

Format each insight as a clear, actionable statement.

Content:
{document_content}

Extract 3-5 key insights:
"""

def extract_insights_from_document(document_content: str) -> List[str]:
    """Extract insights using AI with structured prompting."""
    
    prompt = INSIGHT_EXTRACTION_PROMPT.format(document_content=document_content)
    
    response = llm_wrapper.chat_completion([
        {"role": "system", "content": "You are an expert at analyzing customer research."},
        {"role": "user", "content": prompt}
    ])
    
    # Parse response and validate insights
    insights = parse_insight_list(response.content)
    validated_insights = [insight for insight in insights if validate_insight(insight)]
    
    return validated_insights
```

### Insight Quality Guidelines

**Good Insights:**
- Specific and actionable
- Based on evidence from the data
- Customer-focused language
- Clear problem or opportunity statement

**Examples:**
```
✅ "Users abandon checkout when forced to create an account, preferring guest checkout options"
✅ "Mobile users struggle with small touch targets in the navigation menu"
✅ "Customers want real-time order tracking notifications via SMS"

❌ "The website needs improvement"
❌ "Users don't like the design"
❌ "More features would be good"
```

## Stage 4: JTBD Definition

Jobs-to-be-Done statements are created following the standard JTBD framework format.

### JTBD Framework Structure

**Standard Format:**
```
"When [situation], I want [motivation], so I can [expected outcome]"
```

**Component Breakdown:**

**Situation (When):**
- Contextual trigger or circumstance
- Specific scenario or environment
- Time-based or event-driven context

**Motivation (I want):**
- Desired capability or solution
- Functional or emotional need
- Action or outcome seeking

**Expected Outcome (So I can):**
- Ultimate goal or benefit
- Value proposition for the user
- Success measure or end state

### JTBD Creation Process

**Interactive Creation:**
```python
def create_jtbd_statement(
    situation: str,
    motivation: str,  
    outcome: str,
    context: str = None
) -> Dict[str, Any]:
    """Create properly formatted JTBD statement."""
    
    # 1. Validate components
    if not all([situation, motivation, outcome]):
        return {"success": False, "error": "All JTBD components required"}
    
    # 2. Format statement
    statement = f"When {situation.strip()}, I want {motivation.strip()}, so I can {outcome.strip()}"
    
    # 3. Validate format
    if not validate_jtbd_format(statement):
        return {"success": False, "error": "JTBD format validation failed"}
    
    # 4. Generate embedding
    embedding = embedding_manager.get_embedding(statement)
    
    # 5. Store in database
    result = db.create_jtbd(
        statement=statement,
        context=context,
        outcome=outcome,
        embedding=embedding
    )
    
    return result
```

### JTBD Examples by Domain

**E-commerce:**
```
"When I'm shopping online during my lunch break, I want to complete checkout in under 2 minutes, so I can finish my purchase before returning to work"
```

**Software Tools:**
```
"When I'm collaborating on a project with remote teammates, I want to share my screen and files seamlessly, so I can maintain productive communication flow"
```

**Financial Services:**
```
"When I'm reviewing my monthly expenses, I want to automatically categorize transactions, so I can quickly identify spending patterns and budget effectively"
```

## Stage 5: Context Building

Context building involves selecting relevant insights, JTBDs, and metrics for HMW generation.

### Selection Process

**Search-Driven Selection:**
1. User enters natural language query
2. System generates query embedding
3. Semantic search across insights, JTBDs, and document chunks
4. Results ranked by similarity score
5. User selects relevant items for context

**Context Types:**

**Insights Context:**
- Customer pain points from research
- Behavioral observations
- Feature requests and needs
- Satisfaction drivers

**JTBD Context:**  
- Related job statements
- Similar user scenarios
- Contextual job variations
- Outcome-focused priorities

**Metrics Context:**
- Current performance measures
- Target improvements  
- Success criteria
- Business impact indicators

### Token Budget Management

**Budget Constraints:**
```python
class ContextBudget:
    MAX_CONTEXT_TOKENS = 4000
    TOKEN_BUFFER = 500
    EFFECTIVE_LIMIT = MAX_CONTEXT_TOKENS - TOKEN_BUFFER
    
    def check_budget(self, context_items: Dict) -> Dict[str, Any]:
        """Validate context fits within token budget."""
        
        total_tokens = 0
        for item_type, items in context_items.items():
            for item in items:
                total_tokens += count_tokens(item["content"])
        
        within_budget = total_tokens <= self.EFFECTIVE_LIMIT
        
        return {
            "within_budget": within_budget,
            "total_tokens": total_tokens,
            "remaining_tokens": self.EFFECTIVE_LIMIT - total_tokens,
            "budget_percentage": (total_tokens / self.EFFECTIVE_LIMIT) * 100
        }
```

### Context Quality Assessment

**Readiness Scoring:**
```python
def assess_context_readiness(context: Dict[str, List]) -> Dict[str, Any]:
    """Score context readiness for HMW generation."""
    
    score = 0
    recommendations = []
    
    # Insight diversity (0-30 points)
    insight_count = len(context.get("insights", []))
    if insight_count >= 3:
        score += 30
    elif insight_count >= 2:
        score += 20
        recommendations.append("Consider adding 1-2 more insights for better coverage")
    else:
        score += 10
        recommendations.append("Add more insights - at least 2-3 recommended")
    
    # JTBD relevance (0-25 points)  
    jtbd_count = len(context.get("jtbds", []))
    if jtbd_count >= 2:
        score += 25
    elif jtbd_count >= 1:
        score += 15
        recommendations.append("Consider adding another relevant JTBD")
    else:
        recommendations.append("Add at least 1 JTBD statement for context")
    
    # Metric alignment (0-20 points)
    metric_count = len(context.get("metrics", []))
    if metric_count >= 2:
        score += 20
    elif metric_count >= 1:
        score += 10
        recommendations.append("Add success metrics for better solution alignment")
    else:
        recommendations.append("Define metrics to measure solution success")
    
    # Context coherence (0-25 points)
    coherence_score = calculate_context_coherence(context)
    score += coherence_score
    
    if coherence_score < 15:
        recommendations.append("Selected items seem unrelated - review for thematic consistency")
    
    # Determine readiness level
    if score >= 80:
        readiness = "ready"
    elif score >= 60:
        readiness = "partially_ready"
    else:
        readiness = "not_ready"
    
    return {
        "readiness": readiness,
        "score": score,
        "recommendations": recommendations
    }
```

## Stage 6: How Might We (HMW) Generation

HMW questions are generated from the selected context using AI assistance.

### HMW Generation Process

**Generation Prompt Structure:**
```python
HMW_GENERATION_PROMPT = """
Based on the following context, generate How Might We (HMW) questions that address the key challenges and opportunities.

Context:
- Customer Insights: {insights_summary}
- Jobs to be Done: {jtbds_summary}  
- Success Metrics: {metrics_summary}

Guidelines:
1. Start each question with "How might we"
2. Focus on specific, actionable opportunities
3. Address root causes, not just symptoms
4. Consider both user needs and business goals
5. Generate 5-8 varied HMW questions

Generate HMW questions:
"""

def generate_hmw_questions(context: Dict[str, Any]) -> Dict[str, Any]:
    """Generate HMW questions from selected context."""
    
    # 1. Prepare context summaries
    insights_summary = format_insights_for_prompt(context.get("insights", []))
    jtbds_summary = format_jtbds_for_prompt(context.get("jtbds", []))
    metrics_summary = format_metrics_for_prompt(context.get("metrics", []))
    
    # 2. Build prompt
    prompt = HMW_GENERATION_PROMPT.format(
        insights_summary=insights_summary,
        jtbds_summary=jtbds_summary,
        metrics_summary=metrics_summary
    )
    
    # 3. Generate HMW questions
    response = llm_wrapper.chat_completion([
        {"role": "system", "content": "You are an expert at design thinking and innovation."},
        {"role": "user", "content": prompt}
    ])
    
    # 4. Parse and validate HMW questions
    hmw_questions = parse_hmw_list(response.content)
    validated_hmws = []
    
    for hmw in hmw_questions:
        if validate_hmw_format(hmw):
            validated_hmws.append(hmw)
        else:
            logger.warning(f"Invalid HMW format: {hmw}")
    
    return {
        "success": True,
        "hmw_questions": validated_hmws,
        "context_used": {
            "insights_count": len(context.get("insights", [])),
            "jtbds_count": len(context.get("jtbds", [])),
            "metrics_count": len(context.get("metrics", []))
        }
    }
```

### HMW Quality Guidelines

**Effective HMW Questions:**
- Specific enough to be actionable
- Open enough to allow creative solutions
- Focused on user value creation
- Aligned with business capabilities

**Examples by Quality Level:**

**Excellent HMWs:**
```
✅ "How might we reduce checkout abandonment for mobile users shopping during work hours?"
✅ "How might we help users track project progress without disrupting their workflow?"
✅ "How might we make financial insights more accessible for users with varying expertise levels?"
```

**Good HMWs:**
```
⚠️ "How might we improve the mobile checkout experience?"
⚠️ "How might we make project tracking easier?"
⚠️ "How might we simplify financial data presentation?"
```

**Poor HMWs:**
```
❌ "How might we fix the website?"
❌ "How might we make users happier?"
❌ "How might we increase revenue?"
```

## Stage 7: Solution Creation and Prioritization

Solutions are created to address HMW questions and scored for prioritization.

### Solution Development Process

**Solution Creation Workflow:**
```python
def create_solution_for_hmw(
    hmw_question: str,
    context: Dict[str, Any]
) -> Dict[str, Any]:
    """Generate solution addressing specific HMW question."""
    
    solution_prompt = f"""
    HMW Question: {hmw_question}
    
    Context:
    {format_context_for_solution(context)}
    
    Create a specific solution that:
    1. Directly addresses the HMW question
    2. Provides clear customer benefit
    3. Describes improved user journey
    4. Is technically feasible
    5. Aligns with business goals
    
    Format:
    Title: [Concise solution name]
    Description: [Detailed solution explanation]
    Customer Benefit: [Clear value to users]
    User Journey: [Step-by-step experience improvement]
    """
    
    response = llm_wrapper.chat_completion([
        {"role": "system", "content": "You are a product strategist creating actionable solutions."},
        {"role": "user", "content": solution_prompt}
    ])
    
    # Parse solution components
    solution_data = parse_solution_response(response.content)
    
    return solution_data
```

### Impact and Effort Scoring

**Scoring Framework:**

**Impact Score (1-10):**
- Customer value creation potential
- Business metric improvement  
- Market differentiation opportunity
- Strategic alignment

**Effort Score (1-10):**
- Technical complexity
- Resource requirements
- Time to market
- Implementation risk

**Scoring Guidelines:**
```python
IMPACT_CRITERIA = {
    "high": {
        "score_range": (8, 10),
        "description": "Significant customer value, major business impact, strategic advantage"
    },
    "medium": {
        "score_range": (5, 7), 
        "description": "Moderate customer value, noticeable business impact, competitive parity"
    },
    "low": {
        "score_range": (1, 4),
        "description": "Limited customer value, minimal business impact, nice-to-have"
    }
}

EFFORT_CRITERIA = {
    "low": {
        "score_range": (1, 3),
        "description": "Simple implementation, existing resources, low risk"
    },
    "medium": {
        "score_range": (4, 6),
        "description": "Moderate complexity, some new resources, manageable risk"
    },
    "high": {
        "score_range": (7, 10), 
        "description": "Complex implementation, significant resources, high risk"
    }
}
```

### Final Score Calculation

**Prioritization Formula:**
```python
def calculate_final_score(impact_score: int, effort_score: int) -> float:
    """Calculate weighted final score for solution prioritization."""
    
    # Weight: 60% impact, 40% ease of implementation
    impact_weight = 0.6
    ease_weight = 0.4
    
    # Convert effort to ease (higher effort = lower ease)
    ease_score = 10 - effort_score
    
    final_score = (impact_score * impact_weight) + (ease_score * ease_weight)
    
    return round(final_score, 2)

# Example calculations:
# High impact (9), Low effort (3): (9 * 0.6) + (7 * 0.4) = 8.2
# Medium impact (6), Medium effort (5): (6 * 0.6) + (5 * 0.4) = 5.6  
# Low impact (3), High effort (8): (3 * 0.6) + (2 * 0.4) = 2.6
```

## Data Flow Architecture

### End-to-End Data Movement

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Documents     │───▶│   Text Chunks    │───▶│   Embeddings    │
│   (Raw Text)    │    │   (Processed)    │    │   (Vectors)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│    Insights     │───▶│      JTBDs       │───▶│   Context       │
│  (Extracted)    │    │   (Defined)      │    │  (Selected)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│      HMWs       │───▶│   Solutions      │───▶│ Prioritization  │
│  (Generated)    │    │   (Created)      │    │   (Scored)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Semantic Relationships

**Vector Space Connections:**
- Documents ↔ Insights (source relationship)
- Insights ↔ JTBDs (semantic similarity)
- JTBDs ↔ HMWs (derivation relationship)
- HMWs ↔ Solutions (addresses relationship)

**Search Relationships:**
- Query embeddings find similar content across all types
- Context building through semantic relevance
- Cross-type relationship discovery
- Recommendation generation based on similarity

This comprehensive workflow ensures systematic transformation of customer research into prioritized, actionable solutions while maintaining traceability throughout the entire process.