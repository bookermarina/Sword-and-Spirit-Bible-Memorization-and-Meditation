import React from 'react';
import { Verse } from '../types';

interface VerseDetailProps {
  verse: Verse;
  onClose: () => void;
  onPractice: () => void;
  onDelete: (id: string) => void;
}

export const VerseDetail: React.FC<VerseDetailProps> = ({ verse, onClose, onPractice, onDelete }) => {
  
  const getDueStatus = (nextReview: number) => {
    const diff = nextReview - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days <= 0) return { label: 'Due Now', color: 'text-red-600', bg: 'bg-red-50' };
    if (days === 1) return { label: 'Tomorrow', color: 'text-amber-600', bg: 'bg-amber-50' };
    return { label: `in ${days} days`, color: 'text-green-600', bg: 'bg-green-50' };
  };

  const status = getDueStatus(verse.nextReview);

  // Helper to detect verse numbers formatted as [1], [12], etc.
  const isVerseRef = (text: string) => /^\[\d+\]$/.test(text);
  const words = verse.text.split(/(\s+)/);
  const verseNumStyle = "text-[10px] align-top text-indigo-400 font-bold select-none mr-0.5 opacity-80 inline-block";

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-1 rounded">
                {verse.topic || 'General'}
              </span>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {verse.version}
              </span>
            </div>
            <h2 className="text-3xl font-bold text-slate-800 font-serif">{verse.reference}</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto flex-1 bg-white">
          <div className="text-2xl md:text-3xl font-serif text-slate-800 leading-relaxed text-center mb-8">
             {words.map((word, idx) => {
               if (isVerseRef(word)) {
                 return <span key={idx} className={verseNumStyle}>{word.replace(/[\[\]]/g, '')}</span>;
               }
               return <span key={idx}>{word}</span>;
             })}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Next Review</span>
              <span className={`font-bold ${status.color}`}>{status.label}</span>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Streak</span>
              <span className="font-bold text-slate-700">{verse.repetitions}</span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Interval</span>
              <span className="font-bold text-slate-700">{verse.interval} days</span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col items-center justify-center text-center">
              <span className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">Mastery</span>
              <span className={`font-bold ${verse.mastery === 100 ? 'text-green-600' : 'text-slate-700'}`}>
                {verse.mastery}%
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center gap-4">
            <button 
              onClick={() => {
                if(window.confirm('Are you sure you want to stop memorizing this verse?')) {
                  onDelete(verse.id);
                  onClose();
                }
              }}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Remove
            </button>
            
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl font-medium text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              <button 
                onClick={onPractice}
                className="px-6 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                Practice Now
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};