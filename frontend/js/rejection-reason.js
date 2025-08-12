const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
const contentId = new URLSearchParams(window.location.search).get('contentId');

// دالة للحصول على الترجمة
function getTranslation(key) {
  const lang = localStorage.getItem('language') || 'ar';
  const translations = window.translations || {};
  return translations[lang]?.[key] || key;
}

// دالة معالجة النصوص ثنائية اللغة
function getLocalizedName(name) {
  if (!name) return '';
  const lang = localStorage.getItem('language') || 'ar';
  if (typeof name === 'string' && name.trim().startsWith('{') && name.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(name);
      return parsed[lang] || parsed['ar'] || parsed['en'] || name;
    } catch (e) {
      return name;
    }
  }
  if (typeof name === 'object' && name !== null) {
    return name[lang] || name['ar'] || name['en'] || JSON.stringify(name);
  }
  return name;
}

// جلب معلومات الملف
async function fetchFileInfo() {
  try {
    const res = await fetch(`${apiBase}/contents/${contentId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error(getTranslation('error-loading-data'));
    }
    const data = await res.json();
    return data.data || {};
  } catch (error) {
    console.error(getTranslation('error-loading-data'), error);
    return {};
  }
}

// جلب السبب والردود من API
async function fetchRejectionReasonWithAuthor() {
  const res = await fetch(`${apiBase}/contents/${contentId}/rejection-reason`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return { reason: data.reason || '', author: data.author || '' };
}

async function fetchReplies() {
  const res = await fetch(`${apiBase}/contents/${contentId}/rejection-replies`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  return data.data || [];
}

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

// عرض معلومات الملف
function renderFileInfo(fileInfo) {
  const fileTitle = document.getElementById('file-title');
  const fileDepartment = document.getElementById('file-department');
  if (fileTitle) {
    const fileName = getLocalizedName(fileInfo.title);
    fileTitle.innerHTML = `
      <i class="fa-regular fa-file-lines"></i>
      ${fileName || getTranslation('file-not-found')}
    `;
  }
  if (fileDepartment) {
    const departmentName = getLocalizedName(fileInfo.source_name);
    fileDepartment.innerHTML = `
      <i class="fa-regular fa-building"></i>
      ${departmentName || getTranslation('department-not-found')}
    `;
  }
}

function renderChat(reason, replies) {
  const chatMessages = document.getElementById('chat-messages');
  chatMessages.innerHTML = '';
  // أول رسالة: سبب الرفض
  if (reason && reason.reason) {
    chatMessages.innerHTML += `
      <div class="msg msg-system">
        <div class="msg-text">${reason.reason}</div>
        <div class="msg-meta">${reason.author || getTranslation('system')} <span></span></div>
      </div>
    `;
  }
  // الردود
  replies.forEach(reply => {
    const isMe = Number(reply.user_id) === Number(window.currentUserId);
    console.log('Reply debug:', { 
      replyUserId: reply.user_id, 
      currentUserId: window.currentUserId, 
      fullName: reply.full_name, 
      isMe: isMe 
    });
    chatMessages.innerHTML += `
      <div class="msg ${isMe ? 'msg-user' : 'msg-system'}">
        <div class="msg-text">${reply.reply_text}</div>
        <div class="msg-meta">${reply.full_name} <span>${formatTime(reply.created_at)}</span></div>
      </div>
    `;
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(dateString) {
  if (!dateString) return '';
  try {
    const lang = localStorage.getItem('language') || 'ar';
    const date = new Date(dateString);
    return date.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateString;
  }
}

// دالة تحديث النصوص حسب اللغة
function updatePageTexts() {
  // تحديث النصوص الثابتة
  document.querySelectorAll('[data-translate]').forEach(element => {
    const key = element.getAttribute('data-translate');
    element.textContent = getTranslation(key);
  });
  // تحديث placeholders
  document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
    const key = element.getAttribute('data-translate-placeholder');
    element.placeholder = getTranslation(key);
  });
}

// دالة تحديث البيانات
async function refreshData() {
  try {
    // إظهار رسالة التحميل
    const chatMessages = document.querySelector('#chat-messages');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="loading-message">
          <i class="fa fa-spinner fa-spin"></i>
          <span data-translate="loading-messages">${getTranslation('loading-messages')}</span>
        </div>
      `;
    }
    // جلب البيانات
    const [fileInfo, reasonObj, replies] = await Promise.all([
      fetchFileInfo(),
      fetchRejectionReasonWithAuthor(),
      fetchReplies()
    ]);
    // عرض المعلومات
    renderFileInfo(fileInfo);
    renderChat(reasonObj, replies);
  } catch (error) {
    console.error(getTranslation('error-loading-data'), error);
    const chatMessages = document.querySelector('#chat-messages');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="error-message" style="text-align: center; color: #ef4444; padding: 20px;">
          <i class="fa fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p data-translate="error-loading-data">${getTranslation('error-loading-data')}</p>
        </div>
      `;
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!token) {
    alert(getTranslation('please-login'));
    window.location.href = 'login.html';
    return;
  }
  if (!contentId) {
    alert(getTranslation('invalid-file'));
    history.back();
    return;
  }
  // تحديث النصوص عند التحميل
  updatePageTexts();
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
  const currentUserId = payload.id;
  window.currentUserId = currentUserId;
  window.currentUsername = payload.username; // حفظ اسم المستخدم الحالي للمقارنة
  console.log('Current user debug:', { 
    currentUserId: window.currentUserId, 
    currentUsername: window.currentUsername,
    payload: payload 
  });
  // تحميل البيانات
  await refreshData();
  // إرسال رد جديد
  const form = document.querySelector('.chat-input-row');
  const input = form.querySelector('input');
  const charCount = document.querySelector('.char-count');
  if (form && input && charCount) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      // إظهار حالة الإرسال
      const sendBtn = form.querySelector('.send-btn');
      const originalText = sendBtn.innerHTML;
      sendBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
      sendBtn.disabled = true;
      const ok = await sendReply(text);
      if (ok) {
        // إعادة تحميل البيانات
        await refreshData();
        input.value = '';
        charCount.textContent = '0/500';
      } else {
        alert(getTranslation('error-sending-reply'));
      }
      // إعادة تفعيل الزر
      sendBtn.innerHTML = originalText;
      sendBtn.disabled = false;
    });
    // عداد الأحرف
    input.addEventListener('input', function() {
      charCount.textContent = this.value.length + '/500';
    });
  }
  // مراقبة تغيير اللغة
  window.addEventListener('languageChanged', () => {
    updatePageTexts();
    refreshData();
  });
});
// تصدير الدوال للاستخدام العام
window.refreshData = refreshData; 