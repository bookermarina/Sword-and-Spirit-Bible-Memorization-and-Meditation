import React, { useState, useEffect, useRef } from 'react';
import { Verse, ChatMessage, VerseSuggestion, BibleVersion, UserProfile, DailyStats } from './types';
import { geminiService } from './services/geminiService';
import { VerseList } from './components/VerseList';
import { MemorizationStudio } from './components/MemorizationStudio';
import { ProfileManager } from './components/ProfileManager';
import { VerseDetail } from './components/VerseDetail';

// Robust ID generator to avoid external dependency issues
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const INITIAL_MSG: ChatMessage = {
  id: 'init-1',
  role: 'model',
  text: "Grace and peace to you. I am here to help you arm yourself with Scripture. What spiritual battle are you facing today? Whether it is anxiety, fear, pride, or weariness, there is a word from the Lord for you.",
};

const LEGACY_STORAGE_KEY = 'sword_spirit_data';
const USERS_STORAGE_KEY = 'sword_spirit_users';

const COLORS = [
  'bg-red-500', 'bg-orange-500', 'bg-amber-500', 
  'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
  'bg-cyan-500', 'bg-blue-500', 'bg-indigo-500', 
  'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
  'bg-pink-500', 'bg-rose-500'
];

export default function App() {
  // --- Profile State ---
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  // Track which user's data is currently loaded in the state to prevent overwrites
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  // --- App State ---
  const [verses, setVerses] = useState<Verse[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([INITIAL_MSG]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Daily Goal State
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    date: new Date().toISOString().split('T')[0],
    reviewsCompleted: 0,
    reviewGoal: 3
  });
  
  // Navigation State
  const [activeVerseId, setActiveVerseId] = useState<string | null>(null);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<BibleVersion>(BibleVersion.ESV);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // --- Auto-Save Refs ---
  // We use a ref to hold the latest state for the interval timer
  const stateRef = useRef({
    verses,
    currentVersion,
    chatHistory,
    dailyStats,
    activeVerseId,
    isPracticeMode,
    currentUser,
    loadedUserId
  });

  // Sync refs with state
  useEffect(() => {
    stateRef.current = {
      verses,
      currentVersion,
      chatHistory,
      dailyStats,
      activeVerseId,
      isPracticeMode,
      currentUser,
      loadedUserId
    };
  }, [verses, currentVersion, chatHistory, dailyStats, activeVerseId, isPracticeMode, currentUser, loadedUserId]);

  // Computed
  const activeVerse = verses.find(v => v.id === activeVerseId) || null;

  // --- Initialization & Migration ---
  useEffect(() => {
    const savedUsers = localStorage.getItem(USERS_STORAGE_KEY);
    let parsedUsers: UserProfile[] = [];

    if (savedUsers) {
      try {
        parsedUsers = JSON.parse(savedUsers);
      } catch (e) {
        console.error("Failed to parse users", e);
      }
    }

    // Check for legacy data to migrate
    const legacyData = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyData && parsedUsers.length === 0) {
      // Create a default user for legacy data
      const defaultUser: UserProfile = {
        id: generateId(),
        name: 'Faithful Warrior',
        color: 'bg-indigo-900',
        createdAt: Date.now()
      };
      
      // Save legacy data to new user key
      localStorage.setItem(`sword_spirit_data_${defaultUser.id}`, legacyData);
      
      // Update users list
      parsedUsers = [defaultUser];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(parsedUsers));
      
      // Clear legacy global key
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }

    setProfiles(parsedUsers);
  }, []);

  // --- User Data Loading ---
  useEffect(() => {
    if (!currentUser) {
      setLoadedUserId(null);
      return;
    }

    const userKey = `sword_spirit_data_${currentUser.id}`;
    const saved = localStorage.getItem(userKey);
    const today = new Date().toISOString().split('T')[0];

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.verses) {
          // Ensure migration of any old schema data
          const migratedVerses = parsed.verses.map((v: any) => ({
            ...v,
            nextReview: v.nextReview || Date.now(),
            interval: v.interval || 0,
            easeFactor: v.easeFactor || 2.5,
            repetitions: v.repetitions || 0,
            mastery: v.mastery || 0
          }));
          setVerses(migratedVerses);
        } else {
          setVerses([]);
        }
        
        if (parsed.version) setCurrentVersion(parsed.version);
        else setCurrentVersion(BibleVersion.ESV);

        if (parsed.chatHistory) setChatHistory(parsed.chatHistory);
        else setChatHistory([INITIAL_MSG]);

        // Restore Session State (Active Verse/Mode)
        if (parsed.activeVerseId && parsed.verses.some((v: any) => v.id === parsed.activeVerseId)) {
          setActiveVerseId(parsed.activeVerseId);
        } else {
          setActiveVerseId(null);
        }
        
        if (parsed.isPracticeMode) setIsPracticeMode(parsed.isPracticeMode);
        else setIsPracticeMode(false);

        // Load daily stats
        if (parsed.dailyStats) {
          if (parsed.dailyStats.date === today) {
            setDailyStats(parsed.dailyStats);
          } else {
            // New day, reset count
            setDailyStats({ date: today, reviewsCompleted: 0, reviewGoal: parsed.dailyStats.reviewGoal || 3 });
          }
        } else {
          setDailyStats({ date: today, reviewsCompleted: 0, reviewGoal: 3 });
        }

      } catch (e) {
        console.error("Failed to load user data", e);
        setVerses([]);
        setChatHistory([INITIAL_MSG]);
        setDailyStats({ date: today, reviewsCompleted: 0, reviewGoal: 3 });
      }
    } else {
      // New user default state
      setVerses([]);
      setChatHistory([INITIAL_MSG]);
      setCurrentVersion(BibleVersion.ESV);
      setDailyStats({ date: today, reviewsCompleted: 0, reviewGoal: 3 });
      setActiveVerseId(null);
      setIsPracticeMode(false);
    }

    // Mark that we have finished loading data for this user
    setLoadedUserId(currentUser.id);

  }, [currentUser]);

  // --- Persistence (Reactive) ---
  useEffect(() => {
    // CRITICAL FIX: Only save if we have a user AND the loaded data belongs to that user.
    // This prevents overwriting a new user's data with old state during the switching race condition.
    if (!currentUser || loadedUserId !== currentUser.id) return;

    const userKey = `sword_spirit_data_${currentUser.id}`;
    const dataToSave = {
      verses,
      version: currentVersion,
      chatHistory,
      dailyStats,
      // Persist UI state for "picking up where left off"
      activeVerseId,
      isPracticeMode
    };
    
    localStorage.setItem(userKey, JSON.stringify(dataToSave));
  }, [verses, currentVersion, chatHistory, currentUser, dailyStats, activeVerseId, isPracticeMode, loadedUserId]);

  // --- Persistence (Interval Backup) ---
  useEffect(() => {
    const saveInterval = setInterval(() => {
      const state = stateRef.current;
      
      // Ensure we are in a valid state to save (user loaded matching current user)
      if (state.currentUser && state.loadedUserId === state.currentUser.id) {
        const userKey = `sword_spirit_data_${state.currentUser.id}`;
        const dataToSave = {
          verses: state.verses,
          version: state.currentVersion,
          chatHistory: state.chatHistory,
          dailyStats: state.dailyStats,
          activeVerseId: state.activeVerseId,
          isPracticeMode: state.isPracticeMode
        };
        localStorage.setItem(userKey, JSON.stringify(dataToSave));
      }
    }, 30000); // 30 seconds

    return () => clearInterval(saveInterval);
  }, []);

  // --- User Handlers ---
  const handleCreateProfile = (name: string) => {
    const newProfile: UserProfile = {
      id: generateId(),
      name,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      createdAt: Date.now()
    };

    // Use functional update to ensure we have the latest profiles state
    // and save to localStorage synchronously with the state update
    setProfiles(prev => {
      const updatedProfiles = [...prev, newProfile];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedProfiles));
      return updatedProfiles;
    });

    setCurrentUser(newProfile);
  };

  const handleDeleteProfile = (id: string) => {
    if (!window.confirm("Are you sure? This will delete all memorization progress for this user.")) return;
    
    setProfiles(prev => {
      const updatedProfiles = prev.filter(p => p.id !== id);
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updatedProfiles));
      return updatedProfiles;
    });

    localStorage.removeItem(`sword_spirit_data_${id}`);

    if (currentUser?.id === id) {
      setCurrentUser(null);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    // Reset state immediately for UI
    setVerses([]);
    setChatHistory([INITIAL_MSG]);
    setActiveVerseId(null);
    setIsPracticeMode(false);
  };

  // --- Mock Cloud Login Handler ---
  // TODO: Replace this with actual Firebase Authentication logic
  const handleCloudSync = () => {
    alert("To enable real cloud sync, you must set up a Firebase project and add the credentials to this app.\n\nFor now, I will create a simulated 'Cloud Profile' for you.");
    
    const mockCloudUser: UserProfile = {
      id: generateId(),
      name: 'Google User (Demo)',
      email: 'demo@gmail.com',
      isSynced: true,
      color: 'bg-indigo-600',
      createdAt: Date.now()
    };

    setProfiles(prev => {
      // Avoid dupes in demo
      if (prev.some(p => p.email === mockCloudUser.email)) return prev;
      const updated = [mockCloudUser, ...prev];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    
    setCurrentUser(mockCloudUser);
  };

  // --- App Logic ---
  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading || !currentUser) return;

    const newMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      text: userInput
    };

    setChatHistory(prev => [...prev, newMsg]);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await geminiService.sendMessage(
        chatHistory, 
        userInput, 
        currentVersion,
        currentUser,
        verses // Pass verses so the AI knows the user's "Spiritual Inventory"
      );
      
      const responseMsg: ChatMessage = {
        id: generateId(),
        role: 'model',
        text: response.text,
        suggestedVerses: response.suggestions
      };

      setChatHistory(prev => [...prev, responseMsg]);
    } catch (error) {
      setChatHistory(prev => [...prev, {
        id: generateId(),
        role: 'model',
        text: "I apologize, but I am having trouble consulting the archives right now. Please check your connection and try again.",
        isError: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const addVerse = (suggestion: VerseSuggestion) => {
    if (verses.some(v => v.reference === suggestion.reference)) return;

    const newVerse: Verse = {
      id: generateId(),
      reference: suggestion.reference,
      text: suggestion.text,
      version: currentVersion,
      topic: suggestion.topic,
      addedAt: Date.now(),
      mastery: 0,
      nextReview: Date.now(),
      interval: 0,
      easeFactor: 2.5,
      repetitions: 0
    };

    setVerses(prev => [newVerse, ...prev]);
  };

  const removeVerse = (id: string) => {
    setVerses(prev => prev.filter(v => v.id !== id));
    if (activeVerseId === id) {
      setActiveVerseId(null);
      setIsPracticeMode(false);
    }
  };

  const handleSelectVerse = (verse: Verse) => {
    setActiveVerseId(verse.id);
    setIsPracticeMode(false); // Open Detail view first
  };

  const handleStartPractice = () => {
    setIsPracticeMode(true);
  };

  const handleReviewComplete = (id: string, quality: number) => {
    // SuperMemo-2 (SM-2) Algorithm Implementation
    setVerses(prev => prev.map(v => {
      if (v.id !== id) return v;

      let { interval, repetitions, easeFactor } = v;

      // 1. Update Ease Factor (EF)
      let newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
      if (newEaseFactor < 1.3) newEaseFactor = 1.3; 

      // 2. Calculate Interval & Repetitions
      if (quality < 3) {
        repetitions = 0;
        interval = 1;
      } else {
        if (repetitions === 0) {
          interval = 1;
        } else if (repetitions === 1) {
          interval = 6;
        } else {
          interval = Math.round(interval * newEaseFactor);
        }
        repetitions++;
      }

      // 3. Add "Fuzz"
      let fuzzedInterval = interval;
      if (interval > 4) {
        const fuzzFactor = 0.95 + (Math.random() * 0.1); 
        fuzzedInterval = Math.round(interval * fuzzFactor);
      }

      const newMastery = Math.min(100, Math.round((repetitions * 15) + (newEaseFactor * 5)));
      const nextReview = Date.now() + (fuzzedInterval * 24 * 60 * 60 * 1000);

      return {
        ...v,
        interval: fuzzedInterval,
        repetitions,
        easeFactor: newEaseFactor,
        nextReview,
        mastery: newMastery
      };
    }));

    // 2. Update Daily Stats
    const today = new Date().toISOString().split('T')[0];
    setDailyStats(prev => {
      if (prev.date === today) {
        return { ...prev, reviewsCompleted: prev.reviewsCompleted + 1 };
      } else {
        return { date: today, reviewsCompleted: 1, reviewGoal: prev.reviewGoal };
      }
    });
    
    // Return to Detail view to see updated stats
    setIsPracticeMode(false);
  };

  // --- Render ---

  if (!currentUser) {
    return (
      <ProfileManager 
        profiles={profiles}
        onSelectProfile={setCurrentUser}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
        onCloudSync={handleCloudSync}
      />
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <VerseList 
        verses={verses} 
        onSelect={handleSelectVerse} 
        onRemove={removeVerse} 
        isOpen={sidebarOpen}
        toggleOpen={() => setSidebarOpen(!sidebarOpen)}
        dailyStats={dailyStats}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative">
        
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10 shadow-sm shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm ${currentUser.color}`}>
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
               <h1 className="text-sm font-bold text-slate-800">{currentUser.name}</h1>
               <div className="flex items-center gap-1">
                 <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sword & Spirit</p>
                 {currentUser.isSynced && (
                   <span className="text-[9px] bg-green-100 text-green-700 px-1.5 rounded-full font-bold">Cloud Synced</span>
                 )}
               </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <select 
              value={currentVersion}
              onChange={(e) => setCurrentVersion(e.target.value as BibleVersion)}
              className="text-sm border border-slate-300 rounded-md px-3 py-1.5 bg-slate-50 text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {Object.values(BibleVersion).map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            
            <button 
              onClick={handleLogout}
              className="text-xs font-bold text-slate-400 hover:text-indigo-600 uppercase tracking-wide px-3 py-1.5 border border-transparent hover:border-indigo-100 hover:bg-indigo-50 rounded-md transition-all"
            >
              Switch User
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {chatHistory.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-[90%] sm:max-w-[75%] rounded-2xl p-5 shadow-sm 
                  ${msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none'
                  }
                  ${msg.isError ? 'border-red-300 bg-red-50 text-red-800' : ''}
                `}
              >
                {/* Only render text container if text is not empty */}
                {msg.text && (
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
                      {msg.text.split('**').map((chunk, i) => 
                          i % 2 === 1 ? <strong key={i}>{chunk}</strong> : chunk
                      )}
                  </div>
                )}

                {msg.suggestedVerses && msg.suggestedVerses.length > 0 && (
                  <div className={`${msg.text ? 'mt-4' : ''} grid gap-3 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2`}>
                    {msg.suggestedVerses.map((sug, idx) => (
                      <div key={idx} className="bg-amber-50 rounded-lg p-4 border border-amber-100 flex flex-col shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                            <span className="font-bold text-amber-900 text-sm">{sug.reference}</span>
                            <span className="text-[10px] text-amber-700 uppercase tracking-widest bg-amber-200/50 px-2 py-0.5 rounded">{sug.topic}</span>
                        </div>
                        <p className="text-amber-900/80 text-xs italic font-serif line-clamp-3 mb-3">
                          "{sug.text}"
                        </p>
                        <button 
                          onClick={() => addVerse(sug)}
                          disabled={verses.some(v => v.reference === sug.reference)}
                          className="mt-auto w-full text-xs font-bold uppercase tracking-wide py-2 rounded bg-white text-amber-700 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {verses.some(v => v.reference === sug.reference) ? 'Saved' : 'Add to Memory'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-none p-4 border border-slate-200 shadow-sm flex items-center gap-2">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200 shrink-0">
          <div className="max-w-4xl mx-auto flex gap-3">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ex: I am struggling with anxiety about the future..."
              className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 rounded-full px-6 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-shadow placeholder-slate-400"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !userInput.trim()}
              className="bg-indigo-900 hover:bg-indigo-800 text-white rounded-full w-12 h-12 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-2">
            AI can make mistakes. Verify scripture with your Bible.
          </p>
        </div>

      </div>

      {activeVerse && !isPracticeMode && (
        <VerseDetail 
          verse={activeVerse} 
          onClose={() => setActiveVerseId(null)}
          onPractice={handleStartPractice}
          onDelete={removeVerse}
        />
      )}

      {activeVerse && isPracticeMode && (
        <MemorizationStudio 
          verse={activeVerse} 
          onClose={() => setIsPracticeMode(false)} 
          onReviewComplete={handleReviewComplete}
        />
      )}
    </div>
  );
}