-- Create HMW and solution tables for JTBD Assistant Platform
-- Includes How Might We questions and prioritized solutions with relationships

-- Create hmws table for generated "How Might We" questions
CREATE TABLE hmws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    question TEXT NOT NULL,
    score DECIMAL(4,2) CHECK (score >= 0.0 AND score <= 10.0), -- DSPy-generated relevance score
    
    -- Relationship arrays - default to empty array, not NULL
    jtbd_ids UUID[] DEFAULT '{}', -- Related JTBDs that informed this HMW
    metric_ids UUID[] DEFAULT '{}', -- Related metrics this HMW could impact  
    insight_ids UUID[] DEFAULT '{}', -- Source insights that informed this HMW
    
    -- Metadata
    generation_method TEXT DEFAULT 'dspy' CHECK (generation_method IN ('dspy', 'fallback')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure question starts with "How might we"
    CONSTRAINT hmw_question_format CHECK (
        LOWER(TRIM(question)) LIKE 'how might we%'
    )
);

-- Create solutions table for prioritized solutions
CREATE TABLE solutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    
    -- Scoring (1-10 scale)
    impact_score INTEGER NOT NULL CHECK (impact_score >= 1 AND impact_score <= 10),
    effort_score INTEGER NOT NULL CHECK (effort_score >= 1 AND effort_score <= 10),
    final_score DECIMAL(4,2), -- Calculated field: impact_score / effort_score
    
    -- Relationship arrays - metric_ids is required (at least 1)
    metric_ids UUID[] NOT NULL CHECK (array_length(metric_ids, 1) >= 1),
    hmw_ids UUID[] DEFAULT '{}', -- Source HMWs that led to this solution
    jtbd_ids UUID[] DEFAULT '{}', -- JTBDs this solution addresses
    insight_ids UUID[] DEFAULT '{}', -- Supporting insights for this solution
    
    -- Metadata  
    generation_method TEXT DEFAULT 'dspy' CHECK (generation_method IN ('dspy', 'fallback')),
    status TEXT DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'in_progress', 'completed', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to calculate final_score automatically
CREATE OR REPLACE FUNCTION calculate_solution_final_score()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate as impact/effort ratio, with higher impact and lower effort being better
    NEW.final_score = ROUND((NEW.impact_score::DECIMAL / NEW.effort_score::DECIMAL), 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate final_score
CREATE TRIGGER calculate_solution_score_trigger
    BEFORE INSERT OR UPDATE OF impact_score, effort_score ON solutions
    FOR EACH ROW EXECUTE FUNCTION calculate_solution_final_score();

-- Add updated_at trigger for solutions
CREATE TRIGGER update_solutions_updated_at 
    BEFORE UPDATE ON solutions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to validate metric IDs exist and belong to user
CREATE OR REPLACE FUNCTION validate_solution_metrics()
RETURNS TRIGGER AS $$
DECLARE
    metric_id UUID;
    invalid_count INTEGER := 0;
BEGIN
    -- Check each metric_id exists and belongs to the user
    FOREACH metric_id IN ARRAY NEW.metric_ids
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM metrics 
            WHERE id = metric_id AND user_id = NEW.user_id
        ) THEN
            invalid_count := invalid_count + 1;
        END IF;
    END LOOP;
    
    IF invalid_count > 0 THEN
        RAISE EXCEPTION 'Solution contains % invalid metric IDs that do not exist or do not belong to user', invalid_count;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate metric IDs on insert/update
CREATE TRIGGER validate_solution_metrics_trigger
    BEFORE INSERT OR UPDATE OF metric_ids ON solutions
    FOR EACH ROW EXECUTE FUNCTION validate_solution_metrics();

-- Create indexes for relationship queries
CREATE INDEX idx_hmws_user_id ON hmws(user_id);
CREATE INDEX idx_hmws_score ON hmws(score DESC);
CREATE INDEX idx_hmws_jtbd_ids ON hmws USING GIN(jtbd_ids);
CREATE INDEX idx_hmws_metric_ids ON hmws USING GIN(metric_ids);
CREATE INDEX idx_hmws_insight_ids ON hmws USING GIN(insight_ids);

CREATE INDEX idx_solutions_user_id ON solutions(user_id);
CREATE INDEX idx_solutions_final_score ON solutions(final_score DESC);
CREATE INDEX idx_solutions_status ON solutions(status);
CREATE INDEX idx_solutions_metric_ids ON solutions USING GIN(metric_ids);
CREATE INDEX idx_solutions_hmw_ids ON solutions USING GIN(hmw_ids);
CREATE INDEX idx_solutions_jtbd_ids ON solutions USING GIN(jtbd_ids);
CREATE INDEX idx_solutions_insight_ids ON solutions USING GIN(insight_ids);

-- Add comments for documentation
COMMENT ON TABLE hmws IS 'Generated How Might We questions with relationship arrays';
COMMENT ON TABLE solutions IS 'Generated solutions with scoring and metric assignments';

COMMENT ON COLUMN hmws.score IS 'DSPy-generated relevance score (0.0-10.0)';
COMMENT ON COLUMN hmws.jtbd_ids IS 'Array of JTBD IDs that informed this HMW';
COMMENT ON COLUMN hmws.metric_ids IS 'Array of metric IDs this HMW could impact';
COMMENT ON COLUMN hmws.insight_ids IS 'Array of insight IDs that informed this HMW';

COMMENT ON COLUMN solutions.impact_score IS 'Business impact score (1-10, higher is better)';
COMMENT ON COLUMN solutions.effort_score IS 'Implementation effort score (1-10, higher is more effort)';
COMMENT ON COLUMN solutions.final_score IS 'Calculated as impact_score / effort_score';
COMMENT ON COLUMN solutions.metric_ids IS 'Required: Array of metric IDs this solution will impact';

COMMENT ON CONSTRAINT hmw_question_format ON hmws IS 'Ensures all HMW questions start with "How might we"';
COMMENT ON CONSTRAINT solutions_metric_ids_check ON solutions IS 'Ensures solutions have at least one metric assigned';