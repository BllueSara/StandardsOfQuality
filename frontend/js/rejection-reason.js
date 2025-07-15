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
  
  // إذا كان النص يحتوي على JSON، حاول تحليله
  if (typeof name === 'string' && name.trim().startsWith('{') && name.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(name);
      return parsed[lang] || parsed['ar'] || parsed['en'] || name;
    } catch (e) {
      return name;
    }
  }
  
  // إذا كان object، استخرج النص باللغة المناسبة
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
      throw new Error('فشل في جلب معلومات الملف');
    }
    
    const data = await res.json();
    return data.data || {};
  } catch (error) {
    console.error('خطأ في جلب معلومات الملف:', error);
    return {};
  }
}

// جلب سبب الرفض الحقيقي من API جديد (مع اسم الكاتب)
async function fetchRejectionReasonWithAuthor() {
  try {
    const res = await fetch(`${apiBase}/contents/${contentId}/rejection-reason`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      throw new Error('فشل في جلب سبب الرفض');
    }
    
    const data = await res.json();
    return { reason: data.reason || '', author: data.author || '' };
  } catch (error) {
    console.error('خطأ في جلب سبب الرفض:', error);
    return { reason: '', author: '' };
  }
}

// جلب الردود من الباكند
async function fetchReplies() {
  try {
    const res = await fetch(`${apiBase}/contents/${contentId}/rejection-replies`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      throw new Error('فشل في جلب الردود');
    }
    
    const data = await res.json();
    return data.data || [];
  } catch (error) {
    console.error('خطأ في جلب الردود:', error);
    return [];
  }
}

// إرسال رد جديد
async function sendReply(text) {
  try {
    const res = await fetch(`${apiBase}/contents/${contentId}/rejection-reply`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reply: text })
    });
    
    if (!res.ok) {
      throw new Error('فشل في إرسال الرد');
    }
    
    return true;
  } catch (error) {
    console.error('خطأ في إرسال الرد:', error);
    return false;
  }
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

// عرض السبب والردود في الشات
function renderChat(reason, replies, currentUserId, reasonAuthor) {
  const chatMessages = document.querySelector('#chat-messages');
  if (!chatMessages) return;
  
  chatMessages.innerHTML = '';
  
  // إذا لم يكن هناك سبب، عرض رسالة
  if (!reason && replies.length === 0) {
    chatMessages.innerHTML = `
      <div class="no-messages">
        <i class="fa fa-comment-slash" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
        <p style="color: #888; text-align: center;">${getTranslation('no-rejection-reason')}</p>
      </div>
    `;
    return;
  }
  
  // السبب أول رسالة (bubble)
  if (reason) {
    const isMe = reasonAuthor && reasonAuthor.toLowerCase() === (window.currentUsername || '').toLowerCase();
    chatMessages.innerHTML += `
      <div class="msg ${isMe ? 'msg-system' : 'msg-user'}">
        <div class="msg-text">${reason}</div>
        <div class="msg-meta">
          ${reasonAuthor || getTranslation('unknown')} 
          <span>${formatTime(new Date())}</span>
        </div>
      </div>
    `;
  }
  
  // الردود
  replies.forEach(reply => {
    const isMeReply = reply.username && reply.username.toLowerCase() === (window.currentUsername || '').toLowerCase();
    chatMessages.innerHTML += `
      <div class="msg ${isMeReply ? 'msg-system' : 'msg-user'}">
        <div class="msg-text">${reply.reply_text}</div>
        <div class="msg-meta">
          ${reply.username} 
          <span>${formatTime(reply.created_at)}</span>
        </div>
      </div>
    `;
  });
  
  // التمرير إلى آخر رسالة
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// تنسيق الوقت
function formatTime(dateString) {
  if (!dateString) return '';
  
  const lang = localStorage.getItem('language') || 'ar';
  const date = new Date(dateString);
  
  try {
    if (lang === 'en') {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } else {
      return date.toLocaleTimeString('ar-SA', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    }
  } catch (e) {
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
          <span>${getTranslation('loading-messages')}</span>
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
    renderChat(reasonObj.reason, replies, window.currentUserId, reasonObj.author);
    
  } catch (error) {
    console.error('خطأ في تحديث البيانات:', error);
    const chatMessages = document.querySelector('#chat-messages');
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="error-message" style="text-align: center; color: #ef4444; padding: 20px;">
          <i class="fa fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p>${getTranslation('error-loading-data')}</p>
        </div>
      `;
    }
  }
}

// عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', async () => {
  if (!token) {
    alert(getTranslation('please-login') || 'الرجاء تسجيل الدخول');
    window.location.href = 'login.html';
    return;
  }
  
  if (!contentId) {
    alert(getTranslation('invalid-file') || 'ملف غير صحيح');
    history.back();
    return;
  }
  
  // تحديث النصوص عند التحميل
  updatePageTexts();
  
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
  const currentUserId = payload.id;
  window.currentUserId = currentUserId;
  window.currentUsername = payload.username; // حفظ اسم المستخدم الحالي للمقارنة

  // تحميل البيانات
  await refreshData();

  // إرسال رد جديد
  const form = document.querySelector('#reply-form');
  const input = document.querySelector('#reply-input');
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
        alert(getTranslation('error-sending-reply') || 'حدث خطأ أثناء إرسال الرد');
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