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
     * Retrieves the top relevant/recent memories to be injected into the LLM context.
     * For simplicity, this currently returns the 5 most recent memories.
     * @param {string} currentPrompt - The user's latest input (not used for search yet, but reserved for future semantic search).
     * @returns {string} Context block of memory fragments.
     */
    getMemoryContext(currentPrompt) {
        // Sort by timestamp (most recent first) and then increment recall count for the top ones.
        const sortedMemories = this.memories.sort((a, b) => b.timestamp - a.timestamp);
        const topMemories = sortedMemories.slice(0, 5);

        let context = '';
        if (topMemories.length > 0) {
            context = '--- MEMORY FRAGMENTS (Injected LTM) ---\n';
            topMemories.forEach(mem => {
                context += `- [Recalled] ${mem.text}\n`;
                mem.recall_count = (mem.recall_count || 0) + 1; // Increment recall count
            });
            context += '----------------------------------------\n';
            this._saveMemories(); // Save recall count updates
        }
        return context;
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