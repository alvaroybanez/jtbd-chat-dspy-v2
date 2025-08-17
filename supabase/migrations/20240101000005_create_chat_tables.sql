-- Create chat tables for JTBD Assistant Platform
-- Stores conversation history and chat sessions

-- Chat sessions table
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    
    -- Chat session metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,
    
    -- Chat configuration and state
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    message_count INTEGER NOT NULL DEFAULT 0,
    
    -- Context tracking - what documents/insights/jtbds are selected for this chat
    selected_document_ids UUID[] NOT NULL DEFAULT '{}',
    selected_insight_ids UUID[] NOT NULL DEFAULT '{}', 
    selected_jtbd_ids UUID[] NOT NULL DEFAULT '{}',
    selected_metric_ids UUID[] NOT NULL DEFAULT '{}',
    
    -- Token usage tracking
    total_tokens_used INTEGER NOT NULL DEFAULT 0,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- Chat messages table  
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    
    -- Message content
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    
    -- Message metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Processing information
    intent TEXT, -- detected intent (generate_hmw, create_solutions, etc.)
    processing_time_ms INTEGER, -- how long this message took to process
    tokens_used INTEGER NOT NULL DEFAULT 0,
    
    -- Context used for this message
    context_document_chunks UUID[], -- which document chunks were retrieved
    context_insights UUID[], -- which insights were used
    context_jtbds UUID[], -- which JTBDs were used
    context_metrics UUID[], -- which metrics were referenced
    
    -- AI generation metadata
    model_used TEXT, -- which AI model was used
    temperature DECIMAL(3,2), -- temperature setting used
    
    -- Error tracking
    error_code TEXT, -- if message failed, error code
    error_message TEXT, -- human readable error
    
    -- Additional metadata
    metadata JSONB NOT NULL DEFAULT '{}'
);

-- Update chat updated_at and last_message_at when messages are added
CREATE OR REPLACE FUNCTION update_chat_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chats 
    SET 
        updated_at = NOW(),
        last_message_at = NOW(),
        message_count = message_count + 1,
        total_tokens_used = total_tokens_used + COALESCE(NEW.tokens_used, 0)
    WHERE id = NEW.chat_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update chat when message is inserted
CREATE TRIGGER trigger_update_chat_on_message
    AFTER INSERT ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_on_message();

-- Update chat message count when messages are deleted
CREATE OR REPLACE FUNCTION update_chat_on_message_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE chats 
    SET 
        updated_at = NOW(),
        message_count = message_count - 1,
        total_tokens_used = total_tokens_used - COALESCE(OLD.tokens_used, 0)
    WHERE id = OLD.chat_id;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update chat when message is deleted
CREATE TRIGGER trigger_update_chat_on_message_delete
    AFTER DELETE ON chat_messages
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_on_message_delete();

-- RLS (Row Level Security) policies
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only access their own chats
CREATE POLICY "Users can view their own chats" ON chats
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chats" ON chats
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chats" ON chats
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own chats" ON chats
    FOR DELETE USING (auth.uid() = user_id);

-- Users can only access messages from their own chats
CREATE POLICY "Users can view messages from their own chats" ON chat_messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM chats 
            WHERE chats.id = chat_messages.chat_id 
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert messages to their own chats" ON chat_messages
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM chats 
            WHERE chats.id = chat_messages.chat_id 
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update messages in their own chats" ON chat_messages
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM chats 
            WHERE chats.id = chat_messages.chat_id 
            AND chats.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages from their own chats" ON chat_messages
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM chats 
            WHERE chats.id = chat_messages.chat_id 
            AND chats.user_id = auth.uid()
        )
    );

-- Add comments
COMMENT ON TABLE chats IS 'Chat sessions with context tracking and metadata';
COMMENT ON TABLE chat_messages IS 'Individual messages within chat sessions with processing metadata';
COMMENT ON COLUMN chats.selected_document_ids IS 'Documents selected as context for this chat session';
COMMENT ON COLUMN chats.selected_insight_ids IS 'Insights selected as context for this chat session';
COMMENT ON COLUMN chats.selected_jtbd_ids IS 'JTBDs selected as context for this chat session';
COMMENT ON COLUMN chats.selected_metric_ids IS 'Metrics selected as context for this chat session';
COMMENT ON COLUMN chat_messages.intent IS 'Detected intent: generate_hmw, create_solutions, retrieve_insights, etc.';
COMMENT ON COLUMN chat_messages.context_document_chunks IS 'Document chunks retrieved via vector search for this message';