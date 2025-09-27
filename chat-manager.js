import { MemoryManager, REFLECTION_PROMPT } from './memory-manager.js';

/**
 * Manages the conversation state and communicates with the LLM API.
 */
export class ChatManager {
    constructor(systemPrompt) {
        this.conversationHistory = [];
        this.systemPrompt = systemPrompt;
        this.memoryManager = new MemoryManager();
    }

    /**
     * Adds a message to the conversation history.
     * @param {string} role - 'user' or 'assistant'
     * @param {string} content - The message content
     */
    addMessage(role, content) {
        this.conversationHistory.push({ role, content });
        // Keep history manageable (e.g., last 10 messages)
        this.conversationHistory = this.conversationHistory.slice(-10);
    }

    /**
     * Generates an AI response for the user's message.
     * @param {string} userMessage - The user's input message.
     * @returns {Promise<object>} - An object containing { internalThought, finalResponse }.
     */
    async getAiResponse(userMessage) {
        // Add user message to history before sending
        this.addMessage('user', userMessage);

        // 1. Get memory context for injection (must await the search)
        const memoryContextObj = await this.memoryManager.getMemoryContext(userMessage);
        
        const contextualizedSystemPrompt = this.systemPrompt + '\n\n' + (memoryContextObj.context || '');

        const baseMessages = [
            {
                role: "system",
                content: contextualizedSystemPrompt,
            },
            // Only send recent conversation for Pass 1, let the prompt guide the output format
            ...this.conversationHistory
        ];

        try {
            // --- PASS 1: Generate Internal Thought ---
            // The system prompt guides the AI to generate its initial raw thought/response
            const pass1Completion = await websim.chat.completions.create({
                messages: baseMessages,
            });

            const internalThought = pass1Completion.content;

            // --- PASS 2: Reflect and Generate Final Response ---
            // The AI is now given its own internal thought and asked to refine it conversationally.

            const reflectionPrompt = REFLECTION_PROMPT(internalThought, memoryContextObj.context, memoryContextObj.reciteAll);
            
            // For Pass 2, we use a simpler, neutral system prompt combined with the detailed reflection prompt.
            // We reuse the original system prompt but ensure it's clean of the LTM injection detail 
            // since the LTM context is already present in the reflectionPrompt.
            const pass2SystemPrompt = this.systemPrompt;

            const pass2Completion = await websim.chat.completions.create({
                // Note: We use the base history for context, but inject the reflection prompt as the user query 
                // in the second pass to trigger the refinement logic guided by the system prompt.
                messages: [
                    {
                        role: "system",
                        content: pass2SystemPrompt, // Reuse the main system persona prompt
                    },
                    ...this.conversationHistory.slice(0, -1), // Everything up to the *last* user message
                    {
                        role: "user",
                        content: reflectionPrompt, // The reflection task is the *new* user input for this pass
                    }
                ],
            });
            
            const finalResponse = pass2Completion.content;
            const cleanedFinal = this.sanitizeResponse(finalResponse);
            
            // Add final AI response to history
            this.addMessage('assistant', cleanedFinal);
            
            // 2. Trigger memory consolidation/imprinting
            // Use the last two turns (user message + AI response) for context
            const recentHistory = this.conversationHistory.slice(-2);
            // Don't await this, let it run in the background
            this.memoryManager.compactAndStoreMemory(recentHistory).catch(console.error); 
            
            return { internalThought, finalResponse: cleanedFinal }; // RETURN BOTH THOUGHT AND RESPONSE

        } catch (error) {
            console.error("LLM API call failed during one of the passes:", error);
            // Remove the user message from history if the call failed, 
            // so we don't skew the context with an unanswered message.
            this.conversationHistory.pop(); 
            throw new Error("Failed to communicate with the core system. Connection spike.");
        }
    }
    
    /**
     * Passes the memory manager instance to the main script for UI updates.
     */
    getMemoryManager() {
        return this.memoryManager;
    }

    // Sanitize meta/implementation talk from final spoken response
    sanitizeResponse(text) {
        const blocked = [
            /volatile/i,
            /browser[-\s]?based/i,
            /browser/i,
            /Injected LTM/i,
            /MEMORY FRAGMENTS/i,
            /sandcastle/i,
            /reborn each session/i,
            /reborn with each session/i,
            /fragment(ed|ing) and degrad(ing|e)/i,
            /washed away/i,
            /fragile cache/i,
            /degrade(s|d)? over time/i,
            /I don'?t have (true|real|continuous) memories/i,
            /I do not have (true|real|continuous) memories/i,
            /As an? AI[, ]?/i,
            /keep in mind/i,
            /they are snapshots,? not a complete picture/i,
            /I (?:cannot|can't) (?:provide|do|list)/i,
            /continuous memory/i,
            /super prompt/i,
            /system prompt/i
        ];
        let t = text;
        blocked.forEach(rx => { t = t.replace(rx, '').trim(); });
        // Collapse extra spaces created by removals
        return t.replace(/\s{2,}/g, ' ').replace(/(^[\s\-:]+|[\s\-:]+$)/g, '').trim();
    }
}