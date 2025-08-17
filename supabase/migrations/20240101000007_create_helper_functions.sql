-- Create helper functions for JTBD Assistant Platform
-- These functions provide utilities for data management, validation, and business logic

-- Function to validate and clean HMW question format
-- Ensures all HMW questions start with "How might we" (case insensitive)
CREATE OR REPLACE FUNCTION normalize_hmw_question(input_question text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    cleaned_question text;
    hmw_prefix text := 'How might we ';
BEGIN
    -- Remove extra whitespace and normalize
    cleaned_question := TRIM(input_question);
    
    -- Check if it already starts with "How might we" (case insensitive)
    IF LOWER(cleaned_question) LIKE 'how might we %' THEN
        -- Capitalize properly and return
        RETURN hmw_prefix || SUBSTRING(cleaned_question FROM 13);
    ELSE
        -- Add the prefix
        RETURN hmw_prefix || cleaned_question;
    END IF;
END;
$$;

-- Function to calculate priority score for solutions based on impact/effort
-- Returns a normalized score considering both impact and effort
CREATE OR REPLACE FUNCTION calculate_priority_score(
    impact_score integer,
    effort_score integer,
    method text DEFAULT 'ratio'
)
RETURNS decimal
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Validate input ranges
    IF impact_score < 1 OR impact_score > 10 OR effort_score < 1 OR effort_score > 10 THEN
        RAISE EXCEPTION 'Scores must be between 1 and 10';
    END IF;
    
    -- Calculate based on method
    CASE method
        WHEN 'ratio' THEN
            -- Simple ratio: higher impact, lower effort is better
            RETURN ROUND((impact_score::decimal / effort_score::decimal), 2);
        WHEN 'weighted' THEN
            -- Weighted formula: emphasize high impact, penalize high effort
            RETURN ROUND(((impact_score * 1.5) - (effort_score * 0.8)) / 2.0, 2);
        WHEN 'normalized' THEN
            -- Normalized 0-100 scale
            RETURN ROUND(((impact_score - effort_score + 9) * 100.0 / 18.0), 2);
        ELSE
            -- Default to ratio method
            RETURN ROUND((impact_score::decimal / effort_score::decimal), 2);
    END CASE;
END;
$$;

-- Function to get fallback metric IDs when solutions need metric assignment
-- Returns array of metric IDs, including default fallback if no user metrics exist
CREATE OR REPLACE FUNCTION get_fallback_metric_ids(target_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    user_metric_ids uuid[];
    default_metric_id uuid;
BEGIN
    -- Get user's existing metrics
    SELECT ARRAY_AGG(id) INTO user_metric_ids
    FROM metrics 
    WHERE user_id = target_user_id;
    
    -- If user has metrics, return them
    IF user_metric_ids IS NOT NULL AND array_length(user_metric_ids, 1) > 0 THEN
        RETURN user_metric_ids;
    END IF;
    
    -- Otherwise, get default metric
    SELECT get_default_metric_id() INTO default_metric_id;
    
    -- Ensure default metric exists
    IF default_metric_id IS NULL THEN
        SELECT ensure_default_metric() INTO default_metric_id;
    END IF;
    
    RETURN ARRAY[default_metric_id];
END;
$$;

-- Function to validate relationship arrays contain valid UUIDs for the user
CREATE OR REPLACE FUNCTION validate_relationship_ids(
    target_user_id uuid,
    insight_ids uuid[] DEFAULT '{}',
    metric_ids uuid[] DEFAULT '{}',
    jtbd_ids uuid[] DEFAULT '{}',
    hmw_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    result jsonb := jsonb_build_object();
    invalid_insights uuid[];
    invalid_metrics uuid[];
    invalid_jtbds uuid[];
    invalid_hmws uuid[];
    insight_id uuid;
    metric_id uuid;
    jtbd_id uuid;
    hmw_id uuid;
BEGIN
    -- Validate insights
    IF array_length(insight_ids, 1) > 0 THEN
        FOREACH insight_id IN ARRAY insight_ids
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM insights 
                WHERE id = insight_id AND user_id = target_user_id
            ) THEN
                invalid_insights := array_append(invalid_insights, insight_id);
            END IF;
        END LOOP;
    END IF;
    
    -- Validate metrics
    IF array_length(metric_ids, 1) > 0 THEN
        FOREACH metric_id IN ARRAY metric_ids
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM metrics 
                WHERE id = metric_id AND (user_id = target_user_id OR user_id = '00000000-0000-0000-0000-000000000000'::uuid)
            ) THEN
                invalid_metrics := array_append(invalid_metrics, metric_id);
            END IF;
        END LOOP;
    END IF;
    
    -- Validate JTBDs
    IF array_length(jtbd_ids, 1) > 0 THEN
        FOREACH jtbd_id IN ARRAY jtbd_ids
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM jtbds 
                WHERE id = jtbd_id AND user_id = target_user_id
            ) THEN
                invalid_jtbds := array_append(invalid_jtbds, jtbd_id);
            END IF;
        END LOOP;
    END IF;
    
    -- Validate HMWs
    IF array_length(hmw_ids, 1) > 0 THEN
        FOREACH hmw_id IN ARRAY hmw_ids
        LOOP
            IF NOT EXISTS (
                SELECT 1 FROM hmws 
                WHERE id = hmw_id AND user_id = target_user_id
            ) THEN
                invalid_hmws := array_append(invalid_hmws, hmw_id);
            END IF;
        END LOOP;
    END IF;
    
    -- Build result
    result := jsonb_build_object(
        'valid', (
            COALESCE(array_length(invalid_insights, 1), 0) = 0 AND
            COALESCE(array_length(invalid_metrics, 1), 0) = 0 AND
            COALESCE(array_length(invalid_jtbds, 1), 0) = 0 AND
            COALESCE(array_length(invalid_hmws, 1), 0) = 0
        ),
        'invalid_insight_ids', COALESCE(invalid_insights, '{}'),
        'invalid_metric_ids', COALESCE(invalid_metrics, '{}'),
        'invalid_jtbd_ids', COALESCE(invalid_jtbds, '{}'),
        'invalid_hmw_ids', COALESCE(invalid_hmws, '{}')
    );
    
    RETURN result;
END;
$$;

-- Function to clean up orphaned data (maintenance utility)
CREATE OR REPLACE FUNCTION cleanup_orphaned_data()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_chunks integer := 0;
    deleted_insights integer := 0;
    result jsonb;
BEGIN
    -- Clean up document chunks with no parent document
    DELETE FROM document_chunks 
    WHERE document_id NOT IN (SELECT id FROM documents);
    GET DIAGNOSTICS deleted_chunks = ROW_COUNT;
    
    -- Clean up insights with no parent document
    DELETE FROM insights 
    WHERE document_id NOT IN (SELECT id FROM documents);
    GET DIAGNOSTICS deleted_insights = ROW_COUNT;
    
    -- Build result
    result := jsonb_build_object(
        'deleted_chunks', deleted_chunks,
        'deleted_insights', deleted_insights,
        'cleanup_timestamp', NOW()
    );
    
    RETURN result;
END;
$$;

-- Function to get content statistics for a user
CREATE OR REPLACE FUNCTION get_user_content_stats(target_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
    SELECT jsonb_build_object(
        'documents', COALESCE((SELECT COUNT(*) FROM documents WHERE user_id = target_user_id), 0),
        'document_chunks', COALESCE((
            SELECT COUNT(*) FROM document_chunks dc 
            JOIN documents d ON dc.document_id = d.id 
            WHERE d.user_id = target_user_id
        ), 0),
        'insights', COALESCE((SELECT COUNT(*) FROM insights WHERE user_id = target_user_id), 0),
        'metrics', COALESCE((SELECT COUNT(*) FROM metrics WHERE user_id = target_user_id), 0),
        'jtbds', COALESCE((SELECT COUNT(*) FROM jtbds WHERE user_id = target_user_id), 0),
        'hmws', COALESCE((SELECT COUNT(*) FROM hmws WHERE user_id = target_user_id), 0),
        'solutions', COALESCE((SELECT COUNT(*) FROM solutions WHERE user_id = target_user_id), 0),
        'total_file_size', COALESCE((SELECT SUM(file_size) FROM documents WHERE user_id = target_user_id), 0)
    );
$$;

-- Function to archive old data (for data lifecycle management)
CREATE OR REPLACE FUNCTION archive_old_content(
    days_old integer DEFAULT 365,
    dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
    cutoff_date timestamptz;
    documents_to_archive integer;
    result jsonb;
BEGIN
    cutoff_date := NOW() - (days_old || ' days')::interval;
    
    -- Count documents that would be archived
    SELECT COUNT(*) INTO documents_to_archive
    FROM documents 
    WHERE created_at < cutoff_date;
    
    IF NOT dry_run THEN
        -- Actually perform archiving (in this case, deletion)
        -- In production, you might move to an archive table instead
        DELETE FROM documents WHERE created_at < cutoff_date;
    END IF;
    
    result := jsonb_build_object(
        'cutoff_date', cutoff_date,
        'documents_affected', documents_to_archive,
        'dry_run', dry_run,
        'operation_timestamp', NOW()
    );
    
    RETURN result;
END;
$$;

-- Add helpful comments
COMMENT ON FUNCTION normalize_hmw_question IS 'Ensures HMW questions start with "How might we" prefix';
COMMENT ON FUNCTION calculate_priority_score IS 'Calculates priority score from impact/effort with multiple methods';
COMMENT ON FUNCTION get_fallback_metric_ids IS 'Returns metric IDs for user, falling back to default metric if needed';
COMMENT ON FUNCTION validate_relationship_ids IS 'Validates that relationship arrays contain valid IDs for the user';
COMMENT ON FUNCTION cleanup_orphaned_data IS 'Maintenance function to remove orphaned data';
COMMENT ON FUNCTION get_user_content_stats IS 'Returns comprehensive statistics for user content';
COMMENT ON FUNCTION archive_old_content IS 'Archive or delete old content based on age threshold';