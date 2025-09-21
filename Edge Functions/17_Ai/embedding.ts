import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Type definitions
interface TradeData {
  id: string;
  user_id: string;
  [key: string]: any;
}

interface EmbeddingRequest {
  action: 'embed_trade_data' | 'search_embeddings';
  table_name?: string;
  record_id?: string;
  user_id?: string;
  query_text?: string;
  filters?: {
    symbol?: string;
    content_type?: string;
    source_tables?: string[];
    date_from?: string;
    date_to?: string;
    min_relevance_score?: number;
    similarity_threshold?: number;
    limit?: number;
  };
}

interface VoyagerEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    total_tokens: number;
  };
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const voyagerApiKey = Deno.env.get('VOYAGER_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Voyager AI Embeddings Configuration
const VOYAGER_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGER_MODEL = 'voyage-2'; // Using voyage-2 model (1024 dimensions)

/**
 * Generate embeddings using Voyager AI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    console.log(`Generating embedding for text (${text.length} chars)`);
    
    const response = await fetch(VOYAGER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${voyagerApiKey}`,
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGER_MODEL,
        input_type: 'document' // Use 'document' for storing, 'query' for searching
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Voyager API error: ${response.status} - ${errorText}`);
      throw new Error(`Voyager API error: ${response.status} - ${errorText}`);
    }

    const data: VoyagerEmbeddingResponse = await response.json();
    
    if (!data.data || data.data.length === 0) {
      throw new Error('No embedding data received from Voyager AI');
    }

    console.log(`Generated embedding with ${data.data[0].embedding.length} dimensions`);
    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate query embedding (optimized for search)
 */
async function generateQueryEmbedding(text: string): Promise<number[]> {
  try {
    console.log(`Generating query embedding for: "${text}"`);
    
    const response = await fetch(VOYAGER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${voyagerApiKey}`,
      },
      body: JSON.stringify({
        input: [text],
        model: VOYAGER_MODEL,
        input_type: 'query' // Optimized for search queries
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Voyager API error: ${response.status} - ${errorText}`);
      throw new Error(`Voyager API error: ${response.status} - ${errorText}`);
    }

    const data: VoyagerEmbeddingResponse = await response.json();
    
    if (!data.data || data.data.length === 0) {
      throw new Error('No embedding data received from Voyager AI');
    }

    return data.data[0].embedding;
  } catch (error) {
    console.error('Error generating query embedding:', error);
    throw error;
  }
}

/**
 * Extract meaningful content from trade data for embedding
 */
function extractTradeContent(tableName: string, data: TradeData): {
  content: string;
  metadata: any;
  symbol?: string;
  tradeDate?: string;
  contentType: string;
} {
  let content = '';
  let metadata: any = {};
  let symbol: string | undefined;
  let tradeDate: string | undefined;
  let contentType = 'trade_data';

  switch (tableName) {
    case 'stocks':
      content = `Stock trade: ${data.symbol} - ${data.trade_type} ${data.number_shares} shares at $${data.entry_price}`;
      if (data.exit_price) content += ` (sold at $${data.exit_price})`;
      if (data.stop_loss) content += `. Stop loss: $${data.stop_loss}`;
      if (data.take_profit) content += `. Take profit: $${data.take_profit}`;
      if (data.notes) content += `. Notes: ${data.notes}`;
      
      metadata = {
        symbol: data.symbol,
        trade_type: data.trade_type,
        entry_price: data.entry_price,
        exit_price: data.exit_price,
        number_shares: data.number_shares,
        stop_loss: data.stop_loss,
        take_profit: data.take_profit,
        order_type: data.order_type
      };
      symbol = data.symbol;
      tradeDate = data.entry_date || data.created_at;
      contentType = 'stock_trade';
      break;

    case 'options':
      content = `Options trade: ${data.symbol} ${data.expiry_date} ${data.strike_price}${data.option_type} - ${data.trade_type}`;
      if (data.premium) content += ` Premium: $${data.premium}`;
      if (data.quantity) content += ` Quantity: ${data.quantity}`;
      if (data.notes) content += `. Notes: ${data.notes}`;
      
      metadata = {
        symbol: data.symbol,
        option_type: data.option_type,
        strike_price: data.strike_price,
        expiry_date: data.expiry_date,
        premium: data.premium,
        quantity: data.quantity,
        trade_type: data.trade_type
      };
      symbol = data.symbol;
      tradeDate = data.entry_date || data.created_at;
      contentType = 'options_trade';
      break;

    case 'setups':
      content = `Trading setup: ${data.name || 'Unnamed setup'}`;
      if (data.description) content += ` - ${data.description}`;
      if (data.entry_criteria) content += ` Entry: ${data.entry_criteria}`;
      if (data.exit_criteria) content += ` Exit: ${data.exit_criteria}`;
      
      metadata = {
        name: data.name,
        description: data.description,
        entry_criteria: data.entry_criteria,
        exit_criteria: data.exit_criteria,
        risk_level: data.risk_level
      };
      contentType = 'trading_setup';
      tradeDate = data.created_at;
      break;

    case 'notes':
      // Handle rich text content (JSONB format)
      let noteText = data.title || 'Untitled Note';
      if (data.content && typeof data.content === 'object') {
        // Extract text from rich text JSON structure
        noteText += ' - ' + extractTextFromRichContent(data.content);
      } else if (data.content && typeof data.content === 'string') {
        noteText += ' - ' + data.content;
      }
      content = `Trading note: ${noteText}`;
      
      metadata = {
        title: data.title,
        folder_id: data.folder_id,
        is_favorite: data.is_favorite,
        content_type: 'note'
      };
      contentType = 'trading_note';
      tradeDate = data.created_at;
      break;

    case 'tags':
      content = `Tag: ${data.name}`;
      if (data.description) content += ` - ${data.description}`;
      
      metadata = {
        name: data.name,
        description: data.description,
        color: data.color
      };
      contentType = 'tag';
      tradeDate = data.created_at;
      break;

    case 'templates':
      content = `Template: ${data.name || 'Unnamed template'}`;
      if (data.content) content += ` - ${data.content}`;
      
      metadata = {
        name: data.name,
        content: data.content,
        category: data.category
      };
      contentType = 'template';
      tradeDate = data.created_at;
      break;

    case 'trade_notes':
      content = `Trade note: ${data.content || data.note}`;
      if (data.tags) content += ` Tags: ${data.tags}`;
      
      metadata = {
        content: data.content || data.note,
        tags: data.tags,
        trade_id: data.trade_id
      };
      symbol = data.symbol;
      tradeDate = data.created_at;
      contentType = 'trade_note';
      break;

    default:
      // Generic fallback for any table
      content = `${tableName} record`;
      if (data.name) content += `: ${data.name}`;
      if (data.title) content += `: ${data.title}`;
      if (data.description) content += ` - ${data.description}`;
      if (data.content) content += ` - ${data.content}`;
      
      metadata = { ...data };
      delete metadata.id;
      delete metadata.user_id;
      delete metadata.created_at;
      delete metadata.updated_at;
      
      contentType = tableName;
      tradeDate = data.created_at;
  }

  return { content, metadata, symbol, tradeDate, contentType };
}

/**
 * Extract plain text from rich text JSON content (Lexical format)
 */
function extractTextFromRichContent(content: any): string {
  if (!content || typeof content !== 'object') return '';
  
  let text = '';
  
  function traverseNodes(node: any): void {
    if (node.text) {
      text += node.text + ' ';
    }
    
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(traverseNodes);
    }
  }
  
  if (content.root && content.root.children) {
    content.root.children.forEach(traverseNodes);
  }
  
  return text.trim();
}

/**
 * Process and embed trade data from database changes
 */
async function processTradeDataEmbedding(tableName: string, recordId: string, userId: string) {
  try {
    console.log(`Processing embedding for ${tableName}:${recordId} (user: ${userId})`);

    // Fetch the record data
    const { data: recordData, error: fetchError } = await supabase
      .from(tableName)
      .select('*')
      .eq('id', recordId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error(`Failed to fetch record: ${fetchError.message}`);
      throw new Error(`Failed to fetch record: ${fetchError.message}`);
    }

    if (!recordData) {
      console.log(`No record found for ${tableName}:${recordId}`);
      return { success: false, error: 'Record not found' };
    }

    // Extract content for embedding
    const { content, metadata, symbol, tradeDate, contentType } = extractTradeContent(tableName, recordData);

    if (!content || content.trim().length < 10) {
      console.log(`Content too short for embedding: "${content}"`);
      return { success: false, error: 'Content too short for meaningful embedding' };
    }

    console.log(`Extracted content: "${content.substring(0, 100)}..."`);

    // Generate embedding
    const embedding = await generateEmbedding(content);

    // Convert embedding array to proper vector format for PostgreSQL
    const embeddingVector = `[${embedding.join(',')}]`;

    // Store embedding using the database function
    const { data: embeddingResult, error: embeddingError } = await supabase
      .rpc('upsert_trade_embedding', {
        p_user_id: userId,
        p_source_table: tableName,
        p_source_id: recordId,
        p_content_text: content,
        p_embedding_vector: embeddingVector,
        p_metadata: metadata,
        p_symbol: symbol || null,
        p_trade_date: tradeDate || null,
        p_content_type: contentType,
        p_relevance_score: 1.0
      });

    if (embeddingError) {
      console.error(`Failed to store embedding: ${embeddingError.message}`);
      throw new Error(`Failed to store embedding: ${embeddingError.message}`);
    }

    console.log(`Successfully stored embedding with ID: ${embeddingResult}`);

    return {
      success: true,
      embedding_id: embeddingResult,
      content_length: content.length,
      content_type: contentType,
      symbol: symbol,
      content_preview: content.substring(0, 100) + (content.length > 100 ? '...' : '')
    };

  } catch (error) {
    console.error(`Error processing embedding for ${tableName}:${recordId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Search embeddings for similar content
 */
async function searchSimilarEmbeddings(queryText: string, userId: string, filters: any = {}) {
  try {
    console.log(`Searching embeddings for user ${userId}:`, queryText);

    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(queryText);
    
    // Convert embedding array to proper vector format
    const queryVector = `[${queryEmbedding.join(',')}]`;

    // Search using the database function
    const { data: searchResults, error: searchError } = await supabase
      .rpc('search_trade_embeddings_by_similarity', {
        p_query_vector: queryVector,
        p_user_id: userId,
        p_symbol: filters.symbol || null,
        p_content_type: filters.content_type || null,
        p_source_tables: filters.source_tables || null,
        p_date_from: filters.date_from || null,
        p_date_to: filters.date_to || null,
        p_min_relevance_score: filters.min_relevance_score || 0.0,
        p_similarity_threshold: filters.similarity_threshold || 0.7,
        p_limit: filters.limit || 10
      });

    if (searchError) {
      console.error(`Search failed: ${searchError.message}`);
      throw new Error(`Search failed: ${searchError.message}`);
    }

    console.log(`Found ${searchResults?.length || 0} similar embeddings`);

    return {
      success: true,
      results: searchResults || [],
      query: queryText,
      result_count: searchResults?.length || 0,
      filters_applied: filters
    };

  } catch (error) {
    console.error('Error searching embeddings:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Parse request body with better error handling
 */
async function parseRequestBody(req: Request): Promise<any> {
  const contentType = req.headers.get('content-type') || '';
  console.log('Content-Type:', contentType);

  try {
    // Handle different content types
    if (contentType.includes('application/json')) {
      const text = await req.text();
      console.log('Raw JSON text:', text);
      
      if (!text || text.trim() === '') {
        throw new Error('Empty request body');
      }
      
      return JSON.parse(text);
    } 
    
    // Handle form data
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      const obj: any = {};
      for (const [key, value] of formData.entries()) {
        obj[key] = value;
      }
      console.log('Parsed form data:', obj);
      return obj;
    }
    
    // Handle multipart form data
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const obj: any = {};
      for (const [key, value] of formData.entries()) {
        obj[key] = value;
      }
      console.log('Parsed multipart data:', obj);
      return obj;
    }
    
    // Default: try to parse as JSON
    const text = await req.text();
    console.log('Raw text (no content-type):', text);
    
    if (!text || text.trim() === '') {
      throw new Error('Empty request body');
    }
    
    // Try to parse as JSON first
    try {
      return JSON.parse(text);
    } catch (jsonError) {
      console.error('Failed to parse as JSON:', jsonError);
      
      // If it looks like URL-encoded data, try parsing it
      if (text.includes('=') && text.includes('&')) {
        const params = new URLSearchParams(text);
        const obj: any = {};
        for (const [key, value] of params.entries()) {
          obj[key] = value;
        }
        console.log('Parsed as URL params:', obj);
        return obj;
      }
      
      throw new Error(`Could not parse request body. Content-Type: ${contentType}, Body: ${text.substring(0, 100)}`);
    }
    
  } catch (error) {
    console.error('Error parsing request body:', error);
    throw error;
  }
}

/**
 * Main request handler
 */
serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  };

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: `Method ${req.method} not allowed. Use POST.`,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405
      }
    );
  }

  try {
    // Log request details
    console.log('=== NEW REQUEST ===');
    console.log('Request method:', req.method);
    console.log('Request URL:', req.url);
    console.log('Request headers:', Object.fromEntries(req.headers.entries()));

    // Parse request body with improved handling
    let parsedBody: any;
    
    try {
      parsedBody = await parseRequestBody(req);
      console.log('Successfully parsed request body:', JSON.stringify(parsedBody, null, 2));
    } catch (parseError) {
      console.error('Request body parsing failed:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Failed to parse request body: ${parseError.message}`,
          example: {
            action: 'embed_trade_data',
            table_name: 'stocks',
            record_id: 'uuid',
            user_id: 'uuid'
          },
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Check if parsed body is valid
    if (!parsedBody || typeof parsedBody !== 'object') {
      console.error('Parsed body is not a valid object:', { parsedBody, type: typeof parsedBody });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Request body must be a valid JSON object',
          received: parsedBody,
          received_type: typeof parsedBody,
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Extract and validate action
    const action = parsedBody.action;
    console.log('Extracted action:', { action, type: typeof action, value: JSON.stringify(action) });

    // Validate required action parameter
    if (!action || typeof action !== 'string' || action.trim() === '') {
      console.error('Action validation failed:', { 
        action, 
        type: typeof action, 
        hasProperty: parsedBody.hasOwnProperty('action'),
        keys: Object.keys(parsedBody)
      });
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Action is required and must be a non-empty string',
          received_action: action,
          received_type: typeof action,
          received_body_keys: Object.keys(parsedBody),
          valid_actions: ['embed_trade_data', 'search_embeddings'],
          example: {
            action: 'embed_trade_data',
            table_name: 'stocks',
            record_id: 'uuid',
            user_id: 'uuid'
          },
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    const validActions = ['embed_trade_data', 'search_embeddings'];
    if (!validActions.includes(action)) {
      console.error('Invalid action received:', action);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Invalid action: "${action}". Valid actions: ${validActions.join(', ')}`,
          received_action: action,
          timestamp: new Date().toISOString()
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    console.log(`Processing valid action: ${action}`);

    // Extract other parameters
    const table_name = parsedBody.table_name;
    const record_id = parsedBody.record_id;
    const user_id = parsedBody.user_id;
    const query_text = parsedBody.query_text;
    const filters = parsedBody.filters;

    let result;

    switch (action) {
      case 'embed_trade_data':
        // Validate required parameters for embedding
        if (!table_name || !record_id || !user_id) {
          console.error('Missing required parameters for embed_trade_data:', {
            table_name,
            record_id,
            user_id
          });
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'table_name, record_id, and user_id are required for embedding action',
              received_params: { table_name, record_id, user_id },
              timestamp: new Date().toISOString()
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400
            }
          );
        }
        console.log(`Embedding trade data: ${table_name}:${record_id} for user ${user_id}`);
        result = await processTradeDataEmbedding(table_name, record_id, user_id);
        break;

      case 'search_embeddings':
        // Validate required parameters for search
        if (!query_text || !user_id) {
          console.error('Missing required parameters for search_embeddings:', {
            query_text,
            user_id
          });
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'query_text and user_id are required for search action',
              received_params: { query_text, user_id },
              timestamp: new Date().toISOString()
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400
            }
          );
        }
        console.log(`Searching embeddings: "${query_text}" for user ${user_id}`);
        result = await searchSimilarEmbeddings(query_text, user_id, filters || {});
        break;

      default:
        console.error('This should not happen - unknown action after validation:', action);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: `Unexpected error: action validated but not handled: ${action}`,
            timestamp: new Date().toISOString()
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
          }
        );
    }

    console.log('Operation result:', result.success ? 'SUCCESS' : 'FAILED');
    
    return new Response(
      JSON.stringify({
        ...result,
        timestamp: new Date().toISOString(),
        action: action
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: result.success ? 200 : 400
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        timestamp: new Date().toISOString(),
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});