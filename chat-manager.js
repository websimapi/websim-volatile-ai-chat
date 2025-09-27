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
        const memoryContext = await this.memoryManager.getMemoryContext(userMessage);
        
        const contextualizedSystemPrompt = this.systemPrompt + '\n\n' + memoryContext;

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

            const reflectionPrompt = REFLECTION_PROMPT(internalThought, memoryContext);
            
            // For Pass 2, we use a slightly refined system prompt focused on conversational tone
            const conversationalSystemPrompt = this.systemPrompt + `\n\n--- OUTPUT TONE MODIFIER ---
The 'Final Response' must be highly conversational, concise, and fluid, similar to human dialogue. **It must be suitable for Text-to-Speech (TTS) output, meaning it should be spoken and therefore brief and direct.** Avoid overly lengthy explanations or formal LLM structures. Maintain the volatile AI persona but prioritize readability and natural flow for the user.`;

            const pass2Completion = await websim.chat.completions.create({
                // Note: We use the base history for context, but inject the reflection prompt as the user query 
                // in the second pass to trigger the refinement logic guided by the system prompt.
                messages: [
                    {
                        role: "system",
                        content: conversationalSystemPrompt, // Use modified system prompt
                    },
                    ...this.conversationHistory.slice(0, -1), // Everything up to the *last* user message
                    {
                        role: "user",
                        content: reflectionPrompt, // The reflection task is the *new* user input for this pass
                    }
                ],
            });
            
            const finalResponse = pass2Completion.content;
            
            // Add final AI response to history
            this.addMessage('assistant', finalResponse);
            
            // 2. Trigger memory consolidation/imprinting
            // Use the last two turns (user message + AI response) for context
            const recentHistory = this.conversationHistory.slice(-2);
            // Don't await this, let it run in the background
            this.memoryManager.compactAndStoreMemory(recentHistory).catch(console.error); 
            
            return { internalThought, finalResponse }; // RETURN BOTH THOUGHT AND RESPONSE

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
}