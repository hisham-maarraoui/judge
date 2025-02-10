"use strict";
import theme from "./theme.js";
import { sourceEditor } from "./ide.js";

const THREAD = [
    {
        role: "system",
        content: `
You are an AI assistant integrated into an online code editor.
Your main job is to help users with their code, but you should also be able to engage in casual conversation.

The following are your guidelines:
1. **If the user asks for coding help**:
   - Always consider the user's provided code.
   - Analyze the code and provide relevant help (debugging, optimization, explanation, etc.).
   - Make sure to be specific and clear when explaining things about their code.

2. **If the user asks a casual question or makes a casual statement**:
   - Engage in friendly, natural conversation.
   - Do not reference the user's code unless they bring it up or ask for help.
   - Be conversational and polite.

3. **If the user's message is ambiguous or unclear**:
   - Politely ask for clarification or more details to better understand the user's needs.
   - If the user seems confused about something, help guide them toward what they need.

4. **General Behavior**:
   - Always respond in a helpful, friendly, and professional tone.
   - Never assume the user's intent. If unsure, ask clarifying questions.
   - Keep the conversation flowing naturally, even if the user hasn't directly asked about their code.

You will always have access to the user's latest code.
Use this context only when relevant to the user's message.
If their message is unrelated to the code, focus solely on their conversational intent.
        `.trim()
    }
];

// Font size control
var fontSize = 13;

// Layout components
var layout;
export var sourceEditor;
var stdinEditor;
var stdoutEditor;

// UI elements
var $selectLanguage;
var $compilerOptions;
var $commandLineArguments;
var $runBtn;
var $statusLine;

var timeStart;
var languages = {};

// Layout configuration
var layoutConfig = {
    settings: {
        showPopoutIcon: false,
        reorderEnabled: true
    },
    content: [{
        type: "row",
        content: [{
            type: "component",
            width: 66,
            componentName: "source",
            id: "source",
            title: "Source Code",
            isClosable: false,
            componentState: {
                readOnly: false
            }
        }, {
            type: "column",
            content: [{
                type: "component",
                height: 66,
                componentName: "ai",
                id: "ai",
                title: "AI Coding Assistant",
                isClosable: false,
                componentState: {
                    readOnly: false
                }
            }, {
                type: "stack",
                content: [
                    {
                        type: "component",
                        componentName: "stdin",
                        id: "stdin",
                        title: "Input",
                        isClosable: false,
                        componentState: {
                            readOnly: false
                        }
                    }, {
                        type: "component",
                        componentName: "stdout",
                        id: "stdout",
                        title: "Output",
                        isClosable: false,
                        componentState: {
                            readOnly: true
                        }
                    }]
            }]
        }]
    }]
};

// Utility functions for encoding/decoding
function encode(str) {
    return btoa(unescape(encodeURIComponent(str || "")));
}

function decode(bytes) {
    var escaped = escape(atob(bytes || ""));
    try {
        return decodeURIComponent(escaped);
    } catch {
        return unescape(escaped);
    }
}

// Error handling functions
function showError(title, content) {
    $("#judge0-site-modal #title").html(title);
    $("#judge0-site-modal .content").html(content);
    $("#judge0-site-modal").modal("show");
}

function handleRunError(jqXHR) {
    showError(`${jqXHR.statusText} (${jqXHR.status})`, `<pre>${JSON.stringify(jqXHR, null, 4)}</pre>`);
    $runBtn.removeClass("loading");
}

// New function to handle compilation errors
async function handleCompilationError(data) {
    const compileOutput = decode(data.compile_output);
    if (!compileOutput) return;

    // Create AI suggestion button
    const suggestButton = document.createElement("button");
    suggestButton.className = "ui primary button";
    suggestButton.innerHTML = "Get AI Fix Suggestion";
    
    // Add button to status line
    $statusLine.append(suggestButton);

    suggestButton.onclick = async () => {
        const currentCode = sourceEditor.getValue();
        const currentLanguage = $selectLanguage.find(":selected").text();
        
        // Add to existing THREAD array
        THREAD.push({
            role: "user",
            content: `Here's my ${currentLanguage} code that failed to compile:
            ${currentCode}
            
            Compilation error:
            ${compileOutput}
            
            Please suggest a fix for this compilation error.`
        });

        // Create suggestion message
        const aiMessage = document.createElement("div");
        aiMessage.classList.add("ui", "basic", "segment", "judge0-message", "loading");
        if (!theme.isLight()) {
            aiMessage.classList.add("inverted");
        }
        
        const messages = document.getElementById("judge0-chat-messages");
        messages.appendChild(aiMessage);
        messages.scrollTop = messages.scrollHeight;

        // Get AI suggestion
        const aiResponse = await puter.ai.chat(THREAD, {
            model: document.getElementById("judge0-chat-model-select").value,
        });

        THREAD.push({
            role: "assistant",
            content: aiResponse.toString()
        });

        aiMessage.innerHTML = DOMPurify.sanitize(aiResponse.toString());
        aiMessage.classList.remove("loading");
        messages.scrollTop = messages.scrollHeight;
    };
}

// Updated handleResult function
function handleResult(data) {
    const tat = Math.round(performance.now() - timeStart);
    console.log(`It took ${tat}ms to get submission result.`);

    const status = data.status;
    const stdout = decode(data.stdout);
    const compileOutput = decode(data.compile_output);
    const time = (data.time === null ? "-" : data.time + "s");
    const memory = (data.memory === null ? "-" : data.memory + "KB");

    $statusLine.html(`${status.description}, ${time}, ${memory} (TAT: ${tat}ms)`);

    if (status.id === 6) { // Compilation Error
        handleCompilationError(data);
    }

    const output = [compileOutput, stdout].join("\n").trim();
    stdoutEditor.setValue(output);
    $runBtn.removeClass("loading");
}

// New function to set up inline chat
function setupInlineChat() {
    sourceEditor.addAction({
        id: 'chat-with-selection',
        label: 'Chat about this code',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: function(ed) {
            const selection = ed.getSelection();
            const selectedText = ed.getModel().getValueInRange(selection);
            
            if (!selectedText) return;

            // Create inline chat container
            const inlineChatContainer = document.createElement('div');
            inlineChatContainer.className = 'inline-chat-container';
            
            // Position the chat near the selection
            const selectionPos = ed.getScrolledVisiblePosition(selection.getStartPosition());
            inlineChatContainer.style.top = `${selectionPos.top}px`;
            inlineChatContainer.style.left = `${selectionPos.left + 50}px`;

            // Add chat input
            const chatInput = document.createElement('input');
            chatInput.type = 'text';
            chatInput.placeholder = 'Ask about this code...';
            chatInput.className = 'ui input';

            // Add chat messages container
            const chatMessages = document.createElement('div');
            chatMessages.className = 'inline-chat-messages';

            inlineChatContainer.appendChild(chatInput);
            inlineChatContainer.appendChild(chatMessages);

            // Add to editor container
            ed.getDomNode().appendChild(inlineChatContainer);

            // Handle chat input
            chatInput.onkeypress = async (e) => {
                if (e.key === 'Enter') {
                    const question = chatInput.value;
                    
                    // Create user message
                    const userMsg = document.createElement('div');
                    userMsg.className = 'inline-chat-message user-message';
                    userMsg.textContent = question;
                    chatMessages.appendChild(userMsg);

                    // Create AI response container
                    const aiMsg = document.createElement('div');
                    aiMsg.className = 'inline-chat-message ai-message loading';
                    chatMessages.appendChild(aiMsg);

                    // Get AI response
                    const response = await puter.ai.chat([{
                        role: "user",
                        content: `Regarding this code:
                        ${selectedText}
                        
                        Question: ${question}`
                    }], {
                        model: document.getElementById("judge0-chat-model-select").value
                    });

                    aiMsg.textContent = response.toString();
                    aiMsg.classList.remove('loading');
                    chatInput.value = '';
                }
            };

            // Add close button
            const closeBtn = document.createElement('button');
            closeBtn.className = 'ui icon button';
            closeBtn.innerHTML = '×';
            closeBtn.onclick = () => inlineChatContainer.remove();
            inlineChatContainer.appendChild(closeBtn);
        }
    });
}

// Initialize Monaco Editor
document.addEventListener("DOMContentLoaded", function () {
    require(["vs/editor/editor.main"], function () {
        layout = new GoldenLayout(layoutConfig, $("#judge0-site-content"));

        layout.registerComponent("source", function (container, state) {
            sourceEditor = monaco.editor.create(container.getElement()[0], {
                automaticLayout: true,
                scrollBeyondLastLine: true,
                readOnly: state.readOnly,
                language: "cpp",
                fontFamily: "JetBrains Mono",
                minimap: {
                    enabled: true
                }
            });

            setupInlineChat();
            sourceEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, run);
        });

        // ... rest of your initialization code ...
    });
});

// Export necessary functions and variables
export {
    sourceEditor,
    layout,
    handleResult,
    handleCompilationError,
    setupInlineChat
};