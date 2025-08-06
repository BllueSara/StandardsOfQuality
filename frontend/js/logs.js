document.addEventListener('DOMContentLoaded', () => {
  const fromDateInput    = document.getElementById('from-date');
  const toDateInput      = document.getElementById('to-date');
  const actionTypeSelect = document.getElementById('action-type');
  const userNameSelect   = document.getElementById('user-name');
  const searchInput      = document.getElementById('search-input');
  const logsBody         = document.getElementById('logs-body');
  
  // متغيرات جديدة للحذف والتحديد
  const headerSelectAllCheckbox = document.getElementById('header-select-all');
  const deleteSelectedBtn = document.getElementById('delete-selected');
  const deleteAllBtn = document.getElementById('delete-all');
  
  // مصفوفة لتخزين السجلات المحددة
  let selectedLogs = [];
  let allLogs = [];

  function authHeader() {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }

  // دالة لعرض رسائل التأكيد
  function showConfirmDialog(message, onConfirm) {
    const lang = localStorage.getItem('language') || 'ar';
    const confirmText = lang === 'ar' ? 'تأكيد' : 'Confirm';
    const cancelText = lang === 'ar' ? 'إلغاء' : 'Cancel';
    
    if (confirm(message)) {
      onConfirm();
    }
  }

  // دالة لعرض رسائل النجاح والخطأ
  function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // دالة حذف سجل واحد
  async function deleteLog(logId) {
    try {
      const response = await fetch(`http://localhost:3006/api/users/logs/${logId}`, {
        method: 'DELETE',
        headers: {
          ...authHeader(),
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        showToast(getTranslation('log-deleted-successfully') || 'تم حذف السجل بنجاح');
        loadLogs(); // إعادة تحميل السجلات
      } else {
        const errorData = await response.json();
        showToast(errorData.message || getTranslation('error-deleting-log') || 'خطأ في حذف السجل', 'error');
      }
    } catch (error) {
      console.error('Error deleting log:', error);
      showToast(getTranslation('error-deleting-log') || 'خطأ في حذف السجل', 'error');
    }
  }

  // دالة حذف سجلات متعددة
  async function deleteMultipleLogs(logIds) {
    try {
      const response = await fetch('http://localhost:3006/api/users/logs/bulk-delete', {
        method: 'DELETE',
        headers: {
          ...authHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ logIds })
      });

      if (response.ok) {
        showToast(getTranslation('logs-deleted-successfully') || 'تم حذف السجلات بنجاح');
        loadLogs(); // إعادة تحميل السجلات
      } else {
        const errorData = await response.json();
        showToast(errorData.message || getTranslation('error-deleting-logs') || 'خطأ في حذف السجلات', 'error');
      }
    } catch (error) {
      console.error('Error deleting logs:', error);
      showToast(getTranslation('error-deleting-logs') || 'خطأ في حذف السجلات', 'error');
    }
  }

  // دالة حذف جميع السجلات
  async function deleteAllLogs() {
    try {
      const response = await fetch('http://localhost:3006/api/users/logs/delete-all', {
        method: 'DELETE',
        headers: {
          ...authHeader(),
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        showToast(getTranslation('all-logs-deleted-successfully') || 'تم حذف جميع السجلات بنجاح');
        loadLogs(); // إعادة تحميل السجلات
      } else {
        const errorData = await response.json();
        showToast(errorData.message || getTranslation('error-deleting-all-logs') || 'خطأ في حذف جميع السجلات', 'error');
      }
    } catch (error) {
      console.error('Error deleting all logs:', error);
      showToast(getTranslation('error-deleting-all-logs') || 'خطأ في حذف جميع السجلات', 'error');
    }
  }

  // دالة تصدير السجلات
  async function exportLogs() {
    try {
      const exportBtn = document.getElementById('export-logs');
      const originalText = exportBtn.innerHTML;
      
      // تغيير نص الزر أثناء التصدير
      exportBtn.innerHTML = `
        <i class="fas fa-spinner fa-spin"></i>
        <span>${getTranslation('exporting-logs') || 'جاري التصدير...'}</span>
      `;
      exportBtn.disabled = true;

      const response = await fetch('http://localhost:3006/api/users/logs/export/excel', {
        method: 'GET',
        headers: authHeader()
      });

      if (response.ok) {
        // تحميل الملف
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `system_logs_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast(getTranslation('logs-exported-successfully') || 'تم تصدير السجلات بنجاح');
      } else {
        const errorData = await response.json();
        showToast(errorData.message || getTranslation('error-exporting-logs') || 'خطأ في تصدير السجلات', 'error');
      }
    } catch (error) {
      console.error('Error exporting logs:', error);
      showToast(getTranslation('error-exporting-logs') || 'خطأ في تصدير السجلات', 'error');
    } finally {
      // إعادة نص الزر الأصلي
      const exportBtn = document.getElementById('export-logs');
      exportBtn.innerHTML = `
        <i class="fas fa-file-excel"></i>
        <span data-translate="export-logs">تصدير السجلات</span>
      `;
      exportBtn.disabled = false;
    }
  }

  // دالة تحديث حالة أزرار الحذف
  function updateDeleteButtons() {
    const hasSelected = selectedLogs.length > 0;
    deleteSelectedBtn.disabled = !hasSelected;
    
    // تحديث نص زر حذف المحدد
    const selectedCount = selectedLogs.length;
    const deleteSelectedText = getTranslation('delete-selected') || 'حذف المحدد';
    deleteSelectedBtn.innerHTML = `
      <i class="fas fa-trash"></i>
      <span>${deleteSelectedText} (${selectedCount})</span>
    `;
  }

  // دالة تحديث حالة تحديد الكل
  function updateSelectAllState() {
    const totalLogs = allLogs.length;
    const selectedCount = selectedLogs.length;
    
      // تحديث حالة checkbox تحديد الكل
  if (selectedCount === 0) {
    headerSelectAllCheckbox.checked = false;
    headerSelectAllCheckbox.indeterminate = false;
  } else if (selectedCount === totalLogs) {
    headerSelectAllCheckbox.checked = true;
    headerSelectAllCheckbox.indeterminate = false;
  } else {
    headerSelectAllCheckbox.checked = false;
    headerSelectAllCheckbox.indeterminate = true;
  }
  }

  // دالة تحديد/إلغاء تحديد سجل
  function toggleLogSelection(logId, checkbox) {
    if (checkbox.checked) {
      if (!selectedLogs.includes(logId)) {
        selectedLogs.push(logId);
      }
    } else {
      selectedLogs = selectedLogs.filter(id => id !== logId);
    }
    
    updateDeleteButtons();
    updateSelectAllState();
  }

  // دالة تحديد/إلغاء تحديد الكل
  function toggleSelectAll(checked) {
    selectedLogs = checked ? allLogs.map(log => log.id) : [];
    
    // تحديث جميع checkboxes في الجدول
    const logCheckboxes = document.querySelectorAll('.log-checkbox');
    logCheckboxes.forEach(checkbox => {
      checkbox.checked = checked;
    });
    
    updateDeleteButtons();
    updateSelectAllState();
  }

  // دالة للحصول على الترجمة
  function getTranslation(key) {
    const lang = localStorage.getItem('language') || 'ar';
    const translations = window.translations || {};
    return translations[lang]?.[key] || key;
  }

  // دالة لمعالجة البيانات واستخراج النص الصحيح
  function extractTextFromData(data) {
    if (typeof data === 'string') {
      // محاولة تحليل JSON إذا كان النص يبدو كـ JSON
      if (data.startsWith('{') && data.endsWith('}')) {
        try {
          const parsed = JSON.parse(data);
          const lang = localStorage.getItem('language') || 'ar';
          return parsed[lang] || parsed['ar'] || parsed['en'] || data;
        } catch (e) {
          return data;
        }
      }
      return data;
    } else if (typeof data === 'object' && data !== null) {
      // إذا كان object، محاولة استخراج النص باللغة المناسبة
      const lang = localStorage.getItem('language') || 'ar';
      return data[lang] || data['ar'] || data['en'] || JSON.stringify(data);
    }
    return data || '';
  }

  // دالة لمعالجة النصوص ثنائية اللغة في الوصف
  function processBilingualText(text) {
    if (typeof text !== 'string') return text;
    
    const lang = localStorage.getItem('language') || 'ar';
    
    // إذا كان النص يحتوي على JSON، حاول تحليله أولاً
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(text);
        return parsed[lang] || parsed['ar'] || parsed['en'] || text;
      } catch (e) {
        // إذا فشل التحليل، اترك النص كما هو
      }
    }
    
    // البحث عن أنماط JSON مختلفة في النص
    const jsonPatterns = [
      /\{[^{}]*"ar"[^{}]*"en"[^{}]*\}/g,
      /\{[^{}]*"en"[^{}]*"ar"[^{}]*\}/g,
      /\{[^{}]*"ar"[^{}]*\}/g,
      /\{[^{}]*"en"[^{}]*\}/g
    ];
    
    let processedText = text;
    
    jsonPatterns.forEach(pattern => {
      const matches = processedText.match(pattern);
      if (matches) {
        matches.forEach(match => {
          try {
            const parsed = JSON.parse(match);
            const translatedText = parsed[lang] || parsed['ar'] || parsed['en'] || match;
            processedText = processedText.replace(match, translatedText);
          } catch (e) {
            // إذا فشل التحليل، اترك النص كما هو
          }
        });
      }
    });
    
    return processedText;
  }

  // دالة لاستخراج المعلومات من الوصف
  function extractInfoFromDescription(desc) {
    const info = {
      folderName: '',
      departmentName: '',
      oldName: '',
      newName: '',
      userName: '',
      newRole: '',
      contentName: ''
    };

    // استخراج اسم المجلد
    const folderMatch = desc.match(/مجلد باسم: ([^،]+)/);
    if (folderMatch) {
      info.folderName = folderMatch[1];
    }

    // استخراج اسم القسم
    const deptMatch = desc.match(/في قسم: ([^،]+)/);
    if (deptMatch) {
      info.departmentName = deptMatch[1];
    }

    // استخراج الأسماء القديمة والجديدة (للتعديل)
    const oldNewMatch = desc.match(/من: ([^إ]+) إلى: ([^،]+)/);
    if (oldNewMatch) {
      info.oldName = oldNewMatch[1].trim();
      info.newName = oldNewMatch[2].trim();
    }

    // استخراج اسم المستخدم
    const userMatch = desc.match(/للمستخدم: ([^،]+)/);
    if (userMatch) {
      info.userName = userMatch[1];
    }

    // استخراج الدور الجديد
    const roleMatch = desc.match(/إلى: ([^،]+)/);
    if (roleMatch) {
      info.newRole = roleMatch[1];
    }

    // استخراج اسم المحتوى
    const contentMatch = desc.match(/محتوى: ([^،]+)/);
    if (contentMatch) {
      info.contentName = contentMatch[1];
    }

    return info;
  }

  // دالة لترجمة رسائل السجلات
  function translateLogMessage(description, action, info) {
    const lang = localStorage.getItem('language') || 'ar';
    
    // ترجمة الرسائل حسب نوع الإجراء مع إضافة المعلومات المستخرجة
    const translations = {
      ar: {
        'approve_content': `تم اعتماد المحتوى: ${info.contentName}`,
        'reject_content': `تم رفض المحتوى: ${info.contentName}`,
        'sign_document': 'تم توقيع المستند'
      },
      en: {
        'approve_content': `Approved content: ${info.contentName}`,
        'reject_content': `Rejected content: ${info.contentName}`,
        'sign_document': 'Signed document'
      }
    };

    // إذا كان الإجراء معروف، استخدم الترجمة
    if (translations[lang] && translations[lang][action]) {
      // التحقق من وجود المعلومات المطلوبة
      const hasRequiredInfo = Object.values(info).some(value => value && value.trim() !== '');
      if (hasRequiredInfo) {
        return translations[lang][action];
      } else {
        // إذا لم تكن هناك معلومات كافية، استخدم الوصف الأصلي
        return description;
      }
    }

    // إذا لم يكن معروف، استخدم الوصف الأصلي
    return description;
  }

  // دالة لترجمة أسماء الإجراءات
  function translateActionName(action) {
    const lang = localStorage.getItem('language') || 'ar';
    
    const actionTranslations = {
      ar: {
        'create_folder': 'إنشاء مجلد',
        'update_folder': 'تعديل مجلد',
        'delete_folder': 'حذف مجلد',
        'add_folder_name': 'إضافة اسم مجلد',
        'update_folder_name': 'تعديل اسم مجلد',
        'delete_folder_name': 'حذف اسم مجلد',
        'add_content': 'إضافة محتوى',
        'add_folder': 'إضافة مجلد',
        'update_content': 'تعديل محتوى',
        'delete_content': 'حذف محتوى',
        'add_department': 'إضافة قسم',
        'update_department': 'تعديل قسم',
        'delete_department': 'حذف قسم',
        'add_user': 'إضافة مستخدم',
        'update_user': 'تعديل مستخدم',
        'delete_user': 'حذف مستخدم',
        'change_role': 'تغيير دور',
        'login': 'تسجيل دخول',
        'register_user': 'تسجيل مستخدم جديد',
        'create_ticket': 'إنشاء حدث عارض',
        'update_ticket': 'تعديل حدث عارض',
        'delete_ticket': 'حذف حدث عارض',
        'add_reply': 'إضافة رد',
        'approve_content': 'اعتماد محتوى',
        'reject_content': 'رفض محتوى',
        'sign_document': 'توقيع مستند',
        'delegate_committee_signature': 'تفويض توقيع اللجنة',
        'delegate_signature': 'تفويض توقيع',
        'approve_committee_content': 'اعتماد محتوى اللجنة',
        'reject_committee_content': 'رفض محتوى اللجنة',
        'send_committee_approval_request': 'ارسال طلب اعتماد للجنة',
        'send_approval_request': 'ارسال طلب اعتماد',
        'add_user_permission': 'اضافة صلاحية للمستخدم',
        'update_user_permissions': 'تعديل صلاحيات المستخدم',
        'remove_user_permission': 'حذف صلاحية المستخدم',
        'assign_ticket_multiple': 'تعيين حدث عارض لعدة مستخدمين',
        'notify_content_expired': ' انتهاء صلاحية المحتوى',
        'notify_content_expiry_soon_day': ' انتهاء صلاحية المحتوى قريبا',
        'notify_content_expiry_soon_month': ' انتهاء صلاحية المحتوى بعد شهر',
        'view_department_content' : 'عرض محتوى القسم',
        'view_committee_content' : 'عرض محتوى اللجنة',
        'view_ticket': 'عرض الحدث العارض',
        'add_committee': 'اضافة لجنة',
        'delete_committee': 'حذف لجنة',
        'update_committee': 'تعديل لجنة',
        'add_content_name': 'اضافة اسم محتوى',
        'update_content_name': 'تعديل اسم محتوى',
        'delete_content_name': 'حذف اسم محتوى',
      },
      en: {
        'create_folder': 'Create Folder',
        'add_committee': 'Add Committee',
        'update_committee': 'Update Committee',
        'delete_committee': 'Delete Committee',
        'add_content_name': 'Add Content Name',
        'update_content_name': 'Update Content Name',
        'delete_content_name': 'Delete Content Name',

        'view_ticket': 'View OVR',
        'assign_ticket_multiple': 'Assign Ticket to Multiple Users',
        'delegate_committee_signature': 'Delegate Committee Signature',
        'notify_content_expiry_soon_day': 'Content Expiry Soon',
        "notify_content_expiry_soon_month": "Content Expiry After Month",
        'view_department_content': 'View Department Content',
        'view_committee_content': 'View Committee Content',

        'approve_committee_content': 'Approve Committee Content',
        'reject_committee_content': 'Reject Committee Content',
        'send_committee_approval_request': 'Send Committee Approval Request',
        'notify_content_expired': ' Content Expired',
        'send_approval_request': 'Send Approval Request',
        'add_user_permission': 'Add User Permission',
        'update_user_permissions': 'Update User Permissions',
        'remove_user_permission': 'Remove User Permission',
        'add_folder': 'Add Folder',
        'update_folder': 'Update Folder',
        'delete_folder': 'Delete Folder',
        'add_folder_name': 'Add Folder Name',
        'update_folder_name': 'Update Folder Name',
        'delete_folder_name': 'Delete Folder Name',
        'add_content': 'Add Content',
        'update_content': 'Update Content',
        'delete_content': 'Delete Content',
        'add_department': 'Add Department',
        'update_department': 'Update Department',
        'delete_department': 'Delete Department',
        'add_user': 'Add User',
        'update_user': 'Update User',
        'delete_user': 'Delete User',
        'change_role': 'Change Role',
        'login': 'Login',
        'register_user': 'Register User',
        'create_ticket': 'Create OVR',
        'update_ticket': 'Update OVR',
        'delete_ticket': 'Delete OVR',
        'add_reply': 'Add Reply',
        'approve_content': 'Approve Content',
        'reject_content': 'Reject Content',
        'sign_document': 'Sign Document',
        'delegate_signature': 'Delegate Signature'
      }
    };

    return actionTranslations[lang] && actionTranslations[lang][action] 
      ? actionTranslations[lang][action] 
      : action;
  }

  // دالة لترجمة أنواع الإجراءات
  function translateActionTypes() {
    const lang = localStorage.getItem('language') || 'ar';
    
    const actionTypeTranslations = {
      ar: {
        'all-actions': 'جميع الإجراءات',
        'create_folder': 'إنشاء مجلد',
        'update_folder': 'تعديل مجلد',
        'delete_folder': 'حذف مجلد',
        'add_folder_name': 'إضافة اسم مجلد',
        'update_folder_name': 'تعديل اسم مجلد',
        'delete_folder_name': 'حذف اسم مجلد',
        'add_content': 'إضافة محتوى',
        'update_content': 'تعديل محتوى',
        'delete_content': 'حذف محتوى',
        'add_department': 'إضافة قسم',
        'update_department': 'تعديل قسم',
        'delete_department': 'حذف قسم',
        'add_user': 'إضافة مستخدم',
        'update_user': 'تعديل مستخدم',
        'delete_user': 'حذف مستخدم',
        'change_role': 'تغيير دور',
        'login': 'تسجيل دخول',
        'create_ticket': 'إنشاء حدث عارض',
        'update_ticket': 'تعديل حدث عارض',
        'delete_ticket': 'حذف حدث عارض',
        'add_reply': 'إضافة رد',
        'approve_content': 'اعتماد محتوى',
        'reject_content': 'رفض محتوى',
        'sign_document': 'توقيع مستند',
        'delegate_signature': 'تفويض توقيع',
        'notify_content_expired': ' انتهاء صلاحية المحتوى',
      },
      en: {
        'all-actions': 'All Actions',
        'create_folder': 'Create Folder',
        'update_folder': 'Update Folder',
        'delete_folder': 'Delete Folder',
        'add_folder_name': 'Add Folder Name',
        'update_folder_name': 'Update Folder Name',
        'delete_folder_name': 'Delete Folder Name',
        'add_content': 'Add Content',
        'update_content': 'Update Content',
        'delete_content': 'Delete Content',
        'add_department': 'Add Department',
        'update_department': 'Update Department',
        'notify_content_expired': ' Content Expiration',
        'delete_department': 'Delete Department',
        'add_user': 'Add User',
        'update_user': 'Update User',
        'delete_user': 'Delete User',
        'change_role': 'Change Role',
        'login': 'Login',
        'create_ticket': 'Create OVR',
        'update_ticket': 'Update OVR',
        'delete_ticket': 'Delete OVR',
        'add_reply': 'Add Reply',
        'approve_content': 'Approve Content',
        'reject_content': 'Reject Content',
        'sign_document': 'Sign Document',
        'delegate_signature': 'Delegate Signature'
      }
    };

    // تحديث النص الافتراضي
    const defaultOption = actionTypeSelect.querySelector('option[value=""]');
    if (defaultOption) {
      defaultOption.textContent = actionTypeTranslations[lang]['all-actions'] || 'All Actions';
    }

    // تحديث باقي الخيارات
    actionTypeSelect.querySelectorAll('option').forEach(option => {
      if (option.value && actionTypeTranslations[lang][option.value]) {
        option.textContent = actionTypeTranslations[lang][option.value];
      }
    });
  }

  // دالة لتحديث النصوص بناءً على اللغة
  function updatePageTexts() {
    const lang = localStorage.getItem('language') || 'ar';
    
    // تحديث عناصر HTML
    document.querySelectorAll('[data-translate]').forEach(element => {
      const key = element.getAttribute('data-translate');
      const translation = getTranslation(key);
      if (translation && translation !== key) {
        element.textContent = translation;
      }
    });

    // تحديث placeholders
    document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
      const key = element.getAttribute('data-translate-placeholder');
      const translation = getTranslation(key);
      if (translation && translation !== key) {
        element.placeholder = translation;
      }
    });

    // تحديث اتجاه النص للعناصر
    document.querySelectorAll('input, select, textarea').forEach(element => {
      if (lang === 'ar') {
        element.style.direction = 'rtl';
        element.style.textAlign = 'right';
      } else {
        element.style.direction = 'ltr';
        element.style.textAlign = 'left';
      }
    });

    // ترجمة أنواع الإجراءات
    translateActionTypes();
  }

  // دالة لتنسيق سجلات الصلاحيات
  function formatPermissionLog(description, lang) {
    try {
      const logData = JSON.parse(description);
      let parts = [logData[lang] || logData.ar];
      
      if (logData.details) {
        if (logData.details.added && logData.details.added.length > 0) {
          const addedPerms = logData.details.added.map(p => `"${getTranslation(p)}"`).join(', ');
          parts.push(` ${addedPerms}`);
        }
        if (logData.details.removed && logData.details.removed.length > 0) {
          const removedPerms = logData.details.removed.map(p => `"${getTranslation(p)}"`).join(', ');
          parts.push(`${removedPerms}`);
        }
      }
      return parts.join(' - ');
    } catch (e) {
      return description; // Fallback to raw description
    }
  }

  // تحميل وعرض السجلات
  async function loadLogs() {
    const params = new URLSearchParams();
    if (fromDateInput.value)    params.append('from', fromDateInput.value);
    if (toDateInput.value)      params.append('to', toDateInput.value);
    if (actionTypeSelect.value) params.append('action', actionTypeSelect.value);
    if (userNameSelect.value)   params.append('user', userNameSelect.value);
    if (searchInput.value)      params.append('search', searchInput.value);
    
    // إضافة لغة المستخدم
    const userLanguage = localStorage.getItem('language') || 'ar';
    params.append('lang', userLanguage);

    try {
      const res = await fetch('http://localhost:3006/api/users/logs?' + params.toString(), {
        headers: authHeader()
      });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const json = await res.json();

      logsBody.innerHTML = '';

      if (json.data && Array.isArray(json.data)) {
        allLogs = json.data; // تخزين جميع السجلات
        allLogs.forEach(log => {
          const tr = document.createElement('tr');
          tr.dataset.date   = log.created_at;
          tr.dataset.user   = log.user;
          tr.dataset.action = log.action;
          tr.dataset.id     = log.id; // إضافة ID للسجل

          // تحديد اللغة الحالية
          const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
          const locale = lang === 'en' ? 'en-US' : 'ar-SA';

          // معالجة البيانات باستخدام الدالة الجديدة
          const user = log.user || '-';
          let description = log.description || '';
          const action = log.action || '';

          // معالجة النصوص ثنائية اللغة فقط إذا لم تكن معالجة بالفعل
          const processedUser = typeof user === 'string' ? user : extractTextFromData(user);
          let processedDescription = typeof description === 'string' ? description : extractTextFromData(description);
          
          // معالجة النصوص ثنائية اللغة في الوصف
          if (log.action.includes('permission')) {
            processedDescription = formatPermissionLog(log.description, lang);
          } else {
            processedDescription = processBilingualText(processedDescription);
          }

          // استخدام المعلومات المستخرجة من الباك اند إذا كانت متوفرة
          let info = {};
          if (log.extracted_info) {
            info = log.extracted_info;
            // تنظيف المعلومات المستخرجة أيضاً
            Object.keys(info).forEach(key => {
              if (info[key] && typeof info[key] === 'string') {
                info[key] = processBilingualText(info[key]);
              }
            });
          } else {
            // استخراج المعلومات من الوصف إذا لم تكن متوفرة من الباك اند
            info = extractInfoFromDescription(processedDescription);
            // معالجة النصوص ثنائية اللغة في المعلومات المستخرجة
            Object.keys(info).forEach(key => {
              if (info[key]) {
                info[key] = processBilingualText(info[key]);
              }
            });
          }

          // التحقق من صحة المعلومات المستخرجة
          const hasValidInfo = Object.values(info).some(value => 
            value && 
            value.trim() !== '' && 
            value !== '[object Object]' && 
            !value.includes('undefined')
          );
          
          if (!hasValidInfo) {
            info = {};
          }

          // التحقق من أن الوصف الأصلي صحيح
          if (processedDescription.includes('[object Object]') || 
              processedDescription.includes('undefined') ||
              processedDescription.trim() === '') {
          }

          // ترجمة رسالة السجل واسم الإجراء
          const translatedDescription = translateLogMessage(processedDescription, action, info);
          const translatedAction = translateActionName(action);

          tr.innerHTML = `
            <td><input type="checkbox" class="log-checkbox" value="${log.id}"></td>
            <td>${processedUser}</td>
            <td>${translatedDescription}</td>
            <td>${new Date(log.created_at).toLocaleString(locale)}</td>
            <td><span class="action-text">${translatedAction}</span></td>
            <td>
              <button class="delete-row-btn" onclick="deleteSingleLog('${log.id}')" title="${getTranslation('delete-log') || 'حذف السجل'}">
                <i class="fas fa-trash"></i>
              </button>
            </td>
          `;
          logsBody.appendChild(tr);
          
          // إضافة حدث لتحديد السجل
          const checkbox = tr.querySelector('.log-checkbox');
          checkbox.addEventListener('change', (e) => {
            toggleLogSelection(log.id, e.target);
          });
        });
      } else {
        // عرض رسالة إذا لم تكن هناك بيانات
        logsBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 20px;">
              ${getTranslation('no-logs-found') || 'لا توجد سجلات'}
            </td>
          </tr>
        `;
      }
    } catch (error) {
      console.error('Error loading logs:', error);
      logsBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 20px; color: red;">
            ${getTranslation('error-loading-logs') || 'خطأ في تحميل السجلات'}
          </td>
        </tr>
      `;
    }
  }

  async function fetchUsers() {
    try {
      const res = await fetch('http://localhost:3006/api/users?roles', { headers: authHeader() });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const json = await res.json();
      
      if (json.data && Array.isArray(json.data)) {
        json.data.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.name;
          opt.textContent = u.name;
          userNameSelect.appendChild(opt);
        });
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }

  async function fetchActionTypes() {
    try {
      const res = await fetch('http://localhost:3006/api/users/action-types', { headers: authHeader() });
      
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      
      const json = await res.json();
      
      if (json.data && Array.isArray(json.data)) {
        // مسح الخيارات الحالية (باستثناء الخيار الافتراضي)
        const defaultOption = actionTypeSelect.querySelector('option[value=""]');
        actionTypeSelect.innerHTML = '';
        if (defaultOption) {
          actionTypeSelect.appendChild(defaultOption);
        }
        
        // إضافة الخيارات الجديدة
        json.data.forEach(actionType => {
          const opt = document.createElement('option');
          opt.value = actionType.action;
          opt.textContent = translateActionName(actionType.action);
          actionTypeSelect.appendChild(opt);
        });
      }
    } catch (error) {
      console.error('Error fetching action types:', error);
    }
  }

  // ✅ فلترة مباشرة عند التغيير
  [fromDateInput, toDateInput, actionTypeSelect, userNameSelect].forEach(el => {
    el.addEventListener('change', loadLogs);
  });

  searchInput.addEventListener('input', () => {
    setTimeout(loadLogs, 300); // قليل من التأخير لتحسين التجربة
  });

  // أحداث تحديد الكل
  headerSelectAllCheckbox.addEventListener('change', (e) => {
    toggleSelectAll(e.target.checked);
  });

  // أحداث أزرار الحذف
  deleteSelectedBtn.addEventListener('click', () => {
    if (selectedLogs.length === 0) return;
    
    const lang = localStorage.getItem('language') || 'ar';
    const message = lang === 'ar' 
      ? `هل أنت متأكد من حذف ${selectedLogs.length} سجل محدد؟`
      : `Are you sure you want to delete ${selectedLogs.length} selected logs?`;
    
    showConfirmDialog(message, () => {
      deleteMultipleLogs(selectedLogs);
    });
  });

  deleteAllBtn.addEventListener('click', () => {
    const lang = localStorage.getItem('language') || 'ar';
    const message = lang === 'ar' 
      ? 'هل أنت متأكد من حذف جميع السجلات؟ هذا الإجراء لا يمكن التراجع عنه.'
      : 'Are you sure you want to delete all logs? This action cannot be undone.';
    
    showConfirmDialog(message, () => {
      deleteAllLogs();
    });
  });

  // حدث زر التصدير
  document.getElementById('export-logs').addEventListener('click', () => {
    exportLogs();
  });

  // دالة حذف سجل واحد (متاحة عالمياً)
  window.deleteSingleLog = function(logId) {
    const lang = localStorage.getItem('language') || 'ar';
    const message = lang === 'ar' 
      ? 'هل أنت متأكد من حذف هذا السجل؟'
      : 'Are you sure you want to delete this log?';
    
    showConfirmDialog(message, () => {
      deleteLog(logId);
    });
  };

  // مراقبة تغيير اللغة
  window.addEventListener('languageChanged', () => {
    updatePageTexts();
    loadLogs(); // إعادة تحميل السجلات لتحديث التواريخ
  });

  // أول تحميل
  updatePageTexts();
  fetchUsers();
  fetchActionTypes();
  loadLogs();
});
