# JTBD Assistant Platform - UX Specification

## Executive Summary

This specification addresses critical UX issues in the JTBD Assistant Platform by establishing professional layout patterns, optimal weight distributions, and consistent visual hierarchy. The design prioritizes content over decoration, maximizes usable space, and creates intuitive user flows across all four pages.

## Critical Issues Resolved

### 1. **Weight Distribution Problems** ✅ FIXED
- **Before:** Sidebar ~30%, Main ~70% (backwards for content-focused app)
- **After:** Chat 20/80, Tables 15/85 (content-optimized)

### 2. **Emoji Overload** ✅ FIXED  
- **Before:** Excessive decorative emojis creating unprofessional appearance
- **After:** Functional emojis only for navigation and status indicators

### 3. **Inconsistent Layouts** ✅ FIXED
- **Before:** Different patterns between Chat and Metrics pages
- **After:** Consistent layout framework with page-type optimizations

### 4. **Cramped Content Area** ✅ FIXED
- **Before:** Oversized sidebar stealing content space
- **After:** Content-first approach with contextual sidebar sizing

---

## Layout Specifications

### Weight Distribution by Page Type

#### **Conversational Pages** (Chat Assistant)
```css
Sidebar: 20% (280px @ 1400px viewport)
Main Content: 80% (1120px @ 1400px viewport)
Rationale: Chat needs maximum space for conversation flow and search results
```

#### **Data Table Pages** (Metrics, Insights, JTBDs)  
```css
Sidebar: 15% (210px @ 1400px viewport)
Main Content: 85% (1190px @ 1400px viewport)
Rationale: Tables need maximum horizontal space for columns and data
```

#### **Mixed Content Pages** (Future pages)
```css
Sidebar: 18% (252px @ 1400px viewport)
Main Content: 82% (1148px @ 1400px viewport)
Rationale: Balance between forms, tables, and navigation
```

### Responsive Breakpoints

| Viewport | Sidebar Behavior | Main Content |
|----------|-----------------|--------------|
| **Desktop (1200px+)** | Fixed width per page type | Remaining space |
| **Tablet (768-1199px)** | Collapsible drawer overlay | Full width when collapsed |
| **Mobile (<768px)** | Bottom navigation tabs | Single column layout |

---

## Visual Hierarchy Standards

### Professional Emoji Usage

#### ✅ **APPROVED EMOJIS** (Functional Only)
- **Navigation:** 💬 📊 💡 🎯 (page icons only)
- **Status:** ✅ ⚠️ ❌ (system feedback)
- **Content Types:** 📄 📈 🔍 (data categorization)
- **Actions:** ➕ 📥 🗑️ (clear action indicators)

#### ❌ **PROHIBITED EMOJIS** (Decorative/Excessive)
- Multiple emojis per element
- Emotional/personality emojis (😊 🚀 ✨)
- Decorative emojis in body text
- Redundant emojis with text labels

#### **Replacement Examples**
```
❌ Before: "💡 **Tip:** Search for insights and JTBDs to build context for HMW generation"
✅ After:  "**Quick tip:** Search for insights and JTBDs to build context for HMW generation"

❌ Before: "🎯 **Goal:** Generate actionable How Might We questions"  
✅ After:  "**Primary goal:** Generate actionable How Might We questions"
```

### Typography Hierarchy

| Element | Styling | Usage |
|---------|---------|-------|
| **Page Titles** | `st.title()` - 32px, bold | Main page headers |
| **Section Headers** | `st.header()` - 24px, medium | Major content sections |
| **Subsections** | `st.subheader()` - 18px, medium | Content subsections |
| **Body Text** | Default - 14px, regular | Primary content |
| **Captions** | `st.caption()` - 12px, muted | Secondary information |

---

## Page-Specific Layouts

### Chat Assistant Page

#### **Header Pattern**
```python
# Clean header with essential controls
col1, col2, col3 = st.columns([4, 1, 1])
with col1:
    st.subheader("Conversational Discovery Assistant")
    st.caption("Search research, build context, and generate actionable insights")
with col2:
    st.button("Export", type="secondary")
with col3:
    st.button("Clear", type="secondary")
```

#### **Workflow Progress** (Sidebar-based)
- **Problem:** Horizontal stepper wastes precious vertical space
- **Solution:** Vertical progress indicator in sidebar
- **Benefits:** Saves ~100px vertical space, always visible context

```python
# Vertical workflow in sidebar
stages = [
    {"id": 1, "title": "Search & Select", "desc": "Find relevant content"},
    {"id": 2, "title": "Build Context", "desc": "Review selections"},
    {"id": 3, "title": "Generate HMWs", "desc": "Create questions"},
    {"id": 4, "title": "Explore & Chat", "desc": "Discuss insights"}
]

for stage in stages:
    if stage["id"] == current_stage:
        st.sidebar.markdown(f"**▶ {stage['id']}. {stage['title']}**")
    elif stage["id"] < current_stage:
        st.sidebar.markdown(f"✓ {stage['id']}. {stage['title']}")
    else:
        st.sidebar.markdown(f"○ {stage['id']}. {stage['title']}")
```

#### **Progressive Disclosure Sidebar**
```python
# Context summary (always visible)
render_context_summary_sidebar()

# Stage-specific controls (contextual)
if current_stage == 1:  # Search & Select
    render_search_controls()
elif current_stage == 2:  # Build Context  
    render_context_review_controls()
# ... etc
```

### Data Table Pages (Metrics, Insights, JTBDs)

#### **Header Pattern**
```python
st.title("Metrics Overview")  
st.caption("Track progress with current and target values across all metrics")
```

#### **Filter Layout** (Horizontal, Space-Efficient)
```python
col1, col2, col3, col4 = st.columns([3, 2, 2, 1])
with col1:
    search_term = st.text_input("Search metrics", placeholder="...")
with col2:
    unit_filter = st.multiselect("Filter by Unit", options=units)
with col3:
    progress_filter = st.selectbox("Progress Filter", options=progress_options)
with col4:
    st.button("Export CSV", type="primary")
```

#### **Table Configuration**
```python
# Optimal column configuration for data tables
column_config = {
    "Name": st.column_config.TextColumn("Metric Name", width="medium"),
    "Current": st.column_config.NumberColumn("Current Value", width="small"),
    "Target": st.column_config.NumberColumn("Target Value", width="small"),
    "Progress": st.column_config.ProgressColumn("Progress %", width="small"),
    "Description": st.column_config.TextColumn("Description", width="large")
}

st.dataframe(
    df,
    column_config=column_config,
    use_container_width=True,  # Essential for 85% main content
    height=400
)
```

---

## Content Organization Strategies

### 1. **Information Architecture**
- **Primary content** gets maximum horizontal space
- **Secondary controls** collapse into expandable sections  
- **Contextual tools** appear only when relevant
- **Navigation** remains consistently accessible

### 2. **Content Prioritization**
```
Primary (Always Visible):
- Main data/conversation area
- Essential navigation  
- Core action buttons

Secondary (Expandable):
- Filter controls
- Settings panels
- Help documentation  
- Creation forms

Tertiary (On-Demand):
- Detailed item views
- Export options
- Advanced settings
```

### 3. **Contextual Progressive Disclosure**
- Show relevant controls based on user's current workflow stage
- Collapse less-used functionality into expandable sections
- Provide contextual help only when needed
- Surface commonly-used actions prominently

---

## User Flow Optimization

### Cross-Page Navigation
1. **Consistent tab navigation** at top level
2. **Breadcrumb context** where appropriate  
3. **Back/forward actions** within complex workflows
4. **Quick switches** between related content

### Within-Page Workflows
1. **Linear progression** for complex tasks (Chat workflow)
2. **Non-linear access** for reference data (Tables)
3. **Contextual shortcuts** for power users
4. **Clear entry/exit points** for all flows

### State Management
- **Persistent context** across page switches
- **Recoverable sessions** after interruption  
- **Clear state indicators** showing current progress
- **Reset options** when users get lost

---

## CSS Implementation

### Core Layout Framework
```css
/* Sidebar width optimization by page type */
.chat-page .sidebar { width: 280px !important; }
.metrics-page .sidebar,
.insights-page .sidebar, 
.jtbds-page .sidebar { width: 210px !important; }

/* Professional button styling */
.stButton > button {
    border-radius: 4px;
    border: 1px solid #ddd;
    font-weight: 500;
}

.stButton > button[kind="primary"] {
    background: #0066cc;
    border-color: #0066cc;
}

/* Clean table presentation */
.stDataFrame {
    border: 1px solid #e6e6e6;
    border-radius: 4px;
}

/* Consistent spacing */
.main .block-container {
    padding-top: 2rem;
    max-width: 100%;
}
```

---

## Accessibility Standards

### WCAG 2.1 AA Compliance

#### **Color & Contrast**
- Text contrast ratio ≥ 4.5:1 for normal text
- Text contrast ratio ≥ 3:1 for large text  
- UI component contrast ratio ≥ 3:1
- Non-text contrast ratio ≥ 3:1

#### **Keyboard Navigation**
- All interactive elements keyboard accessible
- Logical tab order throughout interface
- Visible focus indicators on all controls
- Skip links for main content areas

#### **Screen Reader Support**
- Semantic HTML structure with proper headings
- Alt text for all functional images/icons
- Descriptive link text and button labels
- Form labels explicitly associated with inputs

#### **Responsive Design**
- Zoom up to 200% without horizontal scrolling
- Touch targets ≥ 44px for mobile interfaces  
- Content reflows properly at all viewport sizes
- No information loss in responsive breakpoints

---

## Implementation Checklist

### Phase 1: Core Layout (Immediate)
- [ ] Apply new weight distributions (20/80, 15/85)
- [ ] Remove decorative emojis, keep functional only
- [ ] Implement consistent header patterns
- [ ] Add responsive breakpoint handling

### Phase 2: Component Optimization (Week 1)
- [ ] Redesign workflow stepper as sidebar vertical
- [ ] Implement progressive disclosure patterns
- [ ] Optimize filter layouts for space efficiency  
- [ ] Standardize button styling and interactions

### Phase 3: Advanced UX (Week 2)
- [ ] Add contextual help and guidance systems
- [ ] Implement advanced keyboard navigation
- [ ] Add loading states and error handling
- [ ] Create comprehensive style guide documentation

### Quality Assurance
- [ ] Test all layouts at different viewport sizes
- [ ] Verify WCAG 2.1 AA compliance across pages
- [ ] Validate information hierarchy with user testing
- [ ] Performance test with large datasets

---

## Success Metrics

### Usability Improvements
- **Space utilization:** 15-20% increase in content area  
- **Task completion:** Reduced clicks to complete workflows
- **Error reduction:** Fewer user mistakes due to clearer hierarchy
- **Accessibility score:** WCAG 2.1 AA compliance achieved

### User Experience Indicators
- **Professional perception:** Clean, business-appropriate interface
- **Cognitive load:** Reduced mental effort to process information
- **Efficiency:** Faster completion of common tasks
- **Satisfaction:** Higher user satisfaction with interface clarity

This specification provides the foundation for a professional, efficient, and accessible JTBD Assistant Platform that prioritizes user productivity over visual decoration.