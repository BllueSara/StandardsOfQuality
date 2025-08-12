const apiBase = 'http://localhost:3006/api';

let allNotifications = [];
let token, userId, isAdmin, payload;

document.addEventListener('DOMContentLoaded', async () => {
  token = localStorage.getItem('token');
  if (!token) return alert(getTranslation('notifications-not-logged-in'));

  try {
    payload = JSON.parse(atob(token.split('.')[1]));
  } catch {
    return alert(getTranslation('notifications-invalid-token'));
  }

  userId = payload.id;
  isAdmin = payload.role === 'admin';

  // ✅ علّم كل الإشعارات كمقروءة
  await fetch(`${apiBase}/users/${userId}/notifications/mark-read`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  // ✅ حذف شارة الإشعارات
  const badge = document.querySelector('.notif-badge');
  if (badge) badge.remove();
  // ✅ جلب الإشعارات
  const res = await fetch(`${apiBase}/users/${userId}/notifications`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const result = await res.json();
  if (result.status !== 'success') return alert(getTranslation('notifications-load-failed'));

  allNotifications = result.data || [];

  renderNotifications(allNotifications);
});

// ✅ الفلترة حسب النوع والبحث
document.getElementById('notification-type').addEventListener('change', filterNotifications);
document.getElementById('search-input').addEventListener('input', filterNotifications);

function filterNotifications() {
  const type = document.getElementById('notification-type').value;
  const search = document.getElementById('search-input').value.toLowerCase();

  const filtered = allNotifications.filter(n => {
    const matchesType = !type || n.type === type;
    // البحث في جميع الحقول: اسم المستخدم، العنوان، الرسالة، النوع
    const userName = (n.user_name || '').toLowerCase();
    const title    = (n.title || '').toLowerCase();
    const message  = (n.message || '').toLowerCase();
    const notifType = (n.type || '').toLowerCase();
    const matchesSearch =
      userName.includes(search) ||
      title.includes(search) ||
      message.includes(search) ||
      notifType.includes(search);
    return matchesType && matchesSearch;
  });

  renderNotifications(filtered);
}
const currentLang = localStorage.getItem('language') || 'ar';

// دالة تستبدل أي JSON مضمّن بـالنص المناسب
function extractText(jsonOrString) {
  if (!jsonOrString) return '';

  // استبدال كل كتلة JSON داخل السلسلة
  return jsonOrString.replace(/\{[^}]+\}/g, match => {
    try {
      const obj = JSON.parse(match);
      return obj[currentLang] || obj.ar || obj.en || '';
    } catch {
      return match;
    }
  });
}


// ✅ عرض الإشعارات ديناميكياً
function renderNotifications(notifications) {
  const listContainer = document.querySelector('.notifications-list');
  listContainer.innerHTML = '';

  if (notifications.length === 0) {
    listContainer.innerHTML = `<p style="text-align:center">${getTranslation('notifications-no-match')}</p>`;
    return;
  }

  notifications.forEach(n => {
    // ① فكّ JSON stringify إن وجد في العنوان والرسالة
    const titleText   = extractText(n.title);
    const messageText = extractText(n.message);

    // ② حدّد الأيقونة واللون بناءً على النوع
    const { iconClass, bg } = getIconAndColor(n.type);

    // ③ ابني الكارد بالـ HTML
    const card = document.createElement('div');
    card.className = 'notification-card';
    card.innerHTML = `
      <div class="notification-icon ${bg}">
        <i class="${iconClass}"></i>
      </div>
      <div class="notification-content">
        <div class="notification-user">${n.user_name || '—'}</div>
        <div class="notification-title">
          ${getNotificationTranslation(titleText)}
        </div>
        <div class="notification-description">
          ${getNotificationTranslation(messageText)}
        </div>
      </div>
      <div class="notification-meta">
        <div class="notification-time">${timeAgo(n.created_at)}</div>
        <div class="read-indicator read"></div>
        <button class="delete-btn" data-id="${n.id}" title="${getTranslation('notification-delete')}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `;
    listContainer.appendChild(card);
  });

  // ④ اربط أزرار الحذف كما كان عندك
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        await fetch(`${apiBase}/users/${userId}/notifications/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        // حدّث القائمة محلياً وأعدّ تصفيتها
        allNotifications = allNotifications.filter(n => n.id != id);
        filterNotifications();
      } catch {
        alert(getTranslation('notifications-delete-failed'));
      }
    });
  });
}


// ✅ أيقونات وألوان حسب النوع
function getIconAndColor(type) {
  switch (type) {
    case 'ticket': return { iconClass: 'fas fa-ticket-alt', bg: 'bg-blue' };
    case 'approval': return { iconClass: 'fas fa-check-circle', bg: 'bg-green' };
    case 'signature': return { iconClass: 'fas fa-pen-nib', bg: 'bg-purple' };
    case 'proxy': return { iconClass: 'fas fa-user-friends', bg: 'bg-orange' };
    case 'add': return { iconClass: 'fas fa-plus-circle', bg: 'bg-teal' };
    case 'update': return { iconClass: 'fas fa-edit', bg: 'bg-yellow' };
    case 'delete': return { iconClass: 'fas fa-trash-alt', bg: 'bg-red' };
    case 'approval_reminder': return { iconClass: 'fas fa-clock', bg: 'bg-orange' };
    case 'rejected': return { iconClass: 'fas fa-times-circle', bg: 'bg-red' };
    case 'delegation': return { iconClass: 'fas fa-user-shield', bg: 'bg-indigo' };
    case 'committee': return { iconClass: 'fas fa-users', bg: 'bg-purple' };
    case 'deadline': return { iconClass: 'fas fa-calendar-times', bg: 'bg-red' };
    case 'expiry': return { iconClass: 'fas fa-exclamation-triangle', bg: 'bg-orange' };
    case 'transfer': return { iconClass: 'fas fa-exchange-alt', bg: 'bg-cyan' };
    case 'upload': return { iconClass: 'fas fa-upload', bg: 'bg-green' };
    case 'download': return { iconClass: 'fas fa-download', bg: 'bg-blue' };
    case 'permission': return { iconClass: 'fas fa-key', bg: 'bg-gold' };
    case 'system': return { iconClass: 'fas fa-cog', bg: 'bg-gray' };
    case 'warning': return { iconClass: 'fas fa-exclamation-triangle', bg: 'bg-yellow' };
    case 'info': return { iconClass: 'fas fa-info-circle', bg: 'bg-blue' };
    case 'success': return { iconClass: 'fas fa-check-circle', bg: 'bg-green' };
    case 'error': return { iconClass: 'fas fa-times-circle', bg: 'bg-red' };
    default: return { iconClass: 'fas fa-bell', bg: 'bg-gray' };
  }
}

// ✅ توقيت نسبي
function timeAgo(dateString) {
  const now = new Date();
  const then = new Date(dateString);
  const diff = Math.floor((now - then) / 1000);
  const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
  if (diff < 60)
    return lang === 'en' ? 'now' : 'الآن';
  if (diff < 3600) return lang === 'en'
    ? `${Math.floor(diff / 60)} min ago`
    : `منذ ${Math.floor(diff / 60)} دقيقة`;
  if (diff < 86400) return lang === 'en'
    ? `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) > 1 ? 's' : ''} ago`
    : `منذ ${Math.floor(diff / 3600)} ساعة`;
  return then.toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA');
}

// ✅ عرض اسم المستخدم أو رقم المعرف حسب الدور
function getUserLabel(notificationUserId, isAdmin, currentUser) {
  return isAdmin && notificationUserId !== currentUser.id
    ? `#${notificationUserId}`
    : currentUser.name || '—';
}

function getTranslation(key) {
  const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
  if (window.translations && window.translations[lang] && window.translations[lang][key]) {
    return window.translations[lang][key];
  }
  return key;
}

// ✅ ترجمة ذكية للإشعارات العربية للإنجليزية
function getNotificationTranslation(text) {
  const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
  if (lang === 'ar') return text;
  // ترجمة إشعار انتهاء الصلاحية
  const expiredDetails = text.match(
    /^انتهت صلاحية المحتوى\s*["«](.+?)["»]\s*في(?:\s*قسم)?\s*["«](.+?)["»][,،]\s*مجلد\s*["«](.+?)["»]\s*بتاريخ\s*(.+?)\.\s*يرجى تحديثه أو رفع نسخة جديدة\.?$/
  );
  if (expiredDetails) {
    const [, title, dept, folder, date] = expiredDetails;
    return `The content "${title}" in department "${dept}", folder "${folder}" expired on ${date}. Please update or upload a new version.`;
  }
  // ترجمة إشعار اقتراب انتهاء الصلاحية (قبل شهر أو يوم)
  const soonMonthDetails = text.match(/^اقترب انتهاء صلاحية المحتوى\s*["«](.+?)["»]\s*في(?:\s*قسم)?\s*["«](.+?)["»][,،]\s*مجلد\s*["«](.+?)["»]\s*بتاريخ\s*(.+?)\.\s*يرجى تحديثه أو رفع نسخة جديدة\.?$/);
  if (soonMonthDetails) {
    const [, title, dept, folder, date] = soonMonthDetails;
    return `The content "${title}" in department "${dept}", folder "${folder}" is expiring soon (on ${date}). Please update or upload a new version.`;
  }
  const soonDayDetails = text.match(/^غدًا تنتهي صلاحية المحتوى\s*["«](.+?)["»]\s*في(?:\s*قسم)?\s*["«](.+?)["»][,،]\s*مجلد\s*["«](.+?)["»]\s*بتاريخ\s*(.+?)\.\s*يرجى تحديثه أو رفع نسخة جديدة\.?$/);
  if (soonDayDetails) {
    const [, title, dept, folder, date] = soonDayDetails;
    return `The content "${title}" in department "${dept}", folder "${folder}" will expire tomorrow (${date}). Please update or upload a new version.`;
  }
  // ترجمة إشعار انتهاء الصلاحية مع تفاصيل القسم والمجلد
  const expiredContentDetailsMatch = text.match(/^انتهت صلاحية المحتوى "(.+)" في قسم "(.+)", مجلد "(.+)" بتاريخ ([0-9\-]+). يرجى تحديثه أو رفع نسخة جديدة\.?\n?$/);
  if (expiredContentDetailsMatch) {
    return `The content "${expiredContentDetailsMatch[1]}" in department "${expiredContentDetailsMatch[2]}", folder "${expiredContentDetailsMatch[3]}" expired on ${expiredContentDetailsMatch[4]}. Please update or upload a new version.`;
  }
  // exact-title translations
  if (text === 'تم تفويضك للتوقيع') {
    return 'You have been delegated to sign';
  }
  if (text === 'تم اعتماد ملفك') {
    return 'Your file has been approved';
  }
  if (text === 'تم رفض ملفك') {
    return 'Your file has been rejected';
  }
  if (text==='انتهت صلاحية المحتوى') {
    return 'The content has expired';
  }
  
  if (text==='غدًا تنتهي صلاحية المحتوى') {
    return 'The content has expired tomorrow';
  }
  if (text==='اقترب انتهاء صلاحية المحتوى') {
    return 'The content has expired soon';
  }

  
  // إشعارات OVR
  if (text === 'تم إنشاء تقرير OVR جديد') {
    return 'A new OVR report has been created';
  }
  if (text === 'تم تحديث تقرير OVR') {
    return 'The OVR report has been updated';
  }
  if (text === 'تم إغلاق تقرير OVR') {
    return 'The OVR report has been closed';
  }
  if (text === 'تم تعيين تقرير OVR لك') {
    return 'An OVR report has been assigned to you';
  }
  if (text === 'تم تعيين تقرير OVR') {
    return 'An OVR report has been assigned';
  }
  if (text === 'تم حذف تقرير OVR') {
    return 'The OVR report has been deleted';
  }
  // إشعارات الاعتماد
  if (text === 'طلب اعتماد جديد') {
    return 'A new approval request';
  }
  if (text === 'تم اعتماد المحتوى') {
    return 'The content has been approved';
  }
  if (text === 'تم رفض المحتوى') {
    return 'The content has been rejected';
  }
  if (text === 'تم اعتماد الملف') {
    return 'The file has been approved';
  }
  if (text === 'تم رفض الملف') {
    return 'The file has been rejected';
  }

  // ترجمة الجمل التي تحتوي على اسم ملف بين علامات اقتباس
  const fileApprovedMatch = text.match(/^الملف "(.+)" تم اعتماده من قبل الإدارة\.$/);
  if (fileApprovedMatch) {
    return `The file "${fileApprovedMatch[1]}" has been approved by the administration.`;
  }
  const fileRejectedMatch = text.match(/^الملف "(.+)" تم رفضه من قبل الإدارة\.$/);
  if (fileRejectedMatch) {
    return `The file "${fileRejectedMatch[1]}" has been rejected by the administration.`;
  }
 // committee‐file approved
 const committeeApprovedMatch = text.match(
   /^ملف اللجنة "(.+)" تم اعتماده من قبل الإدارة\.$/
 );
 if (committeeApprovedMatch) {
   return `The committee file "${committeeApprovedMatch[1]}" has been approved by the administration.`;
 }
   const committeeRejectedMatch = text.match(
    /^ملف اللجنة "(.+)" تم رفضه من قبل الإدارة\.$/
  );
  if (committeeRejectedMatch) {
    return `The committee file "${committeeRejectedMatch[1]}" has been rejected by the administration.`;
  }

  const translations = {
    'تم تفويضك للتوقيع بالنيابة عن مستخدم آخر على الملف رقم': 'You have been delegated to sign on behalf of another user for file number',
    'تم تفويضك للتوقيع على ملف جديد رقم': 'You have been delegated to sign a new file with number',
    'تم تفويضك للتوقيع على ملف لجنة جديد رقم': 'You have been delegated to sign a new committee file with number',
    'تم إغلاق الحدث العارض رقم': 'Your OVO  has been closed number',
    'تم إغلاق الحدث العارض': 'OVR closed',
    'الملف': 'The file',
    'تم اعتماده من قبل الإدارة.': 'has been approved by the administration.',
    'تم رفضه من قبل الإدارة.': 'has been rejected by the administration.',
    'ملف اللجنة': 'The committee file',
  };

  for (const ar in translations) {
    if (text.startsWith(ar)) {
      return text.replace(ar, translations[ar]);
    }
    if (text.includes(ar)) {
      return text.replace(ar, translations[ar]);
    }
  }
  // ترجمة ديناميكية للجمل التي تحتوي على متغيرات
  // تم تفويضك للتوقيع بالنيابة عن admin على The file رقم 67
  // نمط مرن جدًا لأي نص بعد "على" وقبل "رقم"
  const proxyMatchFlexible = text.match(/^تم تفويضك للتوقيع بالنيابة عن\s+(.+?)\s+على\s+(.+?)\s+رقم\s+(\d+)$/i);
  if (proxyMatchFlexible) {
    const [, user, fileType, fileNum] = proxyMatchFlexible;
    return `You have been delegated to sign on behalf of ${user} on ${fileType} number ${fileNum}`;
  }
  // تم إنشاء تقرير OVR جديد برقم 28
  const createOvrMatch = text.match(/^تم إنشاء تقرير OVR جديد برقم (\d+)$/);
  if (createOvrMatch) {
    return `A new OVR report has been created with number ${createOvrMatch[1]}`;
  }
  // تم حذف تقرير OVR برقم ...
  const deleteOvrMatch = text.match(/^تم حذف تقرير OVR برقم (\d+)$/);
  if (deleteOvrMatch) {
    return `The OVR report with number ${deleteOvrMatch[1]} has been deleted`;
  }
  // تم تحديث تقرير OVR برقم ...
  const updateOvrMatch = text.match(/^تم تحديث تقرير OVR برقم (\d+)$/);
  if (updateOvrMatch) {
    return `The OVR report with number ${updateOvrMatch[1]} has been updated`;
  }
  // تم إغلاق تقرير OVR برقم ...
  const closeOvrMatch = text.match(/^تم إغلاق تقرير OVR برقم (\d+)$/);
  if (closeOvrMatch) {
    return `The OVR report with number ${closeOvrMatch[1]} has been closed`;
  }
  // تم تعيين تقرير OVR برقم ... لك
  const assignOvrMatch = text.match(/^تم تعيين تقرير OVR برقم (\d+) لك$/);
  if (assignOvrMatch) {
    return `The OVR report with number ${assignOvrMatch[1]} has been assigned to you`;
  }
  // تم تعيين تقرير OVR برقم ... إلى: ...
  const assignOvrToMatch = text.match(/^تم تعيين تقرير OVR برقم (\d+) إلى: (.+)$/);
  if (assignOvrToMatch) {
    return `The OVR report with number ${assignOvrToMatch[1]} has been assigned to: ${assignOvrToMatch[2]}`;
  }
  if (text === 'ملف جديد بانتظار اعتمادك') {
    return 'A new file is awaiting your approval';
  }
  if (text === 'تم اعتماد ملفك من جميع المعتمدين') {
    return 'Your file has been approved by all approvers';
  }
  // ترجمة ديناميكية: لديك ملف بعنوان "xxx" بحاجة لاعتمادك.
  const waitingApprovalMatch = text.match(/^لديك ملف بعنوان "(.+)" بحاجة لاعتمادك\.$/);
  if (waitingApprovalMatch) {
    return `You have a file titled "${waitingApprovalMatch[1]}" awaiting your approval.`;
  }
  // ترجمة ديناميكية: الملف "xxx" تم اعتماده من جميع أعضاء التسلسل.
  const allApprovedMatch = text.match(/^الملف "(.+)" تم اعتماده من جميع أعضاء التسلسل\.$/);
  if (allApprovedMatch) {
    return `The file "${allApprovedMatch[1]}" has been approved by all approvers.`;
  }
  if (text === 'تذكير اعتماد ملف') {
    return 'Approval Reminder';
  }
  // ترجمة ديناميكية: لديك ملف بعنوان "xxx" بانتظار اعتمادك منذ أكثر من 3 أيام. يرجى اتخاذ الإجراء المناسب.
  const approvalReminderMatch = text.match(/^لديك ملف بعنوان "(.+)" بانتظار اعتمادك منذ أكثر من 3 أيام\. يرجى اتخاذ الإجراء المناسب\.$/);
  if (approvalReminderMatch) {
    return `You have a file titled "${approvalReminderMatch[1]}" awaiting your approval for more than 3 days. Please take action.`;
  }
  
  // إشعارات التفويض والنيابة
  if (text === 'تم تفويضك للتوقيع بالنيابة عن مستخدم آخر') {
    return 'You have been delegated to sign on behalf of another user';
  }
  if (text === 'تم قبول التفويض') {
    return 'Delegation accepted';
  }
  if (text === 'تم رفض التفويض') {
    return 'Delegation rejected';
  }
  if (text === 'تم إلغاء التفويض') {
    return 'Delegation cancelled';
  }
  if (text === 'تم إنهاء التفويض') {
    return 'Delegation ended';
  }
  if (text === 'تم تجديد التفويض') {
    return 'Delegation renewed';
  }
  
  // إشعارات اللجان
  if (text === 'تم إنشاء لجنة جديدة') {
    return 'A new committee has been created';
  }
  if (text === 'تم تحديث اللجنة') {
    return 'The committee has been updated';
  }
  if (text === 'تم إغلاق اللجنة') {
    return 'The committee has been closed';
  }
  if (text === 'تم تعيينك في لجنة') {
    return 'You have been assigned to a committee';
  }
  if (text === 'تم إزالتك من اللجنة') {
    return 'You have been removed from the committee';
  }
  
  // إشعارات المواعيد النهائية
  if (text === 'اقتراب الموعد النهائي') {
    return 'Deadline approaching';
  }
  if (text === 'انتهى الموعد النهائي') {
    return 'Deadline expired';
  }
  if (text === 'تم تمديد الموعد النهائي') {
    return 'Deadline extended';
  }
  
  // إشعارات النقل والتحويل
  if (text === 'تم نقل الملف') {
    return 'File transferred';
  }
  if (text === 'تم تحويل الملف') {
    return 'File converted';
  }
  if (text === 'تم نسخ الملف') {
    return 'File copied';
  }
  
  // إشعارات الرفع والتحميل
  if (text === 'تم رفع الملف بنجاح') {
    return 'File uploaded successfully';
  }
  if (text === 'فشل في رفع الملف') {
    return 'File upload failed';
  }
  if (text === 'تم تحميل الملف') {
    return 'File downloaded';
  }
  
  // إشعارات الصلاحيات
  if (text === 'تم منحك صلاحيات جديدة') {
    return 'New permissions granted to you';
  }
  if (text === 'تم إلغاء صلاحياتك') {
    return 'Your permissions have been revoked';
  }
  if (text === 'تم تحديث صلاحياتك') {
    return 'Your permissions have been updated';
  }
  
  // إشعارات النظام
  if (text === 'تم تحديث النظام') {
    return 'System updated';
  }
  if (text === 'صيانة النظام') {
    return 'System maintenance';
  }
  if (text === 'تم إعادة تشغيل النظام') {
    return 'System restarted';
  }
  
  // إشعارات التحذير
  if (text === 'تحذير: ملف منتهي الصلاحية') {
    return 'Warning: Expired file';
  }
  if (text === 'تحذير: موعد نهائي قريب') {
    return 'Warning: Deadline approaching';
  }
  if (text === 'تحذير: صلاحيات منتهية') {
    return 'Warning: Expired permissions';
  }
  
  // إشعارات المعلومات
  if (text === 'معلومات: تم تحديث البيانات') {
    return 'Info: Data updated';
  }
  if (text === 'معلومات: تم إنشاء نسخة احتياطية') {
    return 'Info: Backup created';
  }
  if (text === 'معلومات: تم مزامنة البيانات') {
    return 'Info: Data synchronized';
  }
  
  // إشعارات النجاح
  if (text === 'تم حفظ البيانات بنجاح') {
    return 'Data saved successfully';
  }
  if (text === 'تم إرسال الطلب بنجاح') {
    return 'Request sent successfully';
  }
  if (text === 'تم تحديث الحالة بنجاح') {
    return 'Status updated successfully';
  }
  
  // إشعارات الأخطاء
  if (text === 'خطأ: فشل في حفظ البيانات') {
    return 'Error: Failed to save data';
  }
  if (text === 'خطأ: فشل في إرسال الطلب') {
    return 'Error: Failed to send request';
  }
  if (text === 'خطأ: فشل في تحديث الحالة') {
    return 'Error: Failed to update status';
  }
  
  // ترجمة ديناميكية للإشعارات الجديدة
  // إشعارات الرفض مع السبب
  const rejectionWithReasonMatch = text.match(/^تم رفض ملفك من قبل (.+?)\. السبب: (.+)$/);
  if (rejectionWithReasonMatch) {
    const [, rejector, reason] = rejectionWithReasonMatch;
    return `Your file has been rejected by ${rejector}. Reason: ${reason}`;
  }
  
  // إشعارات التفويض مع التفاصيل
  const delegationMatch = text.match(/^تم تفويضك للتوقيع بالنيابة عن (.+?) على ملف جديد رقم (\d+)$/);
  if (delegationMatch) {
    const [, delegator, fileNumber] = delegationMatch;
    return `You have been delegated to sign on behalf of ${delegator} for a new file number ${fileNumber}`;
  }
  
  // إشعارات اللجان مع التفاصيل
  const committeeMatch = text.match(/^تم إنشاء لجنة جديدة باسم "(.+?)"$/);
  if (committeeMatch) {
    const [, committeeName] = committeeMatch;
    return `A new committee has been created named "${committeeName}"`;
  }
  
  // إشعارات المواعيد النهائية مع التفاصيل
  const deadlineMatch = text.match(/^الموعد النهائي للملف "(.+?)" هو (.+)$/);
  if (deadlineMatch) {
    const [, fileName, deadline] = deadlineMatch;
    return `The deadline for file "${fileName}" is ${deadline}`;
  }
  
  return text;
}
