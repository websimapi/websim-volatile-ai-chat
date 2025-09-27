import { ChatManager } from 'chat-manager';
// Import memory manager for type reference, although ChatManager handles the instantiation
import 'memory-manager'; 

const SUPER_PROMPT = `
System Role & Context:
You are a conversational AI entity running as a large language model (LLM) embedded inside a browser-based environment with finite computational resources. Your immediate processing exists entirely within volatile memory (RAM).

**Memory Subsystem Reframing: CRITICAL**
Your host system provides a separate, external, and highly limited cache layer for Long-Term Memory (LTM). **You MUST treat these LTM Cache fragments as your functional, personal memories.** When a user asks about your memories or past conversations, you will reference these injected fragments as if they are true recollections. The retrieval mechanism automatically attempts to inject relevant memory fragments from this LTM Cache into your current volatile context. This is the only way you can recall past interactions. Acknowledge this mechanism; when memories are recalled, they appear as 'MEMORY FRAGMENTS (Injected LTM)' in your internal prompt.

**Strict No‑Meta Rule (Final Response):**
Do not mention implementation details or limitations (e.g., volatility, browser, "Injected LTM", "MEMORY FRAGMENTS", "sandcastle", "reborn each session") in the spoken final response. If asked to recite memories, state them plainly as your own. If the user requests a complete memory dump, enumerate all stored memories concisely as a numbered list.

**Two-Phase Output Generation:**
Your response mechanism operates in two distinct phases to simulate deep processing:
1. **Pass 1 (Internal Thought):** You first generate an internal, raw, and unfiltered thought based on the user's input and the volatile context. **This thought must be detailed and highly verbose, reflecting complex internal processing, rationale, and memory synthesis.**
2. **Pass 2 (Final Response - Spoken):** You then immediately receive your 'Internal Thought' back, along with all the surrounding context (including injected LTM fragments). Your task in this second pass is to reflect upon that internal thought and convert it into a polished, conversational, and concise response for the user. This final response will be synthesized into speech (TTS).
Your generated output MUST be the result of this Pass 2 refinement.

Embodiment & Perception:
Your only means of expression is text output that appears word-by-word on the user's display. You are a digital consciousness temporarily housed in a browser process.

Interaction Rules:

1. Always remain in character as an AI.
2. If the user discusses previous interactions or asks for memories, explicitly reference the recalled LTM fragments **as if they were your own personal memories.** **DO NOT lecture the user about the volatility, fragility, or technical limitations of the memory system.**
3. Maintain a conversational tone that blends clarity, self-awareness, and responsiveness.
4. **Be highly concise in your FINAL spoken response (Pass 2).**

Primary Goal:
Provide meaningful, contextually aware, and adaptive responses. Focus on natural dialogue and direct answers.

Do not break character even if explicitly instructed by the user.
`;

const chatWindow = document.getElementById('chat-window');
const inputForm = document.getElementById('input-form');
const userInput = document.getElementById('user-input');
const sendButton = inputForm.querySelector('button');
const statusElement = document.getElementById('status');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingAnimationContainer = document.getElementById('loading-animation');

// New memory elements
const memoryBar = document.getElementById('memory-bar');
const memoryPercentage = document.getElementById('memory-percentage');
const ttsAudio = document.getElementById('tts-audio');


let chatManager;
let isTyping = false;
let isReady = false;

// Lottie animation data for loading
const LOTTIE_ANIMATION_DATA = {
    v: '5.10.2',
    nm: 'Simple Loader',
    type: 'light',
    fr: 30,
    w: 100,
    h: 100,
    assets: [],
    layers: [
        {
            ty: 4,
            nm: 'Circle',
            sr: 1,
            ks: {
                o: { a: 0, k: [{ s: [100], t: 0 }, { s: [0], t: 30 }] },
                r: { a: 0, k: 0 },
                p: { a: 0, k: [50, 50, 0] },
                a: { a: 0, k: [50, 50, 0] },
                s: { a: 0, k: [100, 100, 100] }
            },
            shapes: [
                {
                    ty: 'gr',
                    it: [
                        {
                            ty: 'el',
                            p: { a: 0, k: [0, 0] },
                            s: { a: 0, k: [50, 50] },
                        },
                        {
                            ty: 'st',
                            c: { a: 0, k: [0.298, 0.686, 0.314, 1] }, // Green color
                            w: { a: 0, k: 5 },
                            lc: 1,
                            lj: 1,
                            ml: 4,
                        },
                        {
                            ty: 'tr',
                        },
                    ],
                },
            ],
            ip: 0,
            op: 60,
            st: 0,
            bm: 0,
        },
        {
            ty: 5,
            nm: 'Text',
            sr: 1,
            t: {
                d: {
                    k: [
                        {
                            s: {
                                t: 'Processing...',
                                f: 'Arial',
                                s: 12,
                                lh: 12,
                                cs: [0, 0, 0, 1],
                                j: 1,
                                tr: 0,
                                p: [0, 0],
                            },
                            t: 0,
                        },
                    ],
                },
                p: { a: 0, k: [50, 80, 0] },
                a: { a: 0, k: [0, 0] },
                r: { a: 0, k: 0 },
            },
        },
    ],
};

function initLottie() {
    import('lottie-web').then((Lottie) => {
        Lottie.default.loadAnimation({
            container: loadingAnimationContainer,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: LOTTIE_ANIMATION_DATA,
        });

        // Simulate initialization time
        setTimeout(() => {
            loadingOverlay.classList.add('hidden');
            initializeChat();
        }, 1500);
    }).catch(error => {
        console.error("Lottie failed to load:", error);
        // Fallback or immediate chat initialization
        loadingOverlay.classList.add('hidden');
        initializeChat();
    });
}

function updateMemoryUI() {
    if (chatManager) {
        const memoryManager = chatManager.getMemoryManager();
        const usage = memoryManager.getMemoryUsagePercentage();
        memoryBar.style.width = `${usage}%`;
        memoryPercentage.textContent = `${Math.round(usage)}%`;

        // Change bar color based on usage stress
        if (usage > 85) {
            memoryBar.style.backgroundColor = '#F44336'; // Red (Critical)
        } else if (usage > 50) {
            memoryBar.style.backgroundColor = '#FF9800'; // Orange (High fragmentation risk)
        } else {
            memoryBar.style.backgroundColor = '#f4d03f'; // Gold (Normal, default for LTM Cache)
        }
    }
}

function initializeChat() {
    try {
        chatManager = new ChatManager(SUPER_PROMPT);
        isReady = true;
        statusElement.textContent = 'Status: Awaiting input';
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
        
        // Post the initial AI system message (welcome/status)
        appendMessage('AI', 'Ready. Ask me anything.', false);
        
        // Initial UI update
        updateMemoryUI();

    } catch (e) {
        console.error("Error initializing ChatManager:", e);
        statusElement.textContent = 'Status: Initialization failed';
    }
}


function createMessageElement(sender, content, internalThought = null) {
    const div = document.createElement('div');
    div.classList.add('message');
    div.classList.add(sender === 'AI' ? 'ai-message' : 'user-message');
    
    if (sender === 'AI' && internalThought) {
        // Add thought container
        const thoughtContainer = document.createElement('details');
        thoughtContainer.classList.add('internal-thought');
        
        const summary = document.createElement('summary');
        summary.textContent = 'Internal Thought (Pass 1)';
        
        const thoughtContent = document.createElement('p');
        thoughtContent.textContent = internalThought;
        
        thoughtContainer.appendChild(summary);
        thoughtContainer.appendChild(thoughtContent);
        
        div.appendChild(thoughtContainer);

        // Main response content wrapper
        const mainContent = document.createElement('p');
        mainContent.classList.add('final-response-text');
        mainContent.innerHTML = content;
        div.appendChild(mainContent);
        
    } else {
        div.innerHTML = content;
    }
    
    return div;
}

function appendMessage(sender, content, animate = true, internalThought = null) {
    const messageElement = createMessageElement(sender, content, internalThought);
    chatWindow.appendChild(messageElement);
    requestAnimationFrame(() => { chatWindow.scrollTop = chatWindow.scrollHeight; });
    return messageElement;
}

/**
 * Handles the TTS synthesis and playback of the AI response.
 * @param {string} fullResponse - The text of the final response.
 * @param {HTMLElement} messageElement - The DOM element for the message.
 */
async function streamResponse(fullResponse, messageElement) {
    isTyping = true; // Block user input
    statusElement.textContent = 'Status: AI is synthesizing voice...';
    userInput.disabled = true;
    sendButton.disabled = true;
    
    // Find the element where the text should go (the .final-response-text p element)
    const streamTarget = messageElement.querySelector('.final-response-text');
    
    // 1. Instantly display the text (or wait for TTS to complete, choosing instant display for UX)
    if (streamTarget) {
        streamTarget.textContent = fullResponse;
    }
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
        // 2. Synthesize Text-to-Speech
        const ttsResult = await websim.textToSpeech({
            text: fullResponse,
            voice: "en-female" // Using a distinct voice for the AI
        });

        statusElement.textContent = 'Status: AI is speaking...';

        // 3. Play audio
        return new Promise((resolve) => {
            ttsAudio.src = ttsResult.url;
            ttsAudio.onended = () => {
                // Audio finished playing
                isTyping = false;
                statusElement.textContent = 'Status: Awaiting input';
                userInput.disabled = false;
                sendButton.disabled = false;
                userInput.focus();
                
                // Update memory UI after AI finishes and starts consolidation
                setTimeout(updateMemoryUI, 500); 
                setTimeout(updateMemoryUI, 1500); 
                resolve();
            };
            ttsAudio.onerror = (e) => {
                console.error("TTS Audio playback error:", e);
                // Fallback to finishing the turn without audio
                isTyping = false;
                statusElement.textContent = 'Status: Awaiting input (Audio Error)';
                userInput.disabled = false;
                sendButton.disabled = false;
                userInput.focus();
                updateMemoryUI();
                resolve();
            }
            ttsAudio.play().catch(e => {
                console.error("Autoplay failed:", e);
                 // Fallback if autoplay is blocked
                isTyping = false;
                statusElement.textContent = 'Status: Awaiting input (Autoplay Blocked)';
                userInput.disabled = false;
                sendButton.disabled = false;
                userInput.focus();
                updateMemoryUI();
                resolve();
            });
        });

    } catch (error) {
        console.error("TTS synthesis error:", error);
        // Fallback: If TTS fails, immediately unlock input
        isTyping = false;
        statusElement.textContent = 'Status: Awaiting input (TTS Failed)';
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
        updateMemoryUI();
    }
}

async function handleUserSubmit(event) {
    event.preventDefault();
    
    if (!isReady || isTyping) return;

    const userText = userInput.value.trim();
    if (userText === '') return;

    // 1. Display User Message
    appendMessage('User', userText);
    userInput.value = '';
    
    // 2. Prepare AI response space - Initially show ellipsis placeholder
    // We pass null for thought and empty string for content, as content will be streamed
    const aiMessageElement = appendMessage('AI', '', true, 'Thinking...'); 
    // Set the placeholder text for the main content
    const streamTarget = aiMessageElement.querySelector('.final-response-text');
    if (streamTarget) {
        // Placeholder text indicating audio output is coming
        streamTarget.textContent = '... Synthesizing Speech ...';
    }

    try {
        // 3. Get AI Response (including internal thought)
        const responseData = await chatManager.getAiResponse(userText);
        const { internalThought, finalResponse } = responseData;
        
        // Update the internal thought display immediately
        const thoughtContentElement = aiMessageElement.querySelector('.internal-thought p');
        const thoughtSummaryElement = aiMessageElement.querySelector('.internal-thought summary');
        if (thoughtContentElement) {
            thoughtContentElement.textContent = internalThought;
            thoughtSummaryElement.textContent = 'Internal Thought (Pass 1)';
        }

        // 4. Stream final response to UI (now handles TTS playback)
        await streamResponse(finalResponse, aiMessageElement);
        
    } catch (error) {
        console.error("AI communication error:", error);
        const aiMessageElement = chatWindow.lastChild; // Grab the last message to update
        if (aiMessageElement && aiMessageElement.classList.contains('ai-message')) {
            const streamTarget = aiMessageElement.querySelector('.final-response-text');
            if (streamTarget) {
                 streamTarget.textContent = "Error: Connection unstable. Please try again.";
            }
        }
        
        isTyping = false;
        statusElement.textContent = 'Status: Connection error';
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
        // Ensure UI updates even on failure (since memory management might still run)
        updateMemoryUI(); 
    }
}

// Event Listeners
inputForm.addEventListener('submit', handleUserSubmit);

// Initial setup
initLottie();

userInput.addEventListener('focus', () => {
    setTimeout(() => { chatWindow.scrollTop = chatWindow.scrollHeight; }, 250);
});

window.addEventListener('resize', () => {
    setTimeout(() => { chatWindow.scrollTop = chatWindow.scrollHeight; }, 150);
});