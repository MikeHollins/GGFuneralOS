/**
 * KC Golden Gate — Chat Widget
 *
 * Embeddable chat widget for kcgoldengate.com.
 * Powered by the Golden Gate Intake Agent via WebSocket.
 *
 * Usage: <script src="https://your-api/chat-widget.js" data-api="https://your-api"></script>
 */

(function() {
  const apiBase = document.currentScript?.getAttribute('data-api') || window.location.origin;
  const wsUrl = apiBase.replace('https://', 'wss://').replace('http://', 'ws://') + '/chat';

  let ws = null;
  let sessionId = null;
  let isOpen = false;

  // ── Create DOM ──────────────────────────────────────────────────────────

  const container = document.createElement('div');
  container.id = 'gg-chat-widget';
  container.innerHTML = `
    <style>
      #gg-chat-widget { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #gg-chat-widget * { box-sizing: border-box; margin: 0; padding: 0; }

      .gg-chat-btn {
        position: fixed; bottom: 24px; right: 24px; z-index: 99999;
        width: 60px; height: 60px; border-radius: 50%;
        background: #1a1a2e; color: #c9a96e; border: none; cursor: pointer;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        font-size: 24px; display: flex; align-items: center; justify-content: center;
        transition: transform 0.2s;
      }
      .gg-chat-btn:hover { transform: scale(1.1); }

      .gg-chat-window {
        position: fixed; bottom: 96px; right: 24px; z-index: 99999;
        width: 380px; max-height: 560px; border-radius: 16px;
        background: white; box-shadow: 0 8px 40px rgba(0,0,0,0.2);
        display: none; flex-direction: column; overflow: hidden;
      }
      .gg-chat-window.open { display: flex; }

      .gg-chat-header {
        background: #1a1a2e; color: white; padding: 16px 20px;
        display: flex; align-items: center; gap: 12px;
      }
      .gg-chat-header-logo {
        width: 36px; height: 36px; border-radius: 50%; background: #c9a96e;
        display: flex; align-items: center; justify-content: center;
        font-weight: bold; font-size: 14px; color: #1a1a2e;
      }
      .gg-chat-header-text h3 { font-size: 14px; font-weight: 600; }
      .gg-chat-header-text p { font-size: 11px; color: rgba(255,255,255,0.6); }
      .gg-chat-close {
        margin-left: auto; background: none; border: none; color: white;
        font-size: 20px; cursor: pointer; opacity: 0.7;
      }
      .gg-chat-close:hover { opacity: 1; }

      .gg-chat-messages {
        flex: 1; overflow-y: auto; padding: 16px; min-height: 300px; max-height: 400px;
        background: #faf9f9;
      }

      .gg-chat-msg {
        margin-bottom: 12px; display: flex;
      }
      .gg-chat-msg.agent { justify-content: flex-start; }
      .gg-chat-msg.user { justify-content: flex-end; }

      .gg-chat-bubble {
        max-width: 80%; padding: 10px 14px; border-radius: 12px;
        font-size: 13px; line-height: 1.5;
      }
      .gg-chat-msg.agent .gg-chat-bubble {
        background: white; color: #333; border: 1px solid #e5e5e5;
        border-bottom-left-radius: 4px;
      }
      .gg-chat-msg.user .gg-chat-bubble {
        background: #1a1a2e; color: white;
        border-bottom-right-radius: 4px;
      }

      .gg-chat-typing {
        display: none; padding: 4px 16px; font-size: 11px; color: #999;
      }
      .gg-chat-typing.show { display: block; }

      .gg-chat-input-area {
        padding: 12px 16px; border-top: 1px solid #eee;
        display: flex; gap: 8px; background: white;
      }
      .gg-chat-input {
        flex: 1; border: 1px solid #ddd; border-radius: 20px;
        padding: 10px 16px; font-size: 13px; outline: none;
        transition: border-color 0.2s;
      }
      .gg-chat-input:focus { border-color: #c9a96e; }
      .gg-chat-send {
        width: 36px; height: 36px; border-radius: 50%;
        background: #c9a96e; border: none; cursor: pointer;
        color: white; font-size: 16px; display: flex;
        align-items: center; justify-content: center;
      }
      .gg-chat-send:hover { background: #b8960e; }

      .gg-chat-upload {
        width: 36px; height: 36px; border-radius: 50%;
        background: #f0f0f0; border: none; cursor: pointer;
        color: #666; font-size: 16px; display: flex;
        align-items: center; justify-content: center;
      }

      @media (max-width: 480px) {
        .gg-chat-window {
          bottom: 0; right: 0; left: 0; width: 100%;
          max-height: 100vh; border-radius: 0;
        }
        .gg-chat-btn { bottom: 16px; right: 16px; }
      }
    </style>

    <button class="gg-chat-btn" id="gg-chat-toggle" title="Chat with us">💬</button>

    <div class="gg-chat-window" id="gg-chat-window">
      <div class="gg-chat-header">
        <div class="gg-chat-header-logo">GG</div>
        <div class="gg-chat-header-text">
          <h3>KC Golden Gate</h3>
          <p>Family Care Assistant</p>
        </div>
        <button class="gg-chat-close" id="gg-chat-close-btn">&times;</button>
      </div>

      <div class="gg-chat-messages" id="gg-chat-messages"></div>
      <div class="gg-chat-typing" id="gg-chat-typing">Agent is typing...</div>

      <div class="gg-chat-input-area">
        <input type="file" id="gg-chat-file" style="display:none" accept="image/*,.pdf" multiple />
        <button class="gg-chat-upload" id="gg-chat-upload-btn" title="Upload photos or documents">📎</button>
        <input class="gg-chat-input" id="gg-chat-input" placeholder="Type a message..." />
        <button class="gg-chat-send" id="gg-chat-send-btn">➤</button>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  // ── Get elements ────────────────────────────────────────────────────────

  const toggleBtn = document.getElementById('gg-chat-toggle');
  const closeBtn = document.getElementById('gg-chat-close-btn');
  const chatWindow = document.getElementById('gg-chat-window');
  const messagesDiv = document.getElementById('gg-chat-messages');
  const typingDiv = document.getElementById('gg-chat-typing');
  const input = document.getElementById('gg-chat-input');
  const sendBtn = document.getElementById('gg-chat-send-btn');
  const uploadBtn = document.getElementById('gg-chat-upload-btn');
  const fileInput = document.getElementById('gg-chat-file');

  // ── Toggle chat ─────────────────────────────────────────────────────────

  toggleBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    chatWindow.classList.toggle('open', isOpen);
    if (isOpen && !ws) connectWebSocket();
    if (isOpen) input.focus();
  });

  closeBtn.addEventListener('click', () => {
    isOpen = false;
    chatWindow.classList.remove('open');
  });

  // ── Send message ────────────────────────────────────────────────────────

  function sendMessage() {
    const text = input.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

    addMessage(text, 'user');
    ws.send(JSON.stringify({ type: 'message', text, session_id: sessionId }));
    input.value = '';
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // ── File upload ─────────────────────────────────────────────────────────

  uploadBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const files = fileInput.files;
    if (!files || !files.length) return;

    for (const file of files) {
      addMessage(`📎 ${file.name}`, 'user');

      if (sessionId) {
        const formData = new FormData();
        formData.append('file', file);
        try {
          await fetch(`${apiBase}/api/portal/upload-chat/${sessionId}`, {
            method: 'POST',
            body: formData,
          });
        } catch (err) {
          console.error('Upload failed:', err);
        }
      }
    }
    fileInput.value = '';
  });

  // ── WebSocket ───────────────────────────────────────────────────────────

  function connectWebSocket() {
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => console.log('[gg-chat] Connected');

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'session') {
          sessionId = data.session_id;
        }

        if (data.type === 'typing') {
          typingDiv.classList.add('show');
          setTimeout(() => typingDiv.classList.remove('show'), 2000);
        }

        if (data.type === 'message' && data.from === 'agent') {
          typingDiv.classList.remove('show');
          addMessage(data.text, 'agent');
        }
      };

      ws.onclose = () => {
        console.log('[gg-chat] Disconnected');
        ws = null;
        // Reconnect after 3 seconds
        setTimeout(() => { if (isOpen) connectWebSocket(); }, 3000);
      };

      ws.onerror = () => {
        console.error('[gg-chat] Connection error');
      };
    } catch (err) {
      console.error('[gg-chat] Failed to connect:', err);
    }
  }

  // ── UI helpers ──────────────────────────────────────────────────────────

  function addMessage(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `gg-chat-msg ${sender}`;
    msgDiv.innerHTML = `<div class="gg-chat-bubble">${escapeHtml(text)}</div>`;
    messagesDiv.appendChild(msgDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
