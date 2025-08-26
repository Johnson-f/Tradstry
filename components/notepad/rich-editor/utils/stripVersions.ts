/**
 * Utility functions to handle version fields in Lexical editor content
 * Lexical requires version fields to reconstruct editor state properly
 */

/**
 * Strip version fields from content for database storage
 */
export function stripVersionsFromContent(content: any): any {
  if (!content || typeof content !== 'object') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(stripVersionsFromContent);
  }

  const cleaned: any = {};
  
  for (const [key, value] of Object.entries(content)) {
    // Skip version fields
    if (key === 'version') {
      continue;
    }
    
    // Recursively clean nested objects and arrays
    if (typeof value === 'object' && value !== null) {
      cleaned[key] = stripVersionsFromContent(value);
    } else {
      cleaned[key] = value;
    }
  }
  
  return cleaned;
}

/**
 * Add version fields back to content when loading from database
 * Lexical needs version: 1 on all nodes to properly parse content
 */
export function addVersionsToContent(content: any): any {
  if (!content || typeof content !== 'object') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(addVersionsToContent);
  }

  const restored: any = {};
  
  for (const [key, value] of Object.entries(content)) {
    // Recursively restore nested objects and arrays
    if (typeof value === 'object' && value !== null) {
      restored[key] = addVersionsToContent(value);
    } else {
      restored[key] = value;
    }
  }
  
  // Add version field if this looks like a Lexical node (has type property)
  if (restored.type) {
    restored.version = 1;
  }
  
  return restored;
}
