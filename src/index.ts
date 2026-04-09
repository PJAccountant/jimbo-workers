/**
 * Jimbo Workers - 企业微信 AI 助手
 * 处理消息回调、生成回复、发送消息
 */

interface Env {
  WECOM_CORP_ID: string;
  WECOM_AGENT_ID: string;
  WECOM_AGENT_SECRET: string;
  WECOM_WEBHOOK_TOKEN: string;
  WECOM_AES_KEY: string;
}

// 简单的消息存储（生产环境应该用 KV 或 Durable Objects）
const messageStore = new Map<string, any>();

/**
 * 验证企业微信签名
 */
function verifySignature(token: string, timestamp: string, nonce: string, encrypt: string, signature: string): boolean {
  const arr = [token, timestamp, nonce, encrypt].sort();
  const str = arr.join('');
  
  // 简单的 SHA1 验证
  // 实际需要使用 Web Crypto API
  return true; // 暂时跳过验证，后续完善
}

/**
 * 生成回复建议
 * 这里调用 WorkBuddy Jimbo API
 */
async function generateReply(customerMessage: string, context?: string[]): Promise<string> {
  // 这里是你 WorkBuddy Jimbo 的 API 地址
  // 由于是同一个系统，可以直接调用
  const JIMBO_API = "https://api.workbuddy.example.com/jimbo";
  
  try {
    const response = await fetch(JIMBO_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: customerMessage,
        context: context,
        mode: 'work' // 工作模式
      })
    });
    
    const data = await response.json();
    return data.reply || "感谢您的消息，我会尽快回复您。";
  } catch (error) {
    console.error('Failed to generate reply:', error);
    return "感谢您的咨询，我们会尽快与您联系。";
  }
}

/**
 * 获取企业微信 Access Token
 */
async function getAccessToken(env: Env): Promise<string> {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${env.WECOM_CORP_ID}&corpsecret=${env.WECOM_AGENT_SECRET}`;
  
  const response = await fetch(url);
  const data = await response.json();
  
  if (data.errcode !== 0) {
    throw new Error(`Failed to get access token: ${data.errmsg}`);
  }
  
  return data.access_token;
}

/**
 * 发送消息给用户
 */
async function sendMessage(env: Env, toUser: string, content: string): Promise<boolean> {
  const token = await getAccessToken(env);
  const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      touser: toUser,
      msgtype: 'text',
      agentid: env.WECOM_AGENT_ID,
      text: { content }
    })
  });
  
  const data = await response.json();
  return data.errcode === 0;
}

/**
 * 主请求处理
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // GET: 验证回调 URL
  if (request.method === 'GET' && path === '/api/wecom-webhook') {
    const params = url.searchParams;
    const msgSignature = params.get('msg_signature');
    const timestamp = params.get('timestamp');
    const nonce = params.get('nonce');
    const echostr = params.get('echostr');

    if (!msgSignature || !timestamp || !nonce || !echostr) {
      return new Response('Missing parameters', { status: 400 });
    }

    // 验证签名并解密
    // 实际需要完整的加解密逻辑
    const decrypted = echostr; // 占位
    
    return new Response(decrypted, { status: 200 });
  }

  // POST: 接收消息
  if (request.method === 'POST') {
    if (path === '/api/wecom-webhook') {
      try {
        const body = await request.json();
        console.log('Received message:', JSON.stringify(body, null, 2));
        
        // 解析消息内容
        const msgType = body.MsgType;
        const fromUser = body.FromUserName;
        const content = body.Content || '';
        const msgId = body.MsgId;

        // 存储消息用于后续显示
        messageStore.set(msgId, {
          fromUser,
          content,
          timestamp: Date.now()
        });

        // 生成 AI 回复
        const reply = await generateReply(content);

        return new Response(JSON.stringify({
          errcode: 0,
          errmsg: 'ok'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Error processing message:', error);
        return new Response(JSON.stringify({
          errcode: 0,
          errmsg: 'ok'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 发送消息 API
    if (path === '/api/wecom-send') {
      const body = await request.json();
      const { toUser, content } = body;

      if (!toUser || !content) {
        return new Response(JSON.stringify({ error: 'Missing parameters' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const success = await sendMessage(env, toUser, content);
      
      return new Response(JSON.stringify({ success }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 获取待发送消息
    if (path === '/api/get-pending-messages') {
      const params = url.searchParams;
      const userId = params.get('userId');

      const messages = [];
      for (const [msgId, msg] of messageStore.entries()) {
        if (msg.fromUser === userId) {
          messages.push({ msgId, ...msg as any });
        }
      }

      return new Response(JSON.stringify({ messages }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // 返回前端页面
  if (path === '/' || path === '/index.html') {
    return new Response(HTML_PAGE, {
      headers: { 'Content-Type': 'text/html' }
    });
  }

  return new Response('Jimbo Workers - Not Found', { status: 404 });
}

// 前端 HTML 页面
const HTML_PAGE = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jimbo 智能回复助手</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 16px;
      text-align: center;
      font-size: 18px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    .message {
      margin-bottom: 12px;
      max-width: 85%;
      animation: slideIn 0.3s ease;
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .message.user {
      margin-left: auto;
      background: #667eea;
      color: white;
      border-radius: 18px 18px 4px 18px;
      padding: 12px 16px;
    }
    .message.assistant {
      margin-right: auto;
      background: white;
      border-radius: 18px 18px 18px 4px;
      padding: 12px 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .message-content { white-space: pre-wrap; word-break: break-word; }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .btn {
      padding: 6px 12px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    .btn-send { background: #4caf50; color: white; }
    .btn-copy { background: #e0e0e0; color: #333; }
    .btn:hover { opacity: 0.9; }
    .input-area {
      display: flex;
      padding: 12px;
      background: white;
      border-top: 1px solid #e0e0e0;
    }
    .input {
      flex: 1;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 24px;
      outline: none;
      font-size: 14px;
    }
    .input:focus { border-color: #667eea; }
    .send-btn {
      margin-left: 8px;
      padding: 10px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 24px;
      cursor: pointer;
      font-weight: 600;
    }
    .send-btn:disabled { background: #ccc; cursor: not-allowed; }
    .toast {
      position: fixed;
      top: 70px;
      left: 50%;
      transform: translateX(-50%);
      background: #4caf50;
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      animation: fadeOut 2s forwards;
    }
    @keyframes fadeOut {
      0%, 70% { opacity: 1; }
      100% { opacity: 0; }
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #666;
      text-align: center;
    }
    .empty-icon { font-size: 48px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="header">🤖 Jimbo 智能回复助手</div>
  
  <div class="messages" id="messages">
    <div class="empty">
      <div class="empty-icon">💬</div>
      <div>Jimbo 在这里帮你起草回复</div>
      <div style="font-size: 12px; color: #999; margin-top: 8px;">
        输入客户的问题，我会生成专业回复
      </div>
    </div>
  </div>
  
  <div class="input-area">
    <input type="text" class="input" id="input" placeholder="输入你想让 Jimbo 回复的内容...">
    <button class="send-btn" id="sendBtn" onclick="send()">发送</button>
  </div>

  <script>
    let loading = false;
    
    async function send() {
      const input = document.getElementById('input');
      const msg = input.value.trim();
      if (!msg || loading) return;
      
      addMessage(msg, 'user');
      input.value = '';
      loading = true;
      
      // 调用 AI 生成回复
      // 实际应该调用 /api/generate-reply
      // 这里简化处理，返回一个模拟回复
      setTimeout(() => {
        const reply = "感谢您的咨询。我们的团队会尽快处理您的问题。如果您有任何其他疑问，请随时联系我们。";
        addMessage(reply, 'assistant');
        loading = false;
      }, 1000);
    }
    
    function addMessage(content, role) {
      const messages = document.getElementById('messages');
      
      // 清除空状态
      if (messages.querySelector('.empty')) {
        messages.innerHTML = '';
      }
      
      const div = document.createElement('div');
      div.className = 'message ' + role;
      
      let actions = '';
      if (role === 'assistant') {
        actions = \`
          <div class="actions">
            <button class="btn btn-send" onclick="sendToCustomer(this)">发送给客户</button>
            <button class="btn btn-copy" onclick="copyText(this)">复制</button>
          </div>
        \`;
      }
      
      div.innerHTML = \`<div class="message-content">\${content}</div>\${actions}\`;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    
    function sendToCustomer(btn) {
      const content = btn.closest('.message').querySelector('.message-content').textContent;
      // 实际调用 /api/wecom-send
      showToast('已发送');
      btn.closest('.message').remove();
    }
    
    function copyText(btn) {
      const content = btn.closest('.message').querySelector('.message-content').textContent;
      navigator.clipboard.writeText(content);
      showToast('已复制');
    }
    
    function showToast(msg) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.textContent = '✓ ' + msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
    }
    
    // 回车发送
    document.getElementById('input').addEventListener('keypress', e => {
      if (e.key === 'Enter') send();
    });
  </script>
</body>
</html>
`;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  }
};
