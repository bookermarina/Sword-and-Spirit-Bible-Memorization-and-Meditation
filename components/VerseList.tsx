import React, { useState } from 'react';
import { Verse, DailyStats } from '../types';

interface VerseListProps {
  verses: Verse[];
  onSelect: (verse: Verse) => void;
  onRemove: (id: string) => void;
  isOpen: boolean;
  toggleOpen: () => void;
  dailyStats: DailyStats;
}

export const VerseList: React.FC<VerseListProps> = ({ verses, onSelect, onRemove, isOpen, toggleOpen, dailyStats }) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  // Sort verses: Overdue/Due first, then by reference
  const sortedVerses = [...verses].sort((a, b) => {
    // If one is due and other isn't, prioritize due
    const now = Date.now();
    const aDue = a.nextReview <= now;
    const bDue = b.nextReview <= now;

    if (aDue && !bDue) return -1;
    if (!aDue && bDue) return 1;

    // If both are due or both are future, sort by date ascending (earliest review first)
    if (a.nextReview !== b.nextReview) return a.nextReview - b.nextReview;

    // Fallback to name
    return a.reference.localeCompare(b.reference);
  });

  // Filter based on search query
  const filteredVerses = sortedVerses.filter(verse => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      verse.reference.toLowerCase().includes(q) ||
      verse.text.toLowerCase().includes(q) ||
      (verse.topic && verse.topic.toLowerCase().includes(q))
    );
  });

  const getDueStatus = (nextReview: number) => {
    const diff = nextReview - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days <= 0) return { label: 'Due Now', color: 'text-red-500' };
    if (days === 1) return { label: 'Tomorrow', color: 'text-slate-400' };
    return { label: `in ${days} days`, color: 'text-slate-400' };
  };

  const goalProgress = Math.min(100, (dailyStats.reviewsCompleted / dailyStats.reviewGoal) * 100);
  const isGoalMet = dailyStats.reviewsCompleted >= dailyStats.reviewGoal;

  return (
    <>
      {/* Mobile Toggle Button (Visible when sidebar is closed on mobile) */}
      {!isOpen && (
        <button 
          onClick={toggleOpen}
          className="fixed bottom-4 right-4 z-40 md:hidden bg-indigo-900 text-white p-4 rounded-full shadow-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
        </button>
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-30 w-80 bg-slate-900 text-slate-100 transform transition-transform duration-300 ease-in-out shadow-2xl
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:w-80 flex flex-col
      `}>
        <div className="p-6 border-b border-slate-700 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold font-serif text-amber-50">My Sword</h2>
            <p className="text-xs text-slate-400">Scripture Library</p>
          </div>
          <button onClick={toggleOpen} className="md:hidden text-slate-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block pl-10 p-2.5 placeholder-slate-500 outline-none transition-colors"
              placeholder="Search reference, topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Daily Goal Widget */}
        <div className="px-4 py-4 border-b border-slate-800 bg-slate-800/30">
          <div className="flex justify-between items-end mb-2">
            <div>
              <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Daily Goal</span>
              <div className="text-sm font-medium text-slate-300">
                {isGoalMet ? 'Goal Met!' : 'Complete Reviews'}
              </div>
            </div>
            <div className="text-xs font-bold text-slate-400">
              {dailyStats.reviewsCompleted} <span className="text-slate-600">/</span> {dailyStats.reviewGoal}
            </div>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ease-out ${isGoalMet ? 'bg-green-500' : 'bg-indigo-500'}`} 
              style={{ width: `${goalProgress}%` }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {verses.length === 0 ? (
            <div className="text-center text-slate-500 py-10 italic text-sm">
              No verses saved yet.<br/>Chat with the Theologian to find armor for your battle.
            </div>
          ) : filteredVerses.length === 0 ? (
            <div className="text-center text-slate-500 py-10 italic text-sm">
              No verses found matching "{searchQuery}"
            </div>
          ) : (
            filteredVerses.map(verse => {
              const status = getDueStatus(verse.nextReview);
              const isDue = verse.nextReview <= Date.now();
              
              return (
                <div 
                  key={verse.id} 
                  className={`group relative rounded-lg p-4 border transition-all cursor-pointer
                    ${isDue 
                      ? 'bg-slate-800 border-amber-500/30 hover:border-amber-500' 
                      : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
                    }
                  `}
                  onClick={() => onSelect(verse)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-amber-500 uppercase tracking-wider">{verse.topic || 'General'}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onRemove(verse.id); }}
                        className="text-slate-500 hover:text-red-400"
                        title="Remove"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-slate-100 mb-1">{verse.reference}</h3>
                  <p className="text-sm text-slate-400 line-clamp-2 font-serif italic mb-3">"{verse.text}"</p>
                  
                  <div className="flex items-center justify-between border-t border-slate-700/50 pt-3 mt-1">
                    <div className="flex flex-col">
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${status.color}`}>
                        {status.label}
                      </span>
                      {verse.repetitions > 0 && (
                        <span className="text-[10px] text-slate-500">Streak: {verse.repetitions}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${verse.mastery === 100 ? 'bg-green-500' : verse.mastery > 30 ? 'bg-amber-500' : 'bg-red-500'}`} 
                          style={{ width: `${verse.mastery}%` }}
                        />
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onSelect(verse); }}
                        className={`text-xs px-3 py-1 rounded-full transition-colors font-medium
                          ${isDue ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-500/20 shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}
                        `}
                      >
                        View
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
};