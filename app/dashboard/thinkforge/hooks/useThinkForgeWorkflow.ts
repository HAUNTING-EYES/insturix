import { useState, useCallback, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowPhase, Idea, Script, ChatMessage, DynamicSuggestion } from '../types';
import { useThinkForgeSession } from './useThinkForgeSession';
import { database } from '@/lib/firebase/config';
import { ref, onValue } from 'firebase/database';
import { ThinkForgeRTDBManager, ThinkForgeTaskUpdate } from '@/app/api/services/thinkforge/utils/rtdb';
import { useUser } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { markSessionAsUsed, cleanupUnusedSessions } from '@/lib/utils/thinkforgeSession';
import { useRaceConditionManager } from '@/lib/utils/raceConditionManager';
import { sanitizeErrorForUser, logSecurely } from '@/lib/utils/secureErrorHandler';

interface TaskSession {
  taskId: string;
  sessionId: string;
  taskType: string;
}

export function useThinkForgeWorkflow() {
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase>('PROMPT');
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [goingHome, setGoingHome] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [generatedScript, setGeneratedScript] = useState<Script | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<DynamicSuggestion[]>([]);
  const [currentTaskSession, setCurrentTaskSession] = useState<TaskSession | null>(null);
  const [isUrlStateInitialized, setIsUrlStateInitialized] = useState(false);

  const { user } = useUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userId = user?.id;
  
  // Race condition manager for safe timeouts
  const raceManager = useRaceConditionManager('thinkforge-workflow');

  // Integrate with enhanced session management
  const { 
    sessionId, 
    isRecovering,
    isCreatingSession,
    isInitialized,
    initializeSession,
    startNewSession: createNewSession,
    loadSession: loadSessionFromHook,
    recoverSession, 
    updateSessionId,
    validateSession,
    autoSave,
    cleanupSession
  } = useThinkForgeSession();

  // URL state management functions
  const updateUrlState = useCallback((phase: WorkflowPhase, sessionId?: string | null) => {
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    url.searchParams.set('phase', phase);
    
    // Validate sessionId before adding to URL
    if (sessionId && typeof sessionId === 'string' && sessionId.length === 24) {
      url.searchParams.set('session', sessionId);
    } else {
      // Remove invalid session parameter from URL
      url.searchParams.delete('session');
      if (sessionId) {
        console.error('Invalid sessionId for URL state:', sessionId, typeof sessionId);
      }
    }
    
    // Use router.replace to avoid creating history entries
    router.replace(url.pathname + url.search, { scroll: false });
  }, [router]);

  const readUrlState = useCallback(() => {
    if (typeof window === 'undefined') return null;
    
    const urlPhase = searchParams.get('phase') as WorkflowPhase;
    const urlSessionId = searchParams.get('session');
    
    // Validate URL session ID
    const validSessionId = urlSessionId && typeof urlSessionId === 'string' && urlSessionId.length === 24 
      ? urlSessionId 
      : null;
    
    if (urlSessionId && !validSessionId) {
      console.error('Invalid session ID from URL:', urlSessionId);
    }
    
    return {
      phase: urlPhase,
      sessionId: validSessionId
    };
  }, [searchParams]);

  // Initialize workflow state from URL on first load
  useEffect(() => {
    if (isUrlStateInitialized || isRecovering) return;
    
    const urlState = readUrlState();
    
    if (urlState && urlState.phase && urlState.sessionId) {
      console.log('Restoring workflow state from URL:', urlState);
      setWorkflowPhase(urlState.phase);
    }
    
    setIsUrlStateInitialized(true);
  }, [readUrlState, isRecovering, isUrlStateInitialized]);

  // Update URL when workflow phase or session changes
  useEffect(() => {
    if (!isUrlStateInitialized) return;
    updateUrlState(workflowPhase, sessionId);
  }, [workflowPhase, sessionId, updateUrlState, isUrlStateInitialized]);

  // Check if error is session-related
  const isSessionError = useCallback((errorMessage: string) => {
    const sessionErrorPatterns = [
      'session not found',
      'invalid session',
      'session expired',
      'unauthorized session',
      'session does not exist',
      '404'
    ];
    return sessionErrorPatterns.some(pattern => 
      errorMessage.toLowerCase().includes(pattern)
    );
  }, []);

  // Enhanced API call with session validation and error handling
  const makeApiCall = useCallback(async (endpoint: string, options: RequestInit, context: string) => {
    try {
      const response = await fetch(endpoint, options);
      const data = await response.json();
      
      // Check for session updates in response
      if (data.sessionId && data.sessionId !== sessionId) {
        console.log(`Session ID updated via API response: ${sessionId} -> ${data.sessionId}`);
        updateSessionId(data.sessionId);
      }
      
      if (!response.ok) {
        // Handle session errors gracefully
        const errorMessage = data.error?.message || data.error || `${context} failed`;
        if (isSessionError(errorMessage)) {
          logSecurely('warn', `Session error in ${context}`, { context, sanitizedError: sanitizeErrorForUser(errorMessage) });
          setError(sanitizeErrorForUser('Session expired. Creating new session...'));
          
                     // Create new session and retry would be handled at higher level
           const newSessionId = await createNewSession();
           if (newSessionId) {
             setError(null);
             throw new Error('SESSION_RECOVERED'); // Signal to retry
           }
        }
        throw new Error(sanitizeErrorForUser(errorMessage));
      }
      
      return { response, data };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_RECOVERED') {
        throw error; // Let caller handle retry
      }
      throw error;
    }
  }, [sessionId, updateSessionId, isSessionError, createNewSession]);

  // --- Script Persistence Functions ----------------------------------------
  const getScriptStorageKey = useCallback((ideaId: number | string, sessionId: string) => {
    return `thinkforge_script_${ideaId}_${sessionId}`;
  }, []);

  const saveScriptToLocalStorage = useCallback((script: Script, ideaId: number | string, sessionId: string) => {
    try {
      const storageKey = getScriptStorageKey(ideaId, sessionId);
      const scriptData = {
        script,
        timestamp: Date.now(),
        sessionId,
        ideaId
      };
      localStorage.setItem(storageKey, JSON.stringify(scriptData));
      console.log('Script saved to localStorage:', storageKey);
    } catch (error) {
      console.error('Failed to save script to localStorage:', error);
    }
  }, [getScriptStorageKey]);

  const loadScriptFromLocalStorage = useCallback((ideaId: number | string, sessionId: string): Script | null => {
    try {
      const storageKey = getScriptStorageKey(ideaId, sessionId);
      const savedData = localStorage.getItem(storageKey);
      if (savedData) {
        const { script, timestamp } = JSON.parse(savedData);
        // Check if script is not older than 7 days
        const daysSinceCreation = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7) {
          console.log('Script loaded from localStorage:', storageKey);
          return script;
        } else {
          // Remove stale script
          localStorage.removeItem(storageKey);
          console.log('Removed stale script from localStorage:', storageKey);
        }
      }
      return null;
    } catch (error) {
      console.error('Failed to load script from localStorage:', error);
      return null;
    }
  }, [getScriptStorageKey]);

  const clearScriptFromLocalStorage = useCallback((ideaId: number | string, sessionId: string) => {
    try {
      const storageKey = getScriptStorageKey(ideaId, sessionId);
      localStorage.removeItem(storageKey);
      console.log('Script cleared from localStorage:', storageKey);
    } catch (error) {
      console.error('Failed to clear script from localStorage:', error);
    }
  }, [getScriptStorageKey]);

  // --- Firebase Task Listener -------------------------------------------
  useEffect(() => {
    if (!currentTaskSession?.taskId || !userId) {
      console.log('Firebase listener not starting - missing taskId or userId:', { taskId: currentTaskSession?.taskId, userId });
      return;
    }

    // Verify Firebase database connection
    if (!database) {
      console.error('❌ Firebase database not initialized');
      setError('Firebase connection error. Please refresh the page.');
      return;
    }

    const firebasePath = `${userId}/thinkforge/tasks/${currentTaskSession.taskId}`;
    console.log('🔥 Setting up Firebase listener for task:', currentTaskSession.taskId, 'at path:', firebasePath);
    console.log('🔥 Firebase database object:', database);
    console.log('🔥 User ID:', userId);
    console.log('🔥 Task session:', currentTaskSession);
    
    const taskRef = ref(database, firebasePath);
    
    // Use enhanced Firebase listener with auto-recovery
    try {
      const unsubscribe = ThinkForgeRTDBManager.createEnhancedListener(
        userId,
        currentTaskSession.taskId,
                 async (task: ThinkForgeTaskUpdate | null) => {
           console.log('🔥 Enhanced Firebase listener triggered for task:', currentTaskSession.taskId);
           
           if (!task) {
             console.log('⚠️ Task not found or deleted at path:', firebasePath);
             return;
           }

        console.log('📨 Task update received:', task);
        console.log('📊 Raw task result:', JSON.stringify(task.result, null, 2));

        if (task.status === 'completed') {
          // --- Ideas task completed --------------------------------------------------
          if (task.type === 'ideas' && task.result?.ideas) {
            setIdeas(task.result.ideas);
            setLoading(false);
            // Delay clearing task session to ensure Firebase updates are processed
            raceManager.createSafeTimeout(
              'clear-task-session',
              'ideas-completion',
              () => setCurrentTaskSession(null),
              1000
            );
            console.log('Ideas updated in UI:', task.result.ideas);
          }
          
          // --- Script task completed -------------------------------------------------
          if (task.type === 'scripts' && task.result?.script) {
            const generatedScript = task.result.script;
            setGeneratedScript(generatedScript);
            setWorkflowPhase('SCRIPT');
            setGeneratingScript(false);
            // Delay clearing task session to ensure Firebase updates are processed
            raceManager.createSafeTimeout(
              'clear-task-session',
              'script-completion',
              () => setCurrentTaskSession(null),
              1000
            );
            
            // Save script to localStorage immediately after generation
            if (selectedIdea && sessionId) {
              saveScriptToLocalStorage(generatedScript, selectedIdea.id, sessionId);
            }
            
            console.log('Script generated and saved to localStorage');
          }

          // --- Chat task completed --------------------------------------------------
          if (task.type === 'chat' && task.result) {
            console.log('💬 Processing chat task result:', task.result);
            
            // Get current chat messages to check for duplicates
            setChatMessages(currentMessages => {
              // Prevent duplicate AI messages by checking if this task was already processed
              const taskMessageId = `ai-${task.taskId}`;
              const existingMessage = currentMessages.find(msg => msg.id.startsWith(taskMessageId));
              
              if (existingMessage) {
                console.log('⏭️ Skipping duplicate AI message for task:', task.taskId);
                return currentMessages;
              }

                          // Enhanced extraction logic with multiple fallback paths
            let aiContent = '';
            const extractionAttempts: Array<{method: string, content: string}> = [];
            
            console.log('🔍 Attempting to extract AI content from task result...');
            console.log('🔍 Result keys:', Object.keys(task.result || {}));
            console.log('🔍 Full result structure:', JSON.stringify(task.result, null, 2));
            
            // Path 1: Direct aiResponse content (most reliable)
            if (task.result.aiResponse?.content) {
              aiContent = task.result.aiResponse.content;
              extractionAttempts.push({method: 'aiResponse.content', content: aiContent});
              console.log('✅ Extracted AI content from aiResponse.content');
            }
            // Path 2: aiResponse message field
            else if (task.result.aiResponse?.message) {
              aiContent = task.result.aiResponse.message;
              extractionAttempts.push({method: 'aiResponse.message', content: aiContent});
              console.log('✅ Extracted AI content from aiResponse.message');
            }
            // Path 3: Response content object
            else if (task.result.response?.content) {
              aiContent = task.result.response.content;
              extractionAttempts.push({method: 'response.content', content: aiContent});
              console.log('✅ Extracted AI content from response.content');
            }
            // Path 4: Chat array with assistant/ai role
            else if (Array.isArray(task.result.chat)) {
              const assistantMessage = task.result.chat.find((m: any) => 
                m?.role === 'assistant' || m?.role === 'ai'
              );
              if (assistantMessage?.content) {
                aiContent = assistantMessage.content;
                extractionAttempts.push({method: 'chat[].content', content: aiContent});
                console.log('✅ Extracted AI content from chat array, role:', assistantMessage.role);
              }
            }
            // Path 5: Raw response string (handle JSON wrapped responses)
            else if (typeof task.result.response === 'string') {
              let rawResponse = task.result.response;
              console.log('📄 Processing raw response string');
              
              // Try to extract JSON from markdown fences
              if (rawResponse.includes('```json') && rawResponse.includes('```')) {
                try {
                  const jsonMatch = rawResponse.match(/```json\s*\n([\s\S]*?)\n```/);
                  if (jsonMatch?.[1]) {
                    const jsonData = JSON.parse(jsonMatch[1]);
                    if (jsonData.chat && Array.isArray(jsonData.chat)) {
                      const assistantMessage = jsonData.chat.find((m: any) => 
                        m?.role === 'assistant' || m?.role === 'ai'
                      );
                      if (assistantMessage?.content) {
                        aiContent = assistantMessage.content;
                        extractionAttempts.push({method: 'markdown-json-chat', content: aiContent});
                        console.log('✅ Extracted AI content from JSON in markdown');
                      }
                    } else if (jsonData.content) {
                      aiContent = jsonData.content;
                      extractionAttempts.push({method: 'markdown-json-content', content: aiContent});
                      console.log('✅ Extracted AI content from JSON content field');
                    }
                  }
                } catch (parseError) {
                  console.warn('⚠️ Failed to parse JSON from markdown, using raw string');
                }
              }
              
              // Try to extract from plain JSON without markdown
              if (!aiContent && rawResponse.trim().startsWith('{')) {
                try {
                  const jsonData = JSON.parse(rawResponse);
                  if (jsonData.chat && Array.isArray(jsonData.chat)) {
                    const assistantMessage = jsonData.chat.find((m: any) => 
                      m?.role === 'assistant' || m?.role === 'ai'
                    );
                    if (assistantMessage?.content) {
                      aiContent = assistantMessage.content;
                      extractionAttempts.push({method: 'plain-json-chat', content: aiContent});
                      console.log('✅ Extracted AI content from plain JSON chat');
                    }
                  } else if (jsonData.content) {
                    aiContent = jsonData.content;
                    extractionAttempts.push({method: 'plain-json-content', content: aiContent});
                    console.log('✅ Extracted AI content from plain JSON content');
                  }
                } catch (parseError) {
                  console.warn('⚠️ Failed to parse plain JSON, continuing to fallback');
                }
              }
              
              // Fallback to raw response if no extraction worked
              if (!aiContent && rawResponse.trim()) {
                aiContent = rawResponse;
                extractionAttempts.push({method: 'raw-response', content: aiContent});
                console.log('✅ Using raw response string as content');
              }
            }
            // Path 6: Direct response field
            else if (task.result.response && typeof task.result.response === 'string') {
              aiContent = task.result.response;
              extractionAttempts.push({method: 'direct-response', content: aiContent});
              console.log('✅ Extracted AI content from direct response field');
            }
            // Path 7: Any message field
            else if (task.result.message) {
              aiContent = task.result.message;
              extractionAttempts.push({method: 'message-field', content: aiContent});
              console.log('✅ Extracted AI content from message field');
            }
            // Path 8: Search all string fields
            else {
              console.log('🔍 Trying comprehensive field search...');
              const searchFields = ['content', 'text', 'output', 'result', 'data'];
              for (const field of searchFields) {
                if (task.result[field] && typeof task.result[field] === 'string') {
                  aiContent = task.result[field];
                  extractionAttempts.push({method: `field-${field}`, content: aiContent});
                  console.log(`✅ Found content in field: ${field}`);
                  break;
                }
              }
            }

              console.log('🎯 Final extracted AI content length:', aiContent?.length || 0);

              if (aiContent && aiContent.trim()) {
                const aiMessage: ChatMessage = {
                  id: `ai-${task.taskId}-${Date.now()}`,
                  role: 'ai',
                  content: aiContent.trim(),
                  timestamp: new Date()
                };
                console.log('✅ Adding AI message to chat:', aiMessage);
                return [...currentMessages, aiMessage];
              } else {
                console.warn('❌ No AI content found in task result');
                console.warn('🔍 Available result structure:', JSON.stringify(task.result, null, 2));
                return currentMessages;
              }
            });

            // Update dynamic suggestions only when backend supplies a non-empty array
            if (Array.isArray(task.result.suggestions) && task.result.suggestions.length > 0) {
              setSuggestions(task.result.suggestions);
              console.log('💡 Updated suggestions:', task.result.suggestions);
            }

            setSendingMessage(false);
            // Delay clearing task session to ensure Firebase updates are processed
            raceManager.createSafeTimeout(
              'clear-task-session',
              'chat-completion',
              () => setCurrentTaskSession(null),
              1000
            );
            
            // Clear send timeout on successful completion
            raceManager.cancelOperation('send-timeout', sessionId || 'default');
          }
        }
        
        if (task.status === 'failed') {
          const taskErrorMessage = typeof task.error === 'object' && task.error?.message 
            ? task.error.message 
            : typeof task.error === 'string' 
            ? task.error 
            : 'Task failed';
          logSecurely('warn', 'Task failed', { 
            taskId: task.taskId,
            sanitizedError: sanitizeErrorForUser(taskErrorMessage)
          });
          
          // Check if failure is session-related 
          const isSessionFailure = task.error && isSessionError(taskErrorMessage);
          if (isSessionFailure && currentTaskSession.sessionId !== sessionId) {
            logSecurely('info', 'Task failed due to session mismatch');
            setError(sanitizeErrorForUser('Session mismatch detected. Please try again.'));
          } else {
            setError(sanitizeErrorForUser(taskErrorMessage));
          }
          
          setSendingMessage(false);
          setLoading(false);
          setCurrentTaskSession(null);
        }
        
        if (task.status === 'processing') {
          console.log('⏳ Task is being processed...');
        }
        },
        (firebaseError: Error) => {
        logSecurely('error', 'Firebase listener error', {
          code: (firebaseError as any).code || 'unknown',
          sanitizedMessage: sanitizeErrorForUser(firebaseError.message || 'Unknown error'),
          userId,
          taskId: currentTaskSession.taskId
        });
        setError(sanitizeErrorForUser('Realtime connection error. Please refresh.'));
        setSendingMessage(false);
        setLoading(false);
      });

      // Properly detach the listener on cleanup
      return () => {
        console.log('🧹 Cleaning up Firebase listener for task:', currentTaskSession.taskId);
        unsubscribe();
      };
      
    } catch (initError) {
      logSecurely('error', 'Failed to initialize Firebase listener', { 
        sanitizedError: sanitizeErrorForUser(initError instanceof Error ? initError.message : 'Unknown error')
      });
      setError(sanitizeErrorForUser('Failed to connect to real-time updates. Please refresh.'));
      setSendingMessage(false);
      setLoading(false);
    }
  }, [userId, currentTaskSession, sessionId, isSessionError, selectedIdea, saveScriptToLocalStorage]);

  // Enhanced send debounce ref and guards with better state management
  const sendInProgressRef = useRef(false);
  const lastMessageRef = useRef<string | null>(null);
  const activeOperationsRef = useRef<Set<string>>(new Set());
  
  // Enhanced operation tracking to prevent race conditions
  const trackOperation = useCallback((operationId: string): boolean => {
    if (activeOperationsRef.current.has(operationId)) {
      console.warn(`Operation ${operationId} already in progress, skipping duplicate`);
      return false;
    }
    activeOperationsRef.current.add(operationId);
    return true;
  }, []);

  const completeOperation = useCallback((operationId: string) => {
    activeOperationsRef.current.delete(operationId);
  }, []);

  // Enhanced message deduplication
  const isDuplicateMessage = useCallback((message: string): boolean => {
    if (lastMessageRef.current === message && sendInProgressRef.current) {
      console.warn('Duplicate message detected while sending in progress, ignoring');
      return true;
    }
    return false;
  }, []);

  // Enhanced task session management with conflict detection
  const setCurrentTaskSessionSafe = useCallback((newTaskSession: TaskSession | null) => {
    if (newTaskSession) {
      const operationId = `task-${newTaskSession.taskId}`;
      
      // Check if we're already tracking this task
      if (currentTaskSession?.taskId === newTaskSession.taskId) {
        console.warn(`Task ${newTaskSession.taskId} already being tracked, skipping duplicate`);
        return false;
      }
      
      // Check for task ID conflicts
      if (currentTaskSession && currentTaskSession.taskId !== newTaskSession.taskId) {
        console.log(`Replacing current task ${currentTaskSession.taskId} with new task ${newTaskSession.taskId}`);
        // Clean up previous task tracking
        completeOperation(`task-${currentTaskSession.taskId}`);
      }
      
      if (trackOperation(operationId)) {
        setCurrentTaskSession(newTaskSession);
        return true;
      }
      return false;
    } else {
      // Clear current task
      if (currentTaskSession) {
        completeOperation(`task-${currentTaskSession.taskId}`);
      }
      setCurrentTaskSession(null);
      return true;
    }
  }, [currentTaskSession, trackOperation, completeOperation]);

  // Enhanced session recovery with better state management
  const handleSessionRecovery = async (): Promise<boolean> => {
    const recoveryId = `recovery-${Date.now()}`;
    
    if (!trackOperation(recoveryId)) {
      console.warn('Session recovery already in progress');
      return false;
    }

    try {
      // Clear any ongoing operations to prevent conflicts
      sendInProgressRef.current = false;
      setSendingMessage(false);
      activeOperationsRef.current.clear();
      
      console.log('🔄 Starting enhanced session recovery...');
      
      // Use the session hook's recovery mechanism
      const recovered = sessionId ? await recoverSession?.(sessionId) : false;
      
      if (recovered) {
        console.log('✅ Session recovery successful');
        return true;
      } else {
        console.log('❌ Session recovery failed, will need new session');
        return false;
      }
    } catch (error) {
      console.error('Session recovery error:', error);
      return false;
    } finally {
      completeOperation(recoveryId);
    }
  };

  // --- Welcome message guard -----------------------------------------------
  const welcomeSentRef = useRef(false);

  // Auto-welcome on first entry to CHAT phase -----------------------------
  useEffect(() => {
    // When user switches to CHAT for the first time (no messages yet),
    // trigger a backend chat call so ForgeAI can greet the user and share
    // a helpful tip. This avoids an empty screen.
    console.log('Auto-welcome check:', {
      workflowPhase,
      chatMessagesLength: chatMessages.length,
      selectedIdea: !!selectedIdea,
      sessionId: !!sessionId,
      sendingMessage,
      currentTaskSession: !!currentTaskSession,
      welcomeSent: welcomeSentRef.current
    });
    
    // Only trigger welcome when all conditions are met and we haven't sent it yet
    if (
      workflowPhase === 'CHAT' &&
      chatMessages.length === 0 &&
      selectedIdea &&
      sessionId &&
      !sendingMessage &&
      !currentTaskSession && // avoid duplicate welcome calls while waiting
      !welcomeSentRef.current // prevent multiple welcome messages
    ) {
      console.log('Triggering auto-welcome message');
      
      // Set flag immediately to prevent race conditions
      welcomeSentRef.current = true;
      setSendingMessage(true);
      
      (async () => {
        try {
          console.log('Sending welcome message to backend');
          const { data } = await makeApiCall('/api/services/thinkforge/chat/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: 'Hello!', // minimal greeting; agent will craft full reply
              sessionId,
              context: {
                selectedIdea,
                chatHistory: []
              }
            })
          }, 'welcome chat');

          if (data.success && data.taskId) {
            console.log('Welcome message task created:', data.taskId);
            setCurrentTaskSession({
              taskId: data.taskId,
              sessionId: data.sessionId || sessionId,
              taskType: 'chat'
            });
            console.log('Set current task session for welcome:', {
              taskId: data.taskId,
              sessionId: data.sessionId || sessionId,
              taskType: 'chat'
            });
            // Keep sendingMessage true - it will be cleared when the Firebase listener receives the result
          } else if (data.success && data.aiResponse) {
            // Immediate response path (rare)
            const aiMessage: ChatMessage = {
              id: `ai-welcome-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              role: 'ai',
              content: data.aiResponse.content || data.aiResponse.message || '',
              timestamp: new Date()
            };
            setChatMessages([aiMessage]);
            setSuggestions(data.suggestions || []);
            setSendingMessage(false);
          } else {
            setSendingMessage(false);
            // Reset flag if failed so user can manually trigger
            welcomeSentRef.current = false;
          }
        } catch (err) {
          console.error('Welcome chat failed:', err);
          setSendingMessage(false);
          // Reset flag if failed so user can manually trigger
          welcomeSentRef.current = false;
        }
      })();
    }
  }, [workflowPhase, selectedIdea, sessionId, sendingMessage, currentTaskSession, makeApiCall]);
   
  useEffect(() => {
    if (!sessionId) return;
    
    // Don't auto-save during session recovery to prevent conflicts
    if (isRecovering || isCreatingSession) return;

    const workflowState = {
      workflowPhase,
      prompt,
      selectedIdea,
      chatMessages,
      generatedScript,
      suggestions,
      ideas,
      timestamp: Date.now()
    };
    
    // Cancel previous auto-save operation
    raceManager.cancelOperation('auto-save', sessionId || 'default');

    // Schedule save after 2 s of inactivity using race condition manager
    raceManager.createSafeTimeout(
      'auto-save',
      sessionId || 'default',
      () => {
        autoSave(workflowState);
        
        // Mark session as used if it has meaningful content
        if (prompt || selectedIdea || ideas.length > 0) {
          markSessionAsUsed(
            sessionId,
            prompt,
            selectedIdea?.tone,
            workflowPhase
          );
        }
      },
      2000
    );

    // Cleanup on unmount or dep change
    return () => {
      raceManager.cancelOperation('auto-save', sessionId || 'default');
    };
  }, [workflowPhase, prompt, selectedIdea, chatMessages, generatedScript, suggestions, ideas, autoSave, sessionId, isRecovering, isCreatingSession]);

  // Session recovery is now handled by useThinkForgeSession hook

  // Manual session loading function for library clicks
  const loadSession = useCallback(async (targetSessionId: string): Promise<boolean> => {
    try {
      if (!targetSessionId || typeof targetSessionId !== 'string' || targetSessionId.length !== 24) {
        console.error('Invalid session ID format:', targetSessionId);
        return false;
      }

      // Prevent multiple concurrent session loads
      if (isRecovering || isCreatingSession) {
        console.warn('Session operation already in progress, skipping load request');
        return false;
      }

      setError(null);
      setLoading(true);
      
      console.log('Loading session from library:', targetSessionId);
      
      // First, load the session in the session management layer
      const sessionLoadSuccess = await loadSessionFromHook(targetSessionId);
      if (!sessionLoadSuccess) {
        console.error('Failed to load session in session management layer');
        setLoading(false);
        return false;
      }
      
      // DON'T clear current workflow state - let it be restored smoothly
      console.log('Preparing for session state restoration without clearing current state');
      
      // Clear any active task sessions first
      setCurrentTaskSession(null);
      
      // Recover the complete workflow state
      console.log('Recovering workflow state for session:', targetSessionId);
      const recoveredState = await recoverSession(targetSessionId);
      
      if (recoveredState) {
        console.log('Session state recovered, restoring workflow smoothly:', recoveredState);
        
        // Use state batching to avoid multiple re-renders and flicker
        const targetPhase = recoveredState.workflowPhase || 'PROMPT';
        
        // Batch all state updates together for smooth transition
        const stateUpdates = () => {
          setWorkflowPhase(targetPhase);
          
          if (recoveredState.prompt) {
            setPrompt(recoveredState.prompt);
            console.log('Restored prompt:', recoveredState.prompt);
          }
          
          if (recoveredState.ideas && Array.isArray(recoveredState.ideas)) {
            setIdeas(recoveredState.ideas);
            console.log('Restored ideas array:', recoveredState.ideas.length, 'ideas');
          }
          
          if (recoveredState.selectedIdea) {
            setSelectedIdea(recoveredState.selectedIdea);
            console.log('Restored selected idea:', recoveredState.selectedIdea.id);
          }
          
          if (recoveredState.chatMessages && Array.isArray(recoveredState.chatMessages)) {
            setChatMessages(recoveredState.chatMessages);
            console.log('Restored chat messages:', recoveredState.chatMessages.length, 'messages');
          }
          
          if (recoveredState.suggestions && Array.isArray(recoveredState.suggestions)) {
            setSuggestions(recoveredState.suggestions);
            console.log('Restored suggestions:', recoveredState.suggestions.length, 'suggestions');
          }
          
          if (recoveredState.generatedScript) {
            setGeneratedScript(recoveredState.generatedScript);
            console.log('Restored generated script');
          } else if (recoveredState.selectedIdea && targetSessionId) {
            // Try to load script from localStorage as fallback
            const savedScript = loadScriptFromLocalStorage(recoveredState.selectedIdea.id, targetSessionId);
            if (savedScript) {
              setGeneratedScript(savedScript);
              console.log('Restored script from localStorage');
            }
          }
        };
        
        // Use React's automatic batching for smooth updates
        stateUpdates();
        
        // Clear any task sessions (user is viewing saved state, not active generation)
        setCurrentTaskSession(null);
        
        // Update session metadata to reflect recent access
        markSessionAsUsed(
          targetSessionId,
          recoveredState.prompt,
          recoveredState.selectedIdea?.tone || recoveredState.defaultTone,
          targetPhase
        );
        
        console.log('Session loaded successfully with complete state restoration');
        console.log('Final workflow state:', {
          phase: targetPhase,
          hasPrompt: !!recoveredState.prompt,
          hasIdeas: !!(recoveredState.ideas?.length),
          hasSelectedIdea: !!recoveredState.selectedIdea,
          hasChatMessages: !!(recoveredState.chatMessages?.length),
          hasScript: !!recoveredState.generatedScript
        });
        
        setLoading(false);
        return true;
      } else {
        logSecurely('error', 'Failed to recover workflow state for session', { sessionId: targetSessionId });
        setError(sanitizeErrorForUser('Failed to load session. The session may be corrupted or deleted.'));
        setLoading(false);
        return false;
      }
    } catch (error) {
      logSecurely('error', 'Error loading session from library', { 
        sessionId: targetSessionId,
        sanitizedError: sanitizeErrorForUser(error instanceof Error ? error.message : 'Failed to load session')
      });
      setError(sanitizeErrorForUser(error instanceof Error ? error.message : 'Failed to load session'));
      setLoading(false);
      return false;
    }
  }, [loadSessionFromHook, recoverSession, loadScriptFromLocalStorage]);

  // Track recovery attempts to prevent infinite loops
  const recoveryAttemptedRef = useRef<Set<string>>(new Set());
  
  // Enhanced session recovery - only for URL-based session loading and page refresh
  useEffect(() => {
    const handleSessionRecovery = async () => {
      if (!isInitialized || !user?.id || isRecovering || isCreatingSession) return;
      
      const urlState = readUrlState();
      
      // If we have a URL session that's different from current, try to load it
      if (urlState?.sessionId && urlState.sessionId !== sessionId) {
        try {
          console.log('Loading session from URL with state restoration:', urlState.sessionId);
          // Prevent race conditions by checking if session is already being processed
          if (loading || goingHome) {
            console.log('Session operation in progress, deferring URL session load');
            return;
          }
          
          const success = await loadSession(urlState.sessionId);
          if (success) {
            console.log('URL session loaded successfully with complete state');
            return;
          } else {
            console.log('URL session load failed');
            // Clear invalid session from URL
            const url = new URL(window.location.href);
            url.searchParams.delete('session');
            router.replace(url.pathname + url.search, { scroll: false });
          }
        } catch (error) {
          logSecurely('error', 'Failed to load session from URL', { 
            sessionId: urlState.sessionId,
            sanitizedError: sanitizeErrorForUser(error instanceof Error ? error.message : 'Unknown error')
          });
        }
      }
      
      // Only attempt recovery once per session and only on initial mount/page refresh
      // Do NOT recover during home navigation or normal workflow transitions
      if (sessionId && !recoveryAttemptedRef.current.has(sessionId) && 
          workflowPhase === 'PROMPT' && !prompt && !selectedIdea && !ideas.length && 
          !isCreatingSession && !isRecovering && !goingHome) {
        
        // Mark this session as having a recovery attempt to prevent loops
        recoveryAttemptedRef.current.add(sessionId);
        
        // Additional check: only recover if this looks like a page refresh/reload scenario
        const urlSessionId = urlState?.sessionId;
        const isUrlSessionLoad = urlSessionId && urlSessionId === sessionId;
        const isPageRefresh = !urlSessionId; // No URL session param suggests page refresh
        
        if (isUrlSessionLoad || isPageRefresh) {
          try {
            console.log('Attempting session state recovery for page refresh/URL load:', sessionId);
            const recoveredState = await recoverSession(sessionId);
            
            if (recoveredState && (recoveredState.prompt || recoveredState.selectedIdea || recoveredState.ideas?.length > 0)) {
              console.log('Session recovery successful, restoring workflow state');
              
              // Restore workflow state
              if (recoveredState.workflowPhase && recoveredState.workflowPhase !== 'PROMPT') {
                setWorkflowPhase(recoveredState.workflowPhase);
              }
              if (recoveredState.prompt) setPrompt(recoveredState.prompt);
              if (recoveredState.ideas?.length) setIdeas(recoveredState.ideas);
              if (recoveredState.selectedIdea) setSelectedIdea(recoveredState.selectedIdea);
              if (recoveredState.chatMessages?.length) setChatMessages(recoveredState.chatMessages);
              if (recoveredState.suggestions?.length) setSuggestions(recoveredState.suggestions);
              if (recoveredState.generatedScript) setGeneratedScript(recoveredState.generatedScript);
              
              // Mark session as used if it has content
              markSessionAsUsed(
                sessionId,
                recoveredState.prompt,
                recoveredState.selectedIdea?.tone || recoveredState.defaultTone,
                recoveredState.workflowPhase
              );
            }
          } catch (error) {
            console.error('Session recovery failed:', error);
          }
        }
      }
      
      // Clean up unused sessions periodically
      cleanupUnusedSessions();
    };

    handleSessionRecovery();
  }, [isInitialized, user?.id, sessionId, workflowPhase, prompt, selectedIdea, ideas.length, isCreatingSession, isRecovering, goingHome, loading, loadSession, recoverSession, readUrlState, router]); // Added all missing dependencies
  
  // Clear recovery tracking when sessionId changes (new session)
  useEffect(() => {
    if (sessionId) {
      // Clean up old recovery attempts (keep only last 5 sessions)
      const currentAttempts = recoveryAttemptedRef.current;
      if (currentAttempts.size > 5) {
        const attemptsArray = Array.from(currentAttempts);
        const toKeep = attemptsArray.slice(-5);
        recoveryAttemptedRef.current = new Set([...toKeep, sessionId]);
      }
    } else {
      // Clear all recovery attempts when no session (going home)
      recoveryAttemptedRef.current.clear();
    }
  }, [sessionId]);



  // Generate ideas with retry logic
  const generateIdeas = useCallback(async (userPrompt: string, retryCount = 0) => {
    setError(null);
    setLoading(true);
    setPrompt(userPrompt);
    setWorkflowPhase('IDEAS');
    
    try {
      // Ensure we have a session for generating ideas
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        console.log('No current session, initializing for ideas generation...');
        currentSessionId = await initializeSession();
        if (!currentSessionId) {
          throw new Error('Failed to initialize session for ideas generation');
        }
      }

      console.log('Generating ideas with session:', currentSessionId);

      const { response, data } = await makeApiCall('/api/services/thinkforge/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: userPrompt,
          preferences: {},
          session_id: currentSessionId
        })
      }, 'generate ideas');

      if (data.success && data.taskId) {
        setCurrentTaskSession({
          taskId: data.taskId,
          sessionId: data.sessionId || currentSessionId,
          taskType: 'ideas'
        });
        
        // Mark session as used since user has started creating content
        markSessionAsUsed(currentSessionId, userPrompt, '', 'IDEAS');
        
        console.log('Ideas task created, tracking taskId:', data.taskId);
      } else {
        throw new Error(sanitizeErrorForUser(data.error?.message || 'Failed to generate ideas'));
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_RECOVERED' && retryCount < 1) {
        logSecurely('info', 'Retrying ideas generation after session recovery');
        return generateIdeas(userPrompt, retryCount + 1);
      }
      
      // Enhanced error handling for ideas generation
      let errorMessage = 'Failed to generate ideas. Please try again.';
      if (err instanceof Error) {
        const errMsg = err.message.toLowerCase();
        if (errMsg.includes('quota') || errMsg.includes('limit') || errMsg.includes('exceeded')) {
          // Check if it's a service limit error with specific message
          if (errMsg.includes('weekly sessions') || errMsg.includes('session limit') || errMsg.includes('sessions this week')) {
            errorMessage = err.message; // Use the full descriptive message from the middleware
          } else {
            errorMessage = 'You have reached your usage limit. Please try again later or upgrade your plan.';
          }
        } else {
          errorMessage = err.message;
        }
      }
      
      logSecurely('error', 'Idea generation failed', { 
        sanitizedError: sanitizeErrorForUser(errorMessage),
        promptLength: userPrompt?.length || 0
      });
      setError(sanitizeErrorForUser(errorMessage));
      setLoading(false);
      setWorkflowPhase('PROMPT');
    }
  }, [sessionId, initializeSession, makeApiCall]);

  // Handle custom idea creation
  const createCustomIdea = useCallback(async (customIdea: Idea) => {
    setError(null);
    setLoading(true);
    setSelectedIdea(customIdea);
    setWorkflowPhase('SELECTED');
    // reset chat – let backend deliver the first AI bubble
    setChatMessages([]);
    try {
      // Ensure we have a session for custom idea creation
      let currentSessionId = sessionId;
      if (!currentSessionId) {
        console.log('No current session for custom idea, initializing...');
        currentSessionId = await initializeSession();
        if (!currentSessionId) {
          throw new Error('Failed to initialize session for custom idea creation');
        }
      }
      
      console.log('Using session ID for custom idea:', currentSessionId);
      
      // Generate initial suggestions
      const initialSuggestions: DynamicSuggestion[] = [
        {
          id: '1',
          title: 'Target Audience',
          description: 'Tell me more about the target audience',
          type: 'question',
          relevance: 0.9
        },
        {
          id: '2',
          title: 'Content Tone',
          description: 'What tone should this content have?',
          type: 'question',
          relevance: 0.8
        },
        {
          id: '3',
          title: 'Structure Flow',
          description: 'Help me structure the content flow',
          type: 'action',
          relevance: 0.7
        }
      ];
      setSuggestions(initialSuggestions);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create session. Please try again.';
      logSecurely('error', 'Custom idea creation failed', { 
        sanitizedError: sanitizeErrorForUser(errorMessage)
      });
      setError(sanitizeErrorForUser(errorMessage));
    } finally {
      setLoading(false);
    }
  }, [sessionId, initializeSession]);

  // Shuffle ideas with retry logic
  const shuffleIdeas = useCallback(async (retryCount = 0) => {
    if (!sessionId) return;
    
    // Validate session ID before using it
    if (typeof sessionId !== 'string' || sessionId.length !== 24) {
      logSecurely('error', 'Invalid session ID for shuffle', { sessionIdType: typeof sessionId });
      setError(sanitizeErrorForUser('Invalid session - please refresh the page'));
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const { response, data } = await makeApiCall('/api/services/thinkforge/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt,
          preferences: {},
          session_id: sessionId,
          regenerate: true
        })
      }, 'shuffle ideas');

      if (data.success && data.taskId) {
        // Track the task with session context
        setCurrentTaskSession({
          taskId: data.taskId,
          sessionId: data.sessionId || sessionId,
          taskType: 'ideas'
        });
        console.log('Shuffle ideas task created, tracking taskId:', data.taskId);
        // Loading state will be cleared when task completes via Firebase listener
      } else {
        throw new Error(sanitizeErrorForUser(data.error?.message || 'Failed to shuffle ideas'));
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_RECOVERED' && retryCount < 1) {
        logSecurely('info', 'Retrying shuffle ideas after session recovery');
        return shuffleIdeas(retryCount + 1);
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to shuffle ideas. Please try again.';
      logSecurely('error', 'Shuffle ideas failed', { 
        sanitizedError: sanitizeErrorForUser(errorMessage)
      });
      setError(sanitizeErrorForUser(errorMessage));
      setLoading(false);
    }
  }, [prompt, sessionId, makeApiCall]);

  // Select an idea and proceed to chat
  const selectIdea = useCallback((idea: Idea) => {
    setSelectedIdea(idea);
    setWorkflowPhase('SELECTED');
    // Clear chat; backend will produce AI greeting
    setChatMessages([]);
    
    // Generate initial suggestions
    const initialSuggestions: DynamicSuggestion[] = [
      {
        id: '1',
        title: 'Target Audience',
        description: 'Tell me more about the target audience',
        type: 'question',
        relevance: 0.9
      },
      {
        id: '2',
        title: 'Content Tone',
        description: 'What tone should this content have?',
        type: 'question',
        relevance: 0.8
      },
      {
        id: '3',
        title: 'Structure Flow',
        description: 'Help me structure the content flow',
        type: 'action',
        relevance: 0.7
      }
    ];
    setSuggestions(initialSuggestions);
  }, []);

  // Update selected idea
  const updateSelectedIdea = useCallback((updatedIdea: Idea) => {
    setSelectedIdea(updatedIdea);
  }, []);

  // Go back to ideas selection
  const goBackToIdeas = useCallback(() => {
    setWorkflowPhase('IDEAS');
    setSelectedIdea(null);
    setChatMessages([]);
    setSuggestions([]);
  }, []);

  // Proceed to chat phase
  const proceedToChat = useCallback(() => {
    setWorkflowPhase('CHAT');
    // Reset welcome flag to ensure proper auto-welcome behavior on new chat sessions
    if (chatMessages.length > 0) {
      welcomeSentRef.current = true; // Skip welcome if messages already exist
    } else {
      welcomeSentRef.current = false; // Allow welcome for empty chat
    }
  }, [chatMessages.length]);

  // Enhanced send chat message with better race condition handling
  const sendMessage = useCallback(async (message: string, retryCount = 0) => {
    if (!selectedIdea || !sessionId) {
      console.warn('Cannot send message: missing selectedIdea or sessionId');
      return;
    }

    // Enhanced duplicate detection
    if (isDuplicateMessage(message)) {
      return;
    }

    const operationId = `send-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    if (!trackOperation(operationId)) {
      console.warn('Send operation already in progress, ignoring duplicate request');
      return;
    }

    if (sendInProgressRef.current) {
      console.warn('Message sending already in progress, ignoring duplicate request');
      completeOperation(operationId);
      return;
    }
    
    if (sendingMessage) {
      console.warn('Already sending message, ignoring duplicate request');
      completeOperation(operationId);
      return;
    }
    
    sendInProgressRef.current = true;
    lastMessageRef.current = message;
    
    // Reset welcome flag since user is manually sending a message
    welcomeSentRef.current = false;

    // Add user message optimistically
    const messageId = `user-${uuidv4()}-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: messageId,
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    setChatMessages(prev => [...prev, userMessage]);

    // Keep spinner until RTDB tells us the task is completed
    setSendingMessage(true);

    // Set a timeout to reset sending state if something goes wrong
    raceManager.cancelOperation('send-timeout', sessionId || 'default');
          raceManager.createSafeTimeout(
        'send-timeout',
        sessionId || 'default',
        () => {
          logSecurely('warn', 'Message sending timeout reached, resetting state');
          setSendingMessage(false);
          sendInProgressRef.current = false;
          setError(sanitizeErrorForUser('Message sending timed out. Please try again.'));
        },
        60000 // 60 second timeout
      );

    let keepLoading = false; // prevents finally{} from turning loading off when we intentionally keep it on

    try {
      const updatedChatHistory = [...chatMessages, userMessage];

      const { data } = await makeApiCall('/api/services/thinkforge/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message, 
          sessionId,
          context: {
            selectedIdea,
            chatHistory: updatedChatHistory
          }
        })
      }, 'send message');

      if (data.success && data.taskId) {
        // Track task using enhanced session management
        const taskSession = {
          taskId: data.taskId,
          sessionId: data.sessionId || sessionId,
          taskType: 'chat'
        };
        
        if (setCurrentTaskSessionSafe(taskSession)) {
          // Keep loading state – it will be cleared when the listener processes the completed task
          keepLoading = true;
        } else {
          console.warn('Failed to set task session, task may already be tracked');
        }
      } else if (data.success && data.aiResponse) {
        // Fallback for older synchronous contract – still show immediate response
        const aiResponse: ChatMessage = {
          id: `ai-sync-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'ai',
          content: data.aiResponse.content || data.aiResponse.message || '',
          timestamp: new Date()
        };
        setChatMessages(prev => [...prev, aiResponse]);
        setSuggestions(data.suggestions || []);
      } else {
        throw new Error(data.error?.message || 'Failed to send message');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_RECOVERED' && retryCount < 1) {
        console.log('Retrying send message after session recovery...');
        // Remove the user message before retry to avoid duplication
        setChatMessages(prev => prev.slice(0, -1));
        completeOperation(operationId);
        return sendMessage(message, retryCount + 1);
      }

      // Enhanced error handling with user-friendly messages
      let errorMessage = 'Failed to send message. Please try again.';
      if (err instanceof Error) {
        const errMsg = err.message.toLowerCase();
        if (errMsg.includes('network') || errMsg.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (errMsg.includes('session')) {
          errorMessage = 'Session error. Your session may have expired. Please refresh the page.';
        } else if (errMsg.includes('quota') || errMsg.includes('limit') || errMsg.includes('exceeded')) {
          // Check if it's a service limit error with specific message
          if (errMsg.includes('weekly sessions') || errMsg.includes('session limit') || errMsg.includes('sessions this week')) {
            errorMessage = err.message; // Use the full descriptive message from the middleware
          } else {
            errorMessage = 'You have reached your usage limit. Please try again later or upgrade your plan.';
          }
        } else if (errMsg.includes('unauthorized')) {
          errorMessage = 'Authentication error. Please sign in again.';
        } else if (err.message !== 'Failed to send message') {
          errorMessage = `Error: ${err.message}`;
        }
      }
      
      logSecurely('error', 'Message sending failed', { 
        sanitizedError: sanitizeErrorForUser(errorMessage),
        messageLength: message?.length || 0
      });
      setError(sanitizeErrorForUser(errorMessage));
      
      // Remove the failed user message from chat to allow retry
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      // Clear timeout when request completes
      raceManager.cancelOperation('send-timeout', sessionId || 'default');
      
      if (!keepLoading) {
        setSendingMessage(false);
      }
      sendInProgressRef.current = false;
      lastMessageRef.current = null;
      completeOperation(operationId);
    }
  }, [selectedIdea, sessionId, chatMessages, makeApiCall, isDuplicateMessage, trackOperation, completeOperation, setCurrentTaskSessionSafe]);

  // Select suggestion
  const selectSuggestion = useCallback((suggestion: DynamicSuggestion) => {
    // Don't auto-send, let the user edit the suggestion first
    // The ChatInterface will handle pasting the description into the input
  }, []);

  // Enhanced generate script with race condition protection
  const generateScript = useCallback(async (retryCount = 0) => {
    if (!selectedIdea || !sessionId) return;
    
    const operationId = `generate-script-${Date.now()}`;
    
    if (!trackOperation(operationId)) {
      console.warn('Script generation already in progress, ignoring duplicate request');
      return;
    }
    
    try {
      // Immediately open script editor and start generating
      setWorkflowPhase('SCRIPT');
      setGeneratingScript(true);
      setError(null);
    
      const existingScript = loadScriptFromLocalStorage(selectedIdea.id, sessionId);
      if (existingScript) {
        setGeneratedScript(existingScript);
        setGeneratingScript(false);
        console.log('Script loaded from localStorage:', selectedIdea.id);
        return;
      }

      const { response, data } = await makeApiCall('/api/services/thinkforge/scripts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: sessionId, // camelCase aligns with scripts route contract
          selectedIdea, 
          chatHistory: chatMessages 
        })
      }, 'generate script');

      if (data.success && data.taskId) {
        // Track the task using enhanced session management
        const taskSession = {
          taskId: data.taskId,
          sessionId: data.sessionId || sessionId,
          taskType: 'scripts'
        };
        
        if (setCurrentTaskSessionSafe(taskSession)) {
          console.log('Script generation task created, tracking taskId:', data.taskId);
          // Loading state will be cleared when task completes via Firebase listener
        } else {
          console.warn('Failed to set script generation task session');
        }
      } else {
        throw new Error(data.error?.message || 'Failed to generate script');
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_RECOVERED' && retryCount < 1) {
        logSecurely('info', 'Retrying script generation after session recovery');
        completeOperation(operationId);
        return generateScript(retryCount + 1);
      }
      
      // Enhanced error handling for script generation
      let errorMessage = 'Failed to generate script. Please try again.';
      if (err instanceof Error) {
        const errMsg = err.message.toLowerCase();
        if (errMsg.includes('quota') || errMsg.includes('limit') || errMsg.includes('exceeded')) {
          // Check if it's a service limit error with specific message
          if (errMsg.includes('weekly sessions') || errMsg.includes('session limit') || errMsg.includes('sessions this week')) {
            errorMessage = err.message; // Use the full descriptive message from the middleware
          } else {
            errorMessage = 'You have reached your usage limit. Please try again later or upgrade your plan.';
          }
        } else {
          errorMessage = err.message;
        }
      }
      
      logSecurely('error', 'Script generation failed', { 
        sanitizedError: sanitizeErrorForUser(errorMessage),
        ideaId: selectedIdea?.id
      });
      setError(sanitizeErrorForUser(errorMessage));
      setGeneratingScript(false);
      // Stay in script editor even if generation fails
    } finally {
      completeOperation(operationId);
    }
  }, [selectedIdea, sessionId, chatMessages, makeApiCall, loadScriptFromLocalStorage, trackOperation, completeOperation, setCurrentTaskSessionSafe]);

  // Edit script
  const editScript = useCallback((updatedScript: Script) => {
    setGeneratedScript(updatedScript);
    
    // Save updated script to localStorage
    if (selectedIdea && sessionId) {
      saveScriptToLocalStorage(updatedScript, selectedIdea.id, sessionId);
    }
  }, [selectedIdea, sessionId, saveScriptToLocalStorage]);

  // Export script
  const exportScript = useCallback(() => {
    if (!generatedScript) return;
    
    setLoading(true);
    raceManager.createSafeTimeout(
      'export-script',
      'export-process',
      () => {
        // Simulate export process
        const title = generatedScript.title || 'ThinkForge Script';
        const sections = generatedScript.sections || [];
        const sectionsText = sections.map(s => `${s.name || 'Section'}\n${s.content || ''}`).join('\n\n');
        const scriptText = `${title}\n\n${sectionsText}`;
        
        const blob = new Blob([scriptText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_script.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setLoading(false);
      },
      1000
    );
  }, [generatedScript]);

  // Back to chat from script
  const backToChat = useCallback(() => {
    setWorkflowPhase('CHAT');
  }, []);

  // Start a new session (clear all state and create fresh session)
  const handleStartNewSession = useCallback(async () => {
    setGoingHome(true);
    
    try {
      // Clear all workflow state first
      setWorkflowPhase('PROMPT');
      setPrompt('');
      setSelectedIdea(null);
      setIdeas([]);
      setGeneratedScript(null);
      setChatMessages([]);
      setSuggestions([]);
      setError(null);
      setCurrentTaskSession(null);
      
      // Clear all loading states
      setLoading(false);
      setSendingMessage(false);
      setGeneratingScript(false);
      
      // Create new session (this also cleans up the old one)
      console.log('Starting new session (home navigation)');
      const newSessionId = await createNewSession();
      
      if (newSessionId) {
        logSecurely('info', 'New session created successfully');
      } else {
        logSecurely('error', 'Failed to create new session');
        setError(sanitizeErrorForUser('Failed to create new session. Please refresh the page.'));
      }
      
    } catch (error) {
      logSecurely('error', 'Failed to start new session', { 
        sanitizedError: sanitizeErrorForUser(error instanceof Error ? error.message : 'Unknown error')
      });
      setError(sanitizeErrorForUser('Failed to create new session. Please refresh the page.'));
    } finally {
      // Clear going home state after cleanup
      raceManager.createSafeTimeout(
        'clear-going-home',
        'start-new-session',
        () => {
          setGoingHome(false);
        },
        1000
      );
    }
  }, [createNewSession]);

  // Cleanup handled automatically by useRaceConditionManager hook

  // Enhanced timeout management with progressive backoff
  const timeoutManager = useRef({
    currentTimeout: 60000, // Start with 60 seconds
    maxTimeout: 180000, // Max 3 minutes
    backoffMultiplier: 1.5,
    retryAttempts: 0,
    maxRetries: 3
  });

  // Reset timeout manager for new operations
  const resetTimeoutManager = useCallback(() => {
    timeoutManager.current = {
      currentTimeout: 60000,
      maxTimeout: 180000,
      backoffMultiplier: 1.5,
      retryAttempts: 0,
      maxRetries: 3
    };
  }, []);

  // Enhanced timeout handling with progressive backoff
  const createSmartTimeout = useCallback((
    operationId: string,
    sessionKey: string,
    onTimeout: () => void,
    customTimeout?: number
  ) => {
    const timeout = customTimeout || timeoutManager.current.currentTimeout;
    
    console.log(`⏰ Setting smart timeout for ${operationId}: ${timeout}ms (attempt ${timeoutManager.current.retryAttempts + 1})`);
    
    // Create warning timeout at 75% of main timeout
    const warningTimeout = timeout * 0.75;
    
    // Set warning notification
    const warningTimeoutId = raceManager.createSafeTimeout(
      `${operationId}-warning`,
      sessionKey,
      () => {
        console.log(`⚠️ Operation ${operationId} taking longer than expected...`);
        // Could show a "still processing..." message to user
      },
      warningTimeout
    );
    
    // Set main timeout with enhanced error message
    const mainTimeoutId = raceManager.createSafeTimeout(
      operationId,
      sessionKey,
      () => {
        console.warn(`⏰ Timeout reached for ${operationId} after ${timeout}ms`);
        
        // Increment timeout for next attempt
        if (timeoutManager.current.retryAttempts < timeoutManager.current.maxRetries) {
          timeoutManager.current.currentTimeout = Math.min(
            timeoutManager.current.currentTimeout * timeoutManager.current.backoffMultiplier,
            timeoutManager.current.maxTimeout
          );
          timeoutManager.current.retryAttempts++;
        }
        
        onTimeout();
      },
      timeout
    );
    
    return {
      warningTimeoutId,
      mainTimeoutId,
      cancel: () => {
        raceManager.cancelOperation(`${operationId}-warning`, sessionKey);
        raceManager.cancelOperation(operationId, sessionKey);
      }
    };
  }, [raceManager]);

  // Enhanced error messages based on timeout patterns
  const getTimeoutErrorMessage = useCallback((operation: string, attempt: number) => {
    if (attempt === 1) {
      return `${operation} is taking longer than expected. This might be due to high server load. Please wait a moment and try again.`;
    } else if (attempt === 2) {
      return `${operation} timed out again. There may be connectivity issues. Please check your internet connection and try again.`;
    } else {
      return `${operation} has timed out multiple times. Please try again later or contact support if the issue persists.`;
    }
  }, []);

  // Enhanced operation retry logic
  const retryWithBackoff = useCallback(async <T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> => {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempting ${operationName} (${attempt}/${maxRetries})`);
        
        const result = await operation();
        
        // Reset timeout manager on success
        if (attempt > 1) {
          resetTimeoutManager();
          console.log(`✅ ${operationName} succeeded on attempt ${attempt}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        console.warn(`❌ ${operationName} attempt ${attempt} failed:`, error);
        
        if (attempt === maxRetries) {
          console.error(`💥 ${operationName} failed after ${maxRetries} attempts`);
          break;
        }
        
        // Progressive delay between retries
        const delay = 1000 * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }, [resetTimeoutManager]);

  // Enhanced connection health monitoring
  const connectionHealth = useRef({
    isOnline: navigator.onLine,
    lastConnectedAt: Date.now(),
    consecutiveFailures: 0,
    lastFailureType: null as string | null
  });

  // Monitor connection health
  useEffect(() => {
    const updateOnlineStatus = () => {
      const wasOffline = !connectionHealth.current.isOnline;
      connectionHealth.current.isOnline = navigator.onLine;
      
      if (navigator.onLine && wasOffline) {
        connectionHealth.current.lastConnectedAt = Date.now();
        connectionHealth.current.consecutiveFailures = 0;
        console.log('🟢 Connection restored');
        
        // Could trigger retry of failed operations here
      } else if (!navigator.onLine) {
        console.log('🔴 Connection lost');
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // Enhanced network error detection
  const isNetworkError = useCallback((error: any): boolean => {
    if (!error) return false;
    
    const errorMessage = error.message || error.toString();
    const networkKeywords = [
      'network', 'offline', 'timeout', 'fetch', 'connection',
      'unreachable', 'dns', 'socket', 'abort', 'cors'
    ];
    
    return networkKeywords.some(keyword => 
      errorMessage.toLowerCase().includes(keyword)
    ) || !connectionHealth.current.isOnline;
  }, []);

  // Enhanced error categorization
  const categorizeError = useCallback((error: any) => {
    if (isNetworkError(error)) {
      connectionHealth.current.consecutiveFailures++;
      connectionHealth.current.lastFailureType = 'network';
      return {
        type: 'network',
        retryable: true,
        userMessage: 'Network connectivity issue. Please check your connection and try again.',
        suggestedDelay: 2000 + (connectionHealth.current.consecutiveFailures * 1000)
      };
    }
    
    if (error?.message?.includes('session')) {
      return {
        type: 'session',
        retryable: true,
        userMessage: 'Session issue detected. Attempting to recover your session...',
        suggestedDelay: 1000
      };
    }
    
    if (error?.message?.includes('quota') || error?.message?.includes('limit')) {
      return {
        type: 'quota',
        retryable: false,
        userMessage: 'Usage limit reached. Please try again later or upgrade your plan.',
        suggestedDelay: 0
      };
    }
    
    if (error?.message?.includes('timeout')) {
      return {
        type: 'timeout',
        retryable: true,
        userMessage: 'Request timed out. This may be due to high server load.',
        suggestedDelay: 3000
      };
    }
    
    return {
      type: 'unknown',
      retryable: false,
      userMessage: 'An unexpected error occurred. Please try again.',
      suggestedDelay: 1000
    };
  }, [isNetworkError]);

  return {
    // State
    workflowPhase,
    prompt,
    loading,
    sendingMessage,
    generatingScript,
    goingHome,
    error,
    selectedIdea,
    ideas,
    generatedScript,
    chatMessages,
    suggestions,
    isRecovering,
    isCreatingSession,
    currentTaskId: currentTaskSession?.taskId || null,
    sessionId,
    
    // Actions
    generateIdeas,
    createCustomIdea,
    shuffleIdeas,
    selectIdea,
    updateSelectedIdea,
    goBackToIdeas,
    proceedToChat,
    sendMessage,
    selectSuggestion,
    generateScript,
    editScript,
    exportScript,
    backToChat,
    startNewSession: handleStartNewSession,
    loadSession,
    setError,
  };
} 