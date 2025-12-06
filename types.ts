export enum BibleVersion {
  ESV = 'ESV',
  KJV = 'KJV',
  NKJV = 'NKJV',
  NASB = 'NASB',
  NIV = 'NIV'
}

export interface UserProfile {
  id: string;
  name: string;
  email?: string; // For Cloud Auth
  isSynced?: boolean; // Visual indicator for cloud profiles
  color: string;
  createdAt: number;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  reviewsCompleted: number;
  reviewGoal: number;
}

export interface Verse {
  id: string;
  reference: string;
  text: string;
  version: BibleVersion;
  topic?: string;
  addedAt: number;
  
  // Spaced Repetition / Mastery Fields
  mastery: number; // 0 to 100 (visual progress)
  nextReview: number; // Timestamp for next scheduled practice
  interval: number; // Current interval in days
  easeFactor: number; // SM-2 Ease Factor (starts at 2.5)
  repetitions: number; // Streak of successful recalls
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  suggestedVerses?: VerseSuggestion[];
  isError?: boolean;
}

export interface VerseSuggestion {
  reference: string;
  text: string;
  topic: string;
}

export interface MemorizationSession {
  verseId: string;
  mode: 'read' | 'blur' | 'initials' | 'flashcard';
  difficulty: number; // 0 - 100 (percentage of words hidden)
}