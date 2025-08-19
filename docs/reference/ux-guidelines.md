# UX Guidelines and Design Standards

This document establishes the professional design standards and UX guidelines for the JTBD Assistant Platform, ensuring consistent, content-optimized layouts and professional visual hierarchy across all components.

## Design Philosophy

### Content-First Approach

The platform prioritizes **content over decoration**, maximizing usable space for meaningful user interactions while maintaining professional aesthetics.

**Core Principles:**
- **Maximum Usable Space**: Content gets priority in layout decisions
- **Professional Appearance**: Clean, business-appropriate design language
- **Functional Aesthetics**: Visual elements serve clear functional purposes
- **Consistent Patterns**: Predictable layouts across different page types

## Layout Standards

### Weight Distribution System

The platform uses **page-type specific weight distributions** to optimize content presentation:

#### Conversational Pages (Chat Interface)

**Distribution**: 20% Sidebar / 80% Main Content

```python
# Implementation pattern for chat pages
with st.sidebar:
    # Sidebar: 20% width (280px @ 1400px viewport)
    render_workflow_progress()
    render_context_summary()
    render_stage_controls()

# Main content: 80% width (1120px @ 1400px viewport)
render_chat_interface()
render_search_results()
render_follow_up_questions()
```

**Rationale**: Chat interactions require maximum horizontal space for:
- Conversational AI responses
- Search result presentation
- Follow-up question display
- Context integration visualization

#### Data Table Pages (Metrics, Insights, JTBDs)

**Distribution**: 15% Sidebar / 85% Main Content

```python
# Implementation pattern for table pages
with st.sidebar:
    # Sidebar: 15% width (210px @ 1400px viewport)
    render_navigation()
    render_filters()
    render_create_forms()
    render_summary_stats()

# Main content: 85% width (1190px @ 1400px viewport)
render_data_table()
render_bulk_actions()
render_export_controls()
```

**Rationale**: Data tables need maximum space for:
- Multiple columns with adequate width
- Readable content without horizontal scrolling
- Bulk selection and action controls
- Export and pagination interfaces

#### Mixed Content Pages (Future Extensions)

**Distribution**: 18% Sidebar / 82% Main Content

Reserved for pages that combine conversational elements with data presentation.

### Responsive Breakpoints

| Viewport Width | Sidebar Behavior | Main Content | Layout Adjustments |
|---------------|------------------|--------------|-------------------|
| **Desktop (1200px+)** | Fixed width per page type | Remaining space | Full feature set |
| **Tablet (768-1199px)** | Collapsible drawer overlay | Full width when collapsed | Touch-optimized controls |
| **Mobile (<768px)** | Bottom navigation tabs | Single column layout | Simplified interface |

## Typography Hierarchy

### Streamlit Implementation Standards

```python
# Page-level titles
st.title("JTBD Assistant Platform")
# → 32px font size, bold weight, primary color

# Section headers  
st.header("Context Summary")
# → 24px font size, medium weight, secondary color

# Subsection headers
st.subheader("Selected Insights")
# → 18px font size, medium weight, tertiary color

# Body text
st.markdown("Regular content and descriptions...")
# → 14px font size, regular weight, body color

# Secondary information
st.caption("Token usage: 1,250/4,000 tokens remaining")
# → 12px font size, regular weight, muted color
```

### Typography Usage Guidelines

**Page Titles** (`st.title()`):
- Use once per page for main page identification
- Keep concise and descriptive
- Avoid decorative elements

**Section Headers** (`st.header()`):
- Use for major content divisions
- Create logical content hierarchy
- Maintain parallel structure

**Subsection Headers** (`st.subheader()`):
- Use for content subdivisions within sections
- Maintain consistent naming patterns
- Support scannable content structure

**Body Text** (`st.markdown()`):
- Default for all primary content
- Use for explanations, descriptions, and instructions
- Keep line lengths readable (60-80 characters)

**Secondary Information** (`st.caption()`):
- Use for metadata, status information, and help text
- Keep brief and relevant
- Provide contextual assistance

## Professional Emoji Usage

### Approved Functional Emojis

**Navigation Icons** (Page identification only):
- 💬 Chat Assistant
- 📊 Metrics Overview  
- 💡 Insights Management
- 🎯 JTBDs Management

**Status Indicators** (System feedback only):
- ✅ Success states
- ⚠️ Warning states
- ❌ Error states

**Content Type Indicators** (Data categorization):
- 📄 Documents
- 📈 Metrics
- 🔍 Search results

**Action Indicators** (Clear functional purpose):
- ➕ Add/Create actions
- 📥 Import actions
- 🗑️ Delete actions

### Prohibited Decorative Elements

**Multiple Emojis**: Never use multiple emojis in a single element
```python
# ❌ Incorrect
st.header("🎯✨ JTBD Management Dashboard 🚀📊")

# ✅ Correct  
st.header("JTBD Management")
```

**Emotional Emojis**: Avoid personality or emotional emojis in content
```python
# ❌ Incorrect
st.info("Great job! 😊 You've created your first JTBD! 🎉")

# ✅ Correct
st.success("JTBD created successfully")
```

**Redundant Emojis**: Don't use emojis that duplicate text meaning
```python
# ❌ Incorrect
st.button("📄 Download Report 📥")

# ✅ Correct
st.button("📄 Download Report")
```

## Content Organization Patterns

### Progressive Disclosure

**Information Hierarchy**: Present information in order of importance
- Primary actions and content first
- Secondary options in expandable sections  
- Advanced features behind clear entry points
- Help and documentation easily accessible but not prominent

**Contextual Controls**: Show relevant options based on current workflow stage
```python
# Stage-specific control rendering
if current_stage == 1:  # Search & Select
    render_search_controls()
    render_similarity_threshold()
    render_content_filters()
elif current_stage == 2:  # Build Context
    render_context_review()
    render_token_budget()
    render_context_actions()
```

### Workflow Stage Integration

**Visual Progress Indicators**: 
- Vertical sidebar progress for space efficiency
- Clear current stage identification
- Completed stage acknowledgment
- Future stage preview

**Stage-Appropriate Content**:
- Dynamic sidebar content based on current stage
- Contextual help and guidance
- Relevant action options only
- Clear next-step suggestions

## Interactive Element Standards

### Button Hierarchy

**Primary Buttons** (`type="primary"`):
- Main action on each page/section
- One primary button per functional area
- Clear, action-oriented labels
- Prominent visual treatment

**Secondary Buttons** (`type="secondary"`):  
- Supporting actions
- Navigation between stages
- Alternative action paths
- Subtle visual treatment

**Text Buttons** (default):
- Minor actions
- Cancel operations
- Advanced options
- Minimal visual impact

### Input Field Standards

**Text Inputs**:
```python
# Proper labeling and placeholder usage
search_query = st.text_input(
    "Search research content",
    placeholder="e.g., mobile checkout issues",
    help="Search across insights, JTBDs, and document chunks"
)
```

**Form Validation**:
- Real-time validation feedback
- Clear error messages
- Helpful correction guidance
- Success confirmation

### Selection Interface Standards

**Result Cards**: Consistent format for all search results
```python
def render_result_card(result, content_type):
    """Standardized result card rendering"""
    with st.container():
        col1, col2, col3 = st.columns([8, 1, 1])
        
        with col1:
            # Content preview with consistent truncation
            st.markdown(f"**{result['title']}**")
            st.caption(truncate_content(result['content'], 200))
            
        with col2:
            # Similarity score display
            st.metric("Similarity", f"{result['similarity']:.2f}")
            
        with col3:
            # Selection action
            if st.button("Select", key=f"select_{result['id']}"):
                add_to_context(result)
```

## Error Handling and Feedback

### User-Friendly Error Messages

**Error Message Structure**:
1. **Clear Problem Statement**: What went wrong
2. **Actionable Solution**: How to fix it  
3. **Alternative Path**: What to try instead

```python
# Error message example
if not search_results:
    st.warning(
        "No results found for your search. "
        "Try using broader terms or lowering the similarity threshold."
    )
    
    with st.expander("Search suggestions"):
        st.markdown("""
        - Use broader, more general terms
        - Check spelling and try synonyms
        - Lower the similarity threshold below 0.7
        - Browse existing content in the sidebar
        """)
```

### Loading and Processing States

**Progress Indicators**:
```python
# Appropriate loading states
with st.spinner("Analyzing intent and searching content..."):
    # Time-consuming operation
    results = process_user_query(query)

# Progress bars for longer operations
progress_bar = st.progress(0)
for i, step in enumerate(processing_steps):
    process_step(step)
    progress_bar.progress((i + 1) / len(processing_steps))
```

### Success Feedback

**Confirmation Messages**:
- Clear success indication
- Relevant next-step suggestions
- Integration with workflow progression

```python
# Success message with progression
st.success("JTBD created successfully and added to your context.")
st.info("**Next step**: Continue building context or generate How Might We questions.")
```

## Accessibility Considerations

### Screen Reader Support

**Semantic Structure**: Use proper heading hierarchy
**Alternative Text**: Provide descriptions for visual elements
**Keyboard Navigation**: Ensure all interactions are keyboard accessible
**Focus Management**: Clear focus indicators and logical tab order

### Color and Contrast

**Color Usage**: Never rely on color alone for information
**Contrast Ratios**: Meet WCAG AA standards (4.5:1 for normal text)
**Text Readability**: Maintain readable font sizes and line spacing

### Responsive Design

**Touch Targets**: Minimum 44px touch targets on mobile
**Text Sizing**: Scalable text that remains readable when zoomed
**Layout Flexibility**: Content reflows appropriately across screen sizes

## Performance Guidelines

### Lazy Loading Patterns

```python
# Efficient content loading
@st.cache_data
def load_search_results(query, filters):
    """Cache search results for repeated queries"""
    return expensive_search_operation(query, filters)

# Progressive loading for large datasets
if st.button("Load more results"):
    load_additional_results(offset=current_offset, limit=20)
```

### Memory Management

**State Management**: Keep session state minimal and focused
**Cache Usage**: Cache expensive operations appropriately
**Resource Cleanup**: Clear unused data from session state

These UX guidelines ensure a professional, accessible, and user-focused experience that maximizes productivity while maintaining visual appeal and functional clarity throughout the JTBD Assistant Platform.