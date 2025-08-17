-- Seed default data for JTBD Assistant Platform
-- This includes the critical default metric for fallback scenarios when DSPy is unavailable

-- Insert the default fallback metric
-- This metric will be used when DSPy service is unavailable and no specific metrics are provided
-- Using a predictable UUID for consistent fallback behavior across environments
INSERT INTO metrics (
    id,
    user_id,
    name,
    description,
    current_value,
    target_value,
    unit,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid, -- System user ID
    'General Improvement',
    'Default metric for fallback scenarios when specific metrics are not available or DSPy service is down. Represents general business improvement goals.',
    0.0,
    100.0,
    'percentage',
    NOW(),
    NOW()
) ON CONFLICT (id) DO NOTHING; -- Prevent duplicate insertion

-- Create a system user entry (if not using Supabase Auth)
-- This is used for system-generated content and fallback scenarios
-- Note: This may not be needed if using Supabase Auth, but provides consistency
INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
) VALUES (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'system@jtbd-assistant.internal',
    crypt('system-only-account', gen_salt('bf')), -- This account cannot be used for login
    NOW(),
    NOW(),
    NOW(),
    '{"provider": "system", "providers": ["system"]}'::jsonb,
    '{"name": "System Account", "description": "Internal system account for default data"}'::jsonb,
    false,
    'authenticated'
) ON CONFLICT (id) DO NOTHING;

-- Alternatively, if using a simpler approach without auth.users table:
-- Just ensure we have a reference user_id for the default metric
-- This approach works better if you're not managing the auth.users table directly

-- Create a function to get or create the default metric ID
-- This ensures the fallback metric is always available
CREATE OR REPLACE FUNCTION get_default_metric_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT id FROM metrics 
    WHERE name = 'General Improvement' 
    AND user_id = '00000000-0000-0000-0000-000000000000'::uuid
    LIMIT 1;
$$;

-- Create a function to ensure default metric exists (idempotent)
CREATE OR REPLACE FUNCTION ensure_default_metric()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
    default_metric_id uuid;
BEGIN
    -- Try to get existing default metric
    SELECT get_default_metric_id() INTO default_metric_id;
    
    -- If not found, create it
    IF default_metric_id IS NULL THEN
        INSERT INTO metrics (
            id,
            user_id,
            name,
            description,
            current_value,
            target_value,
            unit
        ) VALUES (
            '00000000-0000-0000-0000-000000000001'::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid,
            'General Improvement',
            'Default metric for fallback scenarios when specific metrics are not available or DSPy service is down.',
            0.0,
            100.0,
            'percentage'
        ) RETURNING id INTO default_metric_id;
    END IF;
    
    RETURN default_metric_id;
END;
$$;

-- Insert some sample development data (can be removed in production)
-- This helps with testing and development workflows

-- Sample document for testing (only in development)
DO $$
BEGIN
    -- Only insert sample data if we're in a development environment
    -- Check if there are any existing documents to avoid polluting production
    IF NOT EXISTS (SELECT 1 FROM documents LIMIT 1) THEN
        
        -- Insert a sample document
        INSERT INTO documents (
            id,
            user_id,
            filename,
            content,
            content_hash,
            file_size,
            file_type
        ) VALUES (
            'sample-doc-1'::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid,
            'sample-customer-research.md',
            E'# Customer Research Summary\n\nCustomers are struggling with:\n1. Time-consuming manual processes\n2. Lack of real-time visibility\n3. Difficulty integrating systems\n\nKey insights:\n- 80% want automation\n- 65% need better reporting\n- 90% want mobile access',
            '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a', -- Sample hash
            285,
            'md'
        );
        
        -- Insert sample insights
        INSERT INTO insights (
            id,
            document_id,
            user_id,
            content,
            confidence_score,
            source_chunk_ids
        ) VALUES 
        (
            'sample-insight-1'::uuid,
            'sample-doc-1'::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid,
            'Customers prioritize automation over manual processes, with 80% expressing strong preference for automated workflows.',
            0.92,
            '{}'::uuid[]
        ),
        (
            'sample-insight-2'::uuid,
            'sample-doc-1'::uuid,
            '00000000-0000-0000-0000-000000000000'::uuid,
            'Real-time visibility and reporting are critical pain points, affecting 65% of users who need better dashboard capabilities.',
            0.88,
            '{}'::uuid[]
        );
        
        RAISE NOTICE 'Sample development data inserted successfully';
    ELSE
        RAISE NOTICE 'Skipping sample data insertion - documents already exist';
    END IF;
END $$;

-- Verify the default metric was created successfully
DO $$
DECLARE
    default_metric_exists boolean;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM metrics 
        WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
    ) INTO default_metric_exists;
    
    IF default_metric_exists THEN
        RAISE NOTICE 'Default fallback metric created successfully: %', get_default_metric_id();
    ELSE
        RAISE EXCEPTION 'Failed to create default fallback metric';
    END IF;
END $$;

-- Add comments
COMMENT ON FUNCTION get_default_metric_id IS 'Returns the UUID of the default fallback metric';
COMMENT ON FUNCTION ensure_default_metric IS 'Ensures the default fallback metric exists, creating it if necessary';