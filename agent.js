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
let conversations = [];
let isListening = false;
let recognition = null;
let isWaitingForResponse = false;

// Initialize the app
function init() {
    // Load conversations and filter out problematic ones
    const savedConversations = localStorage.getItem('conversations');
    conversations = savedConversations ? JSON.parse(savedConversations) : [];
    
    // Remove any hardcoded or problematic conversations
    conversations = conversations.filter(conv => {
        return conv.id && 
               conv.id !== 'default-conversation' && 
               conv.title !== 'who are you?' &&
               conv.title !== 'Who are you?';
    });
    
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
    
    // Close sidebar on mobile
    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
    
    // Focus on input field immediately for typing
    setTimeout(() => {
        chatInput.focus();
    }, 100);
}

function deleteConversation(conversationId, event) {
    event.stopPropagation();
    
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
                <p>No conversations yet</p>
            </div>
        `;
        return;
    }
    
    conversations.forEach(conversation => {
        const conversationItem = document.createElement('div');
        conversationItem.className = `conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`;
        conversationItem.innerHTML = `
            <i class="fas fa-comment"></i>
            <div class="conversation-content">
                <div class="conversation-title">${conversation.title}</div>
                <div class="conversation-preview">${conversation.preview || 'Start a new conversation...'}</div>
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
    
    loadConversations();
    showChatInterface();
    
    chatMessages.innerHTML = '';
    conversation.messages.forEach(message => {
        addMessageToChat(message.text, message.type);
    });
    
    if (window.innerWidth <= 1024) {
        closeSidebar();
    }
}

function showChatInterface() {
    welcomeScreen.style.display = 'none';
}

// Message Handling
async function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText || isWaitingForResponse) return;

    isWaitingForResponse = true;
    sendBtn.disabled = true;

    addMessageToChat(messageText, 'user');
    chatInput.value = '';
    autoResizeTextarea();

    updateConversation(messageText, 'user');
    showTypingIndicator();

    try {
        const aiResponse = await sendToWebhook(messageText);
        removeTypingIndicator();
        addMessageToChat(aiResponse, 'ai');
        updateConversation(aiResponse, 'ai');
    } catch (error) {
        console.error('Error sending message to webhook:', error);
        removeTypingIndicator();
        
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
    if (!currentConversationId) {
        currentConversationId = 'conversation-' + Date.now();
        const newConversation = {
            id: currentConversationId,
            title: 'New Conversation',
            preview: 'Start a new conversation...',
            timestamp: new Date().toISOString(),
            messages: []
        };
        conversations.unshift(newConversation);
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
    
    let responseText;
    
    if (Array.isArray(responseData)) {
        responseText = responseData[0]?.output || "I received your message but couldn't generate a proper response.";
    } else if (responseData.output) {
        responseText = responseData.output;
    } else if (typeof responseData === 'string') {
        responseText = responseData;
    } else {
        responseText = "Thank you for your message. I'm processing your request.";
    }

    return responseText;
}

function addMessageToChat(text, type) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    // Use a logo image for AI messages, keep user icon for user messages
    const avatarContent = type === 'user' 
        ? '<i class="fas fa-user"></i>'
        : '<img src="https://test.tanzlite.host/wp-content/uploads/2025/09/Minza-at-Tanzlite.jpg" alt="Tanzlite AI" class="message-logo">';
    
    messageDiv.innerHTML = `
        <div class="message-container">
            <div class="message-wrapper">
                <div class="message-avatar">
                    ${avatarContent}
                </div>
                <div class="message-content">${formatMessage(text)}</div>
            </div>
        </div>
    `;
    
    if (welcomeScreen.style.display !== 'none') {
        welcomeScreen.style.display = 'none';
    }
    
    removeTypingIndicator();
    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="message-container">
            <div class="message-wrapper">
                <div class="message-avatar">
                    <img src="https://test.tanzlite.host/wp-content/uploads/2025/09/Minza-at-Tanzlite.jpg" alt="Tanzlite AI" class="message-logo">
                </div>
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
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
    let conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) {
        conversation = {
            id: currentConversationId,
            title: 'New Conversation',
            preview: 'Start a new conversation...',
            timestamp: new Date().toISOString(),
            messages: []
        };
        conversations.unshift(conversation);
    }

    conversation.messages.push({ text, type, timestamp: new Date().toISOString() });
    
    // Update preview with latest message
    if (type === 'user') {
        conversation.preview = text.length > 30 ? text.substring(0, 30) + '...' : text;
        
        // Auto-generate title from first user message only
        if (conversation.title === 'New Conversation') {
            // Use more words for the title (up to 4-5 words)
            const words = text.trim().split(' ');
            let titleWords = words.slice(0, 5); // Take up to 5 words
            
            // Capitalize first letter of first word only
            if (titleWords.length > 0) {
                titleWords[0] = titleWords[0].charAt(0).toUpperCase() + titleWords[0].slice(1).toLowerCase();
            }
            
            // Make remaining words lowercase
            for (let i = 1; i < titleWords.length; i++) {
                titleWords[i] = titleWords[i].toLowerCase();
            }
            
            conversation.title = titleWords.join(' ');
            
            // Limit title length for display
            if (conversation.title.length > 35) {
                conversation.title = conversation.title.substring(0, 32) + '...';
            }
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
    if (!text) return '';
    
    let formattedText = text;
    
    // 1. Clean up markdown formatting
    formattedText = cleanMarkdownFormatting(formattedText);
    
    // 2. Convert URLs with http/https
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    formattedText = formattedText.replace(urlRegex, function(url) {
        let displayUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" class="message-link">' + displayUrl + '</a>';
    });
    
    // 3. Convert www URLs without protocol
    const wwwRegex = /(^|\s)(www\.[^\s]+)/ig;
    formattedText = formattedText.replace(wwwRegex, function(match, space, url) {
        let fullUrl = 'https://' + url;
        let displayUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
        return space + '<a href="' + fullUrl + '" target="_blank" rel="noopener noreferrer" class="message-link">' + displayUrl + '</a>';
    });
    
    // 4. Convert newlines to <br> tags
    formattedText = formattedText.replace(/\n/g, '<br>');
    
    return formattedText;
}

// New function to clean markdown formatting and convert lists
function cleanMarkdownFormatting(text) {
    let cleanedText = text;
    
    // Remove asterisks from bold text (**text** → text)
    cleanedText = cleanedText.replace(/\*\*(.*?)\*\*/g, '$1');
    
    // Remove single asterisks from italic text (*text* → text)
    cleanedText = cleanedText.replace(/\*(.*?)\*/g, '$1');
    
    // Convert markdown lists to HTML ordered lists
    // Handle numbered lists (1., 2., 3., etc.)
    cleanedText = convertNumberedLists(cleanedText);
    
    // Handle asterisk lists (* item) to HTML lists
    cleanedText = convertAsteriskLists(cleanedText);
    
    // Handle dash lists (- item) to HTML lists
    cleanedText = convertDashLists(cleanedText);
    
    return cleanedText;
}

function convertNumberedLists(text) {
    // Match lines that start with numbers like "1.", "2.", etc.
    const lines = text.split('\n');
    let inList = false;
    let listItems = [];
    let result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check if this line starts with a number followed by a dot and space
        if (/^\d+\.\s+.+/.test(line)) {
            if (!inList) {
                inList = true;
                // If we have previous content, add it first
                if (result.length > 0 && result[result.length - 1] !== '') {
                    result.push('');
                }
            }
            // Extract the content after the number
            const content = line.replace(/^\d+\.\s+/, '');
            listItems.push('<li>' + content + '</li>');
        } else {
            // If we were in a list and this line doesn't match, close the list
            if (inList && listItems.length > 0) {
                result.push('<ol class="message-list">' + listItems.join('') + '</ol>');
                listItems = [];
                inList = false;
            }
            result.push(line);
        }
    }
    
    // Close any remaining list
    if (inList && listItems.length > 0) {
        result.push('<ol class="message-list">' + listItems.join('') + '</ol>');
    }
    
    return result.join('\n');
}

function convertAsteriskLists(text) {
    const lines = text.split('\n');
    let inList = false;
    let listItems = [];
    let result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check if this line starts with asterisk and space
        if (/^\*\s+.+/.test(line)) {
            if (!inList) {
                inList = true;
                if (result.length > 0 && result[result.length - 1] !== '') {
                    result.push('');
                }
            }
            // Extract the content after the asterisk
            const content = line.replace(/^\*\s+/, '');
            listItems.push('<li>' + content + '</li>');
        } else {
            if (inList && listItems.length > 0) {
                result.push('<ol class="message-list">' + listItems.join('') + '</ol>');
                listItems = [];
                inList = false;
            }
            result.push(line);
        }
    }
    
    if (inList && listItems.length > 0) {
        result.push('<ol class="message-list">' + listItems.join('') + '</ol>');
    }
    
    return result.join('\n');
}

function convertDashLists(text) {
    const lines = text.split('\n');
    let inList = false;
    let listItems = [];
    let result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check if this line starts with dash and space
        if (/^-\s+.+/.test(line)) {
            if (!inList) {
                inList = true;
                if (result.length > 0 && result[result.length - 1] !== '') {
                    result.push('');
                }
            }
            // Extract the content after the dash
            const content = line.replace(/^-\s+/, '');
            listItems.push('<li>' + content + '</li>');
        } else {
            if (inList && listItems.length > 0) {
                result.push('<ol class="message-list">' + listItems.join('') + '</ol>');
                listItems = [];
                inList = false;
            }
            result.push(line);
        }
    }
    
    if (inList && listItems.length > 0) {
        result.push('<ol class="message-list">' + listItems.join('') + '</ol>');
    }
    
    return result.join('\n');
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