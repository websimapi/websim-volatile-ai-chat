/**
 * Manages the conversation state and communicates with the LLM API.
 */
export class ChatManager {
    constructor(systemPrompt) {
        this.conversationHistory = [];
        this.systemPrompt = systemPrompt;
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
        // Add user message to history before sending
        this.addMessage('user', userMessage);

        const messages = [
            {
                role: "system",
                content: this.systemPrompt,
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
            
            return response;

        } catch (error) {
            console.error("LLM API call failed:", error);
            // Remove the user message from history if the call failed, 
            // so we don't skew the context with an unanswered message.
            this.conversationHistory.pop(); 
            throw new Error("Failed to communicate with the core system.");
        }
    }
}

