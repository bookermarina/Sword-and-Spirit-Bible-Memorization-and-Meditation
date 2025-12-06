import React, { useState } from 'react';
import { UserProfile } from '../types';

interface ProfileManagerProps {
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onCreateProfile: (name: string) => void;
  onDeleteProfile: (id: string) => void;
  onCloudSync: () => void;
}

export const ProfileManager: React.FC<ProfileManagerProps> = ({ 
  profiles, 
  onSelectProfile, 
  onCreateProfile, 
  onDeleteProfile,
  onCloudSync
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      onCreateProfile(newName.trim());
      setNewName('');
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 p-8 text-center relative overflow-hidden shrink-0">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-indigo-900 to-slate-900 opacity-90 z-0"></div>
          <div className="relative z-10">
            <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-amber-500 font-serif font-bold text-4xl mx-auto mb-4 shadow-inner border border-white/20">
              S
            </div>
            <h1 className="text-3xl font-bold text-white font-serif tracking-tight">Sword & Spirit</h1>
            <p className="text-slate-300 mt-2 text-sm font-medium">Scripture Memorization Assistant</p>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          
          {/* Cloud Sync Section */}
          <div className="mb-8">
            <h2 className="text-xs font-bold text-indigo-900 uppercase tracking-widest mb-3 px-2">Cloud Sync</h2>
            <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl p-4 flex flex-col items-center text-center">
               <p className="text-sm text-slate-600 mb-3 font-medium">Back up your spiritual armor and access it on any device.</p>
               <button 
                 onClick={onCloudSync}
                 className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-2.5 px-4 rounded-lg border border-slate-300 shadow-sm transition-all flex items-center justify-center gap-2"
               >
                 <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                 </svg>
                 Sign in with Google
               </button>
            </div>
          </div>

          <div className="w-full h-px bg-slate-100 mb-6"></div>

          {/* Local Profiles Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Local Profiles</h2>
              <span className="text-[10px] font-bold text-slate-300 bg-slate-100 px-2 py-0.5 rounded-full">{profiles.length}</span>
            </div>

            {!isCreating && (
              <>
                {profiles.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                    <p className="text-slate-400 text-xs italic">No local profiles found.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {profiles.map(profile => (
                      <div 
                        key={profile.id}
                        className={`group relative bg-white border border-slate-200 rounded-xl p-3 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/10 transition-all cursor-pointer flex items-center gap-3
                          ${profile.isSynced ? 'border-l-4 border-l-green-500' : ''}
                        `}
                        onClick={() => onSelectProfile(profile)}
                      >
                        <div className={`w-10 h-10 rounded-full ${profile.color} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
                          {profile.name.charAt(0).toUpperCase()}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-800 text-sm leading-tight truncate">{profile.name}</h3>
                            {profile.isSynced && (
                              <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          {profile.email ? (
                            <p className="text-xs text-slate-400 truncate">{profile.email}</p>
                          ) : (
                            <p className="text-[10px] text-slate-400 mt-0.5">Local Storage</p>
                          )}
                        </div>

                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          <button 
                            onClick={(e) => { e.stopPropagation(); onDeleteProfile(profile.id); }}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                            title="Delete Profile"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                          <div className="p-1.5 text-indigo-600 bg-indigo-50 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Create New Local */}
            <div className="pt-2">
               {!isCreating ? (
                  <button 
                    onClick={() => setIsCreating(true)}
                    className="w-full py-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl text-slate-500 hover:text-indigo-700 font-bold transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Create Local Profile
                  </button>
               ) : (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 animate-fade-in-up">
                    <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">New Local Profile</h2>
                    <form onSubmit={handleSubmit}>
                      <input
                        autoFocus
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Enter your name..."
                        className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none mb-3 bg-white text-sm"
                      />
                      <div className="flex gap-2">
                        <button 
                          type="button" 
                          onClick={() => setIsCreating(false)}
                          className="flex-1 py-2 px-3 rounded-lg text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 font-bold transition-colors text-xs"
                        >
                          Cancel
                        </button>
                        <button 
                          type="submit" 
                          disabled={!newName.trim()}
                          className="flex-1 py-2 px-3 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-bold shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                        >
                          Create
                        </button>
                      </div>
                    </form>
                  </div>
               )}
            </div>
          </div>

        </div>
        
        {/* Footer */}
        <div className="bg-slate-50 p-4 text-center border-t border-slate-200">
           <p className="text-[10px] text-slate-400">
             Local data is stored on this device. Cloud data requires login.
           </p>
        </div>
      </div>
    </div>
  );
};