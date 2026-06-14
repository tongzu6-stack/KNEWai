import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  MessageSquare, 
  Plus, 
  Send, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Menu, 
  Sparkles,
  ArrowRight,
  Sparkle,
  ArrowUp,
  ArrowDown,
  Settings,
  Lightbulb,
  Code2,
  Zap,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { tryCreateLocalReply } from './lib/local-chat';
import { Storage, Message as LocalMessage, Session as LocalSession } from './lib/storage';

interface ChatSession extends LocalSession {
  userId?: string; 
}

interface Message extends LocalMessage {
  modelUsed?: string;
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentStreamingModelUsed, setCurrentStreamingModelUsed] = useState('');
  const [chatMode, setChatMode] = useState<'fast' | 'thinking' | 'max'>('fast');
  const [isTheoryEnabled, setIsTheoryEnabled] = useState(false);
  const [isCodingEnabled, setIsCodingEnabled] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);

  // Rate Limiting Logic 
  const checkRateLimit = async (mode: 'thinking' | 'max') => {
    return Storage.checkRateLimit(mode);
  };

  const addUsageLog = async (mode: 'thinking' | 'max') => {
    Storage.addUsageLog(mode);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  
  // UI States
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitleText, setEditTitleText] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [personalization, setPersonalization] = useState({
    aiTone: 'Balanced',
    customPersonality: '',
    userProfile: ''
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const [canScroll, setCanScroll] = useState(false);

  // Monitor scroll behavior to keep scroll position if user scrolls up
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    const threshold = 150;
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= threshold;
    shouldAutoScrollRef.current = isAtBottom;

    // Check if the container resides content exceeding its viewport
    const isScrollable = scrollHeight > clientHeight + 30;
    setCanScroll(isScrollable);

    // If scroll position is in the lower half of content, arrow up scrolls home
    const halfway = (scrollHeight - clientHeight) / 2;
    if (scrollTop > halfway) {
      setScrollDirection('up');
    } else {
      setScrollDirection('down');
    }
  };

  const handleScrollToEnds = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    if (scrollDirection === 'up') {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  // Keep check on scroll layout correctness dynamically on new rendering updates
  useEffect(() => {
    const timer = setTimeout(() => {
      handleScroll();
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, streamingText, isGenerating, activeSessionId]);

  // Load initial data from Storage
  useEffect(() => {
    const localSessions = Storage.getSessions();
    setSessions(localSessions);
    if (localSessions.length > 0 && !activeSessionId) {
      setActiveSessionId(localSessions[0].id);
      setMessages(Storage.getMessages(localSessions[0].id));
    }
    setPersonalization(Storage.getSettings());
  }, []);

  const savePersonalizationSettings = async (updatedSettings: { aiTone: string; customPersonality: string; userProfile: string; }) => {
    try {
      setIsSavingSettings(true);
      Storage.saveSettings(updatedSettings);
      setPersonalization(updatedSettings);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Update chat view when active session changes
  useEffect(() => {
    if (activeSessionId) {
      setMessages(Storage.getMessages(activeSessionId));
    }
  }, [activeSessionId]);

  // Scroll smoothly when messages list updates (e.g. new message gets added/finalized)
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Instant scroll during active generation updates to prevent lag/stutter of smooth scroll
  useEffect(() => {
    if (isGenerating && shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [streamingText, isGenerating]);

  // Handle auto-resizing textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputMessage]);

  const createNewSession = () => {
    const newSessionId = `sess_${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: 'New Chat Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    Storage.saveSession(newSession);
    setSessions(Storage.getSessions());
    setActiveSessionId(newSessionId);
    setMessages([]);
  };

  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    Storage.deleteSession(sessionId);
    const updated = Storage.getSessions();
    setSessions(updated);
    if (activeSessionId === sessionId) {
      if (updated.length > 0) {
        setActiveSessionId(updated[0].id);
        setMessages(Storage.getMessages(updated[0].id));
      } else {
        setActiveSessionId(null);
        setMessages([]);
      }
    }
  };

  const saveSessionTitle = (sessionId: string) => {
    if (!editTitleText.trim()) return;
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.title = editTitleText.trim();
      session.updatedAt = Date.now();
      Storage.saveSession(session);
      setSessions(Storage.getSessions());
      setEditingSessionId(null);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isGenerating) return;

    let sessionId = activeSessionId;
    const userPrompt = inputMessage.trim();
    setInputMessage('');
    setRateLimitError(null);
    
    // Check if this is the very first message of the session
    const isFirstMessage = messages.length === 0;

    try {
      // Enforcement of Rate Limits
      if (chatMode === 'thinking') {
        const canUse = await checkRateLimit('thinking');
        if (!canUse) {
          setRateLimitError('Thinking mode limit reached (10 messages/5h). Please try again later.');
          return;
        }
      }
      if (chatMode === 'max') {
        const canUse = await checkRateLimit('max');
        if (!canUse) {
          setRateLimitError('MAX mode limit reached (20 messages/48h). Please try again later.');
          return;
        }
      }

      setIsGenerating(true);
      setStreamingText('');

      // 1. Create a session if none is active
      if (!sessionId) {
        sessionId = `sess_${Date.now()}`;
        const newSession = {
          id: sessionId,
          title: 'New Chat Session',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        Storage.saveSession(newSession);
        setSessions(Storage.getSessions());
        setActiveSessionId(sessionId);
      }

      // 2. Save user message Locally
      const userMessageId = `msg_user_${Date.now()}`;
      const newUserMsg: Message = {
        id: userMessageId,
        role: 'user',
        content: userPrompt,
        createdAt: Date.now(),
      };
      Storage.saveMessage(sessionId, newUserMsg);
      setMessages(Storage.getMessages(sessionId));

      // Update session title on first message
      if (isFirstMessage) {
        let autoTitle = userPrompt.split('\n')[0].trim();
        if (autoTitle.length > 35) {
          const spaceIndex = autoTitle.substring(0, 35).lastIndexOf(' ');
          autoTitle = (spaceIndex > 10 ? autoTitle.substring(0, spaceIndex) : autoTitle.substring(0, 35)) + '...';
        }
        if (autoTitle) {
          const s = Storage.getSessions().find(x => x.id === sessionId);
          if (s) {
            s.title = autoTitle;
            Storage.saveSession(s);
            setSessions(Storage.getSessions());
          }
        }
      }

      // 3. Check for local pre-responses
      const localReplyText = tryCreateLocalReply(userPrompt);
      let streamAccumulator = '';
      let modelUsed = 'knew 2.0-beta';

      if (localReplyText) {
        // Instant response for simple phrases
        streamAccumulator = localReplyText;
        setStreamingText(streamAccumulator);
        modelUsed = 'knew-local';
      } else {
        // 4. Assemble history payload for the backend API from current context
        const currentHistory = [...messages, { id: userMessageId, role: 'user' as const, content: userPrompt, createdAt: new Date() }];
        const apiMessages = currentHistory.map(m => ({
          role: m.role,
          content: m.content
        }));

        // 5. Request the server-side streaming API with personalization and client time options
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            messages: apiMessages,
            personalization,
            clientTime: new Date().toString(),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            modelId: chatMode === 'max' ? 'max' : (isTheoryEnabled ? 'theory' : (chatMode === 'thinking' && isCodingEnabled ? 'thinking,coding' : (chatMode === 'thinking' ? 'thinking' : (isCodingEnabled ? 'coding' : 'default'))))
          })
        });

        if (!response.ok) {
          const errDetails = await response.json().catch(() => ({}));
          throw new Error(errDetails.error || 'Server returned an error');
        }

        modelUsed = response.headers.get('X-Model-Used') || 'knew 2.0-beta';
        setCurrentStreamingModelUsed(modelUsed);

        // Read response body directly as text stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunkStr = decoder.decode(value, { stream: true });
            streamAccumulator += chunkStr;
            setStreamingText(streamAccumulator);
          }
        }
      }

      // 6. Stream finished or local reply ready. Save Locally
      if (streamAccumulator) {
        // Record usage log for rate limiting
        if (chatMode === 'thinking') await addUsageLog('thinking');
        if (chatMode === 'max') await addUsageLog('max');

        const modelMessageId = `msg_model_${Date.now()}`;
        const newModelMsg: Message = {
          id: modelMessageId,
          role: 'model',
          content: streamAccumulator,
          createdAt: Date.now(),
          modelUsed
        };
        Storage.saveMessage(sessionId, newModelMsg);
        setMessages(Storage.getMessages(sessionId));
      }
      setStreamingText('');

    } catch (error: any) {
      console.error('Chat error:', error);
      // Display error as temporary streaming text
      setStreamingText(`**Chat generation encountered an error:** ${error.message || error}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Custom renderer mapping for beautiful plain Markdown with smooth typography
  const markdownComponents = {
    h1: ({ children }: any) => <h1 className="text-base font-semibold text-stone-900 mt-4 mb-2 first:mt-0 tracking-tight">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-[14.5px] font-semibold text-stone-900 mt-3 mb-1.5 first:mt-0 tracking-tight">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-[13.5px] font-semibold text-stone-900 mt-2 mb-1 first:mt-0 tracking-tight">{children}</h3>,
    p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed text-[14px] text-stone-700 font-light">{children}</p>,
    ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2.5 space-y-1 text-[14px] text-stone-700 font-light">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2.5 space-y-1 text-[14px] text-stone-700 font-light">{children}</ol>,
    li: ({ children }: any) => <li className="mb-0.5">{children}</li>,
    code: ({ children, ...props }: any) => (
      <code className="font-mono text-xs bg-stone-100 text-stone-800 px-1.5 py-0.5 rounded border border-stone-200/60" {...props}>
        {children}
      </code>
    ),
    pre: ({ children }: any) => (
      <pre className="font-mono text-[12.5px] bg-stone-900 text-stone-100 p-3.5 my-3 rounded-lg overflow-x-auto border border-stone-850 leading-relaxed shadow-sm">
        {children}
      </pre>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-stone-300 pl-3.5 italic my-2.5 text-stone-500 text-[13.5px]">
        {children}
      </blockquote>
    ),
    table: ({ children }: any) => (
      <div className="my-4 overflow-x-auto border border-stone-200 rounded-lg">
        <table className="w-full text-left text-[13px] border-collapse">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-stone-50 border-b border-stone-200 text-stone-900 font-medium">
        {children}
      </thead>
    ),
    th: ({ children }: any) => (
      <th className="px-4 py-2 font-semibold">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="px-4 py-2 border-t border-stone-100 text-stone-600">
        {children}
      </td>
    ),
    a: ({ href, children }: any) => (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-stone-900 underline font-medium hover:text-stone-600 transition-colors">
        {children}
      </a>
    )
  };

  return (
    <div className="flex h-[100dvh] bg-stone-50 overflow-hidden font-sans text-stone-800" id="app-workspace">
      {/* Sidebar navigation */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/10 backdrop-blur-[1px] z-30 md:hidden"
            />
            <motion.aside
              initial={{ width: 0, x: -280, opacity: 0 }}
              animate={{ width: 280, x: 0, opacity: 1 }}
              exit={{ width: 0, x: -280, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed md:relative h-[100dvh] border-r border-stone-200/80 bg-white flex flex-col shrink-0 z-40 md:z-20 overflow-hidden shadow-2xl md:shadow-none"
              id="history-side-panel"
            >
              {/* Header / Sidebar Control */}
              <div className="p-4 flex items-center justify-between border-b border-stone-100">
                <span className="text-[11px] font-medium tracking-widest text-stone-400 uppercase font-mono">Chats</span>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={createNewSession}
                  className="flex items-center space-x-1.5 bg-stone-900 text-stone-50 hover:bg-stone-800 py-1.5 px-3 rounded-lg text-xs font-medium border border-transparent cursor-pointer transition-all"
                  id="new-chat-session-btn"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2]" />
                  <span>New chat</span>
                </motion.button>
              </div>

              {/* List of sessions */}
              <div className="flex-1 overflow-y-auto p-2.5 space-y-1 scrollbar-none">
                {sessions.length === 0 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center p-4 space-y-1">
                    <span className="text-[11px] font-mono text-stone-400">No active sessions</span>
                    <span className="text-[10px] text-stone-400">Create a session to begin</span>
                  </div>
                ) : (
                  sessions.map((sess) => {
                    const isActive = sess.id === activeSessionId;
                    const isEditing = sess.id === editingSessionId;

                    return (
                      <motion.div
                        layout="position"
                        key={sess.id}
                        onClick={() => !isEditing && setActiveSessionId(sess.id)}
                        className="group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-[13.5px] cursor-pointer select-none"
                      >
                        {isActive && (
                          <motion.div
                            layoutId="activeSessionBackground"
                            className="absolute inset-0 bg-stone-100 rounded-xl z-0"
                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          />
                        )}

                        <div className="flex items-center space-x-2.5 min-w-0 flex-1 z-10">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 transition-colors duration-155 ${isActive ? 'text-stone-800' : 'text-stone-400 group-hover:text-stone-700'}`} />
                          {isEditing ? (
                            <input
                              type="text"
                              value={editTitleText}
                              onChange={(e) => setEditTitleText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveSessionTitle(sess.id);
                                if (e.key === 'Escape') setEditingSessionId(null);
                              }}
                              className="bg-white border border-stone-300 text-xs text-stone-900 px-1.5 py-0.5 rounded w-full focus:outline-none"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <span className={`truncate font-light text-[13px] transition-colors duration-155 ${isActive ? 'text-stone-900 font-medium' : 'text-stone-500 group-hover:text-stone-900'}`}>{sess.title}</span>
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity z-10">
                          {isEditing ? (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); saveSessionTitle(sess.id); }}
                                className="p-1 hover:text-stone-900 hover:bg-stone-200/65 rounded text-stone-500 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setEditingSessionId(null); }}
                                className="p-1 hover:text-stone-900 hover:bg-stone-200/65 rounded text-stone-500 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingSessionId(sess.id);
                                  setEditTitleText(sess.title);
                                }}
                                className="p-1 hover:text-stone-900 hover:bg-stone-250/50 rounded text-stone-450 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => deleteSession(sess.id, e)}
                                className="p-1 hover:text-red-700 hover:bg-red-50 rounded text-stone-450 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main chat viewport */}
      <main className="flex-1 flex flex-col h-full bg-stone-50 relative overflow-hidden" id="chat-conversation-panel">
        
        {/* Navigation control bar */}
        <header className="px-3 md:px-4 py-3 border-b border-stone-200/40 bg-white/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center space-x-3 min-w-0">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-stone-100 rounded-xl text-stone-500 hover:text-stone-900 cursor-pointer transition-colors shrink-0"
              title={sidebarOpen ? 'Hide drawer' : 'Show drawer'}
              id="sidebar-toggle-btn"
            >
              <Menu className="w-5 h-5" />
            </motion.button>
            <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
              <span className="font-bold text-[15px] text-stone-900 tracking-tight font-sans">KNEWai</span>
              
              {/* Model Mode Selector */}
              <div className="flex bg-stone-100 p-0.5 rounded-xl border border-stone-200/60">
                {(['fast', 'thinking', 'max'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setChatMode(mode);
                      if (mode === 'thinking' && isTheoryEnabled) {
                        setIsTheoryEnabled(false);
                      }
                    }}
                    className={`px-2 md:px-3 py-1 md:py-1.5 rounded-[10px] text-[10px] font-bold uppercase transition-all duration-200 ${
                      chatMode === mode 
                        ? 'bg-stone-900 text-stone-100 shadow-sm' 
                        : 'text-stone-400 hover:text-stone-600'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-stone-100 rounded-xl text-stone-500 hover:text-stone-900 cursor-pointer transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </motion.button>
          </div>
        </header>

        {/* Messaging responses window with smart scroll tracking */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollbar-none"
        >
          {!activeSessionId || (messages.length === 0 && !streamingText) ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex flex-col items-center justify-center p-6 text-center space-y-4 max-w-sm mx-auto"
              id="chat-empty-greeting"
            >
              <div className="space-y-1.5">
                <div className="flex flex-col items-center space-y-1">
                  <h3 className="text-[17px] font-bold text-stone-850 tracking-tight leading-none">KNEWai</h3>
                  {/* Version string removed as requested */}
                </div>
                <p className="text-[12px] text-stone-450 leading-relaxed font-light mt-1">
                  Type a prompt below to launch a conversation. Your chat history is stored locally on this machine.
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="w-full max-w-2xl mx-auto space-y-6">
              
              {/* Message History Render */}
              <AnimatePresence initial={false}>
                {messages.map((message) => {
                  const isUser = message.role === 'user';
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 12, scale: 0.99 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className={`flex flex-col space-y-1 ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest px-1">
                        {isUser ? 'You' : (message.modelUsed || 'Assistant')}
                      </span>
                      <div
                        className={`max-w-[90%] px-4 py-2.5 rounded-2xl transition-all duration-150 ${
                          isUser 
                            ? 'bg-stone-900 text-stone-100 rounded-tr-sm text-[13.5px] leading-relaxed font-light font-sans shadow-sm' 
                            : 'bg-white text-stone-800 border border-stone-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.01)] rounded-tl-sm hover:border-stone-300'
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        ) : (
                          <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Streaming AI content */}
              {streamingText && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col space-y-1 items-start"
                >
                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest px-1">
                    {currentStreamingModelUsed || 'Assistant'}
                  </span>
                  <div className="w-full max-w-[90%] bg-white text-stone-800 border border-stone-200/50 shadow-[0_2px_12px_rgba(0,0,0,0.01)] px-4 py-2.5 rounded-2xl rounded-tl-sm">
                    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
                      {streamingText}
                    </ReactMarkdown>
                  </div>
                </motion.div>
              )}

              {/* Loader during API calling */}
              {isGenerating && !streamingText && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col space-y-1 items-start animate-pulse"
                >
                  <span className="text-[9px] font-mono text-stone-400 uppercase tracking-widest px-1">
                    Computing...
                  </span>
                  <div className="px-4 py-3 bg-white text-stone-800 border border-stone-200/50 rounded-2xl rounded-tl-sm shadow-sm">
                    <div className="flex space-x-1.5 py-1 items-center">
                      <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-stone-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Scroll Control Button */}
        <AnimatePresence>
          {canScroll && (
            <motion.button
              initial={{ opacity: 0, y: 15, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.8 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleScrollToEnds}
              className="absolute bottom-24 right-5 md:right-8 p-3 rounded-full bg-white/95 backdrop-blur-sm border border-stone-200/80 shadow-[0_4px_20px_rgba(0,0,0,0.06)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.1)] text-stone-600 hover:text-stone-900 transition-all cursor-pointer z-30 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-stone-400"
              title={scrollDirection === 'up' ? "Scroll to Top" : "Scroll to Bottom"}
              aria-label={scrollDirection === 'up' ? "Scroll to Top" : "Scroll to Bottom"}
            >
              {scrollDirection === 'up' ? (
                <ArrowUp className="w-4 h-4 stroke-[2.2]" />
              ) : (
                <ArrowDown className="w-4 h-4 stroke-[2.2]" />
              )}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Messaging Input Textbox */}
        <div className="p-4 bg-white border-t border-stone-200/40">
          <div className="max-w-2xl mx-auto">
            <form onSubmit={handleSend} className="relative flex items-end">
              <div className="absolute left-2 bottom-1.5 flex flex-col items-start z-50">
                <AnimatePresence>
                  {isToolsMenuOpen && (
                    <>
                      <div 
                        className="fixed inset-0 z-40 bg-transparent" 
                        onClick={() => setIsToolsMenuOpen(false)}
                      />
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="mb-2 bg-white border border-stone-200 shadow-xl rounded-2xl p-1.5 min-w-[160px] overflow-hidden z-50"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const newState = !isTheoryEnabled;
                            setIsTheoryEnabled(newState);
                            if (newState) {
                              if (chatMode === 'thinking') setChatMode('fast');
                              setIsCodingEnabled(false);
                            }
                            setIsToolsMenuOpen(false);
                          }}
                          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left transition-colors mt-1 ${
                            isTheoryEnabled
                              ? 'bg-purple-50 text-purple-600' 
                              : 'hover:bg-stone-50 text-stone-600'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg ${isTheoryEnabled ? 'bg-purple-100' : 'bg-stone-100'}`}>
                            <Lightbulb className={`w-3.5 h-3.5 ${isTheoryEnabled ? 'text-purple-600' : 'text-stone-500'}`} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-medium leading-none">Theory</span>
                            <span className="text-[10px] text-stone-400 mt-0.5">Debate & logic</span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const newState = !isCodingEnabled;
                            setIsCodingEnabled(newState);
                            if (newState) {
                              setIsTheoryEnabled(false);
                            }
                            setIsToolsMenuOpen(false);
                          }}
                          className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left transition-colors mt-1 ${
                            isCodingEnabled
                              ? 'bg-emerald-50 text-emerald-600' 
                              : 'hover:bg-stone-50 text-stone-600'
                          }`}
                        >
                          <div className={`p-1.5 rounded-lg ${isCodingEnabled ? 'bg-emerald-100' : 'bg-stone-100'}`}>
                            <Code2 className={`w-3.5 h-3.5 ${isCodingEnabled ? 'text-emerald-600' : 'text-stone-500'}`} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-medium leading-none">Coding</span>
                            <span className="text-[10px] text-stone-400 mt-0.5">Writing software</span>
                          </div>
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                  className={`p-2 rounded-lg cursor-pointer transition-all duration-150 flex items-center space-x-1 ${
                    isToolsMenuOpen || isTheoryEnabled || isCodingEnabled
                      ? 'bg-blue-100/50 text-blue-600 hover:bg-blue-100/80' 
                      : 'bg-stone-100 hover:bg-stone-200 text-stone-500'
                  }`}
                  title="Tools"
                >
                  <Plus className={`w-4 h-4 transition-transform duration-200 ${isToolsMenuOpen ? 'rotate-45' : ''}`} />
                </motion.button>
              </div>
              <div className="w-full flex flex-col">
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={rateLimitError ? rateLimitError : (isGenerating ? "Formatting Response..." : "Send a message...")}
                  disabled={isGenerating}
                  className={`w-full bg-stone-50 focus:bg-white text-stone-800 placeholder-stone-400 text-[13.5px] rounded-xl pl-12 pr-11 py-2.5 border outline-none focus:ring-2 transition-all duration-200 resize-none font-light ${
                    rateLimitError 
                      ? 'border-red-300 focus:border-red-500 focus:ring-red-500/5' 
                      : 'border-stone-200/80 focus:border-stone-900 focus:ring-stone-900/5'
                  }`}
                  id="prompt-input"
                />
                <AnimatePresence>
                  {rateLimitError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-[11px] rounded-lg mt-1"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>{rateLimitError}</span>
                      <button 
                        onClick={() => setRateLimitError(null)} 
                        className="ml-auto hover:text-red-800"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="submit"
                disabled={!inputMessage.trim() || isGenerating}
                className="absolute right-2 bottom-1.5 p-2 bg-stone-900 hover:bg-stone-800 disabled:bg-transparent disabled:text-stone-300 text-stone-50 rounded-lg cursor-pointer transition-all duration-150"
                title="Send active prompt"
                id="submit-prompt-btn"
              >
                <Send className="w-3.5 h-3.5" />
              </motion.button>
            </form>
          </div>
        </div>

      </main>

      {/* Settings Dialog Overlay */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-[2.5px] flex items-center justify-center z-50 p-4" id="settings-overlay">
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_12px_40px_rgba(0,0,0,0.12)] w-full max-w-4xl h-[85vh] max-h-[600px] flex flex-col overflow-hidden text-stone-800"
              id="settings-dialog-card"
            >
              {/* Header */}
              <div className="px-6 py-4.5 border-b border-stone-100 flex items-center justify-between">
                <span className="text-[17px] font-semibold text-stone-850">Settings</span>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body split pane */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {/* Left tab sidebar */}
                <div className="w-full md:w-[220px] bg-stone-50 border-b md:border-b-0 md:border-r border-stone-100 p-3.5 flex flex-col justify-between">
                  <div className="flex md:flex-col overflow-x-auto md:overflow-x-visible space-x-1 md:space-x-0 md:space-y-1 scrollbar-none">
                    <div className="px-3.5 py-2.5 rounded-xl bg-stone-200 text-stone-900 font-medium text-[13.5px] cursor-pointer whitespace-nowrap">
                      Personalization
                    </div>
                  </div>
                  
                  <div className="hidden md:block p-3 text-[9px] font-mono text-stone-400 tracking-wider uppercase">
                  </div>
                </div>

                {/* Right options config panel */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col justify-between whitespace-normal">
                  <div className="space-y-6">
                    {/* AI Tone Options selection */}
                    <div className="space-y-2">
                      <label className="block text-[13px] font-semibold text-stone-800">
                        AI Tone
                      </label>
                      <select
                        value={personalization.aiTone}
                        onChange={(e) => setPersonalization({ ...personalization, aiTone: e.target.value })}
                        className="w-full max-w-xs bg-white text-stone-800 border border-stone-200 hover:border-stone-400 rounded-xl px-3.5 py-2 text-[13.5px] outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 transition-all cursor-pointer"
                      >
                        <option value="Balanced">Balanced</option>
                        <option value="Creative">Creative</option>
                        <option value="Precise">Precise</option>
                        <option value="Humorous">Humorous</option>
                        <option value="Professional">Professional</option>
                      </select>
                    </div>

                    <hr className="border-stone-100" />

                    {/* Dark Mode toggle */}
                    <div className="flex items-center justify-between">
                      <label className="text-[13px] font-semibold text-stone-800">
                        Dark Mode
                      </label>
                      <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${isDarkMode ? 'bg-stone-800' : 'bg-stone-200'}`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <hr className="border-stone-100" />

                    {/* Custom Personality Input directives */}
                    <div className="space-y-2">
                      <label className="block text-[13.5px] font-semibold text-stone-800">
                        Custom Personality
                      </label>
                      <textarea
                        value={personalization.customPersonality}
                        onChange={(e) => setPersonalization({ ...personalization, customPersonality: e.target.value })}
                        placeholder="Describe exactly how KNEWai should speak, think, and respond."
                        rows={3.5}
                        className="w-full bg-stone-50 focus:bg-white text-stone-800 placeholder-stone-400/80 text-[13px] rounded-xl px-4 py-3 border border-stone-200 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/5 transition-all resize-none font-light leading-relaxed"
                      />
                      <p className="text-[11px] text-stone-400 font-light">
                        This is added on top of the selected AI tone.
                      </p>
                    </div>

                    <hr className="border-stone-100" />

                    {/* What should KNEWai know about you? textfield */}
                    <div className="space-y-2">
                      <label className="block text-[13.5px] font-semibold text-stone-800">
                        What should KNEWai know about you?
                      </label>
                      <textarea
                        value={personalization.userProfile}
                        onChange={(e) => setPersonalization({ ...personalization, userProfile: e.target.value })}
                        placeholder="Tell KNEWai about your goals, preferences, work, studies, language, or anything useful."
                        rows={3.5}
                        className="w-full bg-stone-50 focus:bg-white text-stone-800 placeholder-stone-400/80 text-[13px] rounded-xl px-4 py-3 border border-stone-200 outline-none focus:border-stone-900 focus:ring-2 focus:ring-stone-900/5 transition-all resize-none font-light leading-relaxed"
                      />
                      <p className="text-[11px] text-stone-400 font-light">
                        This stays private in your browser and is included in future AI instructions.
                      </p>
                    </div>
                  </div>

                  {/* Actions Bar layout */}
                  <div className="pt-6 border-t border-stone-100 flex items-center justify-end space-x-3 mt-6">
                    <button
                      onClick={() => setIsSettingsOpen(false)}
                      className="px-4 py-2 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-50 text-[13px] font-medium transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        savePersonalizationSettings(personalization);
                        setIsSettingsOpen(false);
                      }}
                      disabled={isSavingSettings}
                      className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-[13px] font-medium transition-colors cursor-pointer flex items-center space-x-1.5 shadow-sm"
                    >
                      {isSavingSettings ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save settings</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
