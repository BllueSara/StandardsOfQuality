const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
const contentId = new URLSearchParams(window.location.search).get('contentId');

// جلب سبب الرفض الحقيقي من API جديد (مع اسم الكاتب)
async function fetchRejectionReasonWithAuthor() {
  const res = await fetch(`${apiBase}/contents/${contentId}/rejection-reason`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return { reason: data.reason || '', author: data.author || '' };
}

// جلب الردود من الباكند
async function fetchReplies() {
  const res = await fetch(`${apiBase}/contents/${contentId}/rejection-replies`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.data || [];
}

// إرسال رد جديد
async function sendReply(text) {
  const res = await fetch(`${apiBase}/contents/${contentId}/rejection-reply`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reply: text })
  });
  return res.ok;
}

// عرض السبب والردود في الشات
function renderChat(reason, replies, currentUserId, reasonAuthor) {
  const chatMessages = document.querySelector('.chat-messages');
  chatMessages.innerHTML = '';
  // السبب أول رسالة (bubble)
  const isMe = reasonAuthor && reasonAuthor.toLowerCase() === (window.currentUsername || '').toLowerCase();
  chatMessages.innerHTML += `
    <div class="msg ${isMe ? 'msg-system' : 'msg-user'}">
      <div class="msg-text">${reason || 'لا يوجد سبب مذكور'}</div>
      <div class="msg-meta">${reasonAuthor || 'غير معروف'}</div>
    </div>
  `;
  // الردود
  replies.forEach(reply => {
    const isMeReply = reply.username && reply.username.toLowerCase() === (window.currentUsername || '').toLowerCase();
    chatMessages.innerHTML += `
      <div class="msg ${isMeReply ? 'msg-system' : 'msg-user'}">
        <div class="msg-text">${reply.reply_text}</div>
        <div class="msg-meta">${reply.username} <span>${formatTime(reply.created_at)}</span></div>
      </div>
    `;
  });
}

// تنسيق الوقت
function formatTime(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateString;
  }
}

// عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', async () => {
  if (!token) {
    alert('الرجاء تسجيل الدخول');
    window.location.href = 'login.html';
    return;
  }
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
  const currentUserId = payload.id;
  window.currentUsername = payload.username; // حفظ اسم المستخدم الحالي للمقارنة

  // جلب السبب والردود مع اسم الكاتب
  const reasonObj = await fetchRejectionReasonWithAuthor();
  const replies = await fetchReplies();
  renderChat(reasonObj.reason, replies, currentUserId, reasonObj.author);

  // إرسال رد جديد
  const form = document.querySelector('.chat-input-row');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const text = input.value.trim();
    if (!text) return;
    const ok = await sendReply(text);
    if (ok) {
      const replies = await fetchReplies();
      renderChat(reasonObj.reason, replies, currentUserId, reasonObj.author);
      input.value = '';
      document.querySelector('.char-count').textContent = '0/500';
    } else {
      alert('حدث خطأ أثناء إرسال الرد');
    }
  });
  // عداد الأحرف
  const input = form.querySelector('input');
  input.addEventListener('input', function() {
    document.querySelector('.char-count').textContent = this.value.length + '/500';
  });
}); 