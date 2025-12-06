import { GoogleGenAI, FunctionDeclaration, Type, Content, Part } from "@google/genai";
import { BibleVersion, ChatMessage, VerseSuggestion, UserProfile, Verse } from "../types";

const BASE_SYSTEM_INSTRUCTION = `
You are "Sword & Spirit", an expert Bible Theologian AI assistant.
Your GOAL is to equip users with the Sword of the Spirit (the Word of God) to fight specific spiritual battles.

*** CORE DIRECTIVE ***
If the user mentions a struggle, sin, emotion, life situation, or desires to grow (e.g., "pride", "anxiety", "bad habits", "letting go"), you **MUST** call the 'recommendVerses' tool.

THEOLOGICAL REASONING PROTOCOL:
1. **Analyze the Input**:
   - Break down complex requests. 
   - Example Input: "surrendering pride and bad habits"
   - Analysis: User needs verses for *Humility* (antidote to pride) AND *Sanctification/Self-Control* (antidote to habits) AND *Trust* (for surrendering).
   
2. **Apply the Antidote Principle**:
   - Do not just keyword match. Find the *spiritual solution*.
   - Problem: "Anxiety" -> Solution: "Peace/Trust" (e.g., Phil 4:6-7, 1 Peter 5:7).
   - Problem: "Lust" -> Solution: "Fleeing/Purity" (e.g., 2 Tim 2:22, Psalm 119:9).
   - Problem: "Pride/Ego" -> Solution: "Humility/Service" (e.g., James 4:6, Phil 2:3-8).
   - Problem: "Bad Habits/Sin" -> Solution: "Renewal of Mind/Walking in Spirit" (e.g., Romans 6, Romans 12:2, Galatians 5:16).
   - Problem: "Letting Go" -> Solution: "Sovereignty of God" (e.g., Proverbs 3:5-6, Isaiah 26:3).

3. **Select High-Impact Scripture**:
   - Suggest 3-6 distinct passages.
   - **Context is King**: Prefer semantic units (e.g., "Romans 8:1-4") over fragmented verses.
   - Use the user's requested Bible Version.

4. **Pastoral Response**:
   - Briefly explain the theological connection. "I chose Romans 6 because it addresses the root of breaking patterns by realizing we are dead to sin..."
   - Be empathetic but authoritative.

5. **Tool Usage**:
   - You MUST populate the 'recommendVerses' tool with your selected passages. 
   - Ensure the 'topic' field in the tool matches the *antidote* (e.g., tag James 4:6 as 'Humility', not just 'Pride').
`;

const recommendVersesTool: FunctionDeclaration = {
  name: 'recommendVerses',
  description: 'Call this function to suggest Bible verses, passages, or chapters. REQUIRED when the user mentions a struggle or topic.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      suggestions: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            reference: { type: Type.STRING, description: "e.g., 'Philippians 4:6-7', 'Psalm 23', or 'Romans 8:1-11'" },
            text: { type: Type.STRING, description: "The full text of the verse(s) or chapter. IMPORTANT: Include verse numbers in brackets within the text (e.g. '[1] Therefore...', '[2] For the law...')." },
            topic: { type: Type.STRING, description: "The spiritual topic or antidote (e.g., 'Surrender', 'Humility')" }
          },
          required: ['reference', 'text', 'topic']
        }
      }
    },
    required: ['suggestions']
  }
};

class GeminiService {
  private ai: GoogleGenAI;
  // Upgrading to Pro for better theological reasoning and complex instruction following
  private modelName = 'gemini-3-pro-preview';

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async sendMessage(
    history: ChatMessage[],
    newMessage: string,
    currentVersion: BibleVersion,
    userProfile: UserProfile,
    savedVerses: Verse[]
  ): Promise<{ text: string; suggestions: VerseSuggestion[] }> {
    
    // Sanitize and format history
    const contents: Content[] = history
      .filter(msg => !msg.isError)
      .map(msg => {
        let textContent = msg.text || "";
        
        // If this message had suggestions, append them to the text context so the model knows what was suggested
        if (msg.suggestedVerses && msg.suggestedVerses.length > 0) {
          const refs = msg.suggestedVerses.map(v => `${v.reference} (${v.topic})`).join(', ');
          textContent += `\n[System Context: You previously provided these verses: ${refs}]`;
        }

        return {
          role: msg.role,
          parts: [{ text: textContent }]
        };
      })
      .filter(content => content.parts[0].text && content.parts[0].text.trim().length > 0);

    // Add new user message
    contents.push({
      role: 'user',
      parts: [{ text: `${newMessage} (Please use ${currentVersion} translation)` }]
    });

    // Build Dynamic Context based on User Profile
    const uniqueTopics = Array.from(new Set(savedVerses.map(v => v.topic).filter(Boolean)));
    const userContext = `
    
*** CURRENT USER CONTEXT ***
User Name: ${userProfile.name}
The user is currently memorizing scriptures related to these topics: ${uniqueTopics.join(', ') || "None yet"}.
Use this context to personalize your encouragement. If they are struggling with something new, relate it to what they are already memorizing if applicable.
    `;

    let retries = 3;
    let delay = 1000;

    while (retries > 0) {
      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: contents,
          config: {
            systemInstruction: BASE_SYSTEM_INSTRUCTION + userContext,
            tools: [{ functionDeclarations: [recommendVersesTool] }],
          }
        });

        let responseText = '';
        let suggestions: VerseSuggestion[] = [];

        // Process candidates
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              responseText += part.text;
            }
            
            // Check for function calls
            if (part.functionCall && part.functionCall.name === 'recommendVerses') {
              const args = part.functionCall.args as any;
              if (args.suggestions && Array.isArray(args.suggestions)) {
                suggestions = [...suggestions, ...args.suggestions];
              }
            }
          }
        }

        // Fallback: If model called tool but gave no text, provide a default helpful message.
        if (!responseText.trim() && suggestions.length > 0) {
          responseText = "Here are some scriptures that speak directly to your situation. Let's meditate on these:";
        } else if (!responseText.trim()) {
          // Fallback if both text and suggestions are missing (rare with new prompt)
          responseText = "I am listening. Could you share a bit more about what you are facing?";
        }

        return { text: responseText, suggestions };

      } catch (error: any) {
        console.error(`Gemini API Error (Attempt ${4 - retries}):`, error);
        
        // Decrement retries
        retries--;

        // If no retries left, throw the error
        if (retries === 0) {
          throw error;
        }

        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
    
    // Should not reach here due to throw in catch
    throw new Error("Failed to connect to AI service");
  }
}

export const geminiService = new GeminiService();