const DEFAULT_LOCAL_API = "http://127.0.0.1:5000";
const isSameServerChat =
  ["127.0.0.1", "localhost"].includes(window.location.hostname) &&
  window.location.port === "5000";
const API_BASE_URL = (
  window.CHATBOT_API_URL || (isSameServerChat ? "" : DEFAULT_LOCAL_API)
).replace(/\/$/, "");
const CHAT_ENDPOINT = API_BASE_URL ? `${API_BASE_URL}/chat` : "/chat";

let chatbotWidget = null;

function injectChatbotStyles() {
  if (document.getElementById("chatbot-widget-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "chatbot-widget-styles";
  style.textContent = `
    #chat-btn {
      position: fixed;
      right: 1.5rem;
      bottom: 1.5rem;
      z-index: 1200;
      width: 62px;
      height: 62px;
      border: 1px solid rgba(0, 245, 212, 0.35);
      border-radius: 999px;
      background: linear-gradient(135deg, #00f5d4, #39ff14);
      color: #041414;
      font-weight: 800;
      letter-spacing: 0.08em;
      box-shadow: 0 18px 38px rgba(0, 245, 212, 0.22);
    }

    #chat-box {
      position: fixed;
      right: 1.5rem;
      bottom: 6.5rem;
      z-index: 1199;
      width: min(360px, calc(100vw - 2rem));
      height: min(520px, calc(100vh - 9rem));
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(0, 245, 212, 0.2);
      border-radius: 18px;
      background:
        linear-gradient(180deg, rgba(0, 245, 212, 0.08), rgba(0, 245, 212, 0) 18%),
        rgba(10, 10, 10, 0.96);
      backdrop-filter: blur(16px);
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45);
    }

    #chat-box.is-open {
      display: flex;
    }

    .chatbot-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 1rem 0.8rem;
      border-bottom: 1px solid rgba(0, 245, 212, 0.16);
    }

    .chatbot-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #e0e0e0;
    }

    .chatbot-subtitle {
      margin: 0.2rem 0 0;
      font-size: 0.78rem;
      color: #888888;
    }

    .chatbot-close {
      width: 36px;
      height: 36px;
      border: 1px solid rgba(0, 245, 212, 0.24);
      border-radius: 999px;
      background: transparent;
      color: #e0e0e0;
      font-size: 1rem;
    }

    #messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .message {
      max-width: 86%;
      padding: 0.85rem 1rem;
      border-radius: 16px;
      line-height: 1.45;
      font-size: 0.94rem;
      white-space: pre-wrap;
    }

    .message.user {
      align-self: flex-end;
      border-bottom-right-radius: 6px;
      background: linear-gradient(135deg, #00f5d4, #39ff14);
      color: #041414;
      font-weight: 600;
    }

    .message.bot {
      align-self: flex-start;
      border-bottom-left-radius: 6px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.06);
      color: #e0e0e0;
    }

    .chatbot-input-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0.75rem;
      padding: 0.95rem;
      border-top: 1px solid rgba(0, 245, 212, 0.16);
      background: rgba(255, 255, 255, 0.02);
    }

    #userInput {
      min-width: 0;
      padding: 0.85rem 1rem;
      border: 1px solid rgba(0, 245, 212, 0.2);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      color: #e0e0e0;
      outline: none;
    }

    #userInput:focus {
      border-color: rgba(0, 245, 212, 0.5);
      box-shadow: 0 0 0 3px rgba(0, 245, 212, 0.12);
    }

    .chatbot-send {
      min-width: 84px;
      padding: 0.85rem 1rem;
      border: none;
      border-radius: 999px;
      background: linear-gradient(135deg, #00f5d4, #39ff14);
      color: #041414;
      font-weight: 700;
    }

    .chatbot-send:disabled,
    #userInput:disabled {
      opacity: 0.65;
      cursor: not-allowed;
    }

    @media (max-width: 640px) {
      #chat-btn {
        right: 1rem;
        bottom: 1rem;
      }

      #chat-box {
        right: 1rem;
        bottom: 5.75rem;
        width: calc(100vw - 2rem);
        height: min(72vh, 520px);
      }
    }
  `;

  document.head.appendChild(style);
}

function appendMessage(role, text) {
  const { messages } = ensureChatbotWidget();
  const messageNode = document.createElement("div");
  messageNode.className = `message ${role}`;
  messageNode.textContent = text;
  messages.appendChild(messageNode);
  messages.scrollTop = messages.scrollHeight;
  return messageNode;
}

function ensureChatbotWidget() {
  if (chatbotWidget && document.body.contains(chatbotWidget.box)) {
    return chatbotWidget;
  }

  injectChatbotStyles();

  const buttons = Array.from(document.querySelectorAll("#chat-btn"));
  const boxes = Array.from(document.querySelectorAll("#chat-box"));

  buttons.slice(1).forEach((node) => node.remove());
  boxes.slice(1).forEach((node) => node.remove());

  const button = buttons[0] || document.createElement("button");
  const box = boxes[0] || document.createElement("section");

  if (!buttons[0]) {
    document.body.appendChild(button);
  }

  if (!boxes[0]) {
    document.body.appendChild(box);
  }

  button.id = "chat-btn";
  button.type = "button";
  button.textContent = "AI";
  button.removeAttribute("onclick");
  button.setAttribute("aria-controls", "chat-box");
  button.setAttribute("aria-expanded", "false");

  box.id = "chat-box";
  box.setAttribute("aria-hidden", "true");
  box.innerHTML = `
    <div class="chatbot-header">
      <div>
        <p class="chatbot-title">Zero Gravity Assistant</p>
        <p class="chatbot-subtitle">Ask about the team, projects, or joining.</p>
      </div>
      <button class="chatbot-close" type="button" data-chat-close>x</button>
    </div>
    <div id="messages"></div>
    <div class="chatbot-input-row">
      <input id="userInput" type="text" placeholder="Type your message..." autocomplete="off" />
      <button class="chatbot-send" type="button" data-chat-send>Send</button>
    </div>
  `;

  const messages = box.querySelector("#messages");
  const input = box.querySelector("#userInput");
  const sendButton = box.querySelector("[data-chat-send]");
  const closeButton = box.querySelector("[data-chat-close]");

  button.addEventListener("click", toggleChat);
  closeButton.addEventListener("click", toggleChat);
  sendButton.addEventListener("click", sendMessage);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendMessage();
    }
  });

  chatbotWidget = { button, box, messages, input, sendButton };

  appendMessage("bot", "Hi. I can help with Zero Gravity, projects, and joining.");

  return chatbotWidget;
}

function toggleChat() {
  const { button, box, input } = ensureChatbotWidget();
  const isOpen = box.classList.toggle("is-open");
  button.setAttribute("aria-expanded", String(isOpen));
  box.setAttribute("aria-hidden", String(!isOpen));

  if (isOpen) {
    input.focus();
  }
}

async function sendMessage() {
  const { input, sendButton } = ensureChatbotWidget();
  const message = input.value.trim();

  if (!message) {
    return;
  }

  appendMessage("user", message);
  input.value = "";
  input.disabled = true;
  sendButton.disabled = true;

  const pendingMessage = appendMessage("bot", "Thinking...");

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    let data = {};

    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.reply || "The chatbot request failed.");
    }

    pendingMessage.textContent =
      data.reply || "I could not generate a reply right now. Please try again.";
  } catch (error) {
    pendingMessage.textContent =
      error.message ||
      "Could not reach the chatbot backend. Start the Flask server and try again.";
  } finally {
    input.disabled = false;
    sendButton.disabled = false;
    input.focus();
  }
}

window.toggleChat = toggleChat;
window.sendMessage = sendMessage;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureChatbotWidget);
} else {
  ensureChatbotWidget();
}
