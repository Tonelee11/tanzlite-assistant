// DOM Elements
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const closeSidebarBtn = document.getElementById('closeSidebarBtn');
const themeToggle = document.getElementById('themeToggle');
const newChatBtn = document.getElementById('newChatBtn');
const conversationList = document.getElementById('conversationList');
const chatMessages = document.getElementById('chatMessages');
const welcomeScreen = document.getElementById('welcomeScreen');
const chatInput = document.getElementById('chatInput');
const voiceBtn = document.getElementById('voiceBtn');
const sendBtn = document.getElementById('sendBtn');

// Webhook Configuration
const WEBHOOK_URL = 'https://anthonyc.app.n8n.cloud/webhook/c1dd25e8-087e-4ae9-bc5d-aee202772af6/chat';
const ROUTE = 'general';

// State Management
let currentConversationId = null;
let conversations = JSON.parse(localStorage.getItem('conversations')) || [];
let isListening = false;
let recognition = null;
let isWaitingForResponse = false;

// Initialize the app
function init() {
    loadConversations();
    setupEventListeners();
    setupVoiceRecognition();
    checkScreenSize();
    
    // Auto-open sidebar on desktop
    if (window.innerWidth > 1024) {
        sidebar.classList.add('open');
    }
}

// Event Listeners
function setupEventListeners() {
    sidebarToggle.addEventListener('click', toggleSidebar);
    closeSidebarBtn.addEventListener('click', closeSidebar);
    themeToggle.addEventListener('click', toggleTheme);
    newChatBtn.addEventListener('click', startNewChat);
    sendBtn.addEventListener('click', sendMessage);
    voiceBtn.addEventListener('click', toggleVoiceRecognition);
    
    chatInput.addEventListener('input', autoResizeTextarea);
    chatInput.addEventListener('keydown', handleKeydown);
    
    window.addEventListener('resize', checkScreenSize);
}

// Sidebar Functions
function toggleSidebar() {
    sidebar.classList.toggle('open');
}

function closeSidebar() {
    sidebar.classList.remove('open');
}

// Voice Recognition
function setupVoiceRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = function() {
            isListening = true;
            voiceBtn.classList.add('listening');
            voiceBtn.innerHTML = '<i class="fas fa-stop"></i>';
        };

        recognition.onresult = function(event) {
            const transcript = event.results[0][0].transcript;
            chatInput.value = transcript;
            autoResizeTextarea();
            stopVoiceRecognition();
        };

        recognition.onerror = function(event) {
            console.log('Speech recognition error:', event.error);
            stopVoiceRecognition();
        };

        recognition.onend = function() {
            stopVoiceRecognition();
        };
    } else {
        voiceBtn.style.display = 'none';
    }
}

function toggleVoiceRecognition() {
    if (!recognition) {
        alert('Voice recognition is not supported in your browser. Please use Chrome or Edge.');
        return;
    }

    if (isListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function stopVoiceRecognition() {
    isListening = false;
    voiceBtn.classList.remove('listening');
    voiceBtn.innerHTML = '<i class="fas fa-microphone"></i>';
}

// Conversation Management
function startNewChat() {
    currentConversationId = 'conversation-' + Date.now();
    const newConversation = {
        id: currentConversationId,
        title: 'New Conversation',
        preview: 'Start a new conversation...',
        timestamp: new Date().toISOString(),
        messages: []
    };
    
    conversations.unshift(newConversation);
    saveConversations();
    loadConversations();
    showChatInterface();
    
    // Hide welcome screen
    welcomeScreen.style.display = 'none';
    
    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
}

function deleteConversation(conversationId, event) {
    event.stopPropagation(); // Prevent triggering conversation load
    
    if (confirm('Are you sure you want to delete this conversation?')) {
        conversations = conversations.filter(conv => conv.id !== conversationId);
        
        if (currentConversationId === conversationId) {
            currentConversationId = null;
            chatMessages.innerHTML = '';
            welcomeScreen.style.display = 'flex';
        }
        
        saveConversations();
        loadConversations();
    }
}

function loadConversations() {
    conversationList.innerHTML = '';
    
    if (conversations.length === 0) {
        conversationList.innerHTML = `
            <div style="padding: 20px; text-align: center; color: rgba(255,255,255,0.7);">
                <p>No conversations yet. Start a new chat!</p>
            </div>
        `;
        return;
    }
    
    conversations.forEach(conversation => {
        const conversationItem = document.createElement('div');
        conversationItem.className = `conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`;
        conversationItem.innerHTML = `
            <div class="conversation-icon">
                <i class="fas fa-comment"></i>
            </div>
            <div class="conversation-content">
                <div class="conversation-title">${conversation.title}</div>
                <div class="conversation-preview">${conversation.preview}</div>
            </div>
            <button class="delete-conversation-btn" onclick="deleteConversation('${conversation.id}', event)">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        conversationItem.addEventListener('click', () => {
            loadConversation(conversation.id);
        });
        
        conversationList.appendChild(conversationItem);
    });
}

function loadConversation(conversationId) {
    currentConversationId = conversationId;
    const conversation = conversations.find(c => c.id === conversationId);
    
    if (!conversation) return;
    
    // Update UI
    loadConversations();
    showChatInterface();
    welcomeScreen.style.display = 'none';
    
    // Clear and load messages
    chatMessages.innerHTML = '';
    conversation.messages.forEach(message => {
        addMessageToChat(message.text, message.type);
    });
    
    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
}

function showChatInterface() {
    welcomeScreen.style.display = 'none';
}

// Message Handling with Webhook Integration
async function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText || isWaitingForResponse) return;

    isWaitingForResponse = true;
    sendBtn.disabled = true;

    // Add user message
    addMessageToChat(messageText, 'user');
    chatInput.value = '';
    autoResizeTextarea();

    // Update conversation
    updateConversation(messageText, 'user');

    // Show typing indicator
    showTypingIndicator();

    try {
        // Send message to webhook
        const aiResponse = await sendToWebhook(messageText);
        removeTypingIndicator();
        addMessageToChat(aiResponse, 'ai');
        updateConversation(aiResponse, 'ai');
    } catch (error) {
        console.error('Error sending message to webhook:', error);
        removeTypingIndicator();
        
        // Show error message
        const errorMessage = "Sorry, I'm having trouble connecting right now. Please try again in a moment.";
        addMessageToChat(errorMessage, 'ai');
        updateConversation(errorMessage, 'ai');
    } finally {
        isWaitingForResponse = false;
        sendBtn.disabled = false;
    }
}

// Webhook Communication
async function sendToWebhook(messageText) {
    // Generate session ID if this is a new conversation
    if (!currentConversationId) {
        currentConversationId = 'conversation-' + Date.now();
    }

    const requestData = {
        action: "sendMessage",
        sessionId: currentConversationId,
        route: ROUTE,
        chatInput: messageText
    };

    const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseData = await response.json();
    
    // Extract the response text based on your n8n webhook structure
    // Adjust this based on your actual webhook response format
    let responseText;
    
    if (Array.isArray(responseData)) {
        // If response is an array, take the first item's output
        responseText = responseData[0]?.output || "I received your message but couldn't generate a proper response.";
    } else if (responseData.output) {
        // If response has an output property
        responseText = responseData.output;
    } else if (typeof responseData === 'string') {
        // If response is a simple string
        responseText = responseData;
    } else {
        // Fallback response
        responseText = "Thank you for your message. I'm processing your request.";
    }

    return responseText;
}

function addMessageToChat(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `
        <div class="message-avatar">
            ${type === 'user' ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>'}
        </div>
        <div class="message-content">${formatMessage(text)}</div>
    `;
    
    // Remove welcome screen if it's the first message
    if (welcomeScreen.style.display !== 'none') {
        welcomeScreen.style.display = 'none';
    }
    
    // Remove typing indicator if present
    removeTypingIndicator();
    
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="message-avatar">
            <i class="fas fa-robot"></i>
        </div>
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    chatMessages.appendChild(typingDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function updateConversation(text, type) {
    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) {
        // Create new conversation if it doesn't exist
        const newConversation = {
            id: currentConversationId,
            title: 'New Conversation',
            preview: 'Start a new conversation...',
            timestamp: new Date().toISOString(),
            messages: []
        };
        conversations.unshift(newConversation);
    }

    const currentConv = conversations.find(c => c.id === currentConversationId);
    currentConv.messages.push({ text, type, timestamp: new Date().toISOString() });
    
    // Update conversation preview
    if (type === 'user') {
        currentConv.preview = text.length > 30 ? text.substring(0, 30) + '...' : text;
        
        // Auto-generate title from first message if not set
        if (currentConv.title === 'New Conversation') {
            currentConv.title = text.length > 20 ? text.substring(0, 20) + '...' : text;
        }
    }
    
    saveConversations();
    loadConversations();
}

// UI Helpers
function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    document.body.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeToggle.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

function autoResizeTextarea() {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight > 120 ? 120 : chatInput.scrollHeight) + 'px';
}

function handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function checkScreenSize() {
    if (window.innerWidth > 1024) {
        sidebar.classList.add('open');
    } else {
        sidebar.classList.remove('open');
    }
}

function formatMessage(text) {
    // Simple formatting for demonstration
    return text.replace(/\n/g, '<br>');
}

function saveConversations() {
    localStorage.setItem('conversations', JSON.stringify(conversations));
}

// Make deleteConversation function globally available
window.deleteConversation = deleteConversation;

// Load saved theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.body.setAttribute('data-theme', savedTheme);
themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';

// Initialize the app
document.addEventListener('DOMContentLoaded', init);