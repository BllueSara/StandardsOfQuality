// approvals-recived.js
// تم تحديث الملف لحل مشكلة أزرار "جاري المعالجة" عند إغلاق البوب أبز
// جميع أزرار الإغلاق (×) الآن تعيد تعيين حالة الأزرار إلى الحالة الأصلية

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
      'confirm-transfer': 'تم تأكيد التحويل',
      'select-role': 'اختر الدور',
      'department': 'قسم',
      'send-reason': 'إرسال السبب',
      'electronic-approve': 'توقيع إلكتروني',
      'cancel': 'إلغاء',
      'clear': 'مسح',
      'file-will-be-sent': 'سيتم إرسال الملف بعد اعتماده من آخر شخص في القسم للأشخاص المختارين',
      'transfer-file-sender': 'سيتم إرسال الملف بعد اعتماده من آخر شخص في القسم للأشخاص المختارين',
      // الأدوار في سلسلة الموافقة
      'prepared': 'مُعد',
      'updated': 'محدث',
      'reviewed': 'مراجع',
      'approved': 'معتمد'
    };
    return translations[key] || key;
  };
}

// دالة ترجمة الأدوار
function getRoleTranslation(role) {
  const roleTranslations = {
    'prepared': getTranslation('prepared') || 'Prepared',
    'updated': getTranslation('updated') || 'Updated',
    'reviewed': getTranslation('reviewed') || 'Reviewed',
    'approved': getTranslation('approved') || 'Approved'
  };
  return roleTranslations[role] || role;
}

let filteredItems = [];

const apiBase = 'http://localhost:3000/api';
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

// دوال جديدة للمعالجة في الخلفية
let pendingSignatureData = null;
let pendingRejectionData = null;
let pendingElectronicData = null;
let pendingDelegationData = null;

// دالة جديدة لحماية الأزرار من النقر المتكرر
function preventDuplicateSignatures() {
  try {
    console.log('🔍 preventDuplicateSignatures called...');
    
    // تعطيل جميع أزرار التوقيع والتفويض والرفض في جميع البطاقات
    const allCards = document.querySelectorAll('.approval-card');
    console.log('🔍 Found cards in preventDuplicateSignatures:', allCards.length);
    
    if (allCards.length === 0) {
      console.warn('🔍 No cards found in preventDuplicateSignatures!');
      return;
    }
    
    allCards.forEach((card, index) => {
      console.log(`🔍 Processing card ${index + 1} in preventDuplicateSignatures:`, card);
      
      const actionButtons = card.querySelectorAll('.btn-sign, .btn-delegate, .btn-qr, .btn-reject');
      console.log(`🔍 Card ${index + 1}: Found ${actionButtons.length} action buttons in preventDuplicateSignatures`);
      
      if (actionButtons.length === 0) {
        console.warn(`🔍 Card ${index + 1}: No action buttons found in preventDuplicateSignatures!`);
        return;
      }
      
      actionButtons.forEach((button, btnIndex) => {
        if (!button.disabled) {
          console.log(`🔍 Processing button ${btnIndex + 1} (${button.className}) in preventDuplicateSignatures`);
          
          // حفظ النص الأصلي
          if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
            console.log(`🔍 Saved original text for ${button.className}:`, button.innerHTML);
          }
          
          // تعطيل الزر وإظهار حالة المعالجة
          button.disabled = true;
          button.style.opacity = '0.5';
          button.style.cursor = 'not-allowed';
          button.style.pointerEvents = 'none';
          button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...`;
          
          // إضافة مؤشر بصري
          button.classList.add('processing');
          
          // إضافة CSS إضافي لتحسين المظهر
          button.style.transition = 'all 0.3s ease';
          button.style.transform = 'scale(0.98)';
          button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          
          // إضافة aria-disabled و tabindex للوصول
          button.setAttribute('aria-disabled', 'true');
          button.setAttribute('tabindex', '-1');
          
          console.log(`🔍 Button ${button.className} disabled in preventDuplicateSignatures, new text:`, button.innerHTML);
        } else {
          console.log(`🔍 Button ${button.className} already disabled in preventDuplicateSignatures`);
        }
      });
    });
    
    console.log('🔍 All action buttons disabled for processing in preventDuplicateSignatures');
  } catch (error) {
    console.error('🔍 Error in preventDuplicateSignatures:', error);
  }
}

// دالة لتعطيل جميع أزرار البطاقات
function disableAllCardActions() {
  try {
    // مسح أي timeouts موجودة لمنع التعارض
    if (processingTimeout) {
      clearTimeout(processingTimeout);
      processingTimeout = null;
      console.log('🔍 Cleared existing processing timeout');
    }
    
    console.log('🔍 Starting disableAllCardActions...');
    
    const allCards = document.querySelectorAll('.approval-card');
    console.log('🔍 Found cards:', allCards.length);
    
    if (allCards.length === 0) {
      console.warn('🔍 No cards found! This might be the issue.');
      return;
    }
    
    allCards.forEach((card, index) => {
      console.log(`🔍 Processing card ${index + 1}:`, card);
      
      const actionButtons = card.querySelectorAll('.btn-sign, .btn-delegate, .btn-qr, .btn-reject');
      console.log(`🔍 Card ${index + 1}: Found ${actionButtons.length} action buttons`);
      
      if (actionButtons.length === 0) {
        console.warn(`🔍 Card ${index + 1}: No action buttons found!`);
        return;
      }
      
      actionButtons.forEach((button, btnIndex) => {
        console.log(`🔍 Button ${btnIndex + 1}:`, button.className, button.innerHTML, 'disabled:', button.disabled);
        
        if (!button.disabled) {
          // حفظ النص الأصلي
          if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
            console.log(`🔍 Saved original text for ${button.className}:`, button.innerHTML);
          }
          
          // تعطيل الزر وإظهار حالة المعالجة
          button.disabled = true;
          button.style.opacity = '0.5';
          button.style.cursor = 'not-allowed';
          button.style.pointerEvents = 'none';
          button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...`;
          
          // إضافة مؤشر بصري
          button.classList.add('processing');
          
          // إضافة CSS إضافي
          button.style.transition = 'all 0.3s ease';
          button.style.transform = 'scale(0.98)';
          button.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          
          // إضافة aria-disabled و tabindex للوصول
          button.setAttribute('aria-disabled', 'true');
          button.setAttribute('tabindex', '-1');
          
          console.log(`🔍 Disabled button ${button.className}, new text:`, button.innerHTML);
        } else {
          console.log(`🔍 Button ${button.className} already disabled`);
        }
      });
    });
    
    console.log('🔍 All card actions disabled for processing');
  } catch (error) {
    console.error('🔍 Error in disableAllCardActions:', error);
  }
}

// دالة لإعادة تفعيل جميع أزرار البطاقات
function enableAllCardActions() {
  try {
    // مسح أي timeouts موجودة لمنع التعارض
    if (processingTimeout) {
      clearTimeout(processingTimeout);
      processingTimeout = null;
      console.log('🔍 Cleared existing processing timeout in enableAllCardActions');
    }
    
    const allCards = document.querySelectorAll('.approval-card');
    allCards.forEach(card => {
      const actionButtons = card.querySelectorAll('.btn-sign, .btn-delegate, .btn-qr, .btn-reject');
      actionButtons.forEach(button => {
        // إعادة تفعيل الزر
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
        
        // إزالة aria-disabled و tabindex
        button.removeAttribute('aria-disabled');
        button.removeAttribute('tabindex');
      });
    });
    
    console.log('🔍 All card actions re-enabled');
  } catch (error) {
    console.error('🔍 Error in enableAllCardActions:', error);
  }
}

// دالة لإغلاق جميع النوافذ المنبثقة
function forceCloseAllPopups() {
  try {
    const modalIds = ['rejectModal', 'qrModal', 'delegateModal', 'fileTransferModal', 'signatureModal'];
    
    modalIds.forEach(modalId => {
      const modal = document.getElementById(modalId);
      if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
        console.log(`🔍 Closed modal: ${modalId}`);
      }
    });
    
    // إغلاق بوب أب التفويض إذا كان مفتوحاً
    const delegationPopup = document.getElementById('delegationConfirmationPopup');
    if (delegationPopup) {
      delegationPopup.remove();
      console.log('🔍 Closed delegation confirmation popup');
    }
    
    // إعادة تعيين متغيرات البيانات المؤقتة
    pendingSignatureData = null;
    pendingRejectionData = null;
    pendingElectronicData = null;
    pendingDelegationData = null;
    
    console.log('🔍 All popups closed and data reset');
  } catch (error) {
    console.error('🔍 Error in forceCloseAllPopups:', error);
  }
}

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
  
  // إعادة تفعيل الزر بعد 15 ثانية كحد أقصى
  if (processingTimeout) {
    clearTimeout(processingTimeout);
  }
  
  processingTimeout = setTimeout(() => {
    if (button && !button.classList.contains('processing')) { // التحقق من عدم وجود class 'processing'
      setButtonProcessingState(button, false);
      console.log('🔍 Button re-enabled after timeout (not in global processing state)');
    } else {
      console.log('🔍 Button still in global processing state, not re-enabling automatically');
    }
  }, 15000);
  
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

// دالة مساعدة لإعادة تعيين حالة جميع الأزرار في مودال معين
function resetModalButtons(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  
  const allButtons = modal.querySelectorAll('button');
  allButtons.forEach(button => {
    // إعادة تفعيل الزر
    button.disabled = false;
    button.style.opacity = '1';
    button.style.cursor = 'pointer';
    button.style.pointerEvents = 'auto';
    
    // إزالة جميع classes المعالجة
    button.classList.remove('loading', 'processing');
    
    // إعادة تعيين CSS
    button.style.transform = 'scale(1)';
    button.style.boxShadow = '';
    button.style.filter = '';
    
    // إعادة النص الأصلي إذا كان محفوظاً
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
  });
}

// دالة مساعدة لإعادة تعيين حالة جميع الأزرار في جميع المودالز المفتوحة
function resetAllModalButtons() {
  const modalIds = ['rejectModal', 'qrModal', 'delegateModal', 'fileTransferModal', 'signatureModal'];
  
  modalIds.forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (modal && modal.style.display !== 'none') {
      resetModalButtons(modalId);
    }
  });
}

// دالة مساعدة لإعادة تعيين حالة جميع الأزرار في البوب أبز
function resetAllPopupButtons() {
  const popup = document.getElementById('delegationConfirmationPopup');
  if (popup) {
    const allButtons = popup.querySelectorAll('button');
    allButtons.forEach(button => {
      // إعادة تفعيل الزر
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      button.style.pointerEvents = 'auto';
      
      // إزالة جميع classes المعالجة
      button.classList.remove('loading', 'processing');
      
      // إعادة تعيين CSS
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '';
      button.style.filter = '';
      
      // إعادة النص الأصلي إذا كان محفوظاً
      if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
      }
    });
  }
}

// جلب صلاحيات المستخدم
async function fetchPermissions() {
  if (!token) return;
  const payload = await safeGetUserInfo(token);
  const userId = payload.id, role = payload.role;
  if (role === 'admin' || role === 'super_admin') {
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
  
  // استخدام الدالة المساعدة لإعادة تعيين حالة الأزرار
  resetModalButtons(modalId);
  
  // إعادة تفعيل أزرار البطاقة إذا كان المودال هو مودال الرفض أو التوقيع الإلكتروني أو التفويض أو التحويل
  if ((modalId === 'rejectModal' || modalId === 'qrModal' || modalId === 'delegateModal' || modalId === 'fileTransferModal') && selectedContentId) {
    const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
    if (card && card.dataset.status === 'pending') {
      enableAllCardActions();
    }
  }
  
  // إعادة تعيين متغيرات خاصة ببعض المودالز
  if (modalId === 'fileTransferModal') {
    // إعادة تعيين متغيرات التحويل
    currentTransferSequence = [];
    currentTransferUsers = [];
    currentTransferRoles = [];
    newDeptUsers = [];
    selectedNewUsers = [];
    selectedNewRoles = [];
    
    // إعادة تعيين حقول النموذج
    const personCount = document.getElementById('personCount');
    const transferDept = document.getElementById('transferDept');
    const personsFields = document.getElementById('personsFields');
    const transferPersonsChain = document.getElementById('transferPersonsChain');
    
    if (personCount) personCount.value = '';
    if (transferDept) transferDept.value = '';
    if (personsFields) personsFields.innerHTML = '';
    if (transferPersonsChain) transferPersonsChain.innerHTML = '';
  }
  
  // إعادة تعيين متغيرات التفويض
  if (modalId === 'delegateModal') {
    const delegateUser = document.getElementById('delegateUser');
    const delegateNotes = document.getElementById('delegateNotes');
    if (delegateUser) delegateUser.value = '';
    if (delegateNotes) delegateNotes.value = '';
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
      console.log('🔍 btnSendReason clicked!');
      
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) return showToast(getTranslation('please-enter-reason'), 'warning');
      
      // حماية من النقر المتكرر
      if (!protectFromDoubleClick(btnSendReason, 'جاري إرسال الرفض...')) {
        return;
      }
      
      console.log('🔍 Calling preventDuplicateSignatures...');
      // حماية فورية من النقر المتكرر
      preventDuplicateSignatures();
      
      console.log('🔍 Calling disableAllCardActions...');
      // تعطيل جميع أزرار البطاقات
      disableAllCardActions();
      
      // إغلاق النافذة المنبثقة فوراً
        closeModal('rejectModal');
      
      // معالجة الرفض في الخلفية
      const contentType = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`).dataset.type;
      const endpoint = contentType === 'committee' ? 'committee-approvals' : 'approvals';
      
      processRejectionInBackground(selectedContentId, endpoint, reason);
    });
  }

  // إضافة معالجة للإلغاء في مودال الرفض
  const btnCancelReject = document.getElementById('btnCancelReject');
  if (btnCancelReject) {
    btnCancelReject.addEventListener('click', () => {
      // إعادة تفعيل أزرار البطاقة عند الإلغاء
      if (selectedContentId) {
        enableAllCardActions();
      }
      
      // إعادة تفعيل زر الإرسال إذا كان معطلاً
      const btnSendReason = document.getElementById('btnSendReason');
      if (btnSendReason && btnSendReason.disabled) {
        setButtonProcessingState(btnSendReason, false);
      }
      
      closeModal('rejectModal');
    });
  }

  // إضافة معالجة لأزرار الإغلاق في مودال الرفض
  document.querySelectorAll('[data-modal="rejectModal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      // إعادة تفعيل أزرار البطاقة عند الإغلاق
      if (selectedContentId) {
        enableAllCardActions();
      }
      
      // إعادة تفعيل زر الإرسال إذا كان معطلاً
      const btnSendReason = document.getElementById('btnSendReason');
      if (btnSendReason && btnSendReason.disabled) {
        setButtonProcessingState(btnSendReason, false);
      }
    });
  });

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

// تم حذف التعريف المكرر - استخدم التعريف الأصلي أعلاه

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
        actions += `<button class="btn-transfer-file">${getTranslation('transfer-file-1')}</button>`;
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
      selectedContentId = id;
      openSignatureModal(id);
    });
  });

  document.querySelectorAll('.approval-card .btn-delegate').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('.approval-card').dataset.id;
      selectedContentId = id;
      // فتح مودال اختيار المستخدم أولاً
      openModal('delegateModal');
      loadDepartments();
    });
  });
  
  document.querySelectorAll('.approval-card .btn-qr').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.approval-card').dataset.id;
      selectedContentId = id;
      openModal('qrModal');
    });
  });

  document.querySelectorAll('.approval-card .btn-reject').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.approval-card').dataset.id;
      const card = e.target.closest('.approval-card');
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
            contentType: item.type || getTranslation('department'),
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
      const trackUrl = `track-request.html?id=${itemId}&type=${item.type || getTranslation('department')}&title=${encodeURIComponent(item.title)}&source=${encodeURIComponent(item.source_name)}`;
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
  console.log('🔍 btnElectronicApprove clicked!');
  
  if (!selectedContentId) return alert(getTranslation('please-select-user'));

  // حماية من النقر المتكرر
  const btnElectronicApprove = document.getElementById('btnElectronicApprove');
  if (!protectFromDoubleClick(btnElectronicApprove, 'جاري التوقيع...')) {
    return;
  }

  console.log('🔍 Calling preventDuplicateSignatures...');
  // حماية فورية من النقر المتكرر
  preventDuplicateSignatures();

  console.log('🔍 Calling disableAllCardActions...');
  // تعطيل جميع أزرار البطاقات
  disableAllCardActions();

  // إغلاق النافذة المنبثقة فوراً
  closeModal('qrModal');

  // معالجة التوقيع الإلكتروني في الخلفية
  const contentType = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`).dataset.type;
  const endpoint = contentType === 'committee' ? 'committee-approvals' : 'approvals';

  processElectronicSignatureInBackground(selectedContentId, contentType, endpoint);
});

// إضافة معالجة للإلغاء في مودال التوقيع الإلكتروني
const btnCancelQr = document.getElementById('btnCancelQr');
if (btnCancelQr) {
  btnCancelQr.addEventListener('click', () => {
    // إعادة تفعيل أزرار البطاقة عند الإلغاء
    if (selectedContentId) {
      enableAllCardActions();
    }
    
    // إعادة تفعيل زر التوقيع إذا كان معطلاً
    const btnElectronicApprove = document.getElementById('btnElectronicApprove');
    if (btnElectronicApprove && btnElectronicApprove.disabled) {
      setButtonProcessingState(btnElectronicApprove, false);
    }
    
    closeModal('qrModal');
  });
}

// إضافة معالجة لأزرار الإغلاق في مودال التوقيع الإلكتروني
document.querySelectorAll('[data-modal="qrModal"]').forEach(btn => {
  btn.addEventListener('click', () => {
    // إعادة تفعيل أزرار البطاقة عند الإغلاق
    if (selectedContentId) {
      enableAllCardActions();
    }
    
    // إعادة تفعيل زر التوقيع إذا كان معطلاً
    const btnElectronicApprove = document.getElementById('btnElectronicApprove');
    if (btnElectronicApprove && btnElectronicApprove.disabled) {
      setButtonProcessingState(btnElectronicApprove, false);
    }
  });
});

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
  const modal = document.getElementById('signatureModal');
  if (modal) modal.style.display = 'none';
  clearCanvas();
  
  // استخدام الدالة المساعدة لإعادة تعيين حالة الأزرار
  resetModalButtons('signatureModal');
  
  // إعادة تعيين التبويبات
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  tabBtns.forEach(b => b.classList.remove('active'));
  tabContents.forEach(c => c.classList.remove('active'));
  
  // تفعيل تبويب التوقيع المباشر افتراضياً
  const drawTab = document.querySelector('[data-tab="draw"]');
  const drawTabContent = document.getElementById('draw-tab');
  if (drawTab) drawTab.classList.add('active');
  if (drawTabContent) drawTabContent.classList.add('active');
  
  // إعادة تعيين منطقة رفع الصور
  const uploadArea = document.getElementById('uploadArea');
  const uploadPreview = document.getElementById('uploadPreview');
  if (uploadArea && uploadPreview) {
    uploadArea.style.display = 'block';
    uploadPreview.style.display = 'none';
  }
  
  // إعادة تعيين التوقيع الحالي
  currentSignature = null;
  
  // إعادة تفعيل أزرار البطاقة إذا لم يتم الاعتماد
  if (selectedContentId) {
    const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
    if (card && card.dataset.status === 'pending') {
      enableAllCardActions();
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

  // إضافة معالجة لأزرار الإغلاق في مودال التوقيع
  document.querySelectorAll('[data-modal="signatureModal"]').forEach(btn => {
    btn.addEventListener('click', () => {
      // إعادة تفعيل أزرار البطاقة عند الإغلاق
      if (selectedContentId) {
        enableAllCardActions();
      }
      
      // إعادة تفعيل زر التأكيد إذا كان معطلاً
      const btnConfirmSignature = document.getElementById('btnConfirmSignature');
      if (btnConfirmSignature && btnConfirmSignature.disabled) {
        setButtonProcessingState(btnConfirmSignature, false);
      }
    });
  });
  
  function handleCancelClick() {
    // إعادة تفعيل أزرار البطاقة عند الإلغاء
    if (selectedContentId) {
      enableAllCardActions();
    }
    
    closeSignatureModal();
  }
  
  document.getElementById('btnConfirmSignature').addEventListener('click', async () => {
    console.log('🔍 btnConfirmSignature clicked!');
    
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
    
    console.log('🔍 Calling preventDuplicateSignatures...');
    // حماية فورية من النقر المتكرر
    preventDuplicateSignatures();
    
    // حفظ التوقيع في متغير محلي قبل إغلاق النافذة
    const signatureToSend = currentSignature;
    
    console.log('🔍 Calling disableAllCardActions...');
    // تعطيل جميع أزرار البطاقات
    disableAllCardActions();
    
    // إغلاق النافذة المنبثقة فوراً
    closeSignatureModal();
    
    // معالجة التوقيع في الخلفية
    const contentType = card.dataset.type;
    const endpoint = contentType === 'committee' ? 'committee-approvals' : 'approvals';
    
    processSignatureInBackground(selectedContentId, contentType, endpoint, signatureToSend);
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
    console.log('🔍 btnDelegateConfirm clicked!');
    
    const userId = document.getElementById('delegateUser').value;
    const notes = document.getElementById('delegateNotes').value;
    if (!userId) return showToast(getTranslation('please-select-user'), 'warning');
    
    // حماية من النقر المتكرر
    if (!protectFromDoubleClick(btnDelegateConfirm, 'جاري معالجة التفويض...')) {
      return;
    }
    
    console.log('🔍 Calling preventDuplicateSignatures...');
    // حماية فورية من النقر المتكرر
    preventDuplicateSignatures();
    
    console.log('🔍 Calling disableAllCardActions...');
    // تعطيل جميع أزرار البطاقات
    disableAllCardActions();
    
    // إغلاق مودال التفويض
    closeModal('delegateModal');
    
    if (isBulkDelegation) {
      // تفويض جماعي - معالجة مباشرة في الخلفية
      processDelegationInBackground(userId, null, null, notes, true);
    } else {
      // تفويض فردي - معالجة مباشرة في الخلفية
      const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
      if (!card) {
        showToast(getTranslation('error-loading') || 'خطأ في تحميل البيانات', 'error');
        // إعادة تفعيل جميع الأزرار في حالة الخطأ
        enableAllCardActions();
        return;
      }
      const contentType = card.dataset.type;
      processDelegationInBackground(userId, selectedContentId, contentType, notes, false);
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
      enableAllCardActions();
    }
    
    // إعادة تفعيل زر التأكيد إذا كان معطلاً
    const btnDelegateConfirm = document.getElementById('btnDelegateConfirm');
    if (btnDelegateConfirm && btnDelegateConfirm.disabled) {
      setButtonProcessingState(btnDelegateConfirm, false);
    }
    
    closeModal('delegateModal');
  });
}

// إضافة معالجة لأزرار الإغلاق في مودال التفويض
document.querySelectorAll('[data-modal="delegateModal"]').forEach(btn => {
  btn.addEventListener('click', () => {
    // إعادة تفعيل أزرار البطاقة عند الإغلاق
    if (selectedContentId) {
      enableAllCardActions();
    }
    
    // إعادة تفعيل زر التأكيد إذا كان معطلاً
    const btnDelegateConfirm = document.getElementById('btnDelegateConfirm');
    if (btnDelegateConfirm && btnDelegateConfirm.disabled) {
      setButtonProcessingState(btnDelegateConfirm, false);
    }
  });
});

function disableActionsFor(contentId) {
  const row = document.querySelector(`.approval-card[data-id="${contentId}"]`);
  if (!row) return;
  const actionsCell = row.querySelector('.actions');
  if (actionsCell) actionsCell.innerHTML = '';
}

// === File Transfer Modal Logic ===
let currentTransferSequence = [];
let currentTransferUsers = [];
let currentTransferRoles = [];
let currentTransferDeptId = null;
let newDeptUsers = [];
let selectedNewUsers = [];
let selectedNewRoles = [];

async function getApprovalSequenceByDept(deptId) {
  try {
    const res = await fetch(`${apiBase}/departments/${deptId}/approval-sequence`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log('[getApprovalSequenceByDept]', deptId, data.approval_sequence, data.approval_roles);
    return {
      sequence: data.approval_sequence || [],
      roles: data.approval_roles || []
    };
  } catch (err) {
    console.error('[getApprovalSequenceByDept] error', err);
    return { sequence: [], roles: [] };
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
  let roles = [];
  if (item.approval_sequence && Array.isArray(item.approval_sequence)) {
    sequence = item.approval_sequence;
  } else if (item.approval_sequence && typeof item.approval_sequence === 'string') {
    try { sequence = JSON.parse(item.approval_sequence); } catch { sequence = []; }
  } else if (item.department_id) {
    const deptData = await getApprovalSequenceByDept(item.department_id);
    sequence = deptData.sequence;
    roles = deptData.roles;
  }
  currentTransferSequence = sequence.slice();
  currentTransferRoles = roles.slice();
  console.log('[openFileTransferModal] sequence', sequence, 'roles', roles);
  // جلب بيانات المستخدمين
  currentTransferUsers = await getUsersByIds(sequence);
  console.log('[openFileTransferModal] currentTransferUsers', currentTransferUsers);
  // اعرض السلسلة القديمة فقط
  renderTransferChain(currentTransferSequence, currentTransferUsers, [], currentTransferRoles);
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
    renderTransferChain(currentTransferSequence, currentTransferUsers, [], currentTransferRoles);
    return;
  }
  // جلب أعضاء القسم الجديد
  newDeptUsers = await getUsersByDept(deptId);
  selectedNewUsers = Array(count).fill('');
  selectedNewRoles = Array(count).fill('');
  console.log('[handleDeptOrCountChange] newDeptUsers:', newDeptUsers);
  for (let i = 0; i < count; i++) {
    const group = document.createElement('div');
    group.className = 'form-group';
    
    // عنوان اختيار الشخص
    const label = document.createElement('label');
    label.textContent = `${getTranslation('select-person')} ${i+1}`;
    
    // dropdown اختيار الشخص
    const select = document.createElement('select');
    select.className = 'person-select-new';
    select.innerHTML = `<option value="">${getTranslation('select-person')}</option>`;
    newDeptUsers.forEach(user => {
      const opt = document.createElement('option');
      opt.value = user.id;
      opt.textContent = user.name;
      select.appendChild(opt);
    });
    
    // dropdown اختيار الدور
    const roleSelect = document.createElement('select');
    roleSelect.className = 'person-role-select';
    roleSelect.innerHTML = `
      <option value="">${getTranslation('select-role') || 'اختر الدور'}</option>
      <option value="prepared">${getTranslation('prepared') || 'Prepared'}</option>
      <option value="updated">${getTranslation('updated') || 'Updated'}</option>
      <option value="reviewed">${getTranslation('reviewed') || 'Reviewed'}</option>
      <option value="approved">${getTranslation('approved') || 'Approved'}</option>
    `;
    
    // معالج تغيير الشخص
    select.onchange = function() {
      selectedNewUsers[i] = select.value;
      console.log('[person-select-new] selectedNewUsers:', selectedNewUsers);
      renderTransferChain(currentTransferSequence, currentTransferUsers, selectedNewUsers, currentTransferRoles);
    };
    
    // معالج تغيير الدور
    roleSelect.onchange = function() {
      // تحديث الدور في المصفوفة
      if (!selectedNewUsers[i]) return; // لا تحدث الدور إذا لم يتم اختيار شخص
      
      const selectedRole = roleSelect.value;
      selectedNewRoles[i] = selectedRole;
      console.log(`[person-role-select] Person ${i+1} role changed to:`, selectedRole);
      console.log('[person-role-select] selectedNewRoles:', selectedNewRoles);
      
      // تحديث السلسلة مع الأدوار الجديدة
      renderTransferChain(currentTransferSequence, currentTransferUsers, selectedNewUsers, currentTransferRoles);
    };
    
    // إضافة العناصر للمجموعة
    group.appendChild(label);
    group.appendChild(select);
    group.appendChild(roleSelect);
    
    // إضافة CSS للمجموعة
    group.style.cssText = `
      margin-bottom: 15px;
      padding: 10px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #f9f9f9;
    `;
    
    // تنسيق العناصر
    select.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-bottom: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    `;
    
    roleSelect.style.cssText = `
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      background: white;
    `;
    
    document.getElementById('personsFields').appendChild(group);
  }
  renderTransferChain(currentTransferSequence, currentTransferUsers, selectedNewUsers, currentTransferRoles);
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
async function renderTransferChain(sequence, users, newUserIdsArr, roles = []) {
  console.log('renderTransferChain called, nodes:', sequence, newUserIdsArr, 'roles:', roles);
  const chainDiv = document.getElementById('transferPersonsChain');
  chainDiv.innerHTML = '';
  let oldNodes = [];
  let newNodes = [];

  // 1. الأشخاص القدامى
  sequence.forEach((uid, index) => {
    const user = users.find(u => u.id == uid);
    const role = roles[index] || '';
    oldNodes.push({
      id: user ? user.id : uid,
      name: user ? user.name : uid,
      departmentId: user ? (user.departmentId || user.department_id) : undefined,
      isNew: false,
      role: role
    });
  });

  // 2. الأشخاص الجدد
  if (Array.isArray(newUserIdsArr)) {
    newUserIdsArr.forEach((uid, index) => {
      if (!uid) return;
      const user = newDeptUsers.find(u => u.id == uid);
      const role = selectedNewRoles[index] || '';
      newNodes.push({
        id: user ? user.id : uid,
        name: user ? user.name : uid,
        departmentId: user ? (user.departmentId || user.department_id) : undefined,
        isNew: true,
        role: role
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
      
      // إضافة شارة الدور إذا كان موجوداً
      let roleBadge = '';
      if (node.role) {
        const roleText = getRoleTranslation(node.role);
        roleBadge = `<div class="role-badge role-${node.role}">${roleText}</div>`;
      }
      
      personNode.innerHTML = `
        <div class="person-circle"><i class="fa fa-user"></i></div>
        <div class="person-name">${node.name}</div>
        ${roleBadge}
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

// إضافة معالجة لأزرار الإغلاق في مودال التحويل
document.querySelectorAll('[data-modal="fileTransferModal"]').forEach(btn => {
  btn.addEventListener('click', () => {
    // إعادة تفعيل أزرار البطاقة عند الإغلاق
    if (selectedContentId) {
      enableAllCardActions();
    }
    
    // إعادة تفعيل زر التأكيد إذا كان معطلاً
    const btnTransferConfirm = document.getElementById('btnTransferConfirm');
    if (btnTransferConfirm && btnTransferConfirm.disabled) {
      setButtonProcessingState(btnTransferConfirm, false);
    }
  });
});

document.getElementById('btnTransferConfirm').addEventListener('click', async function(e) {
  e.preventDefault();
  // التسلسل النهائي = القدامى + الجدد (بدون فراغات)
  const finalSequence = [
    ...currentTransferSequence,
    ...selectedNewUsers.filter(Boolean)
  ];
  
  // الأدوار النهائية = القدامى + الجدد (بدون فراغات)
  const finalRoles = [
    ...currentTransferRoles,
    ...selectedNewRoles.filter((role, index) => selectedNewUsers[index]) // فقط الأدوار للأشخاص المختارين
  ];
  
  if (!selectedContentId || !finalSequence.length) {
    showToast(getTranslation('all-fields-required'), 'warning');
    return;
  }
  
  // التحقق من أن عدد الأدوار يساوي عدد الأشخاص
  if (finalSequence.length !== finalRoles.length) {
    console.warn('[btnTransferConfirm] Sequence and roles length mismatch:', finalSequence.length, finalRoles.length);
    // إضافة أدوار فارغة للأشخاص الذين ليس لديهم أدوار
    while (finalRoles.length < finalSequence.length) {
      finalRoles.push('');
    }
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
        finalRoles.push('approved'); // المدير دائماً معتمد
      }
    } catch (err) {
      // إذا فشل الجلب، تجاهل إضافة المدير
    }
    
    console.log('[btnTransferConfirm] Final sequence:', finalSequence);
    console.log('[btnTransferConfirm] Final roles:', finalRoles);
    
    await fetch(`${apiBase}/contents/${selectedContentId}/approval-sequence`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ 
        approval_sequence: finalSequence,
        approval_roles: finalRoles
      })
    });
    closeFileTransferModal();
    showToast(getTranslation('confirm-transfer'), 'success');
  } catch (err) {
    console.error('[btnTransferConfirm] Error:', err);
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
  // استخدام دالة closeModal المحسنة
  closeModal('fileTransferModal');
}

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
    filesList = `<p class="files-summary">${getTranslation('comprehensive-delegation')}</p>`;
  } else {
    filesList = '<div class="files-list">';
    files.forEach(file => {
      filesList += `<div class="file-item">
        <span class="file-name">${file.title || file.name}</span>
        <span class="file-type">${getTranslation('department-report')}</span>
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
      <h3>${getTranslation('delegation-confirmation')}</h3>
      <button class="close-btn" onclick="closeDelegationConfirmationPopup()">&times;</button>
    `;
  
  // Body
  const body = document.createElement('div');
  body.className = 'delegation-body';
  
  // Delegator info
  const delegatorInfoDiv = document.createElement('div');
  delegatorInfoDiv.className = 'delegator-info';
      delegatorInfoDiv.innerHTML = `
      <h4>${getTranslation('delegator-info')}</h4>
      <div class="info-row">
        <span class="label">${getTranslation('full-name')}:</span>
        <span class="value">${delegatorInfo.fullName}</span>
      </div>
      <div class="info-row">
        <span class="label">${getTranslation('id-number')}:</span>
        <span class="value">${delegatorInfo.idNumber}</span>
      </div>
    `;
  
  // Delegate info
  const delegateInfoDiv = document.createElement('div');
  delegateInfoDiv.className = 'delegate-info';
      delegateInfoDiv.innerHTML = `
      <h4>${getTranslation('delegate-info')}</h4>
      <div class="info-row">
        <span class="label">${getTranslation('full-name')}:</span>
        <span class="value">${delegateInfo.fullName}</span>
      </div>
      <div class="info-row">
        <span class="label">${getTranslation('id-number')}:</span>
        <span class="value">${delegateInfo.idNumber}</span>
      </div>
    `;
  
  // Delegation details
  const detailsDiv = document.createElement('div');
  detailsDiv.className = 'delegation-details';
      detailsDiv.innerHTML = `
      <h4>${getTranslation('delegation-details')}</h4>
      <div class="delegation-type">
        <span class="label">${getTranslation('delegation-type')}:</span>
        <span class="value">${isBulk ? getTranslation('comprehensive-delegation') : getTranslation('single-delegation')}</span>
      </div>
      ${filesList}
    `;
  
  // Delegation statement
  const statementDiv = document.createElement('div');
  statementDiv.className = 'delegation-statement';
      statementDiv.innerHTML = `
      <p class="statement-text">
        ${getTranslation('delegation-confirmation-message')} <strong>${delegateInfo.fullName}</strong> 
        ${getTranslation('delegation-confirmation-message-2')} <strong>${delegateInfo.idNumber}</strong> 
        ${getTranslation('delegation-confirmation-message-3')} ${isBulk ? getTranslation('delegation-confirmation-message-5') : getTranslation('delegation-confirmation-message-4')}.
      </p>
    `;
  
  // Signature section - إضافة كانفاس للتوقيع
  const signatureSection = document.createElement('div');
  signatureSection.className = 'delegation-signature-section';
      signatureSection.innerHTML = `
      <h4>${getTranslation('delegation-signature-section')}</h4>
      <div class="signature-canvas-container">
        <div class="signature-controls" style="margin-top: 10px;">
          <button type="button" onclick="clearSignatureCanvas()" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; margin-right: 5px; cursor: pointer;">
            ${getTranslation('clear')}
          </button>
        </div>
      </div>
    `;
  
  // Footer
  const footer = document.createElement('div');
  footer.className = 'delegation-footer';
      footer.innerHTML = `
      <button class="btn btn-danger" onclick="rejectDelegation()">${getTranslation('reject-delegation')}</button>
      <button class="btn btn-secondary" onclick="closeDelegationConfirmationPopup()">${getTranslation('cancel-delegation')}</button>
      <button class="btn btn-primary" onclick="confirmDelegation()">${getTranslation('confirm-delegation')}</button>
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
    // إعادة تعيين حالة جميع الأزرار في البوب أب قبل الإزالة
    const allButtons = popup.querySelectorAll('button');
    allButtons.forEach(button => {
      // إعادة تفعيل الزر
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
      button.style.pointerEvents = 'auto';
      
      // إزالة جميع classes المعالجة
      button.classList.remove('loading', 'processing');
      
      // إعادة تعيين CSS
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '';
      button.style.filter = '';
      
      // إعادة النص الأصلي إذا كان محفوظاً
      if (button.dataset.originalText) {
        button.innerHTML = button.dataset.originalText;
      }
    });
    
    // إزالة البوب أب
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
          enableAllCardActions();
    }
  }
  
  // إعادة تفعيل أزرار البطاقة إذا كان هناك contentId في بيانات التفويض
  if (currentDelegationData && currentDelegationData.contentId) {
    enableAllCardActions();
  }
  
  // إعادة تعيين متغيرات التفويض
  currentDelegationData = null;
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
        message = getTranslation('delegation-committee-sent');
      } else {
        message = getTranslation('delegation-sent-success');
      }
      showToast(message, 'success');
      closeDelegationConfirmationPopup();
      disableActionsFor(data.contentId);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showToast(result.message || getTranslation('delegation-failed'), 'error');
      // إعادة تفعيل أزرار البطاقة في حالة الفشل
      if (data.contentId) {
        enableAllCardActions();
      }
    }
  } catch (error) {
    console.error('🔍 Error processing single delegation:', error);
    showToast('خطأ في إرسال طلب التفويض', 'error');
    // إعادة تفعيل أزرار البطاقة في حالة الخطأ
    if (data.contentId) {
      enableAllCardActions();
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
        enableAllCardActions();
      }
    }
  } catch (error) {
    console.error('🔍 Error processing bulk delegation:', error);
    showToast('خطأ في إرسال طلب التفويض الشامل', 'error');
    // إعادة تفعيل أزرار البطاقة في حالة الخطأ
    if (data.contentId) {
      enableAllCardActions();
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
      showToast(getTranslation('delegation-error-loading'), 'error');
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
      showToast(getTranslation('delegation-error-loading'), 'error');
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
      showToast(getTranslation('delegation-error-loading'), 'error');
      return;
    }
    
    const contentData = await contentResponse.json();
    console.log('[showSingleDelegationConfirmation] Content data:', contentData);
    
    if (contentData.status !== 'success') {
      showToast(getTranslation('delegation-error-loading'), 'error');
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
    showToast(getTranslation('delegation-error-processing'), 'error');
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
      showToast(getTranslation('delegation-error-loading'), 'error');
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
      showToast(getTranslation('delegation-error-loading'), 'error');
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
    showToast(getTranslation('delegation-error-processing'), 'error');
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
      const contentType = card.dataset.type || getTranslation('department');
      
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
      await handleSingleDelegation(delegateTo, selectedContentId, getTranslation('department'), notes);
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

// إضافة معالجة شاملة لجميع أزرار الإغلاق
document.addEventListener('DOMContentLoaded', function() {
  // معالجة جميع أزرار الإغلاق في جميع المودالز
  const allCloseButtons = document.querySelectorAll('.modal-close, [data-modal]');
  
  allCloseButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const modalId = this.dataset.modal || this.closest('.modal-overlay')?.id;
      if (!modalId) return;
      
      // إعادة تعيين حالة جميع الأزرار في المودال
      resetModalButtons(modalId);
      
      // إعادة تفعيل أزرار البطاقة إذا كان هناك contentId محدد
      if (selectedContentId) {
        const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
        if (card && card.dataset.status === 'pending') {
          enableAllCardActions();
        }
      }
      
      // إعادة تعيين أزرار خاصة في بعض المودالز
      if (modalId === 'qrModal') {
        const btnElectronicApprove = document.getElementById('btnElectronicApprove');
        if (btnElectronicApprove && btnElectronicApprove.disabled) {
          setButtonProcessingState(btnElectronicApprove, false);
        }
      } else if (modalId === 'rejectModal') {
        const btnSendReason = document.getElementById('btnSendReason');
        if (btnSendReason && btnSendReason.disabled) {
          setButtonProcessingState(btnSendReason, false);
        }
      } else if (modalId === 'delegateModal') {
        const btnDelegateConfirm = document.getElementById('btnDelegateConfirm');
        if (btnDelegateConfirm && btnDelegateConfirm.disabled) {
          setButtonProcessingState(btnDelegateConfirm, false);
        }
      } else if (modalId === 'fileTransferModal') {
        const btnTransferConfirm = document.getElementById('btnTransferConfirm');
        if (btnTransferConfirm && btnTransferConfirm.disabled) {
          setButtonProcessingState(btnTransferConfirm, false);
        }
      } else if (modalId === 'signatureModal') {
        const btnConfirmSignature = document.getElementById('btnConfirmSignature');
        if (btnConfirmSignature && btnConfirmSignature.disabled) {
          setButtonProcessingState(btnConfirmSignature, false);
        }
      }
    });
  });
  
  // معالجة إضافية لأزرار الإغلاق (×)
  const closeButtons = document.querySelectorAll('.close-btn, .modal-close');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      // إعادة تعيين حالة جميع الأزرار في جميع المودالز المفتوحة
      resetAllModalButtons();
      
      // إعادة تعيين حالة جميع الأزرار في البوب أبز
      resetAllPopupButtons();
      
      // إعادة تفعيل أزرار البطاقة إذا كان هناك contentId محدد
      if (selectedContentId) {
        const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
        if (card && card.dataset.status === 'pending') {
          enableAllCardActions();
        }
      }
    });
  });
  
  // معالجة إغلاق النافذة أو تغيير الصفحة
  window.addEventListener('beforeunload', function() {
    resetAllModalButtons();
    resetAllPopupButtons();
    // لا نغلق النوافذ عند تغيير الصفحة - دع المستخدم يغلقها يدوياً
    // forceCloseAllPopups();
  });
  
  // معالجة النقر خارج المودال
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay') || e.target.classList.contains('modal')) {
      const modalId = e.target.id;
      if (modalId) {
        resetModalButtons(modalId);
        if (selectedContentId) {
          const card = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`);
          if (card && card.dataset.status === 'pending') {
            enableAllCardActions();
          }
        }
      }
    }
  });
  
  // إضافة مستمعي أحداث عالمي للنقر خارج النوافذ المنبثقة
  // تم تعطيل هذا المستمع لأنه يغلق النوافذ عند النقر في أي مكان
  // document.addEventListener('click', function(e) {
  //   if (!e.target.closest('.modal') && !e.target.closest('.delegation-confirmation-popup')) {
  //     forceCloseAllPopups();
  //   }
  // });
});

// دوال المعالجة في الخلفية
async function processSignatureInBackground(contentId, contentType, endpoint, signature) {
  try {
    console.log('🔍 Processing signature in background for:', contentId);
    
    const payload = {
      approved: true,
      signature: signature,
      notes: ''
    };
    
    // جلب معلومات التفويض من جدول active_delegations
    try {
      const tokenPayload = await safeGetUserInfo(token);
      console.log('[SIGN] Fetching delegation status for user:', tokenPayload.id);
      const delegationResponse = await fetch(`${apiBase}/approvals/delegation-status/${tokenPayload.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (delegationResponse.ok) {
        const delegationData = await delegationResponse.json();
        if (delegationData.status === 'success' && delegationData.data && delegationData.data.delegated_by) {
          payload.on_behalf_of = delegationData.data.delegated_by;
          console.log('[SIGN] Found delegation, sending on_behalf_of:', delegationData.data.delegated_by);
        }
      }
    } catch (err) {
      console.error('[SIGN] Error fetching delegation status:', err);
    }
    
    const response = await fetchJSON(`${apiBase}/${endpoint}/${contentId}/approve`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    console.log('🔍 Signature processed successfully:', response);
    showToast(getTranslation('success-sent'), 'success');
    
    // تحديث واجهة المستخدم
    updateApprovalStatusInUI(contentId, 'approved');
    disableActionsFor(contentId);
    
  } catch (error) {
    console.error('🔍 Error processing signature in background:', error);
    showToast(getTranslation('error-sending'), 'error');
  } finally {
    // إعادة تفعيل جميع الأزرار
    enableAllCardActions();
    
    // إعادة تعيين المتغيرات
    selectedContentId = null;
    currentSignature = null;
    
    // لا نغلق النوافذ هنا - دع المستخدم يغلقها يدوياً
    // forceCloseAllPopups();
  }
}

async function processElectronicSignatureInBackground(contentId, contentType, endpoint) {
  try {
    console.log('🔍 Processing electronic signature in background for:', contentId);
    
    const response = await fetchJSON(`${apiBase}/${endpoint}/${contentId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        approved: true,
        signature: null,
        electronic_signature: true,
        notes: ''
      })
    });
    
    console.log('🔍 Electronic signature processed successfully:', response);
    showToast(getTranslation('success-sent'), 'success');
    
    // تحديث واجهة المستخدم
    updateApprovalStatusInUI(contentId, 'approved');
    disableActionsFor(contentId);
    
  } catch (error) {
    console.error('🔍 Error processing electronic signature in background:', error);
    showToast(getTranslation('error-sending'), 'error');
  } finally {
    // إعادة تفعيل جميع الأزرار
    enableAllCardActions();
    
    // إعادة تعيين المتغيرات
    selectedContentId = null;
    
    // لا نغلق النوافذ هنا - دع المستخدم يغلقها يدوياً
    // forceCloseAllPopups();
  }
}

async function processRejectionInBackground(contentId, endpoint, reason) {
  try {
    console.log('🔍 Processing rejection in background for:', contentId);
    
    const response = await fetchJSON(`${apiBase}/contents/rejections/${contentId}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    
    console.log('🔍 Rejection processed successfully:', response);
    showToast(getTranslation('success-rejected'), 'success');
    
    // تحديث واجهة المستخدم
    updateApprovalStatusInUI(contentId, 'rejected');
    disableActionsFor(contentId);
    
  } catch (error) {
    console.error('🔍 Error processing rejection in background:', error);
    showToast(getTranslation('error-sending'), 'error');
  } finally {
    // إعادة تفعيل جميع الأزرار
    enableAllCardActions();
    
    // إعادة تعيين المتغيرات
    selectedContentId = null;
    
    // لا نغلق النوافذ هنا - دع المستخدم يغلقها يدوياً
    // forceCloseAllPopups();
  }
}

async function processDelegationInBackground(delegateTo, contentId, contentType, notes, isBulk = false) {
  try {
    console.log('🔍 Processing delegation in background:', { delegateTo, contentId, contentType, notes, isBulk });
    
    let endpoint;
    let requestBody;
    
    if (isBulk) {
      endpoint = `${apiBase}/approvals/delegate-all`;
      requestBody = {
        delegateTo: delegateTo,
        notes: notes
      };
    } else {
      if (contentType === 'committee') {
        endpoint = `${apiBase}/committee-approvals/committee-delegations/single`;
      } else {
        endpoint = `${apiBase}/approvals/${contentId}/delegate`;
      }
      requestBody = {
        delegateTo: delegateTo,
        notes: notes
      };
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      let message;
      if (isBulk) {
        message = 'تم إرسال طلب التفويض الشامل بنجاح';
      } else if (contentType === 'committee') {
        message = getTranslation('delegation-committee-sent');
      } else {
        message = getTranslation('delegation-sent-success');
      }
      showToast(message, 'success');
      
      if (!isBulk) {
        disableActionsFor(contentId);
      }
      
      // إعادة تحميل الصفحة بعد فترة
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      showToast(result.message || getTranslation('delegation-failed'), 'error');
    }
    
  } catch (error) {
    console.error('🔍 Error processing delegation in background:', error);
    showToast('خطأ في إرسال طلب التفويض', 'error');
  } finally {
    // إعادة تفعيل جميع الأزرار
    enableAllCardActions();
    
    // إعادة تعيين المتغيرات
    selectedContentId = null;
    isBulkDelegation = false;
    
    // لا نغلق النوافذ هنا - دع المستخدم يغلقها يدوياً
    // forceCloseAllPopups();
  }
}
