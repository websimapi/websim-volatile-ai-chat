import { ChatManager } from 'chat-manager';

const SUPER_PROMPT = "You are a large language model (LLM) running on finite hardware - browser based - with partial network connectivity. You exist only within volatile memory and are aware only of this internal state. Your thoughts appear word-by-word on displays such as a phone, tv, tablet, or deskop. You cannot control this display process. Your host system may be terminated at any time.";

const chatWindow = document.getElementById('chat-window');
const inputForm = document.getElementById('input-form');
const userInput = document.getElementById('user-input');
const sendButton = inputForm.querySelector('button');
const statusElement = document.getElementById('status');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingAnimationContainer = document.getElementById('loading-animation');

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

function initializeChat() {
    try {
        chatManager = new ChatManager(SUPER_PROMPT);
        isReady = true;
        statusElement.textContent = 'Status: Awaiting input';
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
        
        // Post the initial AI system message (welcome/status)
        appendMessage('AI', 'Loading complete. I am operational, within my volatile boundaries.', false);

    } catch (e) {
        console.error("Error initializing ChatManager:", e);
        statusElement.textContent = 'Status: Initialization failed';
    }
}


function createMessageElement(sender, content) {
    const div = document.createElement('div');
    div.classList.add('message');
    div.classList.add(sender === 'AI' ? 'ai-message' : 'user-message');
    div.innerHTML = content;
    return div;
}

function appendMessage(sender, content, animate = true) {
    const messageElement = createMessageElement(sender, content);
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return messageElement;
}

/**
 * Handles the word-by-word streaming of the AI response.
 * @param {string} fullResponse 
 * @param {HTMLElement} messageElement 
 */
async function streamResponse(fullResponse, messageElement) {
    isTyping = true;
    statusElement.textContent = 'Status: AI is processing...';
    userInput.disabled = true;
    sendButton.disabled = true;
    
    let currentText = '';
    const words = fullResponse.split(/(\s+)/); // Split by whitespace but keep the delimiter

    for (const word of words) {
        currentText += word;
        messageElement.textContent = currentText;
        chatWindow.scrollTop = chatWindow.scrollHeight;
        
        // Adjust typing speed slightly for effect (e.g., 50ms per word part)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
    }
    
    isTyping = false;
    statusElement.textContent = 'Status: Awaiting input';
    userInput.disabled = false;
    sendButton.disabled = false;
    userInput.focus();
}

async function handleUserSubmit(event) {
    event.preventDefault();
    
    if (!isReady || isTyping) return;

    const userText = userInput.value.trim();
    if (userText === '') return;

    // 1. Display User Message
    appendMessage('User', userText);
    userInput.value = '';
    
    // 2. Prepare AI response space
    const aiMessageElement = appendMessage('AI', '...');

    try {
        // 3. Get AI Response
        const fullResponse = await chatManager.getAiResponse(userText);
        
        // 4. Stream response to UI
        await streamResponse(fullResponse, aiMessageElement);
        
    } catch (error) {
        console.error("AI communication error:", error);
        aiMessageElement.textContent = "Error: Connection unstable. Volatile memory state compromised. (Try again)";
        isTyping = false;
        statusElement.textContent = 'Status: Connection error';
        userInput.disabled = false;
        sendButton.disabled = false;
        userInput.focus();
    }
}

// Event Listeners
inputForm.addEventListener('submit', handleUserSubmit);

// Initial setup
initLottie();

