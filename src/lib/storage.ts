
/**
 * Local Storage Logic for KNEWai
 * Manages sessions, messages, settings, and rate limiting logs in the browser.
 */

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: number;
}

export interface Session {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
}

export interface UserSettings {
  aiTone: string;
  customPersonality: string;
  userProfile: string;
}

const STORAGE_KEYS = {
  SESSIONS: 'knewai_sessions',
  MESSAGES_PREFIX: 'knewai_msgs_',
  SETTINGS: 'knewai_settings',
  USAGE_LOGS: 'knewai_usage_logs'
};

export const Storage = {
  // Sessions
  getSessions: (): Session[] => {
    const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return data ? JSON.parse(data) : [];
  },
  
  saveSession: (session: Session) => {
    const sessions = Storage.getSessions();
    const index = sessions.findIndex(s => s.id === session.id);
    if (index !== -1) {
      sessions[index] = session;
    } else {
      sessions.unshift(session);
    }
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  },

  deleteSession: (id: string) => {
    const sessions = Storage.getSessions().filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    localStorage.removeItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${id}`);
  },

  // Messages
  getMessages: (sessionId: string): Message[] => {
    const data = localStorage.getItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${sessionId}`);
    return data ? JSON.parse(data) : [];
  },

  saveMessage: (sessionId: string, message: Message) => {
    const msgs = Storage.getMessages(sessionId);
    msgs.push(message);
    localStorage.setItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${sessionId}`, JSON.stringify(msgs));
    
    // Update session timestamp
    const sessions = Storage.getSessions();
    const sIdx = sessions.findIndex(s => s.id === sessionId);
    if (sIdx !== -1) {
      sessions[sIdx].updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    }
  },

  // Settings
  getSettings: (): UserSettings => {
    const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return data ? JSON.parse(data) : { aiTone: 'Helpful', customPersonality: '', userProfile: '' };
  },

  saveSettings: (settings: UserSettings) => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  },

  // Rate Limiting
  getUsageLogs: () => {
    const data = localStorage.getItem(STORAGE_KEYS.USAGE_LOGS);
    return data ? JSON.parse(data) : [];
  },

  addUsageLog: (mode: 'thinking' | 'max') => {
    const logs = Storage.getUsageLogs();
    logs.push({ mode, timestamp: Date.now() });
    localStorage.setItem(STORAGE_KEYS.USAGE_LOGS, JSON.stringify(logs));
  },

  checkRateLimit: (mode: 'thinking' | 'max'): boolean => {
    const hours = mode === 'thinking' ? 5 : 48;
    const limit = mode === 'thinking' ? 10 : 20;
    const now = Date.now();
    const cutoff = now - (hours * 60 * 60 * 1000);
    
    const logs = Storage.getUsageLogs().filter((l: any) => l.timestamp > cutoff && l.mode === mode);
    return logs.length < limit;
  }
};
