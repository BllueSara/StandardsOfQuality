// rejected-files.js
const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
let allRejectedFiles = [];
let filteredFiles = [];

// دالة للحصول على الترجمة
function getTranslation(key) {
  const lang = localStorage.getItem('language') || 'ar';
  const translations = window.translations || {};
  return translations[lang]?.[key] || key;
}

// دالة جلب الملفات المرفوضة من قاعدة البيانات
async function fetchRejectedFiles() {
  if (!token) {
    alert('الرجاء تسجيل الدخول');
    window.location.href = 'login.html';
    return;
  }

  try {
    const response = await fetch(`${apiBase}/contents/rejected`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('فشل في جلب الملفات المرفوضة');
    }

    const result = await response.json();
    allRejectedFiles = result.data || [];
    filteredFiles = [...allRejectedFiles];
    
    renderRejectedFiles();
    updateRejectedCount();
    populateDepartmentFilter();
  } catch (error) {
    console.error('خطأ في جلب الملفات المرفوضة:', error);
    showErrorMessage(getTranslation('error-loading-files') || 'حدث خطأ في تحميل الملفات المرفوضة');
  }
}

// دالة عرض الملفات المرفوضة
function renderRejectedFiles() {
  const container = document.querySelector('.rejected-list');
  if (!container) return;

  container.innerHTML = '';

  if (filteredFiles.length === 0) {
    container.innerHTML = `
      <div class="no-files">
        <i class="fa fa-inbox" style="font-size: 3rem; color: #ccc; margin-bottom: 1rem;"></i>
        <p style="color: #888; text-align: center;">${getTranslation('no-rejected-files') || 'لا توجد ملفات مرفوضة'}</p>
      </div>
    `;
    return;
  }

  filteredFiles.forEach(file => {
    const card = createRejectedCard(file);
    container.appendChild(card);
  });
}

// دالة إنشاء بطاقة ملف مرفوض
function createRejectedCard(file) {
  const card = document.createElement('div');
  card.className = 'rejected-card';
  card.dataset.fileId = file.id;

  const fileName = getLocalizedName(file.title);
  const departmentName = getLocalizedName(file.source_name);
  const rejectDate = formatDate(file.rejected_at || file.updated_at);
  const rejectReason = file.reject_reason || getTranslation('no-reason-specified') || 'لا يوجد سبب محدد';

  card.innerHTML = `
    <div class="rejected-info">
      <div class="file-title">
        <i class="fa-regular fa-file-lines"></i> 
        ${fileName}
      </div>
      <div class="file-meta">
        <i class="fa-regular fa-building"></i> 
        ${departmentName}
      </div>
      <div class="file-status-row">
        <span class="status rejected">
          <i class="fa fa-xmark"></i> 
          ${getTranslation('rejected') || 'مرفوض'}
        </span>
        <span class="file-date">${rejectDate}</span>
      </div>
      <div class="reject-reason" style="margin-top: 8px; color: #ef4444; font-size: 0.9rem;">
        <i class="fa fa-exclamation-triangle"></i>
        ${getTranslation('rejection-reason') || 'سبب الرفض'}: ${rejectReason}
      </div>
    </div>
    <button class="details-btn" onclick="viewFileDetails(${file.id})">
      <i class="fa-regular fa-eye"></i> 
      ${getTranslation('view-details') || 'عرض تفاصيل'}
    </button>
  `;

  return card;
}

// دالة عرض تفاصيل الملف
async function viewFileDetails(fileId) {
  window.location.href = `rejection-reason.html?contentId=${fileId}`;
}

// دالة البحث في الملفات المرفوضة
function searchRejectedFiles() {
  const searchTerm = document.querySelector('#search-input').value.trim().toLowerCase();
  const departmentFilter = document.querySelector('#department-filter').value;
  const dateFilter = document.querySelector('#date-filter').value;
  
  filteredFiles = allRejectedFiles.filter(file => {
    const fileName = getLocalizedName(file.title).toLowerCase();
    const departmentName = getLocalizedName(file.source_name).toLowerCase();
    const rejectReason = (file.reject_reason || '').toLowerCase();
    
    // فلترة البحث
    const matchesSearch = !searchTerm || 
      fileName.includes(searchTerm) || 
      departmentName.includes(searchTerm) || 
      rejectReason.includes(searchTerm);
    
    // فلترة القسم
    const matchesDepartment = !departmentFilter || 
      getLocalizedName(file.source_name) === departmentFilter;
    
    // فلترة التاريخ
    const matchesDate = filterByDate(file.rejected_at || file.updated_at, dateFilter);
    
    return matchesSearch && matchesDepartment && matchesDate;
  });
  
  renderRejectedFiles();
  updateRejectedCount();
}

// دالة فلترة التاريخ
function filterByDate(fileDate, dateFilter) {
  if (!dateFilter) return true;
  
  const fileDateTime = new Date(fileDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  switch (dateFilter) {
    case 'today':
      return fileDateTime >= today;
    case 'week':
      return fileDateTime >= weekAgo;
    case 'month':
      return fileDateTime >= monthAgo;
    default:
      return true;
  }
}

// دالة ملء فلتر الأقسام
function populateDepartmentFilter() {
  const departmentFilter = document.querySelector('#department-filter');
  if (!departmentFilter) return;
  
  // مسح الخيارات الحالية (باستثناء الخيار الافتراضي)
  const defaultOption = departmentFilter.querySelector('option[value=""]');
  departmentFilter.innerHTML = '';
  if (defaultOption) {
    departmentFilter.appendChild(defaultOption);
  }
  
  // استخراج الأقسام الفريدة من الملفات
  const departments = [...new Set(allRejectedFiles.map(file => getLocalizedName(file.source_name)))];
  
  departments.forEach(dept => {
    const option = document.createElement('option');
    option.value = dept;
    option.textContent = dept;
    departmentFilter.appendChild(option);
  });
}

// دالة تحديث عداد الملفات المرفوضة
function updateRejectedCount() {
  const countElement = document.getElementById('rejected-count');
  if (countElement) {
    countElement.textContent = filteredFiles.length;
  }
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

// دالة تنسيق التاريخ
function formatDate(dateString) {
  if (!dateString) return '';
  
  const lang = localStorage.getItem('language') || 'ar';
  const date = new Date(dateString);
  
  if (lang === 'en') {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } else {
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

// دالة عرض رسالة خطأ
function showErrorMessage(message) {
  const container = document.querySelector('.rejected-list');
  if (container) {
    container.innerHTML = `
      <div class="error-message" style="text-align: center; color: #ef4444; padding: 20px;">
        <i class="fa fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>${message}</p>
      </div>
    `;
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
function refreshData() {
  fetchRejectedFiles();
}

// إضافة مستمعي الأحداث
document.addEventListener('DOMContentLoaded', () => {
  // تحديث النصوص عند التحميل
  updatePageTexts();
  
  // تحميل البيانات
  fetchRejectedFiles();
  
  // مستمع البحث
  const searchInput = document.querySelector('#search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      setTimeout(searchRejectedFiles, 300);
    });
  }
  
  // مستمعي الفلاتر
  const departmentFilter = document.querySelector('#department-filter');
  const dateFilter = document.querySelector('#date-filter');
  
  if (departmentFilter) {
    departmentFilter.addEventListener('change', searchRejectedFiles);
  }
  
  if (dateFilter) {
    dateFilter.addEventListener('change', searchRejectedFiles);
  }
  
  // مراقبة تغيير اللغة
  window.addEventListener('languageChanged', () => {
    updatePageTexts();
    renderRejectedFiles();
    populateDepartmentFilter();
  });
});

// تصدير الدوال للاستخدام العام
window.viewFileDetails = viewFileDetails;
window.refreshData = refreshData; 