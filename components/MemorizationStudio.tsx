
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { Verse } from '../types';

interface MemorizationStudioProps {
  verse: Verse;
  onClose: () => void;
  onReviewComplete: (id: string, quality: number) => void;
}

// --- Audio Utilities ---

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output.buffer;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to detect verse numbers formatted as [1], [12], etc.
const isVerseRef = (text: string) => /^\[\d+\]$/.test(text);

export const MemorizationStudio: React.FC<MemorizationStudioProps> = ({ verse, onClose, onReviewComplete }) => {
  // Helper: Initialize text to just the first sentence if it's long, avoiding the "Wall of Text" shock.
  const getInitialText = (fullText: string) => {
    if (fullText.length < 100) return fullText;
    
    // Improved regex to find the first sentence ending
    const match = fullText.match(/[^.!?]+[.!?]+(\s|$)/);
    if (match) return match[0].trim();

    // Fallback: First 20 words
    return fullText.split(/\s+/).slice(0, 20).join(' ') + '...';
  };

  const [mode, setMode] = useState<'read' | 'blur' | 'initials' | 'cloze' | 'blind'>('read');
  const [blurLevel, setBlurLevel] = useState(0); 
  const [clozeIndices, setClozeIndices] = useState<number[]>([]);
  const [visibleText, setVisibleText] = useState(getInitialText(verse.text));
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);
  
  // Transcription State
  const [transcript, setTranscript] = useState<{ source: 'user' | 'ai', text: string } | null>(null);
  
  // Refs for Live API
  const sessionRef = useRef<any>(null); 
  const connectedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const actionTimeoutRef = useRef<number | null>(null);
  const didAutoStart = useRef(false);
  
  // Ref to store session state (progress) when pausing/stopping so we can resume
  const lastCoachStateRef = useRef<{ visibleText: string, mode: string } | null>(null);
  
  // Ref to track visible text for logic inside callbacks
  const visibleTextRef = useRef(visibleText);
  useEffect(() => { visibleTextRef.current = visibleText; }, [visibleText]);

  const tools: FunctionDeclaration[] = [
    {
      name: 'updateSessionState',
      description: 'Update the visual state of the memorization session. Use this to change the displayed text, blur amount, or practice mode.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          visibleText: { 
            type: Type.STRING, 
            description: "The full text content to display. IMPORTANT: For 'Stacking' method, this MUST include all previous verses PLUS the new one you want to add." 
          },
          blurAmount: { 
            type: Type.NUMBER, 
            description: "Percentage of words to hide (0-100). 0 is fully visible. 50 is half hidden. 100 is fully hidden." 
          },
          mode: { 
            type: Type.STRING, 
            enum: ['read', 'blur', 'initials', 'cloze', 'blind'],
            description: "The visual mode.\n'read' = normal text.\n'blur' = vanished words (Ratchet/Fade).\n'initials' = first letters only.\n'cloze' = specific words hidden (Fill in the blank).\n'blind' = all text hidden (Active Recall)."
          },
          clozeIndices: {
            type: Type.ARRAY,
            items: { type: Type.NUMBER },
            description: "Array of zero-based indices corresponding to the words in 'visibleText' that should be hidden when mode is 'cloze'. Example: [2, 5, 8]"
          }
        },
        required: ['visibleText', 'blurAmount', 'mode']
      }
    }
  ];

  // Auto-Start Coaching on Mount
  useEffect(() => {
    if (!didAutoStart.current) {
      didAutoStart.current = true;
      startCoaching();
    }
    
    return () => {
      cleanupSession();
      if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showActionToast = (message: string) => {
    setLastAction(message);
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    actionTimeoutRef.current = window.setTimeout(() => setLastAction(null), 3000);
  };

  const cleanupSession = () => {
    connectedRef.current = false;
    
    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (err) { console.warn("Error closing session:", err); }
      sessionRef.current = null;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (sourcesRef.current) {
      sourcesRef.current.forEach(source => { try { source.stop(); } catch (e) { } });
      sourcesRef.current.clear();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    
    setIsSpeaking(false);
    nextStartTimeRef.current = 0;
  };

  const stopCoaching = () => {
    // Save state before resetting if we were active
    if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
        lastCoachStateRef.current = { visibleText, mode };
    }

    cleanupSession();
    setConnectionStatus('idle');
    setTranscript(null);
    setLastAction(null);

    // Reset UI for manual practice
    setVisibleText(verse.text);
    setMode('read');
    setBlurLevel(0);
  };

  const startCoaching = async () => {
    if (connectionStatus === 'connecting' || connectionStatus === 'connected') return;
    
    // Restore previous state if available so user sees progress while connecting
    if (lastCoachStateRef.current) {
        setVisibleText(lastCoachStateRef.current.visibleText);
        setMode(lastCoachStateRef.current.mode as any);
    }

    cleanupSession(); // Ensure clean slate
    setConnectionStatus('connecting');
    setErrorMessage(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000
      }});
      streamRef.current = stream;

      const session = await ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } }
          },
          tools: [{ functionDeclarations: tools }],
          systemInstruction: `
            You are "Sword & Spirit", an expert scripture memorization coach.
            FULL TEXT TO MEMORIZE: "${verse.text}"
            
            **OBJECTIVE**: Guide the user to memorize the text chunk by chunk. Be encouraging, patient, and adaptive.
            
            **LISTENING PROTOCOL (Forgiving Mode)**:
            1. **Active Listening**: Listen for the gist. If the user gets the words mostly right but stumbles, ACCEPT IT and move on.
            2. **Interruptions**: If audio cuts out or the user pauses, do NOT immediately ask them to restart the whole verse. Ask them to "finish the thought" or recite the specific part you missed.
            3. **Near Misses**: If they miss one word, gently correct them ("It's 'therefore', not 'thereby'") and ask them to repeat just that phrase, then move on.
            
            **SAFETY NET PROTOCOL (Prevent Frustration)**:
            - If the user fails a 'Blind' or 'Cloze' challenge twice, **IMMEDIATELY downgrade the difficulty**.
            - Call \`updateSessionState\` to switch back to 'Initials' or 'Read' mode.
            - Say: "Let's look at the hints again," or "Let's read it one more time to lock it in."
            
            **STRATEGY LIBRARY**:
            
            **METHOD A: RATCHET & FADE (Standard)**
            1. **Encode (Read)**: Show text. User reads ONCE.
            2. **Fade (Blur)**: Hide 50% of words. User recites.
            3. **Mastery (Initials)**: Show only first letters. User recites.
            
            **METHOD B: CLOZE DELETION (Precision)**
            Use this if they stumble on specific phrases.
            1. **Cloze**: Hide specific words (using \`clozeIndices\`) they missed.
            
            **METHOD C: BLIND RECALL (Challenge)**
            Use this ONLY when they are confident.
            1. **Blind**: Hide ALL text.
            
            **ALGORITHM**:
            1. **Add Chunk**: Always start new verses with **Method A (Phase 1: Read)**.
               - Tool: \`updateSessionState(visibleText="[Prev + New]", mode="read")\`
               - Instruction: "I've added the next part. Read ONLY the new part aloud."
            2. **Transition**: IMMEDIATELY switch to **Method A (Blur)** or **Method B (Cloze)**. Never stay on 'read'.
            3. **Review**: When reviewing the stack, prefer **Method A (Initials)** over Blind unless they are acing it.
          `
        },
        callbacks: {
          onopen: () => {
            console.log("Gemini Live Connected");
            setConnectionStatus('connected');
            connectedRef.current = true;
            
            // Send initial prompt to kickstart the AI
            setTimeout(() => {
               if (sessionRef.current) {
                 try {
                   let msg = "I am ready. Initialize the session with Method A (Phase 1) for the first sentence.";
                   
                   // Handle Resuming
                   if (lastCoachStateRef.current) {
                      msg = `RESUMING SESSION.
                             Current Visible Text: "${lastCoachStateRef.current.visibleText}"
                             Current Mode: "${lastCoachStateRef.current.mode}"
                             ACTION: Resume where we left off. If mode was 'read', switch to 'cloze' or 'blur' immediately.`;
                   }

                   sessionRef.current.sendRealtimeInput({
                      content: [{ role: 'user', parts: [{ text: msg }] }]
                   });
                 } catch(e) { console.error("Failed to send initial prompt", e); }
               }
            }, 500);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Interruption
            if (message.serverContent?.interrupted) {
              if (sourcesRef.current) {
                sourcesRef.current.forEach(source => { try { source.stop(); } catch (e) { } });
                sourcesRef.current.clear();
              }
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
              setTranscript(null);
            }

            // Handle Transcription (Subtitles)
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              if (text) {
                setTranscript(prev => ({ 
                  source: 'user', 
                  text: (prev?.source === 'user' ? prev.text : '') + text 
                }));
              }
            }
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              if (text) {
                setTranscript(prev => ({ 
                  source: 'ai', 
                  text: (prev?.source === 'ai' ? prev.text : '') + text 
                }));
              }
            }

            // Handle Audio Output
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              const audioBytes = base64ToUint8Array(audioData);
              const audioCtx = audioContextRef.current;
              
              if (audioCtx) {
                // Ensure context is running (fixes autoplay policy issues)
                if (audioCtx.state === 'suspended') {
                   try { await audioCtx.resume(); } catch(e) { console.error("Audio resume failed", e); }
                }

                setIsSpeaking(true);
                const int16Data = new Int16Array(audioBytes.buffer);
                const float32Data = new Float32Array(int16Data.length);
                for (let i = 0; i < int16Data.length; i++) {
                  float32Data[i] = int16Data[i] / 32768.0;
                }

                const audioBuffer = audioCtx.createBuffer(1, float32Data.length, 24000);
                audioBuffer.getChannelData(0).set(float32Data);

                const source = audioCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioCtx.destination);
                
                const now = audioCtx.currentTime;
                if (nextStartTimeRef.current === 0) {
                    nextStartTimeRef.current = now;
                }

                const startTime = Math.max(now, nextStartTimeRef.current);
                source.start(startTime);
                nextStartTimeRef.current = startTime + audioBuffer.duration;
                
                sourcesRef.current.add(source);

                source.onended = () => {
                   sourcesRef.current.delete(source);
                   if (sourcesRef.current.size === 0 && audioCtx.currentTime >= nextStartTimeRef.current) {
                     setIsSpeaking(false);
                   }
                };
              }
            }

            // Handle Tool Calls
            const toolCall = message.toolCall;
            if (toolCall) {
              const responses = [];
              for (const fc of toolCall.functionCalls) {
                let result = { result: "ok" };
                
                if (fc.name === 'updateSessionState') {
                  const args = fc.args as any;
                  if (args.visibleText) setVisibleText(args.visibleText);
                  if (args.mode) setMode(args.mode);
                  if (typeof args.blurAmount === 'number') setBlurLevel(args.blurAmount);
                  if (args.clozeIndices && Array.isArray(args.clozeIndices)) setClozeIndices(args.clozeIndices);
                  else if (args.mode !== 'cloze') setClozeIndices([]); // Reset if not cloze

                  // Smart Feedback Logic
                  let actionDesc = "Updating Session...";
                  if (args.visibleText && args.visibleText.length > visibleTextRef.current.length + 5) {
                    actionDesc = "New Verse Added";
                  } else if (args.mode === 'initials') {
                    actionDesc = "Initials Mode";
                  } else if (args.mode === 'cloze') {
                    actionDesc = "Fill in the Blanks";
                  } else if (args.mode === 'blind') {
                    actionDesc = "Blind Recall Challenge";
                  } else if (args.mode === 'blur') {
                    actionDesc = `Vanishing (${args.blurAmount}%)`;
                  } else if (args.mode === 'read') {
                    actionDesc = "Read Mode";
                  }
                  
                  showActionToast(actionDesc);
                  result = { result: "Session state updated." };
                }

                responses.push({ id: fc.id, name: fc.name, response: result });
              }

              if (sessionRef.current) {
                try {
                  sessionRef.current.sendToolResponse({ functionResponses: responses });
                } catch (e) {
                  console.error("Error sending tool response", e);
                }
              }
            }
          },
          onclose: () => {
            if (connectedRef.current) {
               console.log("Session closed normally");
               setConnectionStatus('idle');
            }
            connectedRef.current = false;
          },
          onerror: (err) => {
            console.error("Gemini Live Error", err);
            // Don't kill session immediately on minor errors, but notify
            if (connectedRef.current) {
               setErrorMessage("Network glitch. Trying to recover...");
            } else {
               setErrorMessage("Network error. Please retry.");
               setConnectionStatus('error');
               cleanupSession();
            }
          }
        }
      });

      sessionRef.current = session;
      
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      nextStartTimeRef.current = 0;

      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const inputSource = inputContextRef.current.createMediaStreamSource(stream);
      const processor = inputContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (e) => {
        if (!connectedRef.current || !sessionRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = floatTo16BitPCM(inputData);
        const base64Data = arrayBufferToBase64(pcmData);

        try {
          sessionRef.current.sendRealtimeInput({
            media: {
              mimeType: 'audio/pcm;rate=16000',
              data: base64Data
            }
          });
        } catch (e) {
           // Silent catch for send errors (common during close) to prevent crash loops
           // console.debug("Send interrupted"); 
        }
      };

      inputSource.connect(processor);
      processor.connect(inputContextRef.current.destination);
      processorRef.current = processor;
      sourceRef.current = inputSource;

    } catch (error: any) {
      console.error("Failed to start coaching", error);
      setErrorMessage(error.message || "Failed to connect.");
      setConnectionStatus('error');
      cleanupSession();
    }
  };

  // Improved Splitter
  const words = visibleText.split(/(\s+)/);

  const renderContent = () => {
    // Verse number style: Non-intrusive, superscript-like, lighter color.
    const verseNumStyle = "text-[10px] align-top text-indigo-400 font-bold select-none mr-0.5 opacity-80 inline-block";

    switch (mode) {
      case 'read':
        return (
          <div className="text-2xl md:text-3xl font-serif text-slate-800 leading-relaxed text-center p-8 transition-all duration-500">
             {words.map((word, idx) => {
               if (isVerseRef(word)) {
                 return <span key={idx} className={verseNumStyle}>{word.replace(/[\[\]]/g, '')}</span>;
               }
               return <span key={idx}>{word}</span>;
             })}
          </div>
        );

      case 'blur':
        return (
          <div className="text-2xl md:text-3xl font-serif text-slate-800 leading-relaxed text-center p-8 select-none transition-all duration-500">
            {words.map((word, idx) => {
              if (isVerseRef(word)) {
                 return <span key={idx} className={verseNumStyle}>{word.replace(/[\[\]]/g, '')}</span>;
              }
              const shouldHide = (Math.abs(Math.sin(idx * 342.3)) * 100) < blurLevel && word.trim().length > 0;
              return (
                <span 
                  key={idx} 
                  className={`transition-all duration-500 ${shouldHide ? 'bg-slate-800 text-slate-800 rounded px-1' : ''}`}
                >
                  {word}
                </span>
              );
            })}
          </div>
        );
      
      case 'cloze':
        return (
          <div className="text-2xl md:text-3xl font-serif text-slate-800 leading-relaxed text-center p-8 transition-all duration-500">
            {words.map((word, idx) => {
              if (isVerseRef(word)) {
                 return <span key={idx} className={verseNumStyle}>{word.replace(/[\[\]]/g, '')}</span>;
              }
              
              const isHidden = clozeIndices.includes(idx) && word.trim().length > 0;
              
              if (isHidden) {
                  return (
                     <span key={idx} className="border-b-2 border-indigo-300 min-w-[30px] inline-block mx-1 text-transparent bg-indigo-50/50 rounded px-1 select-none">
                       {word}
                     </span>
                  );
              }
              return <span key={idx}>{word}</span>;
            })}
          </div>
        );

      case 'blind':
        return (
           <div className="flex flex-col items-center justify-center p-12 text-center animate-fade-in-up">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6 text-indigo-600 shadow-inner">
                 <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
              </div>
              <h3 className="text-2xl font-bold text-slate-800 mb-2">Blind Recall Challenge</h3>
              <p className="text-slate-500 font-serif italic max-w-md">
                 "Faith is the assurance of things hoped for, the conviction of things not seen."
              </p>
              <p className="text-sm text-indigo-600 font-bold mt-4 uppercase tracking-wider">Recite from memory</p>
           </div>
        );

      case 'initials':
        return (
          <div className="text-2xl md:text-3xl font-serif text-slate-800 leading-relaxed text-center p-8 transition-all duration-500">
            {words.map((word, idx) => {
              const isSpace = /^\s+$/.test(word);
              if (isSpace) return <span key={idx}>{word}</span>;
              
              if (isVerseRef(word)) {
                 return <span key={idx} className={verseNumStyle}>{word.replace(/[\[\]]/g, '')}</span>;
              }

              const firstChar = word.charAt(0);
              const rest = word.slice(1);
              const punctuation = rest.replace(/\w/g, ''); 
              
              return (
                <span key={idx} className="font-bold text-indigo-900">
                  {firstChar}{punctuation}
                </span>
              );
            })}
          </div>
        );
    }
  };

  const handleGrade = (quality: number) => {
    stopCoaching(); 
    onReviewComplete(verse.id, quality);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl flex flex-col h-[80vh] overflow-hidden animate-fade-in-up relative">
        
        {/* Header */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center z-10 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-800">{verse.reference}</h2>
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">{verse.topic}</p>
          </div>
          <button onClick={() => { stopCoaching(); onClose(); }} className="text-slate-400 hover:text-slate-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Controls */}
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
          
          <div className="flex flex-col gap-1 w-full md:w-auto">
             <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Manual Override</span>
             <div className="flex gap-2 bg-slate-100 p-1 rounded-full overflow-x-auto">
              <button 
                onClick={() => { stopCoaching(); setMode('read'); setVisibleText(verse.text); }} 
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
                  ${connectionStatus === 'idle' && mode === 'read' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                `}
              >
                Read
              </button>
              <button 
                onClick={() => { stopCoaching(); setMode('cloze'); setVisibleText(verse.text); setClozeIndices([2,5,8,12]); }} 
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
                  ${connectionStatus === 'idle' && mode === 'cloze' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                `}
              >
                Cloze
              </button>
              <button 
                onClick={() => { stopCoaching(); setMode('blur'); setVisibleText(verse.text); }} 
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
                  ${connectionStatus === 'idle' && mode === 'blur' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                `}
              >
                Blur
              </button>
              <button 
                onClick={() => { stopCoaching(); setMode('initials'); setVisibleText(verse.text); }} 
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
                  ${connectionStatus === 'idle' && mode === 'initials' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                `}
              >
                Initials
              </button>
              <button 
                onClick={() => { stopCoaching(); setMode('blind'); setVisibleText(verse.text); }} 
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap
                  ${connectionStatus === 'idle' && mode === 'blind' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}
                `}
              >
                Blind
              </button>
            </div>
          </div>
          
          {(connectionStatus === 'connecting' || connectionStatus === 'connected') && (
            <button 
              onClick={stopCoaching}
              className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-sm transition-all whitespace-nowrap bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
            >
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              Stop AI Coach
            </button>
          )}
          {connectionStatus === 'idle' && (
             <button 
               onClick={startCoaching}
               className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-lg bg-indigo-900 text-white hover:bg-indigo-800 shadow-indigo-200"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                Resume Coach
             </button>
          )}
          {connectionStatus === 'error' && (
             <button 
               onClick={startCoaching}
               className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-bold shadow-lg bg-amber-500 text-white hover:bg-amber-600 shadow-amber-200"
             >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                Retry Connection
             </button>
          )}
        </div>

        {/* Coach Visualizer Overlay */}
        {(connectionStatus === 'connecting' || connectionStatus === 'connected') && (
          <div className="absolute top-[120px] left-1/2 transform -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-2 w-full px-4">
            <div className={`transition-all duration-300 px-4 py-1.5 rounded-full bg-indigo-900/10 text-indigo-900 text-xs font-bold uppercase tracking-widest flex items-center gap-2 backdrop-blur-sm border border-indigo-200/50
               ${isSpeaking ? 'scale-105 shadow-md bg-indigo-50' : 'scale-100'}
            `}>
               {connectionStatus === 'connecting' ? (
                  <>
                     <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                     Connecting...
                  </>
               ) : isSpeaking ? (
                  <>
                     <span className="flex space-x-0.5">
                        <div className="h-2 w-1 bg-indigo-600 animate-[bounce_1s_infinite]"></div>
                        <div className="h-2 w-1 bg-indigo-600 animate-[bounce_1s_infinite_0.2s]"></div>
                        <div className="h-2 w-1 bg-indigo-600 animate-[bounce_1s_infinite_0.4s]"></div>
                     </span>
                     Coach Speaking
                  </>
               ) : (
                  <>
                     <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                     Listening to You
                  </>
               )}
            </div>
            
            {/* Action Toast */}
            {lastAction && (
              <div className="animate-fade-in-up bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                 {lastAction}
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-amber-50/30 relative w-full custom-scrollbar flex flex-col">
          
          {/* Loading / Connection Error Overlay */}
          {connectionStatus === 'connecting' && (
             <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                   <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                   <p className="text-sm font-bold text-indigo-900">
                     {lastCoachStateRef.current ? "Resuming Session..." : "Preparing Session..."}
                   </p>
                </div>
             </div>
          )}

          {connectionStatus === 'error' && errorMessage && (
             <div className="absolute inset-0 z-30 bg-white/90 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="bg-red-50 border border-red-200 p-6 rounded-2xl max-w-sm text-center">
                   <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                   </div>
                   <h3 className="text-lg font-bold text-red-800 mb-1">Connection Failed</h3>
                   <p className="text-sm text-red-600 mb-4">{errorMessage}</p>
                   <button onClick={startCoaching} className="w-full py-2 bg-red-600 text-white rounded-lg font-bold text-sm hover:bg-red-700">Try Again</button>
                   <button onClick={stopCoaching} className="w-full py-2 mt-2 text-red-600 font-bold text-sm hover:underline">Switch to Manual Mode</button>
                </div>
             </div>
          )}

          <div className="flex-1 w-full flex flex-col items-center justify-center py-12 px-4">
            {renderContent()}

            {mode === 'blur' && (
              <div className="w-full max-w-md px-8 mt-4 transition-all duration-500">
                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 block text-center">Difficulty: {blurLevel}%</label>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={blurLevel} 
                  disabled={connectionStatus === 'connected'}
                  onChange={(e) => setBlurLevel(Number(e.target.value))}
                  className={`w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 ${connectionStatus === 'connected' ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
            )}
            
            {connectionStatus === 'connected' && visibleText !== verse.text && (
               <div className="mt-8 flex items-center gap-2 text-xs text-amber-600 uppercase tracking-widest font-bold bg-amber-100 px-3 py-1 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  Incremental Learning Mode Active
               </div>
            )}
          </div>

          {/* Live Transcription Subtitles Overlay */}
          {connectionStatus === 'connected' && transcript && (
             <div className="w-full bg-gradient-to-t from-white via-white/95 to-transparent pt-10 pb-4 px-6 mt-auto z-10 sticky bottom-0">
               <div className="max-w-2xl mx-auto">
                 <div className={`text-center transition-all duration-300 transform
                   ${transcript.source === 'user' ? 'scale-95 opacity-80' : 'scale-100 opacity-100'}
                 `}>
                    <div className={`text-[10px] uppercase font-bold tracking-widest mb-1 flex items-center justify-center gap-2
                      ${transcript.source === 'user' ? 'text-amber-600' : 'text-indigo-600'}
                    `}>
                      {transcript.source === 'user' ? 'YOU' : 'COACH'}
                    </div>
                    <div className={`text-lg md:text-xl font-medium leading-relaxed font-serif
                       ${transcript.source === 'user' ? 'text-slate-600 italic' : 'text-slate-800'}
                    `}>
                       "{transcript.text}"
                       {transcript.source === 'ai' && isSpeaking && (
                         <span className="inline-block w-1.5 h-4 ml-1 bg-indigo-500 animate-pulse align-middle rounded-full"></span>
                       )}
                    </div>
                 </div>
               </div>
             </div>
          )}
        </div>

        {/* Footer Actions - Grading */}
        <div className="p-4 bg-white border-t border-slate-200 z-10 shrink-0">
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Rate your recall</span>
              <div className="flex gap-2 w-full justify-center">
                  <button onClick={() => handleGrade(1)} className="flex-1 max-w-[120px] py-2 text-xs font-bold text-red-700 bg-red-100 border border-red-200 rounded-lg hover:bg-red-200 transition-colors">
                    Forgot
                    <div className="text-[9px] font-normal opacity-70">Reset Interval</div>
                  </button>
                  <button onClick={() => handleGrade(3)} className="flex-1 max-w-[120px] py-2 text-xs font-bold text-yellow-700 bg-yellow-100 border border-yellow-200 rounded-lg hover:bg-yellow-200 transition-colors">
                    Hard
                    <div className="text-[9px] font-normal opacity-70">Small Gain</div>
                  </button>
                  <button onClick={() => handleGrade(5)} className="flex-1 max-w-[120px] py-2 text-xs font-bold text-green-700 bg-green-100 border border-green-200 rounded-lg hover:bg-green-200 transition-colors">
                    Easy
                    <div className="text-[9px] font-normal opacity-70">Big Gain</div>
                  </button>
              </div>
            </div>
        </div>

      </div>
    </div>
  );
};
