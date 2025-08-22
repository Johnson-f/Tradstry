-- Templates table with RLS
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    content JSONB NOT NULL DEFAULT '{"root": {"children": []}}'::jsonb,
    is_system BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, name) DEFERRABLE
);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON public.templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_is_system ON public.templates(is_system);

-- RLS Policies
-- Users can view system templates and their own templates
CREATE POLICY "Users can view system templates and their own" 
ON public.templates FOR SELECT 
USING (is_system = true OR user_id = auth.uid());

-- Users can insert their own templates
CREATE POLICY "Users can insert their own templates"
ON public.templates FOR INSERT
WITH CHECK (user_id = auth.uid() AND is_system = false);

-- Users can update their own templates and system templates (but can't change is_system flag)
CREATE POLICY "Users can update their own templates"
ON public.templates FOR UPDATE
USING (user_id = auth.uid() OR is_system = true)
WITH CHECK (
    (user_id = auth.uid() AND is_system = false) OR
    (is_system = true AND user_id IS NULL)
);

-- Users can only delete their own non-system templates
CREATE POLICY "Users can delete their own templates"
ON public.templates FOR DELETE
USING (user_id = auth.uid() AND is_system = false);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_templates_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to create a new template
CREATE OR REPLACE FUNCTION create_template(
    p_name TEXT,
    p_description TEXT DEFAULT NULL,
    p_content JSONB DEFAULT '{"root": {"children": []}}'::jsonb
) RETURNS UUID 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_template_id UUID;
BEGIN
    INSERT INTO public.templates (
        user_id,
        name,
        description,
        content
    ) VALUES (
        auth.uid(),
        p_name,
        p_description,
        p_content
    )
    RETURNING id INTO v_template_id;
    
    RETURN v_template_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating template: %', SQLERRM;
END;
$$;

-- Function to update a template
CREATE OR REPLACE FUNCTION update_template(
    p_template_id UUID,
    p_name TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_content JSONB DEFAULT NULL
) RETURNS BOOLEAN 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE public.templates
    SET 
        name = COALESCE(p_name, name),
        description = COALESCE(p_description, description),
        content = COALESCE(p_content, content)
    WHERE id = p_template_id
    AND (user_id = auth.uid() OR is_system = true);
    
    RETURN FOUND;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error updating template: %', SQLERRM;
END;
$$;

-- Function to delete a template (only user's own non-system templates)
CREATE OR REPLACE FUNCTION delete_template(p_template_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM public.templates
    WHERE id = p_template_id
    AND user_id = auth.uid()
    AND is_system = false;
    
    RETURN FOUND;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error deleting template: %', SQLERRM;
END;
$$;

-- Function to get all templates (user's templates + system templates)
CREATE OR REPLACE FUNCTION get_templates()
RETURNS TABLE (
    id UUID,
    user_id UUID,
    name TEXT,
    description TEXT,
    content JSONB,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT 
        id,
        user_id,
        name,
        description,
        content,
        is_system,
        created_at,
        updated_at
    FROM public.templates
    WHERE user_id = auth.uid() OR is_system = true
    ORDER BY is_system DESC, updated_at DESC;
$$;

-- Function to get a single template by ID
CREATE OR REPLACE FUNCTION get_template(p_template_id UUID)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    name TEXT,
    description TEXT,
    content JSONB,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) 
LANGUAGE sql SECURITY DEFINER AS $$
    SELECT 
        id,
        user_id,
        name,
        description,
        content,
        is_system,
        created_at,
        updated_at
    FROM public.templates
    WHERE id = p_template_id
    AND (user_id = auth.uid() OR is_system = true);
$$;

-- Function to create system templates (for admin use only)
CREATE OR REPLACE FUNCTION create_system_template(
    p_name TEXT,
    p_description TEXT,
    p_content JSONB DEFAULT '{"root": {"children": []}}'::jsonb
) RETURNS UUID 
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_template_id UUID;
BEGIN
    -- Only allow system templates to be created by superuser
    IF current_user != 'postgres' THEN
        RAISE EXCEPTION 'Only system administrators can create system templates';
    END IF;
    
    INSERT INTO public.templates (
        name,
        description,
        content,
        is_system
    ) VALUES (
        p_name,
        p_description,
        p_content,
        true
    )
    RETURNING id INTO v_template_id;
    
    RETURN v_template_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating system template: %', SQLERRM;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT EXECUTE ON FUNCTION create_template(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_template(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_template(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_templates() TO authenticated;
GRANT EXECUTE ON FUNCTION get_template(UUID) TO authenticated;



SELECT create_system_template(
    'Market Research',
    'Template for comprehensive market analysis and research notes',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Market Research"}]}, {"type": "paragraph", "children": [{"text": "Research Date: "}]}, {"type": "paragraph", "children": [{"text": "Market Focus: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Macro Environment Analysis"}]}, {"type": "paragraph", "children": [{"text": "GDP Growth: "}]}, {"type": "paragraph", "children": [{"text": "Inflation Rate: "}]}, {"type": "paragraph", "children": [{"text": "Interest Rates: "}]}, {"type": "paragraph", "children": [{"text": "Central Bank Policy: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Market Sentiment"}]}, {"type": "paragraph", "children": [{"text": "VIX Level: "}]}, {"type": "paragraph", "children": [{"text": "Put/Call Ratio: "}]}, {"type": "paragraph", "children": [{"text": "Institutional Flow: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Sector Analysis"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Sector"}]}, {"type": "table-cell", "children": [{"text": "Performance"}]}, {"type": "table-cell", "children": [{"text": "Outlook"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Technical Analysis"}]}, {"type": "paragraph", "children": [{"text": "S&P 500 Levels - Support: ___ | Resistance: ___"}]}, {"type": "paragraph", "children": [{"text": "Market Breadth: "}]}, {"type": "paragraph", "children": [{"text": "Key Patterns: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Trading Implications"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "High Probability Setups: "}]}, {"type": "list-item", "children": [{"text": "Setups to Avoid: "}]}, {"type": "list-item", "children": [{"text": "Risk Level: "}]}, {"type": "list-item", "children": [{"text": "Position Sizing: "}]}]}]}}$json$
);

SELECT create_system_template(
    'Trade Exit Review',
    'Template for analyzing completed trades and lessons learned',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Trade Exit Review"}]}, {"type": "paragraph", "children": [{"text": "Symbol: "}]}, {"type": "paragraph", "children": [{"text": "Exit Date: "}]}, {"type": "paragraph", "children": [{"text": "Exit Time: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Trade Results"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Exit Price"}]}, {"type": "table-cell", "children": [{"text": "P&L ($)"}]}, {"type": "table-cell", "children": [{"text": "P&L (%)"}]}, {"type": "table-cell", "children": [{"text": "R Multiple"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "paragraph", "children": [{"text": "Reason for Exit: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Trade Analysis"}]}, {"type": "paragraph", "children": [{"text": "What went right: "}]}, {"type": "paragraph", "children": [{"text": "What went wrong: "}]}, {"type": "paragraph", "children": [{"text": "Execution quality (1-10): "}]}, {"type": "heading", "level": 2, "children": [{"text": "Lessons Learned"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Key insight: "}]}, {"type": "list-item", "children": [{"text": "Rule to follow: "}]}, {"type": "list-item", "children": [{"text": "Mistake to avoid: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Emotional Review"}]}, {"type": "paragraph", "children": [{"text": "Emotions during trade: "}]}, {"type": "paragraph", "children": [{"text": "Stress level (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Decision quality: "}]}]}}$json$
);

SELECT create_system_template(
    'Weekly Performance Review',
    'Template for weekly trading performance analysis and planning',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Weekly Performance Review"}]}, {"type": "paragraph", "children": [{"text": "Week of: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Performance Summary"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Total Trades"}]}, {"type": "table-cell", "children": [{"text": "Winners"}]}, {"type": "table-cell", "children": [{"text": "Losers"}]}, {"type": "table-cell", "children": [{"text": "Win Rate"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "paragraph", "children": [{"text": "Weekly P&L: $"}]}, {"type": "paragraph", "children": [{"text": "Best Trade: "}]}, {"type": "paragraph", "children": [{"text": "Worst Trade: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Strategy Performance"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Most successful setup: "}]}, {"type": "list-item", "children": [{"text": "Least successful setup: "}]}, {"type": "list-item", "children": [{"text": "Market conditions: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Rule Adherence"}]}, {"type": "paragraph", "children": [{"text": "Risk management score (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Discipline score (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Major violations: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Goals for Next Week"}]}, {"type": "numbered-list", "children": [{"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Watchlist"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}, {"type": "list-item", "children": [{"text": ""}]}]}]}}$json$
);

SELECT create_system_template(
    'Earnings Event Analysis',
    'Template for tracking earnings plays and event-driven trades',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Earnings Event Analysis"}]}, {"type": "paragraph", "children": [{"text": "Company: "}]}, {"type": "paragraph", "children": [{"text": "Earnings Date: "}]}, {"type": "paragraph", "children": [{"text": "Quarter: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Pre-Earnings Setup"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Consensus EPS"}]}, {"type": "table-cell", "children": [{"text": "Revenue Est."}]}, {"type": "table-cell", "children": [{"text": "Expected Move"}]}, {"type": "table-cell", "children": [{"text": "IV Rank"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Trade Strategy"}]}, {"type": "paragraph", "children": [{"text": "Strategy Type: "}]}, {"type": "paragraph", "children": [{"text": "Entry Price: "}]}, {"type": "paragraph", "children": [{"text": "Position Size: "}]}, {"type": "paragraph", "children": [{"text": "Risk Amount: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Key Levels"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Support: "}]}, {"type": "list-item", "children": [{"text": "Resistance: "}]}, {"type": "list-item", "children": [{"text": "Breakout level: "}]}, {"type": "list-item", "children": [{"text": "Breakdown level: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Results"}]}, {"type": "paragraph", "children": [{"text": "Actual EPS: "}]}, {"type": "paragraph", "children": [{"text": "Actual Revenue: "}]}, {"type": "paragraph", "children": [{"text": "Initial Reaction: "}]}, {"type": "paragraph", "children": [{"text": "Final P&L: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Post-Analysis"}]}, {"type": "paragraph", "children": [{"text": "What drove the move: "}]}, {"type": "paragraph", "children": [{"text": "Lessons learned: "}]}, {"type": "paragraph", "children": [{"text": "Future improvements: "}]}]}}$json$
);

SELECT create_system_template(
    'Psychology Check-in',
    'Template for monitoring trading psychology and emotional state',
    $json${"root": {"children": [{"type": "heading", "level": 1, "children": [{"text": "Psychology Check-in"}]}, {"type": "paragraph", "children": [{"text": "Date: "}]}, {"type": "paragraph", "children": [{"text": "Time: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Mental State Assessment"}]}, {"type": "table", "children": [{"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "Confidence"}]}, {"type": "table-cell", "children": [{"text": "Stress Level"}]}, {"type": "table-cell", "children": [{"text": "Focus"}]}, {"type": "table-cell", "children": [{"text": "Energy"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": "(1-10)"}]}, {"type": "table-cell", "children": [{"text": "(1-10)"}]}, {"type": "table-cell", "children": [{"text": "(1-10)"}]}, {"type": "table-cell", "children": [{"text": "(1-10)"}]}]}, {"type": "table-row", "children": [{"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}, {"type": "table-cell", "children": [{"text": ""}]}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Recent Performance Impact"}]}, {"type": "paragraph", "children": [{"text": "Recent wins affecting mindset: "}]}, {"type": "paragraph", "children": [{"text": "Recent losses affecting mindset: "}]}, {"type": "paragraph", "children": [{"text": "Account drawdown concerns: "}]}, {"type": "heading", "level": 2, "children": [{"text": "External Factors"}]}, {"type": "bulleted-list", "children": [{"type": "list-item", "children": [{"text": "Life stress level: "}]}, {"type": "list-item", "children": [{"text": "Sleep quality: "}]}, {"type": "list-item", "children": [{"text": "Financial pressure: "}]}, {"type": "list-item", "children": [{"text": "Health status: "}]}]}, {"type": "heading", "level": 2, "children": [{"text": "Trading Rule Adherence"}]}, {"type": "paragraph", "children": [{"text": "Temptation to break rules (1-10): "}]}, {"type": "paragraph", "children": [{"text": "Most challenging rule: "}]}, {"type": "paragraph", "children": [{"text": "Emotional triggers today: "}]}, {"type": "heading", "level": 2, "children": [{"text": "Action Plan"}]}, {"type": "paragraph", "children": [{"text": "Position sizing adjustment needed: "}]}, {"type": "paragraph", "children": [{"text": "Mental exercises to do: "}]}, {"type": "paragraph", "children": [{"text": "Should I trade today? Why: "}]}]}}$json$
);