# ⚔️ Sword & Spirit

> "For the word of God is living and active, sharper than any two-edged sword..." — Hebrews 4:12

**Sword & Spirit** is a sophisticated scripture memorization application powered by Google's Gemini AI. It combines a pastoral "Theologian AI" with a real-time "Voice Coach" to help users identify spiritual struggles, find the "antidote" scriptures, and memorize them using evidence-based active recall strategies.

## 🌟 Key Features

### 1. The Theologian Assistant (`gemini-3-pro-preview`)
- **Spiritual Diagnosis**: Users describe their struggles (e.g., "anxiety," "pride," "burnout").
- **Antidote Principle**: The AI analyzes the root theological issue and prescribes specific scriptures as the "antidote" (e.g., prescribing *Humility* verses for *Pride*).
- **Contextual Reasoning**: Suggests full semantic passages (e.g., Romans 8:1-4) rather than fragmented verses.

### 2. The Memorization Studio (Gemini Live API)
A real-time, low-latency voice session where the AI acts as a strict but encouraging coach.
- **Multimodal Interaction**: Uses the Gemini 2.5 Flash Native Audio model to listen to the user recite and speak back feedback instantly.
- **Strict Verification**: The AI listens for the *entire* text chunk. If you mumble or cut off, it asks you to repeat.
- **Live Transcription**: Displays real-time subtitles of the conversation (User & AI) to provide visual feedback on what the model is hearing.

### 3. Adaptive Active Recall Protocols
The coach dynamically switches between strategies to challenge the user:
- **Ratchet & Fade (Standard)**:
  1. **Read**: Read the new text once.
  2. **Vanish (Blur)**: Immediate 30-70% visual obscuration.
  3. **Initials**: Recite seeing only the first letter of each word.
- **Cloze Deletion (Precision)**: If the user stumbles on specific words, the AI selectively hides *only* those words (fill-in-the-blank) to force semantic processing.
- **Blind Recall (Mastery)**: The screen goes blank. The user must recite purely from memory.

### 4. Spaced Repetition System (SM-2)
- Implements the **SuperMemo-2 algorithm** to schedule reviews.
- Tracks `Ease Factor`, `Interval`, and `Streak` for every verse.
- Sorts the library by "Due Now" to ensure efficient long-term retention.

### 5. Data Management
- **Multi-Profile System**: Supports multiple users on a single device.
- **Cloud Sync Ready**: Includes architecture for Google Firebase authentication and Firestore syncing (visuals implemented, logic mocked).
- **Auto-Save**: State is persisted to LocalStorage to prevent data loss during network interruptions.

---

## 🛠️ Technical Architecture

### Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS.
- **AI Integration**: Google GenAI SDK (`@google/genai`).
  - **Chat**: `gemini-3-pro-preview` for high-reasoning text generation.
  - **Live**: `gemini-2.5-flash-native-audio-preview` for real-time WebSockets audio streaming.
- **Audio Processing**: Web Audio API (ScriptProcessorNode) for raw PCM audio conversion (Float32 -> Int16).

### Directory Structure
- `/services/geminiService.ts`: Handles text chat and function calling logic.
- `/components/MemorizationStudio.tsx`: The core Live API implementation. Handles WebSocket connections, audio buffering, and the "Coach" state machine.
- `/components/VerseList.tsx`: The library view with SM-2 sorting logic.
- `/types.ts`: TypeScript definitions for the Verse and User models.

## 🚀 Getting Started

1. **Prerequisites**: Node.js and a valid Google Gemini API Key.
2. **Installation**:
   ```bash
   npm install
   ```
3. **Configuration**:
   Ensure `process.env.API_KEY` is available in your environment.
4. **Run**:
   ```bash
   npm start
   ```

## 🧠 The "Why"
Memorization is not just about rote repetition; it is about **encoding**. Sword & Spirit forces encoding by:
1. **Removing visual crutches** as fast as possible (Vanishing/Initials).
2. **Forcing retrieval** (Blind Recall).
3. **Spacing reviews** just before you are about to forget (SM-2).

---
*Built with React & Gemini*
