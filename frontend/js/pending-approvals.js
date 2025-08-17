// approvals-recived.js

// Fallback translation function if not defined elsewhere
if (typeof getTranslation === 'undefined') {
  window.getTranslation = function(key) {
    const translations = {
      'sign': 'توقيع',
      'delegate': 'تفويض',
      'electronic': 'إلكتروني',
      'reject': 'رفض',
      'preview': 'معاينة',
      'transfer-file': 'تحويل الملف',
      'track-file': 'تتبع الملف',
      'approved': 'معتمد',
      'rejected': 'مرفوض',
      'pending': 'في الانتظار',
      'no-signature': 'يرجى إضافة توقيع أولاً',
      'error-loading': 'خطأ في تحميل البيانات',
      'success-sent': 'تم الإرسال بنجاح',
      'error-sending': 'خطأ في الإرسال',
      'please-login': 'يرجى تسجيل الدخول',
      'error-loading': 'خطأ في تحميل البيانات',
      'please-enter-reason': 'يرجى إدخال سبب الرفض',
      'success-rejected': 'تم الرفض بنجاح',
      'no-content': 'لا يوجد محتوى',
      'please-select-user': 'يرجى اختيار مستخدم',
      'success-delegated': 'تم التفويض بنجاح',
      'delegate-all': 'تفويض جميع الملفات بالنيابة',
      'select-user': 'اختر المستخدم',
      'notes-bulk': 'ملاحظات (تنطبق على جميع الملفات)',
      'all-departments': 'جميع الأقسام',
      'select-department': 'اختر القسم',
      'committee-file': 'ملف لجنة',
      'department-report': 'تقرير قسم',
      'today': 'اليوم',
      'yesterday': 'أمس',
      'this-week': 'هذا الأسبوع',
      'this-month': 'هذا الشهر',
      'all-dates': 'جميع التواريخ',
      'invalid-image': 'يرجى اختيار ملف صورة صالح',
      'hospital-manager': 'مدير المستشفى',
      'select-person': 'اختر شخص',
      'all-fields-required': 'جميع الحقول مطلوبة',
      'confirm-transfer': 'تم تأكيد التحويل'
    };
    return translations[key] || key;
  };
}

let filteredItems = [];

const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
let permissionsKeys = [];
let selectedContentId = null;
let canvas, ctx;
const currentLang = localStorage.getItem('language') || 'ar';
let currentPage = 1;
const itemsPerPage = 5;
let currentSignature = null; // لتخزين التوقيع الحالي (رسم أو صورة)

let allItems = [];
// بعد تعريف itemsPerPage …
const statusList = ['pending', 'approved', 'rejected'];
let currentGroupIndex = 0;
let isBulkDelegation = false; // متغير عالمي لتحديد وضع التفويض الجماعي

// متغيرات جديدة لحماية من النقر المتكرر
let isProcessingApproval = false;
let isProcessingSignature = false;
let isProcessingDelegation = false;
let processingTimeout = null;

// Toast notification function
function showToast(message, type = 'info', duration = 3000) {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Force reflow to ensure animation plays from start
    toast.offsetWidth;

    // Set a timeout to remove the toast
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        // Remove element after animation completes
        setTimeout(() => {
            toast.remove();
        }, 500); // Should match CSS animation duration
    }, duration);
}

// دالة جديدة لحماية الأزرار من النقر المتكرر
function setButtonProcessingState(button, isProcessing, processingText = 'جاري المعالجة...', originalText = null) {
  if (!button) return;
  
  if (isProcessing) {
    // حفظ النص الأصلي إذا لم يتم حفظه من قبل
    if (!originalText) {
      button.dataset.originalText = button.innerHTML;
    }
    
    // تعطيل الزر وإظهار حالة المعالجة
    button.disabled = true;
    button.style.opacity = '0.6';
    button.style.cursor = 'not-allowed';
    button.style.pointerEvents = 'none';
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${processingText}`;
    
    // إضافة مؤشر بصري
    button.classList.add('processing');
    
    // إضافة CSS إضافي لتحسين المظهر
    button.style.transition = 'all 0.3s ease';
    button.style.transform = 'scale(0.98)';
    button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
  } else {
    // إعادة تفعيل الزر وإعادة النص الأصلي
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';
    button.innerHTML = button.dataset.originalText || originalText || button.innerHTML;
    
    // إزالة المؤشر البصري
    button.classList.remove('processing');
    
    // إعادة تعيين CSS
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '';
  }
}

// دالة لحماية من النقر المتكرر مع timeout
function protectFromDoubleClick(button, processingText = 'جاري المعالجة...') {
  if (!button || button.disabled) return false;
  
  // تعطيل الزر فوراً
  setButtonProcessingState(button, true, processingText);
  
  // إعادة تفعيل الزر بعد 5 ثواني كحد أقصى
  if (processingTimeout) {
    clearTimeout(processingTimeout);
  }
  
  processingTimeout = setTimeout(() => {
    if (button) {
      setButtonProcessingState(button, false);
    }
  }, 5000);
  
  return true;
}

// دالة لتعطيل جميع أزرار البطاقة
function disableCardActions(contentId) {
  const card = document.querySelector(`.approval-card[data-id="${contentId}"]`);
  if (!card) return;
  
  const actionButtons = card.querySelectorAll('button');
  actionButtons.forEach(button => {
    button.disabled = true;
    button.style.opacity = '0.5';
    button.style.cursor = 'not-allowed';
    button.style.pointerEvents = 'none';
    
    // إضافة مؤشر بصري
    button.classList.add('processing');
    
    // حفظ النص الأصلي
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.innerHTML;
    }
    
    // إضافة نص المعالجة
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...`;
    
    // إضافة CSS إضافي لتحسين المظهر
    button.style.transition = 'all 0.3s ease';
    button.style.transform = 'scale(0.95)';
    button.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    button.style.filter = 'grayscale(30%)';
  });
}

// دالة لإعادة تفعيل جميع أزرار البطاقة
function enableCardActions(contentId) {
  const card = document.querySelector(`.approval-card[data-id="${contentId}"]`);
  if (!card) return;
  
  const actionButtons = card.querySelectorAll('button');
  actionButtons.forEach(button => {
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';
    
    // إزالة المؤشر البصري
    button.classList.remove('processing');
    
    // إعادة النص الأصلي
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
    
    // إعادة تعيين CSS
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '';
    button.style.filter = '';
  });
}

// جلب صلاحيات المستخدم
async function fetchPermissions() {
  if (!token) return;
  const payload = await safeGetUserInfo(token);
  const userId = payload.id, role = payload.role;
  if (role === 'admin') {
    permissionsKeys = ['*'];
    addBulkDelegateButton(); // إضافة هذا السطر ليظهر الزر للمدير
    return;
  }
  try {
    const res = await fetch(`${apiBase}/users/${userId}/permissions`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const { data: perms } = await res.json();
    permissionsKeys = perms.map(p => typeof p === 'string' ? p : (p.permission || p.permission_key));
  } catch (e) {
    console.error('Failed to fetch permissions', e);
  }
  // بعد جلب الصلاحيات، أضف زر التفويض الجماعي إذا كان يحق للمستخدم
  addBulkDelegateButton();
}

function addBulkDelegateButton() {
  // تحقق من الصلاحية
  const canBulkDelegate = permissionsKeys.includes('*') || permissionsKeys.includes('grant_permissions') || permissionsKeys.includes('delegate_all');
  let btnAll = document.getElementById('delegateAllBtn');
  if (btnAll) btnAll.remove();
  if (canBulkDelegate) {
    btnAll = document.createElement('button');
    btnAll.id = 'delegateAllBtn';
    btnAll.className = 'btn-delegate-all';
    btnAll.type = 'button';
    btnAll.innerHTML = `<i class="fas fa-user-friends"></i> ${getTranslation('delegate-all') || 'تفويض جميع الملفات بالنيابة'}`;
    btnAll.style = 'background: #2563eb; color: #fff; padding: 8px 18px; border-radius: 6px; border: none; font-size: 1rem; margin-right: 8px; cursor: pointer; vertical-align: middle;';
    const deptFilter = document.getElementById('deptFilter');
    if (deptFilter && deptFilter.parentNode) {
      deptFilter.parentNode.insertBefore(btnAll, deptFilter.nextSibling);
    }
    btnAll.onclick = async function() {
      isBulkDelegation = true;
      selectedContentId = null;
      // فتح مودال اختيار المستخدم أولاً
      openModal('delegateModal');
      loadDepartments();
      document.getElementById('delegateNotes').placeholder = getTranslation('notes-bulk') || 'ملاحظات (تنطبق على جميع الملفات)';
    };
  }
}

async function fetchJSON(url, opts = {}) {
  opts.headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  const res = await fetch(url, opts);
  let data = null;
  try {
    data = await res.json();
  } catch {
    // إذا لم يكن هناك body (مثلاً status 204)
    data = null;
  }
  if (!res.ok) {
    // إذا الرد فيه رسالة واضحة، استخدمها
    throw new Error((data && (data.message || data.error)) || await res.text() || 'Request failed');
  }
  return data;
}

function getLocalizedName(name) {
  const lang = localStorage.getItem('language') || 'ar';
  try {
    const parsed = typeof name === 'string' ? JSON.parse(name) : name;
    return parsed?.[lang] || parsed?.ar || parsed?.en || name;
  } catch {
    return name;
  }
}
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = 'none';
  
  // إعادة تفعيل أزرار البطاقة إذا كان المودال هو مودال الرفض أو التوقيع الإلكتروني أو التفويض
  if ((modalId === 'rejectModal' || modalId === 'qrModal' || modalId === 'delegateModal') && selectedContentId) {
    const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
    if (card && card.dataset.status === 'pending') {
      enableCardActions(selectedContentId);
    }
  }
}

function setupCloseButtons() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal 
        || btn.closest('.modal-overlay')?.id;
      if (modalId) closeModal(modalId);
    });
  });
}
console.log('pending-approvals.js loaded');
document.addEventListener('DOMContentLoaded', async () => {
  if (!token) return showToast(getTranslation('please-login'), 'error');
  // تعيين اسم المستخدم الحالي من JWT token
  const payload = await safeGetUserInfo(token);
  window.currentUsername = payload.username;
  await fetchPermissions();

  try {
    const deptResp      = await fetchJSON(`${apiBase}/approvals/assigned-to-me`);
    const combined      = deptResp.data || [];
    allItems = combined;
    filteredItems = allItems;

    // حساب عدد الملفات غير المعتمدة (pending)
    const pendingCount = allItems.filter(item => item.approval_status === 'pending').length;
    document.querySelector('.pending-count').textContent = pendingCount;

    await setupFilters(allItems);
    renderApprovals(filteredItems);
  } catch (err) {
    console.error("Error loading approvals:", err);
    showToast(getTranslation('error-loading'), 'error');
  }
  setupSignatureModal();
  setupCloseButtons();
  setupDateFilter();

  // ربط زر إرسال سبب الرفض
  const btnSendReason = document.getElementById('btnSendReason');
  if (btnSendReason) {
    btnSendReason.addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) return showToast(getTranslation('please-enter-reason'), 'warning');
      
      // حماية من النقر المتكرر
      if (!protectFromDoubleClick(btnSendReason, 'جاري إرسال الرفض...')) {
        return;
      }
      
      try {
        await fetchJSON(`${apiBase}/contents/rejections/${selectedContentId}`, {
          method: 'POST',
          body: JSON.stringify({ reason })
        });
        showToast(getTranslation('success-rejected'), 'success');
        closeModal('rejectModal');
        updateApprovalStatusInUI(selectedContentId, 'rejected');
        disableActionsFor(selectedContentId);
      } catch (e) {
        console.error('Failed to send rejection:', e);
        showToast(getTranslation('error-sending'), 'error');
        // إعادة تفعيل الزر في حالة الخطأ
        setButtonProcessingState(btnSendReason, false);
        // إعادة تفعيل أزرار البطاقة في حالة الخطأ
        enableCardActions(selectedContentId);
      }
    });
  }

  // إضافة معالجة للإلغاء في مودال الرفض
  const btnCancelReject = document.getElementById('btnCancelReject');
  if (btnCancelReject) {
    btnCancelReject.addEventListener('click', () => {
      // إعادة تفعيل أزرار البطاقة عند الإلغاء
      if (selectedContentId) {
        enableCardActions(selectedContentId);
      }
      
      // إعادة تفعيل زر الإرسال إذا كان معطلاً
      const btnSendReason = document.getElementById('btnSendReason');
      if (btnSendReason && btnSendReason.disabled) {
        setButtonProcessingState(btnSendReason, false);
      }
      
      closeModal('rejectModal');
    });
  }

  // **رابط أزرار الباجينشن خارج أي شرط**


// وفي رقم الصفحة:


});

async function setupFilters(items) {
  const deptFilter = document.getElementById('deptFilter');
  // جلب الأقسام من قاعدة البيانات
  let departments = [];
  try {
    const res = await fetch(`${apiBase}/departments/all`, { headers: { Authorization: `Bearer ${token}` } });
    const result = await res.json();
    const data = result.data || result;
    departments = Array.isArray(data) ? data : [];
  } catch (err) {
    // fallback: use only items' source_name
    departments = [];
  }
  const lang = localStorage.getItem('language') || 'ar';
  deptFilter.innerHTML = `<option value="all" data-translate="all-departments">${getTranslation('all-departments')}</option>`;
  // استخدم الأقسام من قاعدة البيانات إذا وجدت، وإلا من العناصر
  if (departments.length > 0) {
    departments.forEach(dept => {
      let parsed;
      try { parsed = JSON.parse(dept.name); } catch { parsed = { ar: dept.name, en: dept.name }; }
      const label = parsed[lang] ?? parsed.ar ?? parsed.en;
      const opt = document.createElement('option');
      opt.value = dept.id;
      opt.textContent = label;
      deptFilter.appendChild(opt);
    });
  } else {
    // fallback: استخدم source_name من العناصر
    const deptSet = new Set(items.map(i => i.source_name).filter(Boolean));
    deptSet.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = getLocalizedName(name);
      deptFilter.appendChild(opt);
    });
  }
  deptFilter.addEventListener('change', applyFilters);
  document.getElementById('statusFilter')?.addEventListener('change', applyFilters);
  document.getElementById('searchInput')?.addEventListener('input', applyFilters);
}

// تحديث الفلتر عند تغيير اللغة
window.addEventListener('storage', function(e) {
  if (e.key === 'language') {
    setupFilters(allItems);
  }
});

function applyFilters() {
  currentPage = 1;  // ترجع للصفحة الأولى عند كل فلتر
  const dept       = document.getElementById('deptFilter').value;
  const status     = document.getElementById('statusFilter').value;
  const searchText = document.getElementById('searchInput').value.trim().toLowerCase();

  // خزّن النتيجة في filteredItems
filteredItems = allItems.filter(i => {
  const localizedTitle = getLocalizedName(i.title).toLowerCase();
  const localizedSource = getLocalizedName(i.source_name).toLowerCase();
  const okDept   = dept === 'all' || i.source_name === dept;
  const okStatus = status === 'all' || i.approval_status === status;
  const okSearch = localizedTitle.includes(searchText) || localizedSource.includes(searchText);
  return okDept && okStatus && okSearch;
});


  renderApprovals(filteredItems);
}
function openModal(modalId) {
  document.getElementById(modalId).style.display = 'flex';
}

function closeModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}

function setupCloseButtons() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', e => {
      const modalId = btn.dataset.modal || btn.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });
}

function renderApprovals(items) {
  const list = document.querySelector('.approvals-list');
  list.innerHTML = '';

  // 1) إجمالي العناصر والفهارس
  const totalItems = items.length;
  const startIdx   = (currentPage - 1) * itemsPerPage;
  const endIdx     = Math.min(startIdx + itemsPerPage, totalItems);

  // 2) فرز وحساب القطع
  const sorted    = items.slice().sort((a, b) => {
    const order = { pending: 0, rejected: 1, approved: 2 };
    return order[a.approval_status] - order[b.approval_status];
  });
  const pageItems = sorted.slice(startIdx, endIdx);

  // صلاحيات الأزرار
  const isAdmin = permissionsKeys.includes('*');
  const canSign = isAdmin || permissionsKeys.includes('sign');
  const canSignOnBehalf = isAdmin || permissionsKeys.includes('sign_on_behalf');
  const canSignElectronic = isAdmin || permissionsKeys.includes('sign_electronic');
  const canTransfer = isAdmin || permissionsKeys.includes('transfer_credits');

  // 3) إنشاء البطاقات
  pageItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'approval-card';
    card.dataset.id     = item.id;
    card.dataset.status = item.approval_status;
    card.dataset.source = item.source_name;
    card.dataset.type   = item.type;

    let actions = '';
    if (item.approval_status === 'pending' || item.approval_status === 'rejected') {
      actions += `<button class="btn-sign">${getTranslation('sign')}</button>`;
      if (canSignOnBehalf) {
        actions += `<button class="btn-delegate">${getTranslation('delegate')}</button>`;
      }
      if (canSignElectronic) {
        actions += `<button class="btn-qr">${getTranslation('electronic')}</button>`;
      }
      // إخفاء زر الرفض إذا كان الملف مرفوض والمرسل الحالي هو من رفضه
      const currentUsername = window.currentUsername || '';
      const isRejectedByCurrentUser = item.approval_status === 'rejected' && 
                                     item.rejected_by_username && 
                                     item.rejected_by_username.toLowerCase() === currentUsername.toLowerCase();
      if (!isRejectedByCurrentUser) {
        actions += `<button class="btn-reject">${getTranslation('reject')}</button>`;
      }
      actions += `<button class="btn-preview">${getTranslation('preview')}</button>`;
      actions += `<button class="btn-track">${getTranslation('track-file')}</button>`;
      if (canTransfer) {
        actions += `<button class="btn-transfer-file">${getTranslation('transfer-file')}</button>`;
      }
    } else if (item.approval_status === 'approved') {
      // للملفات المعتمدة، نعرض فقط زر المعاينة والتتبع
      actions += `<button class="btn-preview">${getTranslation('preview')}</button>`;
      actions += `<button class="btn-track">${getTranslation('track-file')}</button>`;
    }

    const contentType = item.type === 'committee'
      ? getTranslation('committee-file')
      : getTranslation('department-report');

    card.innerHTML = `
      <div class="card-header">
        <span class="file-title">${getLocalizedName(item.title)}</span>
      </div>
      <div class="card-body">
        <div class="user-info">
          <div class="user-details">
            <span class="user-name">${getLocalizedName(item.created_by_name || '')}</span>
            <span class="user-meta"><i class="fa fa-building"></i> ${getLocalizedName(item.source_name)}</span>
            <span class="user-meta"><i class="fa-regular fa-calendar"></i> ${item.created_at ? new Date(item.created_at).toLocaleDateString(currentLang === 'ar' ? 'ar-EG' : 'en-US') : ''}</span>
          </div>
        </div>
        <div class="actions">${actions}</div>
        <div class="status ${item.approval_status}">${statusLabel(item.approval_status)}</div>
        <div class="status-info ${item.approval_status}">${item.status_info || ''}</div>
      </div>
    `;
    list.appendChild(card);
  });

  // 4) حدّث الباجينج
  renderPagination(totalItems);

  // 6) أربط الأزرار
  initActions();
}

function updateApprovalStatusInUI(id, newStatus) {
  const item = allItems.find(i => i.id == id);
  if (!item) return;
  item.approval_status = newStatus;
  applyFilters();
  // تحديث البطاقة مباشرة
  const card = document.querySelector(`.approval-card[data-id="${id}"]`);
  if (card) {
    card.classList.remove('pending', 'approved', 'rejected');
    card.classList.add(newStatus);
    const statusDiv = card.querySelector('.status');
    if (statusDiv) {
      statusDiv.textContent = statusLabel(newStatus);
      statusDiv.className = 'status ' + newStatus;
    }
    disableActionsFor(id);
  }
}

// تم حذف الباجينشن بالكامل بناءً على طلب المستخدم
function renderPagination(totalItems) {
  // لا شيء
}

function statusLabel(status) {
  switch (status) {
    case 'approved':  return getTranslation('approved');
    case 'rejected':  return getTranslation('rejected');
    default:          return getTranslation('pending');
  }
}

// إضافة فلتر التاريخ
function setupDateFilter() {
  const dateFilterBtn = document.querySelector('.filter-btn');
  if (!dateFilterBtn) return;
  
  dateFilterBtn.addEventListener('click', function() {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    
    const dateOptions = [
      { label: getTranslation('today'), value: 'today', date: today },
      { label: getTranslation('yesterday'), value: 'yesterday', date: yesterday },
      { label: getTranslation('this-week'), value: 'lastWeek', date: lastWeek },
      { label: getTranslation('this-month'), value: 'lastMonth', date: lastMonth },
      { label: getTranslation('all-dates'), value: 'all', date: null }
    ];
    
    // إنشاء قائمة منسدلة للتاريخ
    const dropdown = document.createElement('div');
    dropdown.className = 'date-dropdown';
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      z-index: 1000;
      min-width: 150px;
    `;
    
    dateOptions.forEach(option => {
      const item = document.createElement('div');
      item.className = 'date-option';
      item.style.cssText = `
        padding: 10px 15px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.2s;
      `;
      item.textContent = option.label;
      
      item.addEventListener('click', () => {
        applyDateFilter(option.value, option.date);
        document.body.removeChild(dropdown);
      });
      
      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#f8f9fa';
      });
      
      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'white';
      });
      
      dropdown.appendChild(item);
    });
    
    // إزالة القائمة السابقة إذا وجدت
    const existingDropdown = document.querySelector('.date-dropdown');
    if (existingDropdown) {
      document.body.removeChild(existingDropdown);
    }
    
    // إضافة القائمة الجديدة
    document.body.appendChild(dropdown);
    
    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', function closeDropdown(e) {
      if (!dateFilterBtn.contains(e.target) && !dropdown.contains(e.target)) {
        if (document.body.contains(dropdown)) {
          document.body.removeChild(dropdown);
        }
        document.removeEventListener('click', closeDropdown);
      }
    });
  });
}

function applyDateFilter(filterType, filterDate) {
  if (filterType === 'all') {
    filteredItems = allItems;
  } else {
    filteredItems = allItems.filter(item => {
      if (!item.created_at) return false;
      
      const itemDate = new Date(item.created_at);
      const today = new Date();
      
      switch (filterType) {
        case 'today':
          return itemDate.toDateString() === today.toDateString();
        case 'yesterday':
          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          return itemDate.toDateString() === yesterday.toDateString();
        case 'lastWeek':
          const lastWeek = new Date(today);
          lastWeek.setDate(lastWeek.getDate() - 7);
          return itemDate >= lastWeek;
        case 'lastMonth':
          const lastMonth = new Date(today);
          lastMonth.setMonth(lastMonth.getMonth() - 1);
          return itemDate >= lastMonth;
        default:
          return true;
      }
    });
  }
  
  renderApprovals(filteredItems);
}

// (بقية دوال initActions و signature modal و delegate تبقى كما كانت)


function initActions() {
  console.log('[initActions] called');
  document.querySelectorAll('.approval-card .btn-sign').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.approval-card').dataset.id;
      // تعطيل جميع أزرار البطاقة فوراً
      disableCardActions(id);
      openSignatureModal(id);
    });
  });

  document.querySelectorAll('.approval-card .btn-delegate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.approval-card').dataset.id;
      // تعطيل جميع أزرار البطاقة فوراً
      disableCardActions(id);
      selectedContentId = id;
      // فتح مودال اختيار المستخدم أولاً
      openModal('delegateModal');
      loadDepartments();
    });
  });
  
  document.querySelectorAll('.approval-card .btn-qr').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.approval-card').dataset.id;
      // تعطيل جميع أزرار البطاقة فوراً
      disableCardActions(id);
      selectedContentId = id;
      openModal('qrModal');
    });
  });

  document.querySelectorAll('.approval-card .btn-reject').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.approval-card').dataset.id;
      // تعطيل جميع أزرار البطاقة فوراً
      disableCardActions(id);
      selectedContentId = id;
      openModal('rejectModal');
    });
  });

  document.querySelectorAll('.approval-card .btn-preview').forEach(btn => {
    btn.addEventListener('click', async e => {
      const card     = e.target.closest('.approval-card');
      const itemId = card.dataset.id;
      const item   = allItems.find(i => i.id == itemId);

      if (!item || !item.file_path) {
        showToast(getTranslation('no-content'), 'warning');
        return;
      }

      // تسجيل عرض المحتوى
      try {
        let numericItemId = itemId;
        if (typeof itemId === 'string') {
          if (itemId.includes('-')) {
            const match = itemId.match(/\d+$/);
            numericItemId = match ? match[0] : itemId;
          } else {
            numericItemId = parseInt(itemId) || itemId;
          }
        } else {
          numericItemId = parseInt(itemId) || itemId;
        }
        if (!numericItemId || numericItemId <= 0) {
          console.warn('Invalid content ID:', itemId);
          return;
        }
        await fetchJSON(`${apiBase}/contents/log-view`, {
          method: 'POST',
          body: JSON.stringify({
            contentId: numericItemId,
            contentType: item.type || 'department',
            contentTitle: item.title,
            sourceName: item.source_name,
            folderName: item.folder_name || item.folderName || ''
          })
        });
      } catch (err) {
        console.error('Failed to log content view:', err);
        // لا نوقف العملية إذا فشل تسجيل اللوق
      }

const baseApiUrl = apiBase.replace('/api', '');

let filePath = item.file_path;
let fileBaseUrl;

// حالة ملفات اللجان (مسار يبدأ بـ backend/uploads/)
if (filePath.startsWith('backend/uploads/')) {
  fileBaseUrl = `${baseApiUrl}/backend/uploads`;
  // شيل البادئة بالكامل
  filePath = filePath.replace(/^backend\/uploads\//, '');
}
// حالة ملفات الأقسام (مسار يبدأ بـ uploads/)
else if (filePath.startsWith('uploads/')) {
  fileBaseUrl = `${baseApiUrl}/uploads`;
  // شيل البادئة
  filePath = filePath.replace(/^uploads\//, '');
}
// أي حالة ثانية نفترض نفس مجلد uploads
else {
  fileBaseUrl = `${baseApiUrl}/uploads`;
}

      const url = `${fileBaseUrl}/${filePath}`;
      window.open(url, '_blank');
    });
  });

  // معالج حدث زر تتبع الملف
  document.querySelectorAll('.approval-card .btn-track').forEach(btn => {
    btn.addEventListener('click', async e => {
      const card = e.target.closest('.approval-card');
      const itemId = card.dataset.id;
      const item = allItems.find(i => i.id == itemId);

      if (!item) {
        showToast(getTranslation('error-loading'), 'error');
        return;
      }

      // فتح صفحة تتبع الملف في نفس الصفحة
      const trackUrl = `track-request.html?id=${itemId}&type=${item.type || 'department'}&title=${encodeURIComponent(item.title)}&source=${encodeURIComponent(item.source_name)}`;
      window.location.href = trackUrl;
    });
  });

  // Attach event for transfer file button
  document.querySelectorAll('.approval-card .btn-transfer-file').forEach(btn => {
    console.log('[initActions] ربط زر التحويل', btn);
    btn.addEventListener('click', function(e) {
      const card = e.target.closest('.approval-card');
      if (card) {
        selectedContentId = card.dataset.id;
        console.log('[btn-transfer-file] clicked, selectedContentId:', selectedContentId);
        openFileTransferModal();
      }
    });
  });
}

document.getElementById('btnElectronicApprove')?.addEventListener('click', async () => {
  if (!selectedContentId) return alert(getTranslation('please-select-user'));

  // حماية من النقر المتكرر
  const btnElectronicApprove = document.getElementById('btnElectronicApprove');
  if (!protectFromDoubleClick(btnElectronicApprove, 'جاري التوقيع...')) {
    return;
  }

  const contentType = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`).dataset.type;
  const endpoint = contentType === 'committee' ? 'committee-approvals' : 'approvals';

  try {
    await fetchJSON(`${apiBase}/${endpoint}/${selectedContentId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        approved: true,
        signature: null,
        electronic_signature: true,
        notes: ''
      })
    });
    showToast(getTranslation('success-approved'), 'success');
    closeModal('qrModal');
    updateApprovalStatusInUI(selectedContentId, 'approved');
    disableActionsFor(selectedContentId);
  } catch (err) {
    console.error('Failed to electronically approve:', err);
    showToast(getTranslation('error-sending'), 'error');
    // إعادة تفعيل الزر في حالة الخطأ
    setButtonProcessingState(btnElectronicApprove, false);
    // إعادة تفعيل أزرار البطاقة في حالة الخطأ
    enableCardActions(selectedContentId);
  }
});

// إضافة معالجة للإلغاء في مودال التوقيع الإلكتروني
const btnCancelQr = document.getElementById('btnCancelQr');
if (btnCancelQr) {
  btnCancelQr.addEventListener('click', () => {
    // إعادة تفعيل أزرار البطاقة عند الإلغاء
    if (selectedContentId) {
      enableCardActions(selectedContentId);
    }
    
    // إعادة تفعيل زر التوقيع إذا كان معطلاً
    const btnElectronicApprove = document.getElementById('btnElectronicApprove');
    if (btnElectronicApprove && btnElectronicApprove.disabled) {
      setButtonProcessingState(btnElectronicApprove, false);
    }
    
    closeModal('qrModal');
  });
}

function openSignatureModal(contentId) {
  selectedContentId = contentId;
  const modal = document.getElementById('signatureModal');
  modal.style.display = 'flex';
  
  // إعادة تعيين التوقيع الحالي
  currentSignature = null;
  
  // إعادة تعيين التبويبات
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));
  
  // تفعيل تبويب التوقيع المباشر افتراضياً
  document.querySelector('[data-tab="draw"]').classList.add('active');
  document.getElementById('draw-tab').classList.add('active');
  
  // إعادة تعيين منطقة رفع الصور
  const uploadArea = document.getElementById('uploadArea');
  const uploadPreview = document.getElementById('uploadPreview');
  if (uploadArea && uploadPreview) {
    uploadArea.style.display = 'block';
    uploadPreview.style.display = 'none';
  }
  
  setTimeout(() => {
    resizeCanvas();
    clearCanvas();
  }, 50);
}

function closeSignatureModal() {
  document.getElementById('signatureModal').style.display = 'none';
  clearCanvas();
  
  // إعادة تفعيل أزرار البطاقة إذا لم يتم الاعتماد
  if (selectedContentId) {
    const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
    if (card && card.dataset.status === 'pending') {
      enableCardActions(selectedContentId);
    }
  }
}

function clearCanvas() {
  if (ctx && canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function resizeCanvas() {
  const wrapper = canvas.parentElement;
  const rect = wrapper.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#000';
}

// 3. تعديل زر التوقيع اليدوي (التوقيع بالرسم)
function setupSignatureModal() {
  canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  let drawing = false;
  
  window.addEventListener('resize', resizeCanvas);
  
  // إعداد التبويبات
  setupSignatureTabs();
  
  // إعداد رفع الصور
  setupImageUpload();
  
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }
  
  canvas.addEventListener('mousedown', e => {
    drawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });
  canvas.addEventListener('mousemove', e => {
    if (!drawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });
  canvas.addEventListener('mouseup', () => {
    drawing = false;
    // تحديث التوقيع الحالي عند الانتهاء من الرسم
    currentSignature = canvas.toDataURL('image/png');
  });
  canvas.addEventListener('mouseleave', () => drawing = false);
  canvas.addEventListener('touchstart', e => {
    drawing = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  });
  canvas.addEventListener('touchmove', e => {
    if (!drawing) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  });
  canvas.addEventListener('touchend', () => {
    drawing = false;
    // تحديث التوقيع الحالي عند الانتهاء من الرسم
    currentSignature = canvas.toDataURL('image/png');
  });
  
  document.getElementById('btnClear').addEventListener('click', () => {
    clearCanvas();
    currentSignature = null;
  });
  
  document.getElementById('btnCancelSignature').addEventListener('click', () => {
    closeSignatureModal();
  });
  
  function handleCancelClick() {
    // إعادة تفعيل أزرار البطاقة عند الإلغاء
    if (selectedContentId) {
      enableCardActions(selectedContentId);
    }
    
    closeSignatureModal();
  }
  
  document.getElementById('btnConfirmSignature').addEventListener('click', async () => {
    // التحقق من وجود توقيع
    if (!currentSignature) {
      showToast(getTranslation('no-signature') || 'يرجى إضافة توقيع أولاً', 'error');
      return;
    }
    
    const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
    if (!card) {
      showToast(getTranslation('error-loading') || 'خطأ في تحميل البيانات', 'error');
      return;
    }
    
    // حماية من النقر المتكرر
    const confirmButton = document.getElementById('btnConfirmSignature');
    if (!protectFromDoubleClick(confirmButton, 'جاري إرسال التوقيع...')) {
      return;
    }
    
    // استخراج معلومات المستخدم من JWT token
    const tokenPayload = await safeGetUserInfo(token);
    
    const contentType = card.dataset.type;
    const endpoint = contentType === 'committee' ? 'committee-approvals' : 'approvals';
    
    const payload = {
      approved: true,
      signature: currentSignature,
      notes: ''
    };
    
    // جلب معلومات التفويض من جدول active_delegations
    try {
      console.log('[SIGN] Fetching delegation status for user:', tokenPayload.id);
      const delegationResponse = await fetch(`${apiBase}/approvals/delegation-status/${tokenPayload.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('[SIGN] Delegation response status:', delegationResponse.status);
      
      if (delegationResponse.ok) {
        const delegationData = await delegationResponse.json();
        console.log('[SIGN] Delegation data:', delegationData);
        
        if (delegationData.status === 'success' && delegationData.data && delegationData.data.delegated_by) {
          payload.on_behalf_of = delegationData.data.delegated_by;
          console.log('[SIGN] Found delegation, sending on_behalf_of:', delegationData.data.delegated_by);
        } else {
          console.log('[SIGN] No delegation found or invalid data structure');
        }
      } else {
        console.log('[SIGN] Delegation response not ok:', delegationResponse.status);
        const errorText = await delegationResponse.text();
        console.log('[SIGN] Error response:', errorText);
      }
    } catch (err) {
      console.error('[SIGN] Error fetching delegation status:', err);
    }
    
    console.log('[SIGN] Final payload being sent:', payload);
    try {
      const response = await fetchJSON(`${apiBase}/${endpoint}/${selectedContentId}/approve`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      console.log('[SIGN] response:', response);
      showToast(getTranslation('success-sent'), 'success');
      closeSignatureModal();
      updateApprovalStatusInUI(selectedContentId, 'approved');
      disableActionsFor(selectedContentId);
    } catch (err) {
      console.error('Failed to send signature:', err);
      showToast(getTranslation('error-sending'), 'error');
      // إعادة تفعيل الزر في حالة الخطأ
      setButtonProcessingState(confirmButton, false);
      // إعادة تفعيل أزرار البطاقة في حالة الخطأ
      enableCardActions(selectedContentId);
    }
  });
}

// إعداد رفع الصور
function setupImageUpload() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('signatureFile');
  const uploadPreview = document.getElementById('uploadPreview');
  const previewImage = document.getElementById('previewImage');
  const btnRemoveImage = document.getElementById('btnRemoveImage');
  
  // النقر على منطقة الرفع
  uploadArea.addEventListener('click', () => {
    fileInput.click();
  });
  
  // سحب وإفلات الملفات
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  });
  
  // اختيار الملف من input
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  });
  
  // إزالة الصورة
  btnRemoveImage.addEventListener('click', () => {
    uploadPreview.style.display = 'none';
    uploadArea.style.display = 'block';
    fileInput.value = '';
    currentSignature = null;
  });
  
  function handleFileSelect(file) {
    if (!file.type.startsWith('image/')) {
      showToast(getTranslation('invalid-image') || 'يرجى اختيار ملف صورة صالح', 'error');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // تحويل الصورة إلى base64
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // تحديد أبعاد الصورة
        const maxWidth = 400;
        const maxHeight = 200;
        let { width, height } = img;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // رسم الصورة على الكانفاس
        ctx.drawImage(img, 0, 0, width, height);
        
        // تحويل إلى base64
        currentSignature = canvas.toDataURL('image/png');
        
        // عرض المعاينة
        previewImage.src = currentSignature;
        uploadArea.style.display = 'none';
        uploadPreview.style.display = 'block';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}
async function loadDepartments() {
  const deptSelect = document.getElementById('delegateDept');
  if (!deptSelect) return;

  try {
    const res = await fetchJSON(`${apiBase}/departments/all`);
    const departments = Array.isArray(res) ? res : (res.data || []);
    const lang = localStorage.getItem('language') || 'ar';

    deptSelect.innerHTML = `<option value="" disabled selected>${getTranslation('select-department')}</option>`;

    departments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;

      let deptName;
      try {
        const parsed = JSON.parse(d.name);
        deptName = parsed[lang] || parsed.ar || d.name;
      } catch {
        deptName = d.name;
      }

      opt.textContent = deptName;
      deptSelect.appendChild(opt);
    });

  } catch (err) {
    console.error('Failed to load departments:', err);
    showToast(getTranslation('error-loading'), 'error');
  }
}
function setupSignatureTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // إزالة الفئة النشطة من جميع التبويبات
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      // إضافة الفئة النشطة للتبويب المحدد
      btn.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
      
      // إعادة تعيين التوقيع الحالي
      currentSignature = null;
    });
  });
}

document.getElementById('delegateDept').addEventListener('change', async (e) => {
  const deptId = e.target.value;
  try {
    const res = await fetch(`${apiBase}/users?departmentId=${deptId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const json = await res.json();
    const users = json.data || [];
    const userSelect = document.getElementById('delegateUser');
    userSelect.innerHTML = `<option value="" disabled selected>${getTranslation('select-user')}</option>`;

    users.forEach(user => {
      const opt = document.createElement('option');
      opt.value = user.id;
      opt.textContent = user.name;
      userSelect.appendChild(opt);
    });

  } catch (err) {
    console.error('Failed to load users:', err);
    showToast(getTranslation('error-loading'), 'error');
  }
});

// عند التأكيد في مودال التفويض
const btnDelegateConfirm = document.getElementById('btnDelegateConfirm');
if (btnDelegateConfirm) {
  btnDelegateConfirm.addEventListener('click', async () => {
    const userId = document.getElementById('delegateUser').value;
    const notes = document.getElementById('delegateNotes').value;
    if (!userId) return showToast(getTranslation('please-select-user'), 'warning');
    
    // حماية من النقر المتكرر
    if (!protectFromDoubleClick(btnDelegateConfirm, 'جاري معالجة التفويض...')) {
      return;
    }
    
    // إغلاق مودال التفويض
    closeModal('delegateModal');
    
    if (isBulkDelegation) {
      // تفويض جماعي - عرض الإقرار والتوقيع أولاً
      await showBulkDelegationConfirmation(userId, notes);
    } else {
      // تفويض فردي - عرض الإقرار والتوقيع أولاً
      const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
      if (!card) {
        showToast(getTranslation('error-loading') || 'خطأ في تحميل البيانات', 'error');
        // إعادة تفعيل الزر في حالة الخطأ
        setButtonProcessingState(btnDelegateConfirm, false);
        // إعادة تفعيل أزرار البطاقة في حالة الخطأ
        enableCardActions(selectedContentId);
        return;
      }
      const contentType = card.dataset.type;
      await showSingleDelegationConfirmation(userId, selectedContentId, contentType, notes);
    }
    
    isBulkDelegation = false;
  });
}

// إضافة معالجة للإلغاء في مودال التفويض
const btnCancelDelegate = document.getElementById('btnCancelDelegate');
if (btnCancelDelegate) {
  btnCancelDelegate.addEventListener('click', () => {
    // إعادة تفعيل أزرار البطاقة عند الإلغاء
    if (selectedContentId) {
      enableCardActions(selectedContentId);
    }
    
    // إعادة تفعيل زر التأكيد إذا كان معطلاً
    const btnDelegateConfirm = document.getElementById('btnDelegateConfirm');
    if (btnDelegateConfirm && btnDelegateConfirm.disabled) {
      setButtonProcessingState(btnDelegateConfirm, false);
    }
    
    closeModal('delegateModal');
  });
}

function disableActionsFor(contentId) {
  const row = document.querySelector(`.approval-card[data-id="${contentId}"]`);
  if (!row) return;
  const actionsCell = row.querySelector('.actions');
  if (actionsCell) actionsCell.innerHTML = '';
}

// === File Transfer Modal Logic ===
let currentTransferSequence = [];
let currentTransferUsers = [];
let currentTransferDeptId = null;
let newDeptUsers = [];
let selectedNewUsers = [];

async function getApprovalSequenceByDept(deptId) {
  try {
    const res = await fetch(`${apiBase}/departments/${deptId}/approval-sequence`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('[getApprovalSequenceByDept]', deptId, data.approval_sequence);
    return data.approval_sequence || [];
  } catch (err) {
    console.error('[getApprovalSequenceByDept] error', err);
    return [];
  }
}

async function getUsersByIds(userIds) {
  if (!userIds.length) return [];
  try {
    const res = await fetch(`${apiBase}/users?ids=${userIds.join(',')}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('[getUsersByIds]', userIds, data.data);
    return data.data || [];
  } catch (err) {
    console.error('[getUsersByIds] error', err);
    return [];
  }
}

async function getUsersByDept(deptId) {
  try {
    const res = await fetch(`${apiBase}/users?departmentId=${deptId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('[getUsersByDept]', deptId, data.data);
    return data.data || [];
  } catch (err) {
    console.error('[getUsersByDept] error', err);
    return [];
  }
}

async function openFileTransferModal() {
  const modal = document.getElementById('fileTransferModal');
  modal.style.display = 'flex';
  // ضبط الاتجاه حسب اللغة
  const lang = localStorage.getItem('language') || 'ar';
  if (lang === 'en') {
    modal.setAttribute('dir', 'ltr');
    modal.classList.add('ltr-modal');
    modal.classList.remove('rtl-modal');
  } else {
    modal.setAttribute('dir', 'rtl');
    modal.classList.add('rtl-modal');
    modal.classList.remove('ltr-modal');
  }
  await loadTransferDepartments();
  // جلب الملف الحالي
  const item = allItems.find(i => i.id == selectedContentId);
  if (!item) return;
  // جلب سلسلة الاعتماد القديمة (approval_sequence)
  let sequence = [];
  if (item.approval_sequence && Array.isArray(item.approval_sequence)) {
    sequence = item.approval_sequence;
  } else if (item.approval_sequence && typeof item.approval_sequence === 'string') {
    try { sequence = JSON.parse(item.approval_sequence); } catch { sequence = []; }
  } else if (item.department_id) {
    sequence = await getApprovalSequenceByDept(item.department_id);
  }
  currentTransferSequence = sequence.slice();
  console.log('[openFileTransferModal] sequence', sequence);
  // جلب بيانات المستخدمين
  currentTransferUsers = await getUsersByIds(sequence);
  console.log('[openFileTransferModal] currentTransferUsers', currentTransferUsers);
  // اعرض السلسلة القديمة فقط
  renderTransferChain(currentTransferSequence, currentTransferUsers, []);
  // أفرغ الدروب داون
  document.getElementById('personsFields').innerHTML = '';
  document.getElementById('personCount').value = '';
  document.getElementById('transferDept').value = '';
  // اربط تغيير القسم أو العدد
  document.getElementById('transferDept').onchange = handleDeptOrCountChange;
  document.getElementById('personCount').onchange = handleDeptOrCountChange;
}

async function handleDeptOrCountChange() {
  const deptId = document.getElementById('transferDept').value;
  const count = parseInt(document.getElementById('personCount').value);
  document.getElementById('personsFields').innerHTML = '';
  console.log('[handleDeptOrCountChange] deptId:', deptId, 'count:', count);
  if (!deptId || !count) {
    renderTransferChain(currentTransferSequence, currentTransferUsers, []);
    return;
  }
  // جلب أعضاء القسم الجديد
  newDeptUsers = await getUsersByDept(deptId);
  selectedNewUsers = Array(count).fill('');
  console.log('[handleDeptOrCountChange] newDeptUsers:', newDeptUsers);
  for (let i = 0; i < count; i++) {
    const group = document.createElement('div');
    group.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = `${getTranslation('select-person')} ${i+1}`;
    const select = document.createElement('select');
    select.className = 'person-select-new';
    select.innerHTML = `<option value="">${getTranslation('select-person')}</option>`;
    newDeptUsers.forEach(user => {
      const opt = document.createElement('option');
      opt.value = user.id;
      opt.textContent = user.name;
      select.appendChild(opt);
    });
    select.onchange = function() {
      selectedNewUsers[i] = select.value;
      console.log('[person-select-new] selectedNewUsers:', selectedNewUsers);
      renderTransferChain(currentTransferSequence, currentTransferUsers, selectedNewUsers);
    };
    group.appendChild(label);
    group.appendChild(select);
    document.getElementById('personsFields').appendChild(group);
  }
  renderTransferChain(currentTransferSequence, currentTransferUsers, selectedNewUsers);
}

// أضف دالة جلب مدير المستشفى
async function fetchManager() {
  try {
    const res = await fetch(`${apiBase}/users/hospital-manager`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.status === 'success' && data.data) {
      return data.data;
    }
  } catch {}
  return null;
}

// تعريف واحد فقط لدالة renderTransferChain
async function renderTransferChain(sequence, users, newUserIdsArr) {
  console.log('renderTransferChain called, nodes:', sequence, newUserIdsArr);
  const chainDiv = document.getElementById('transferPersonsChain');
  chainDiv.innerHTML = '';
  let oldNodes = [];
  let newNodes = [];

  // 1. الأشخاص القدامى
  sequence.forEach((uid) => {
    const user = users.find(u => u.id == uid);
    oldNodes.push({
      id: user ? user.id : uid,
      name: user ? user.name : uid,
      departmentId: user ? (user.departmentId || user.department_id) : undefined,
      isNew: false
    });
  });

  // 2. الأشخاص الجدد
  if (Array.isArray(newUserIdsArr)) {
    newUserIdsArr.forEach((uid) => {
      if (!uid) return;
      const user = newDeptUsers.find(u => u.id == uid);
      newNodes.push({
        id: user ? user.id : uid,
        name: user ? user.name : uid,
        departmentId: user ? (user.departmentId || user.department_id) : undefined,
        isNew: true
      });
    });
  }

  // 3. فصل أشخاص الجودة عن غيرهم
  const isQuality = node => node.departmentId == 9;
  const oldNonQuality = oldNodes.filter(n => !isQuality(n));
  const oldQuality    = oldNodes.filter(isQuality);
  const newNonQuality = newNodes.filter(n => !isQuality(n));
  const newQuality    = newNodes.filter(isQuality);

  // 4. بناء السلسلة: القدامى غير الجودة -> الجدد غير الجودة -> كل الجودة (قدامى وجدد)
  const nodes = [
    ...oldNonQuality,
    ...newNonQuality,
    ...oldQuality,
    ...newQuality
  ];

  // جلب مدير المستشفى من الباك اند أولاً
  const manager = await fetchManager();

  // إذا وجد المدير، احذفه من أي مكان في nodes
  let nodesWithoutManager = nodes;
  if (manager) {
    nodesWithoutManager = nodes.filter(n => n.id != manager.id);
  }

  // تقسيم الأشخاص إلى صفوف كل صف فيه 3 أشخاص
  function chunkArray(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }
  const rows = chunkArray(nodesWithoutManager, 3);

  // دالة رسم صف
  function renderRow(rowNodes, container) {
    rowNodes.forEach((node, idx) => {
      if (idx > 0) {
        const arrow = document.createElement('div');
        arrow.className = 'arrow-line';
        arrow.innerHTML = '<div class="dashed"></div>';
        container.appendChild(arrow);
      }
      const personNode = document.createElement('div');
      personNode.className = 'person-node';
      personNode.innerHTML = `
        <div class="person-circle"><i class="fa fa-user"></i></div>
        <div class="person-name">${node.name}</div>
      `;
      container.appendChild(personNode);
    });
  }

  // رسم كل صف بدون إكمال آخر صف بـ Placeholder
  rows.forEach((rowNodes) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'persons-chain-row';
    renderRow(rowNodes, rowDiv);
    chainDiv.appendChild(rowDiv);
  });

  // أضف المدير في النهاية فقط (مع سهم)
  if (manager && nodesWithoutManager.length > 0) {
    const lastRowDiv = chainDiv.lastChild;
    const arrow = document.createElement('div');
    arrow.className = 'arrow-line';
    arrow.innerHTML = '<div class="dashed"></div>';
    lastRowDiv.appendChild(arrow);
    const managerNode = document.createElement('div');
    managerNode.className = 'person-node';
    managerNode.innerHTML = `
      <div class="person-circle no-bg"><i class="fa fa-user"></i></div>
      <div class="person-name">${manager.name}</div>
    `;
    lastRowDiv.appendChild(managerNode);
  } else if (!manager && nodesWithoutManager.length > 0) {
    // fallback: نص ثابت إذا لم يوجد مدير مستشفى
    const lastRowDiv = chainDiv.lastChild;
    const arrow = document.createElement('div');
    arrow.className = 'arrow-line';
    arrow.innerHTML = '<div class="dashed"></div>';
    lastRowDiv.appendChild(arrow);
    const managerNode = document.createElement('div');
    managerNode.className = 'person-node';
    managerNode.innerHTML = `
      <div class="person-circle no-bg"><i class="fa fa-user"></i></div>
      <div class="person-name">${getTranslation('hospital-manager')}</div>
    `;
    lastRowDiv.appendChild(managerNode);
  }

  // بعد رسم السلسلة، إذا تجاوز عدد الأشخاص 4 أضف كلاس multi-line-chain
  if (nodesWithoutManager.length > 4) {
    chainDiv.classList.add('multi-line-chain');
  } else {
    chainDiv.classList.remove('multi-line-chain');
  }
}

// استدعِ اختيار الجودة عند فتح البوب أب
const oldOpenFileTransferModal = openFileTransferModal;
openFileTransferModal = function() {
    oldOpenFileTransferModal();
    // اربط تحديث السلسلة
    setupPersonSelectHandlers = function() {
        document.querySelectorAll('.person-select').forEach(select => {
            select.addEventListener('change', updatePersonsChainPopup);
        });
    };
};

document.querySelectorAll('.modal-close[data-modal="fileTransferModal"]').forEach(btn => {
  btn.addEventListener('click', closeFileTransferModal);
});

document.getElementById('btnTransferConfirm').addEventListener('click', async function(e) {
  e.preventDefault();
  // التسلسل النهائي = القدامى + الجدد (بدون فراغات)
  const finalSequence = [
    ...currentTransferSequence,
    ...selectedNewUsers.filter(Boolean)
  ];
  if (!selectedContentId || !finalSequence.length) {
    showToast(getTranslation('all-fields-required'), 'warning');
    return;
  }
  try {
    // جلب مدير المستشفى من الباكند وإضافته للسلسلة
    let managerId = null;
    try {
      const res = await fetch(`${apiBase}/users/hospital-manager`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.status === 'success' && data.data && data.data.id) {
        managerId = data.data.id;
        finalSequence.push(managerId);
      }
    } catch (err) {
      // إذا فشل الجلب، تجاهل إضافة المدير
    }
    await fetch(`${apiBase}/contents/${selectedContentId}/approval-sequence`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ approval_sequence: finalSequence })
    });
    closeFileTransferModal();
    showToast(getTranslation('confirm-transfer'), 'success');
  } catch (err) {
    showToast(getTranslation('error-sending'), 'error');
  }
});

// Example: Add event listener to open modal from a button (replace selector as needed)
// This block is now moved inside initActions()

// استخدم دالة الترجمة من language.js فقط ولا تكررها هنا

// إعادة تعريف الدوال المفقودة حتى لا تظهر أخطاء undefined
async function loadTransferDepartments() {
  const deptSelect = document.getElementById('transferDept');
  if (!deptSelect) return;
  try {
    const res = await fetch(`${apiBase}/departments/all`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    const departments = Array.isArray(json) ? json : (json.data || []);
    const lang = localStorage.getItem('language') || 'ar';
    deptSelect.innerHTML = `<option value="" disabled selected>${getTranslation('select-department')}</option>`;
    departments.forEach(d => {
      let deptName;
      try {
        const parsed = JSON.parse(d.name);
        deptName = parsed[lang] || parsed.ar || d.name;
      } catch { deptName = d.name; }
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = deptName;
      deptSelect.appendChild(opt);
    });
  } catch (err) {
    deptSelect.innerHTML = `<option value="" disabled selected>${getTranslation('select-department')}</option>`;
  }
}

function closeFileTransferModal() {
  document.getElementById('fileTransferModal').style.display = 'none';
  document.getElementById('personCount').value = '';
  document.getElementById('transferDept').value = '';
  document.getElementById('personsFields').innerHTML = '';
  document.getElementById('transferPersonsChain').innerHTML = '';
}

// إضافة دالة setupPersonCountHandler لمنع الخطأ
function setupPersonCountHandler() {}

// إضافة دوال الإقرار والتوقيع للتفويض
let currentDelegationData = null;
let activeCanvas = null;
let activeCtx = null;
let isDrawing = false;
let lastX = 0;
let lastY = 0;

// دالة عرض بوب أب الإقرار والتوقيع للتفويض
function showDelegationConfirmationPopup(delegatorInfo, delegateInfo, files, isBulk = false, delegationData = null) {
  // تخزين بيانات التفويض الحالي
  currentDelegationData = delegationData;
  
  // إزالة أي بوب أب موجود مسبقاً
  const existingPopup = document.getElementById('delegationConfirmationPopup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // إزالة أي كانفاس توقيع موجود مسبقاً
  const existingCanvas = document.getElementById('delegationSignatureCanvas');
  if (existingCanvas) {
    existingCanvas.remove();
  }

  // إعادة تعيين متغيرات التوقيع
  activeCanvas = null;
  activeCtx = null;
  isDrawing = false;
  lastX = 0;
  lastY = 0;

  // إنشاء البوب أب
  const popup = document.createElement('div');
  popup.id = 'delegationConfirmationPopup';
  popup.className = 'delegation-confirmation-popup';
  
  // إضافة inline styles للتأكد من الظهور
  popup.style.position = 'fixed';
  popup.style.top = '0';
  popup.style.left = '0';
  popup.style.width = '100%';
  popup.style.height = '100%';
  popup.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  popup.style.display = 'flex';
  popup.style.justifyContent = 'center';
  popup.style.alignItems = 'center';
  popup.style.zIndex = '10000';
  popup.style.direction = 'rtl';
  
  // تحضير قائمة الملفات
  let filesList = '';
  if (isBulk) {
    filesList = '<p class="files-summary">تفويض شامل لجميع ملفات القسم المعلقة</p>';
  } else {
    filesList = '<div class="files-list">';
    files.forEach(file => {
      filesList += `<div class="file-item">
        <span class="file-name">${file.title || file.name}</span>
        <span class="file-type">ملف قسم</span>
      </div>`;
    });
    filesList += '</div>';
  }

  // إنشاء المحتوى باستخدام DOM بدلاً من innerHTML لتجنب مشاكل الكانفاس
  const content = document.createElement('div');
  content.className = 'delegation-confirmation-content';
  content.style.cssText = 'background: white; border-radius: 8px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);';
  
  // Header
  const header = document.createElement('div');
  header.className = 'delegation-header';
  header.innerHTML = `
    <h3>إقرار التفويض</h3>
    <button class="close-btn" onclick="closeDelegationConfirmationPopup()">&times;</button>
  `;
  
  // Body
  const body = document.createElement('div');
  body.className = 'delegation-body';
  
  // Delegator info
  const delegatorInfoDiv = document.createElement('div');
  delegatorInfoDiv.className = 'delegator-info';
  delegatorInfoDiv.innerHTML = `
    <h4>معلومات الموظف المفوض</h4>
    <div class="info-row">
      <span class="label">الاسم الكامل:</span>
      <span class="value">${delegatorInfo.fullName}</span>
    </div>
    <div class="info-row">
      <span class="label">رقم الهوية:</span>
      <span class="value">${delegatorInfo.idNumber}</span>
    </div>
  `;
  
  // Delegate info
  const delegateInfoDiv = document.createElement('div');
  delegateInfoDiv.className = 'delegate-info';
  delegateInfoDiv.innerHTML = `
    <h4>معلومات الموظف المفوض له</h4>
    <div class="info-row">
      <span class="label">الاسم الكامل:</span>
      <span class="value">${delegateInfo.fullName}</span>
    </div>
    <div class="info-row">
      <span class="label">رقم الهوية:</span>
      <span class="value">${delegateInfo.idNumber}</span>
    </div>
  `;
  
  // Delegation details
  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'delegation-details';
  detailsDiv.innerHTML = `
    <h4>تفاصيل التفويض</h4>
    <div class="delegation-type">
      <span class="label">نوع التفويض:</span>
      <span class="value">${isBulk ? 'تفويض شامل' : 'تفويض فردي'}</span>
    </div>
    ${filesList}
  `;
  
  // Delegation statement
  const statementDiv = document.createElement('div');
  statementDiv.className = 'delegation-statement';
  statementDiv.innerHTML = `
    <p class="statement-text">
      أقر بأنني أفوض الموظف <strong>${delegateInfo.fullName}</strong> 
      ذو رقم الهوية <strong>${delegateInfo.idNumber}</strong> 
      بالتوقيع بالنيابة عني على ${isBulk ? 'جميع ملفات القسم المعلقة' : 'الملفات المحددة'}.
    </p>
  `;
  
  // Signature section - إضافة كانفاس للتوقيع
  const signatureSection = document.createElement('div');
  signatureSection.className = 'delegation-signature-section';
  signatureSection.innerHTML = `
    <h4>توقيع المرسل</h4>
    <div class="signature-canvas-container">
      <div class="signature-controls" style="margin-top: 10px;">
        <button type="button" onclick="clearSignatureCanvas()" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; margin-right: 5px; cursor: pointer;">
          مسح التوقيع
        </button>
      </div>
    </div>
  `;
  
  // Footer
  const footer = document.createElement('div');
  footer.className = 'delegation-footer';
  footer.innerHTML = `
    <button class="btn btn-danger" onclick="rejectDelegation()">رفض التفويض</button>
    <button class="btn btn-secondary" onclick="closeDelegationConfirmationPopup()">إلغاء</button>
    <button class="btn btn-primary" onclick="confirmDelegation()">تأكيد التفويض</button>
  `;
  
  // Assembly
  body.appendChild(delegatorInfoDiv);
  body.appendChild(delegateInfoDiv);
  body.appendChild(detailsDiv);
  body.appendChild(statementDiv);
  body.appendChild(signatureSection);
  
  content.appendChild(header);
  content.appendChild(body);
  content.appendChild(footer);
  
  popup.appendChild(content);
  
  // إنشاء الكانفاس برمجياً بعد إضافة المحتوى
  const canvasContainer = popup.querySelector('.signature-canvas-container');
  const delegationCanvasElement = document.createElement('canvas');
  delegationCanvasElement.id = 'delegationSignatureCanvas';
  delegationCanvasElement.width = 400;
  delegationCanvasElement.height = 200;
  delegationCanvasElement.style.border = '1px solid #ccc';
  delegationCanvasElement.style.borderRadius = '4px';
  delegationCanvasElement.style.cursor = 'crosshair';
  canvasContainer.insertBefore(delegationCanvasElement, canvasContainer.firstChild);
  
  // تعيين الكانفاس النشط
  activeCanvas = delegationCanvasElement;
  activeCtx = activeCanvas.getContext('2d');

  // إضافة ملف CSS للبوب أب
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/frontend/css/delegation-confirmation.css';
  link.id = 'delegation-confirmation-css';
  
  // إزالة القائمة السابقة إذا وجدت
  const existingCSS = document.getElementById('delegation-confirmation-css');
  if (existingCSS) {
    existingCSS.remove();
  }
  
  document.head.appendChild(link);
  document.body.appendChild(popup);
  
  // تهيئة التوقيع بعد إضافة البوب أب والكانفاس
  setTimeout(() => {
    initializeSignatureDrawing();
  }, 200);
}

// دالة إغلاق بوب أب الإقرار
function closeDelegationConfirmationPopup() {
  const popup = document.getElementById('delegationConfirmationPopup');
  if (popup) {
    popup.remove();
  }
  
  // إعادة تعيين متغيرات الكانفاس النشط
  activeCanvas = null;
  activeCtx = null;
  console.log('🔍 Delegation confirmation popup closed, activeCanvas reset');
  
  // إعادة تفعيل أزرار البطاقة إذا كان هناك contentId محدد
  if (selectedContentId) {
    const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
    if (card && card.dataset.status === 'pending') {
      enableCardActions(selectedContentId);
    }
  }
  
  // إعادة تفعيل أزرار البطاقة إذا كان هناك contentId في بيانات التفويض
  if (currentDelegationData && currentDelegationData.contentId) {
    enableCardActions(currentDelegationData.contentId);
  }
}

// دالة تهيئة التوقيع
function initializeSignatureDrawing() {
  console.log('🔍 initializeSignatureDrawing called');
  
  // التحقق من وجود الكانفاس النشط
  if (!activeCanvas || !activeCtx) {
    console.log('🔍 No active canvas found, skipping initialization');
    return;
  }
  
  console.log('🔍 Found activeCanvas:', activeCanvas);

  // تعيين أبعاد الكانفاس حسب حجم الشاشة
  const isMobile = window.innerWidth <= 768;
  const canvasWidth = isMobile ? 350 : 400;
  const canvasHeight = isMobile ? 150 : 200;
  
  console.log('🔍 Setting canvas dimensions:', { canvasWidth, canvasHeight });
  
  // تعيين الأبعاد مباشرة على العنصر
  activeCanvas.width = canvasWidth;
  activeCanvas.height = canvasHeight;
  
  // تعيين الأبعاد في CSS أيضاً للتأكد
  activeCanvas.style.width = canvasWidth + 'px';
  activeCanvas.style.height = canvasHeight + 'px';

  // إعادة الحصول على السياق بعد تغيير الأبعاد
  activeCtx = activeCanvas.getContext('2d');
  console.log('🔍 Got canvas context:', activeCtx);

  if (activeCtx) {
    activeCtx.strokeStyle = '#000';
    activeCtx.lineWidth = 2;
    activeCtx.lineCap = 'round';

    // إزالة event listeners السابقة لتجنب التكرار
    activeCanvas.removeEventListener('mousedown', startDrawing);
    activeCanvas.removeEventListener('mousemove', draw);
    activeCanvas.removeEventListener('mouseup', stopDrawing);
    activeCanvas.removeEventListener('mouseout', stopDrawing);
    activeCanvas.removeEventListener('touchstart', handleTouchStart);
    activeCanvas.removeEventListener('touchmove', handleTouchMove);
    activeCanvas.removeEventListener('touchend', stopDrawing);

    // إضافة event listeners للتوقيع
    activeCanvas.addEventListener('mousedown', startDrawing);
    activeCanvas.addEventListener('mousemove', draw);
    activeCanvas.addEventListener('mouseup', stopDrawing);
    activeCanvas.addEventListener('mouseout', stopDrawing);

    // دعم اللمس للأجهزة المحمولة
    activeCanvas.addEventListener('touchstart', handleTouchStart);
    activeCanvas.addEventListener('touchmove', handleTouchMove);
    activeCanvas.addEventListener('touchend', stopDrawing);

    console.log('🔍 Signature canvas initialized successfully');

  } else {
    console.error('🔍 Failed to get canvas context!');
  }
}

// دوال التوقيع
function startDrawing(e) {
  if (!activeCanvas || !activeCtx) {
    return;
  }
  
  isDrawing = true;
  const rect = activeCanvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
}

function draw(e) {
  if (!isDrawing) {
    return;
  }
  
  if (!activeCanvas || !activeCtx) {
    return;
  }
  
  e.preventDefault();
  
  const rect = activeCanvas.getBoundingClientRect();
  const currentX = e.clientX - rect.left;
  const currentY = e.clientY - rect.top;
  
  activeCtx.beginPath();
  activeCtx.moveTo(lastX, lastY);
  activeCtx.lineTo(currentX, currentY);
  activeCtx.stroke();
  
  lastX = currentX;
  lastY = currentY;
}

function stopDrawing() {
  isDrawing = false;
}

// معالجة اللمس للأجهزة المحمولة
function handleTouchStart(e) {
  e.preventDefault();
  
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    
    const mouseEvent = new MouseEvent('mousedown', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    activeCanvas.dispatchEvent(mouseEvent);
  }
}

function handleTouchMove(e) {
  e.preventDefault();
  
  if (e.touches.length > 0) {
    const touch = e.touches[0];
    
    const mouseEvent = new MouseEvent('mousemove', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    activeCanvas.dispatchEvent(mouseEvent);
  }
}

// دالة مسح التوقيع
function clearSignatureCanvas() {
  if (activeCtx && activeCanvas) {
    // التأكد من أن الكانفاس له أبعاد صحيحة
    if (activeCanvas.width === 0 || activeCanvas.height === 0) {
      const isMobile = window.innerWidth <= 768;
      activeCanvas.width = isMobile ? 350 : 400;
      activeCanvas.height = isMobile ? 150 : 200;
      activeCanvas.style.width = activeCanvas.width + 'px';
      activeCanvas.style.height = activeCanvas.height + 'px';
    }
    
    activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
  }
}

// دالة الحصول على التوقيع من الكانفاس
function getSignatureFromCanvas() {
  if (!activeCanvas) {
    console.error('🔍 Active canvas not found');
    return null;
  }
  
  if (!activeCtx) {
    console.error('🔍 Active canvas context not found');
    return null;
  }
  
  // التحقق من وجود توقيع على الكانفاس
  const imageData = activeCtx.getImageData(0, 0, activeCanvas.width, activeCanvas.height);
  const data = imageData.data;
  let hasSignature = false;
  
  // التحقق من وجود خطوط سوداء (التوقيع)
  for (let i = 0; i < data.length; i += 4) {
    // البحث عن بكسل أسود (RGB قيم منخفضة)
    if (data[i] < 50 && data[i + 1] < 50 && data[i + 2] < 50 && data[i + 3] > 200) {
      hasSignature = true;
      break;
    }
  }
  
  if (!hasSignature) {
    console.log('🔍 No signature detected on canvas');
    return null;
  }
  
  const signatureData = activeCanvas.toDataURL('image/png');
  console.log('🔍 Signature captured successfully:', signatureData.substring(0, 50) + '...');
  return signatureData;
}

// دالة تأكيد التفويض
function confirmDelegation() {
  console.log('🔍 confirmDelegation called');
  console.log('🔍 currentDelegationData:', currentDelegationData);
  
  if (!currentDelegationData) {
    showToast('خطأ: لا توجد بيانات تفويض', 'error');
    return;
  }
  
  // الحصول على توقيع المرسل من الكانفاس
  const senderSignature = getSignatureFromCanvas();
  console.log('🔍 senderSignature obtained:', senderSignature ? 'YES' : 'NO');
  
  if (!senderSignature) {
    showToast('يرجى التوقيع أولاً كمرسل للتفويض', 'error');
    return;
  }
  
  // إضافة توقيع المرسل إلى بيانات التفويض
  currentDelegationData.senderSignature = senderSignature;
  console.log('🔍 Updated currentDelegationData with signature');
  
  // معالجة قبول التفويض حسب النوع
  if (currentDelegationData.isBulk) {
    // قبول تفويض شامل
    console.log('🔍 Processing bulk delegation');
    processBulkDelegation(currentDelegationData);
  } else {
    // قبول تفويض فردي
    console.log('🔍 Processing single delegation');
    processSingleDelegation(currentDelegationData);
  }
  
  // إغلاق البوب أب
  closeDelegationConfirmationPopup();
  
  // مسح البيانات المؤقتة
  currentDelegationData = null;
}

// دالة رفض التفويض
function rejectDelegation() {
  if (!currentDelegationData) {
    showToast('خطأ: لا توجد بيانات تفويض', 'error');
    return;
  }
  
  // إعادة تفعيل أزرار البطاقة عند رفض التفويض
  if (currentDelegationData.contentId) {
    enableCardActions(currentDelegationData.contentId);
  }
  
  // إعادة تفعيل زر التأكيد إذا كان معطلاً
  const confirmButton = document.querySelector('#delegationConfirmationPopup .btn-primary');
  if (confirmButton && confirmButton.disabled) {
    setButtonProcessingState(confirmButton, false);
  }
  
  // إغلاق البوب أب
  closeDelegationConfirmationPopup();
  
  // مسح البيانات المؤقتة
  currentDelegationData = null;
  
  showToast('تم رفض التفويض', 'info');
}

// دالة معالجة تفويض فردي
async function processSingleDelegation(data) {
  try {
    console.log('🔍 processSingleDelegation called with data:', data);
    console.log('🔍 senderSignature in data:', data.senderSignature ? 'PRESENT' : 'MISSING');
    
    const card = document.querySelector(`.approval-card[data-id="${data.contentId}"]`);
    if (!card) {
      showToast('خطأ في جلب معلومات الملف', 'error');
      return;
    }
    
    const contentType = card.dataset.type;
    let endpoint;
    
    if (contentType === 'committee') {
      endpoint = `${apiBase}/committee-approvals/committee-delegations/single`;
    } else {
      // تصحيح المسار ليتطابق مع الباك إند
      endpoint = `${apiBase}/approvals/${data.contentId}/delegate`;
    }
    
    console.log('🔍 Using endpoint:', endpoint);
    
    const requestBody = {
      delegateTo: data.delegateTo,
      notes: data.notes,
      signature: data.senderSignature // توقيع المرسل
    };
    
    console.log('🔍 Request body:', requestBody);
    console.log('🔍 Signature in request:', requestBody.signature ? 'PRESENT' : 'MISSING');
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    console.log('🔍 Response from server:', result);
    
    if (result.status === 'success') {
      let message;
      if (contentType === 'committee') {
        message = 'تم إرسال طلب التفويض للجنة بنجاح';
      } else {
        message = 'تم إرسال طلب التفويض بنجاح';
      }
      showToast(message, 'success');
      closeDelegationConfirmationPopup();
      disableActionsFor(data.contentId);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showToast(result.message || 'فشل إرسال طلب التفويض', 'error');
      // إعادة تفعيل أزرار البطاقة في حالة الفشل
      if (data.contentId) {
        enableCardActions(data.contentId);
      }
    }
  } catch (error) {
    console.error('🔍 Error processing single delegation:', error);
    showToast('خطأ في إرسال طلب التفويض', 'error');
    // إعادة تفعيل أزرار البطاقة في حالة الخطأ
    if (data.contentId) {
      enableCardActions(data.contentId);
    }
  } finally {
    // إعادة تفعيل جميع الأزرار في حالة النجاح أو الفشل
    const confirmButton = document.querySelector('#delegationConfirmationPopup .btn-primary');
    if (confirmButton) {
      setButtonProcessingState(confirmButton, false);
    }
  }
}

// دالة معالجة تفويض شامل
async function processBulkDelegation(data) {
  try {
    console.log('🔍 processBulkDelegation called with data:', data);
    console.log('🔍 senderSignature in data:', data.senderSignature ? 'PRESENT' : 'MISSING');
    
    let endpoint = `${apiBase}/approvals/delegate-all`;
    console.log('🔍 Using endpoint:', endpoint);
    
    const requestBody = {
      delegateTo: data.delegateTo,
      notes: data.notes,
      signature: data.senderSignature // توقيع المرسل
    };
    
    console.log('🔍 Request body:', requestBody);
    console.log('🔍 Signature in request:', requestBody.signature ? 'PRESENT' : 'MISSING');
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    console.log('🔍 Response from server:', result);
    
    if (result.status === 'success') {
      showToast('تم إرسال طلب التفويض الشامل بنجاح', 'success');
      closeDelegationConfirmationPopup();
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showToast(result.message || 'فشل إرسال طلب التفويض الشامل', 'error');
      // إعادة تفعيل أزرار البطاقة في حالة الفشل
      if (data.contentId) {
        enableCardActions(data.contentId);
      }
    }
  } catch (error) {
    console.error('🔍 Error processing bulk delegation:', error);
    showToast('خطأ في إرسال طلب التفويض الشامل', 'error');
    // إعادة تفعيل أزرار البطاقة في حالة الخطأ
    if (data.contentId) {
      enableCardActions(data.contentId);
    }
  } finally {
    // إعادة تفعيل جميع الأزرار في حالة النجاح أو الفشل
    const confirmButton = document.querySelector('#delegationConfirmationPopup .btn-primary');
    if (confirmButton) {
      setButtonProcessingState(confirmButton, false);
    }
  }
}

// دالة authHeaders
function authHeaders() {
  const currentToken = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${currentToken}`
  };
}

// إضافة دالة setupPersonCountHandler لمنع الخطأ
function setupPersonCountHandler() {}

// دوال التفويض مع الإقرار والتوقيع
async function showSingleDelegationConfirmation(delegateTo, contentId, contentType, notes = '') {
  try {
    console.log('[showSingleDelegationConfirmation] Starting with:', { delegateTo, contentId, contentType, notes });
    
    // جلب معلومات المستخدم المفوض له
    const userResponse = await fetch(`${apiBase}/users/${delegateTo}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userData = await userResponse.json();
    console.log('[showSingleDelegationConfirmation] User data:', userData);
    
    if (userData.status !== 'success') {
      showToast('خطأ في جلب معلومات المستخدم', 'error');
      return;
    }
    
    // جلب معلومات المستخدم الحالي (المفوض) من قاعدة البيانات
    const payload = await safeGetUserInfo(token);
    const currentUserId = payload.id;
    console.log('[showSingleDelegationConfirmation] Current user ID from JWT:', currentUserId);
    
    const currentUserResponse = await fetch(`${apiBase}/users/${currentUserId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const currentUserData = await currentUserResponse.json();
    console.log('[showSingleDelegationConfirmation] Current user data from API:', currentUserData);
    
    if (currentUserData.status !== 'success') {
      showToast('خطأ في جلب معلومات المستخدم الحالي', 'error');
      return;
    }
    
    // جلب معلومات الملف
    console.log('[showSingleDelegationConfirmation] Fetching content from:', `${apiBase}/contents/${contentId}`);
    const contentResponse = await fetch(`${apiBase}/contents/${contentId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('[showSingleDelegationConfirmation] Content response status:', contentResponse.status);
    
    if (!contentResponse.ok) {
      const errorText = await contentResponse.text();
      console.error('[showSingleDelegationConfirmation] Content response error:', errorText);
      showToast(`خطأ في جلب معلومات الملف: ${contentResponse.status}`, 'error');
      return;
    }
    
    const contentData = await contentResponse.json();
    console.log('[showSingleDelegationConfirmation] Content data:', contentData);
    
    if (contentData.status !== 'success') {
      showToast('خطأ في جلب معلومات الملف', 'error');
      return;
    }
    
    // تحضير بيانات التفويض
    const delegationData = {
      delegationId: `single-${contentId}`,
      delegateTo: delegateTo,
      contentId: contentId,
      contentType: contentType,
      notes: notes,
      isBulk: false
    };
    console.log('[showSingleDelegationConfirmation] Delegation data:', delegationData);
    
    // عرض بوب أب الإقرار والتوقيع
    showDelegationConfirmationPopup(
      {
        fullName: currentUserData.data.name || currentUserData.data.username || 'مستخدم',
        idNumber: currentUserData.data.national_id || currentUserData.data.employee_number || currentUserData.data.id || 'غير محدد'
      },
      {
        fullName: userData.data.name || userData.data.username || 'مستخدم',
        idNumber: userData.data.national_id || userData.data.employee_number || userData.data.id || 'غير محدد'
      },
      [contentData.data],
      false,
      delegationData
    );
    
  } catch (error) {
    console.error('[showSingleDelegationConfirmation] Error:', error);
    showToast('خطأ في عرض تأكيد التفويض', 'error');
  }
}

async function showBulkDelegationConfirmation(delegateTo, notes = '') {
  try {
    console.log('[showBulkDelegationConfirmation] Starting with:', { delegateTo, notes });
    
    // جلب معلومات المستخدم المفوض له
    const userResponse = await fetch(`${apiBase}/users/${delegateTo}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const userData = await userResponse.json();
    console.log('[showBulkDelegationConfirmation] User data:', userData);
    
    if (userData.status !== 'success') {
      showToast('خطأ في جلب معلومات المستخدم', 'error');
      return;
    }
    
    // جلب معلومات المستخدم الحالي (المفوض) من قاعدة البيانات
    const payload = await safeGetUserInfo(token);
    const currentUserId = payload.id;
    console.log('[showBulkDelegationConfirmation] Current user ID from JWT:', currentUserId);
    
    const currentUserResponse = await fetch(`${apiBase}/users/${currentUserId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const currentUserData = await currentUserResponse.json();
    console.log('[showBulkDelegationConfirmation] Current user data from API:', currentUserData);
    
    if (currentUserData.status !== 'success') {
      showToast('خطأ في جلب معلومات المستخدم الحالي', 'error');
      return;
    }
    
    // تحضير بيانات التفويض الشامل
    const delegationData = {
      delegationId: `bulk-${Date.now()}`,
      delegateTo: delegateTo,
      notes: notes,
      isBulk: true,
      delegationData: {
        delegationId: `bulk-${Date.now()}`
      }
    };
    console.log('[showBulkDelegationConfirmation] Delegation data:', delegationData);
    
    // عرض بوب أب الإقرار والتوقيع
    showDelegationConfirmationPopup(
      {
        fullName: currentUserData.data.name || currentUserData.data.username || 'مستخدم',
        idNumber: currentUserData.data.national_id || currentUserData.data.employee_number || currentUserData.data.id || 'غير محدد'
      },
      {
        fullName: userData.data.name || userData.data.username || 'مستخدم',
        idNumber: userData.data.national_id || userData.data.employee_number || userData.data.id || 'غير محدد'
      },
      [],
      true,
      delegationData
    );
    
  } catch (error) {
    console.error('[showBulkDelegationConfirmation] Error:', error);
    showToast('خطأ في عرض تأكيد التفويض الشامل', 'error');
  }
}

// دالة معالجة التفويض الفردي
async function handleSingleDelegation(delegateTo, contentId, contentType, notes = '') {
  await showSingleDelegationConfirmation(delegateTo, contentId, contentType, notes);
}

// دالة معالجة التفويض الشامل
async function handleBulkDelegation(delegateTo, notes = '') {
  await showBulkDelegationConfirmation(delegateTo, notes);
}

// إضافة event listeners لأزرار التفويض
document.addEventListener('DOMContentLoaded', function() {
  // زر التفويض الفردي
  const delegateButtons = document.querySelectorAll('.btn-delegate');
  delegateButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const card = e.target.closest('.approval-card');
      const contentId = card.dataset.id;
      const contentType = card.dataset.type || 'department';
      
      // فتح modal اختيار المستخدم
      openModal('delegateModal');
      loadDepartments();
      
      // تخزين معرف المحتوى المحدد
      selectedContentId = contentId;
    });
  });
  
  // زر التفويض الشامل
  const bulkDelegateButtons = document.querySelectorAll('.btn-bulk-delegate');
  bulkDelegateButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      // فتح modal التفويض الشامل
      openModal('bulkDelegateModal');
      loadDepartments();
    });
  });
  
  // معالجة تأكيد التفويض الفردي
  const confirmSingleDelegationBtn = document.getElementById('confirmSingleDelegation');
  if (confirmSingleDelegationBtn) {
    confirmSingleDelegationBtn.addEventListener('click', async () => {
      const delegateTo = document.getElementById('delegateTo').value;
      const notes = document.getElementById('delegationNotes').value;
      
      if (!delegateTo) {
        showToast('يرجى اختيار مستخدم للتفويض', 'error');
        return;
      }
      
      // إغلاق modal
      closeModal('delegateModal');
      
      // عرض بوب أب الإقرار والتوقيع
      await handleSingleDelegation(delegateTo, selectedContentId, 'department', notes);
    });
  }
  
  // معالجة تأكيد التفويض الشامل
  const confirmBulkDelegationBtn = document.getElementById('confirmBulkDelegation');
  if (confirmBulkDelegationBtn) {
    confirmBulkDelegationBtn.addEventListener('click', async () => {
      const delegateTo = document.getElementById('bulkDelegateTo').value;
      const notes = document.getElementById('bulkDelegationNotes').value;
      
      if (!delegateTo) {
        showToast('يرجى اختيار مستخدم للتفويض', 'error');
        return;
      }
      
      // إغلاق modal
      closeModal('bulkDelegateModal');
      
      // عرض بوب أب الإقرار والتوقيع
      await handleBulkDelegation(delegateTo, notes);
    });
  }
});

// إضافة دالة setupPersonCountHandler لمنع الخطأ
function setupPersonCountHandler() {}
