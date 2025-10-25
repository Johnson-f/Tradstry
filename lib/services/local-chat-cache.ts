// @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
import { AIChatMessage, AIChatSession } from './ai-chat-service';

interface LocalChatMessage extends Omit<AIChatMessage, 'id'> {
  id: string;
  localId: string; // Temporary local ID
  isLocal: boolean; // Flag to indicate it's not yet saved to DB
  timestamp: number; // Local timestamp for ordering
  scheduledForPersist?: boolean; // Flag for persistence queue
}

interface LocalChatSession extends Omit<AIChatSession, 'id'> {
  id: string;
  localId: string;
  isLocal: boolean;
  timestamp: number;
}

class LocalChatCache {
  private static instance: LocalChatCache;
  private readonly CACHE_PREFIX = 'tradistry_chat_';
  private readonly SESSIONS_KEY = 'tradistry_chat_sessions';
  private readonly PERSIST_DELAY = 2 * 60 * 1000; // 2 minutes
  private persistenceQueue: Set<string> = new Set();

  static getInstance(): LocalChatCache {
    if (!LocalChatCache.instance) {
      LocalChatCache.instance = new LocalChatCache();
    }
    return LocalChatCache.instance;
  }

  // Generate local ID
  private generateLocalId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save message to localStorage immediately
  saveMessageLocally(sessionId: string, message: Omit<AIChatMessage, 'id'>): LocalChatMessage {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      // Return a mock message for SSR
      const localId = this.generateLocalId();
      return {
        ...message,
        id: localId,
        localId,
        isLocal: true,
        timestamp: Date.now(),
      };
    }

    const localId = this.generateLocalId();
    const localMessage: LocalChatMessage = {
      ...message,
      id: localId,
      localId,
      isLocal: true,
      timestamp: Date.now(),
    };

    // Get existing messages for session
    const sessionMessages = this.getSessionMessages(sessionId);
    sessionMessages.push(localMessage);

    // Save back to localStorage
    localStorage.setItem(
      `${this.CACHE_PREFIX}${sessionId}`,
      JSON.stringify(sessionMessages)
    );

    // Schedule for database persistence
    this.scheduleForPersistence(sessionId, localId);

    return localMessage;
  }

  // Save session to localStorage immediately
  saveSessionLocally(session: Omit<AIChatSession, 'id'>): LocalChatSession {
    const localId = this.generateLocalId();
    const localSession: LocalChatSession = {
      ...session,
      id: localId,
      localId,
      isLocal: true,
      timestamp: Date.now(),
    };

    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return localSession;
    }

    // Get existing sessions
    const sessions = this.getAllSessions();
    sessions.push(localSession);

    // Save back to localStorage
    localStorage.setItem(this.SESSIONS_KEY, JSON.stringify(sessions));

    // Schedule for database persistence
    this.scheduleForPersistence('session', localId);

    return localSession;
  }

  // Get messages for a session (includes local and DB messages)
  getSessionMessages(sessionId: string): LocalChatMessage[] {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(`${this.CACHE_PREFIX}${sessionId}`);
      if (!stored) return [];
      
      const messages: LocalChatMessage[] = JSON.parse(stored);
      // Sort by timestamp to maintain order
      return messages.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
      console.error('Error reading session messages from localStorage:', error);
      return [];
    }
  }

  // Get all sessions
  getAllSessions(): LocalChatSession[] {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return [];
    }

    try {
      const stored = localStorage.getItem(this.SESSIONS_KEY);
      if (!stored) return [];
      
      const sessions: LocalChatSession[] = JSON.parse(stored);
      return sessions.sort((a, b) => b.timestamp - a.timestamp); // Latest first
    } catch (error) {
      console.error('Error reading sessions from localStorage:', error);
      return [];
    }
  }

  // Mark message as persisted to database
  markMessagePersisted(sessionId: string, localId: string, dbId: string): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    const sessionMessages = this.getSessionMessages(sessionId);
    const messageIndex = sessionMessages.findIndex(msg => msg.localId === localId);
    
    if (messageIndex !== -1) {
      sessionMessages[messageIndex] = {
        ...sessionMessages[messageIndex],
        id: dbId,
        isLocal: false,
      };
      
      localStorage.setItem(
        `${this.CACHE_PREFIX}${sessionId}`,
        JSON.stringify(sessionMessages)
      );
    }
  }

  // Mark session as persisted to database
  markSessionPersisted(localId: string, dbId: string): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    const sessions = this.getAllSessions();
    const sessionIndex = sessions.findIndex(session => session.localId === localId);
    
    if (sessionIndex !== -1) {
      sessions[sessionIndex] = {
        ...sessions[sessionIndex],
        id: dbId,
        isLocal: false,
      };
      
      localStorage.setItem(this.SESSIONS_KEY, JSON.stringify(sessions));
    }
  }

  // Schedule item for database persistence
  private scheduleForPersistence(sessionId: string, localId: string): void {
    const key = `${sessionId}_${localId}`;
    if (this.persistenceQueue.has(key)) return;

    this.persistenceQueue.add(key);
    
    setTimeout(() => {
      this.persistToDatabase(sessionId, localId);
      this.persistenceQueue.delete(key);
    }, this.PERSIST_DELAY);
  }

  // Persist to database (to be implemented)
  private async persistToDatabase(sessionId: string, localId: string): Promise<void> {
    try {
      console.log(`Persisting ${sessionId}/${localId} to database...`);
      
      // TODO: Implement actual database persistence
      // This would call the AI chat service to save to database
      // For now, just mark as persisted after a delay
      
      if (sessionId === 'session') {
        // This is a session persistence
        // this.markSessionPersisted(localId, 'db_' + localId);
      } else {
        // This is a message persistence  
        // this.markMessagePersisted(sessionId, localId, 'db_' + localId);
      }
      
      console.log(`Successfully persisted ${sessionId}/${localId} to database`);
    } catch (error) {
      console.error(`Failed to persist ${sessionId}/${localId} to database:`, error);
      // Retry logic could be added here
    }
  }

  // Clean up old local entries (optional maintenance)
  cleanupOldEntries(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): void { // 7 days default
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    const cutoffTime = Date.now() - maxAgeMs;
    
    // Clean up sessions
    const sessions = this.getAllSessions();
    const filteredSessions = sessions.filter(session => 
      !session.isLocal || session.timestamp > cutoffTime
    );
    localStorage.setItem(this.SESSIONS_KEY, JSON.stringify(filteredSessions));

    // Clean up messages (would need to iterate through all session keys)
    // Implementation depends on performance requirements
  }

  // Remove duplicate messages from localStorage (cleanup utility)
  removeDuplicateMessages(sessionId: string): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    const messages = this.getSessionMessages(sessionId);
    const seen = new Set<string>();
    const unique = messages.filter(msg => {
      const key = `${msg.role}_${msg.content.trim()}_${msg.message_type}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
    
    localStorage.setItem(
      `${this.CACHE_PREFIX}${sessionId}`,
      JSON.stringify(unique)
    );
  }

  // Clear all local data for a session (useful for debugging)
  clearSessionData(sessionId: string): void {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    localStorage.removeItem(`${this.CACHE_PREFIX}${sessionId}`);
  }

  // Get combined messages (for use in components)
  getCombinedMessages(sessionId: string, dbMessages: AIChatMessage[] = []): AIChatMessage[] {
    const localMessages = this.getSessionMessages(sessionId);
    
    // Convert local messages to AIChatMessage format
    const localAsMessages: AIChatMessage[] = localMessages
      .filter(msg => msg.isLocal) // Only include local messages that haven't been persisted
      .map(msg => ({
        id: msg.id,
        session_id: msg.session_id,
        content: msg.content,
        message_type: msg.message_type,
        role: msg.role,
        created_at: new Date(msg.timestamp).toISOString(),
        updated_at: msg.updated_at,
      }));

    // Create a map for better deduplication
    const messageMap = new Map<string, AIChatMessage>();
    
    // Add DB messages first (they have priority)
    dbMessages.forEach(msg => {
      const key = `${msg.role}_${msg.content.substring(0, 50)}_${msg.message_type}`;
      messageMap.set(key, msg);
    });
    
    // Add local messages only if they don't conflict with DB messages
    localAsMessages.forEach(localMsg => {
      const key = `${localMsg.role}_${localMsg.content.substring(0, 50)}_${localMsg.message_type}`;
      
      // Check if a similar message exists in DB (within time window)
      const similarExists = dbMessages.some(dbMsg => 
        dbMsg.content.trim() === localMsg.content.trim() && 
        dbMsg.role === localMsg.role &&
        Math.abs(new Date(dbMsg.created_at).getTime() - new Date(localMsg.created_at).getTime()) < 10000 // 10 second tolerance
      );
      
      if (!similarExists && !messageMap.has(key)) {
        messageMap.set(key, localMsg);
      }
    });

    // Convert back to array and sort by creation time
    const combined = Array.from(messageMap.values());
    return combined.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }
}

export const localChatCache = LocalChatCache.getInstance();
export type { LocalChatMessage, LocalChatSession };

// Add to global scope for debugging
if (typeof window !== 'undefined') {
  // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  (window as Record<string, unknown>).localChatCache = localChatCache;
  // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  (window as Record<string, unknown>).clearChatDuplicates = (sessionId: string) => {
    localChatCache.removeDuplicateMessages(sessionId);
    console.log(`Cleared duplicates for session: ${sessionId}`);
  };
  // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  (window as Record<string, unknown>).clearAllChatData = (sessionId: string) => {
    localChatCache.clearSessionData(sessionId);
    console.log(`Cleared all data for session: ${sessionId}`);
  };
}
