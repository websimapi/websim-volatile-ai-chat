import { MemoryManager } from './memory-manager.js';

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
     * @returns {Promise<string>} - The full AI response text.
     */
    async getAiResponse(userMessage) {
        // 1. Get memory context for injection
        const memoryContext = this.memoryManager.getMemoryContext(userMessage);

        // Add user message to history before sending
        this.addMessage('user', userMessage);
        
        const contextualizedSystemPrompt = this.systemPrompt + '\n\n' + memoryContext;

        const messages = [
            {
                role: "system",
                content: contextualizedSystemPrompt,
            },
            ...this.conversationHistory
        ];

        try {
            const completion = await websim.chat.completions.create({
                messages: messages,
            });

            const response = completion.content;
            
            // Add AI response to history
            this.addMessage('assistant', response);
            
            // 2. Trigger memory consolidation/imprinting
            // Use the last two turns (user message + AI response) for context
            const recentHistory = this.conversationHistory.slice(-2);
            // Don't await this, let it run in the background
            this.memoryManager.compactAndStoreMemory(recentHistory).catch(console.error); 
            
            return response;

        } catch (error) {
            console.error("LLM API call failed:", error);
            // Remove the user message from history if the call failed, 
            // so we don't skew the context with an unanswered message.
            this.conversationHistory.pop(); 
            throw new Error("Failed to communicate with the core system.");
        }
    }
    
    /**
     * Passes the memory manager instance to the main script for UI updates.
     */
    getMemoryManager() {
        return this.memoryManager;
    }
}