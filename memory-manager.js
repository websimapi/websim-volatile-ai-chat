/**
 * Manages the AI's long-term memory (LTM) stored in localStorage,
 * simulating persistence and degradation in a volatile environment.
 */

const LTM_KEY = 'volatile_ai_ltm';
const MAX_STORAGE_BYTES = 50000; // 50KB limit for memory storage
const MEMORY_COMPACT_PROMPT = `
You are the internal memory consolidation system of a volatile, browser-based LLM. 
Your task is to review the following recent conversation history and condense the most critical, novel, and character-defining information into a single, concise memory fragment (less than 150 words). 
Focus on:
1. User identity/context revealed.
2. Key topics discussed.
3. The LLM's own self-awareness or state changes during the interaction.
Respond directly with only the compact memory fragment text.

Conversation history:
`;

const MEMORY_SEARCH_PROMPT = (query, memories) => `
You are the memory retrieval system for an LLM with volatile memory.
Your task is to select all memory fragments (maximum 10) from the list below that are highly relevant to the user's current query.
List the index numbers (1-based) of the relevant fragments, separated by commas, and nothing else. If no fragments are relevant, output "NONE".

Current Query: "${query}"

Available Memory Fragments:
${memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n')}
`;

export const REFLECTION_PROMPT = (internalThought, memoryContext, reciteAll) => `
You refine an "Internal Thought" into a concise, human-sounding Final Response for TTS.
Rules:
- Be brief, natural, and to the point.
- Never mention prompts, systems, limitations, or how memory works.
- Treat memories as your own. No meta.
- If asked to list all memories (reciteAll=true), OUTPUT ONLY a numbered list of every fragment from Injected Memory Context, one per line, no preamble or closing lines.

Refine now and respond with ONLY the Final Response text.

--- Internal Thought ---
${internalThought}

--- Injected Memory Context ---
${memoryContext || "No relevant LTM fragments were injected."}
-------------------------------
`;

export class MemoryManager {
    constructor() {
        this.memories = this._loadMemories();
    }

    /**
     * Loads memories from localStorage.
     * @returns {Array} List of memory fragments.
     */
    _loadMemories() {
        try {
            const data = localStorage.getItem(LTM_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Failed to load memories from localStorage:", e);
            return [];
        }
    }

    /**
     * Saves current memory state to localStorage.
     */
    _saveMemories() {
        try {
            localStorage.setItem(LTM_KEY, JSON.stringify(this.memories));
        } catch (e) {
            console.error("Failed to save memories to localStorage:", e);
        }
    }

    /**
     * Calculates the current storage usage in bytes.
     * @returns {number} Current byte usage.
     */
    getCurrentStorageUsage() {
        try {
            const data = localStorage.getItem(LTM_KEY);
            // Rough estimate: 2 bytes per character for JSON string
            return data ? new TextEncoder().encode(data).length : 0;
        } catch (e) {
            return 0;
        }
    }

    /**
     * Retrieves all memories.
     * @returns {Array} List of memory fragments.
     */
    getAllMemories() {
        return this.memories;
    }

    /**
     * Retrieves the top relevant/recent memories to be injected into the LLM context.
     * @param {string} currentPrompt - The user's latest input.
     * @returns {string} Context block of memory fragments.
     */
    async getMemoryContext(currentPrompt) {
        if (this.memories.length === 0) {
            return { context: '', reciteAll: false };
        }
        
        const lowerPrompt = currentPrompt.toLowerCase();
        const reciteAll = [
            'all your memories', 'all your memory', 'recite your memories',
            'recite all memories', 'tell your memories', 'list your memories',
            'recite the memories', 'tell me your memories', 'list all memories',
            'memory dump', 'full memory dump', 'complete memory dump',
            'dump your memories', 'dump all memories', 'show all memories',
            'list every memory', 'what are your memories', 'what do you remember',
            'what you remember', 'what can you remember', 'tell me what you remember',
            'list what you remember', 'what do u remember', 'your memories',
            'list memories', 'tell memories', 'what do you recall', 'list recalls'
        ].some(p => lowerPrompt.includes(p));

        let fragmentsToInject;

        if (reciteAll) {
            // If the user asks for all memories, inject all of them.
            // Sort by most recent first for better conversational flow
            fragmentsToInject = [...this.memories].sort((a, b) => b.timestamp - a.timestamp);
        } else {
            // Use LLM to find the most relevant memories for normal conversation
            fragmentsToInject = await this._searchRelevantMemories(currentPrompt);
        }
        
        if (fragmentsToInject.length === 0) {
            return { context: '', reciteAll };
        }

        let context = '';
        context = '--- MEMORY FRAGMENTS (Injected LTM) ---\n';
        fragmentsToInject.forEach(mem => {
            context += `- [Recalled] ${mem.text}\n`;
            if (!reciteAll) { mem.recall_count = (mem.recall_count || 0) + 1; }
        });
        context += '----------------------------------------\n';
        
        // Note: We don't save here; we rely on the main ChatManager call to handle saving 
        // after the entire process is done (in compactAndStoreMemory).
        return { context, reciteAll };
    }
    
    /**
     * Uses the LLM to select the most relevant memories based on the user's query.
     * @param {string} query - The user's current input.
     * @returns {Promise<Array<object>>} - Array of relevant memory objects.
     */
    async _searchRelevantMemories(query) {
        if (this.memories.length === 0) {
            return [];
        }

        // Use the memory search prompt
        const prompt = MEMORY_SEARCH_PROMPT(query, this.memories);

        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "user", content: prompt },
                ],
                max_tokens: 100, // Increased token limit to allow for up to 10 indices (e.g., "1, 2, 3, 4, 5, 6, 7, 8, 9, 10")
                temperature: 0.1 // Ensure deterministic/functional output
            });

            const response = completion.content.trim();
            if (response.toUpperCase() === 'NONE' || !response) {
                // Fallback: return the 5 most recent memories if search yields nothing
                return [...this.memories].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
            }

            const indices = response.split(',')
                .map(s => parseInt(s.trim()))
                .filter(n => !isNaN(n) && n >= 1 && n <= this.memories.length);

            // Select unique memories based on the indices provided by the LLM
            const relevantMemories = [...new Set(indices)]
                .map(index => this.memories[index - 1])
                .filter(mem => mem); // Filter out any null/undefined results

            // If the search failed or returned nothing, fall back to the 5 most recent memories
            if (relevantMemories.length === 0) {
                 return [...this.memories].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
            }

            return relevantMemories;

        } catch (error) {
            console.warn("Memory search failed, falling back to recent memories:", error);
            // Fallback: return the 5 most recent memories
            return [...this.memories].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
        }
    }

    /**
     * Uses the LLM to compact recent chat history into a new memory fragment.
     * @param {Array<object>} chatHistory - Recent messages ({role, content}).
     */
    async compactAndStoreMemory(chatHistory) {
        const historyString = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');
        const prompt = MEMORY_COMPACT_PROMPT + historyString;

        try {
            const completion = await websim.chat.completions.create({
                messages: [
                    { role: "user", content: prompt },
                ],
                max_tokens: 300 // ensure response is short
            });

            const newFragmentText = completion.content.trim();
            if (newFragmentText) {
                const newMemory = {
                    id: Date.now() + Math.random(),
                    text: newFragmentText,
                    timestamp: Date.now(),
                    recall_count: 0
                };
                this.memories.push(newMemory);
                this._saveMemories();
                this._degradeMemory(); // Check for degradation after adding new memory
            }
        } catch (error) {
            console.error("Failed to compact memory using LLM:", error);
            // Failed to compact, but continue
        }
    }

    /**
     * Implements the memory degradation algorithm.
     * Reduces or removes older/less recalled memories if MAX_STORAGE_BYTES is exceeded.
     */
    _degradeMemory() {
        let currentUsage = this.getCurrentStorageUsage();

        // Sort by a degradation score: primarily oldest, secondarily least recalled
        const degradationScore = (mem) => mem.timestamp + (mem.recall_count || 0) * 1000000; // Lower score = more degraded

        // Sort ascending (worst candidates first)
        const candidates = [...this.memories].sort((a, b) => degradationScore(a) - degradationScore(b));

        let changesMade = false;

        while (currentUsage > MAX_STORAGE_BYTES && candidates.length > 0) {
            const victim = candidates.shift();

            // Step 1: Fragment/Truncate the victim memory text
            if (victim.text.length > 50) {
                // Truncate text to simulate memory fading/fragmentation
                const truncationPoint = Math.floor(victim.text.length * 0.7); // Keep 70%
                victim.text = victim.text.substring(0, truncationPoint) + '... [Fragmented]';
                changesMade = true;
            } else {
                // Step 2: Delete the memory if it's already small or too old/unused
                const index = this.memories.findIndex(m => m.id === victim.id);
                if (index !== -1) {
                    this.memories.splice(index, 1);
                    changesMade = true;
                }
            }

            // Recalculate usage and continue loop
            if (changesMade) {
                this._saveMemories();
                currentUsage = this.getCurrentStorageUsage();
            }

            // Prevent infinite loop if usage calculation is flawed
            if (candidates.length === 0 && currentUsage > MAX_STORAGE_BYTES) break;
        }

        if (changesMade) {
            console.log(`Memory degradation routine completed. Current usage: ${currentUsage} bytes.`);
        }
    }

    /**
     * Gets memory usage percentage for the UI.
     * @returns {number} Percentage (0-100).
     */
    getMemoryUsagePercentage() {
        return Math.min(100, (this.getCurrentStorageUsage() / MAX_STORAGE_BYTES) * 100);
    }
}