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

// جلب الملفات المرفوضة من API
async function fetchRejectedFiles() {
  if (!token) {
    alert(getTranslation('please-login'));
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
    if (!response.ok) throw new Error(getTranslation('error-loading-files'));
    const result = await response.json();
    allRejectedFiles = result.data || [];
    filteredFiles = [...allRejectedFiles];
    renderRejectedFiles();
    populateDepartmentFilter();
    updateRejectedCount();
  } catch (error) {
    console.error(getTranslation('error-loading-files'), error);
    renderError(getTranslation('error-loading-files'));
  }
}

function renderRejectedFiles() {
  const container = document.getElementById('rejected-list');
  if (!container) return;
  container.innerHTML = '';
  if (filteredFiles.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:#888;padding:2rem;" data-translate="no-rejected-files">${getTranslation('no-rejected-files')}</div>`;
    return;
  }
  filteredFiles.forEach(file => {
    container.appendChild(createRejectedCard(file));
  });
}

function createRejectedCard(file) {
  const card = document.createElement('div');
  card.className = 'rejected-card';
  // استخدم نفس هيكل الكارت الثابت
  card.innerHTML = `
    <div class="rejected-info">
      <div class="file-title"><i class="fa-regular fa-file-lines"></i> ${getLocalizedName(file.title)}</div>
      <div class="file-meta"><i class="fa-regular fa-building"></i> ${getLocalizedName(file.source_name)}</div>
      <div class="file-status-row">
        <span class="status rejected"><i class="fa fa-xmark"></i> ${getTranslation('rejected')}</span>
        <span class="file-date">${formatDate(file.rejected_at || file.updated_at)}</span>
      </div>
    </div>
    <button class="details-btn" onclick="viewFileDetails(${file.id})"><i class="fa-regular fa-eye"></i> ${getTranslation('view-details')}</button>
  `;
  return card;
}

function getLocalizedName(name) {
  if (!name) return '';
  const lang = localStorage.getItem('language') || 'ar';
  if (typeof name === 'string' && name.trim().startsWith('{') && name.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(name);
      return parsed[lang] || parsed['ar'] || parsed['en'] || name;
    } catch (e) { return name; }
  }
  if (typeof name === 'object' && name !== null) {
    return name[lang] || name['ar'] || name['en'] || JSON.stringify(name);
  }
  return name;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const lang = localStorage.getItem('language') || 'ar';
  const date = new Date(dateString);
  if (lang === 'en') {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } else {
    return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}

function viewFileDetails(fileId) {
  window.location.href = `rejection-reason.html?contentId=${fileId}`;
}

function renderError(msg) {
  const container = document.getElementById('rejected-list');
  if (container) container.innerHTML = `<div style="text-align:center;color:#ef4444;padding:2rem;">${msg}</div>`;
}

function searchRejectedFiles() {
  const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
  const departmentFilter = document.getElementById('department-filter');
  const dateFilter = document.getElementById('date-filter');
  const selectedDept = departmentFilter ? departmentFilter.value : '';
  const selectedDate = dateFilter ? dateFilter.value : '';

  filteredFiles = allRejectedFiles.filter(file => {
    const fileName = getLocalizedName(file.title).toLowerCase();
    const departmentName = getLocalizedName(file.source_name).toLowerCase();
    const rejectReason = (file.reject_reason || '').toLowerCase();
    const matchesSearch = fileName.includes(searchTerm) || departmentName.includes(searchTerm) || rejectReason.includes(searchTerm);
    const matchesDept = !selectedDept || departmentName === selectedDept;
    const matchesDate = filterByDate(file.rejected_at || file.updated_at, selectedDate);
    return matchesSearch && matchesDept && matchesDate;
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
  
  // مسح الخيارات الحالية
  departmentFilter.innerHTML = '';
  // إضافة الخيار الافتراضي المترجم
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = getTranslation('all-departments');
  defaultOption.setAttribute('data-translate', 'all-departments');
  departmentFilter.appendChild(defaultOption);
  
  // استخراج الأقسام الفريدة من الملفات
  const departments = [...new Set(allRejectedFiles.map(file => getLocalizedName(file.source_name)))];
  
  departments.forEach(dept => {
    if (dept && dept.trim() !== '') {
      const option = document.createElement('option');
      option.value = dept;
      option.textContent = dept;
      departmentFilter.appendChild(option);
    }
  });
}

// دالة تحديث عداد الملفات المرفوضة
function updateRejectedCount() {
  const countElement = document.getElementById('rejected-count');
  if (countElement) {
    countElement.textContent = filteredFiles.length;
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

  // تحديث خيارات فلتر التاريخ
  const dateFilter = document.getElementById('date-filter');
  if (dateFilter) {
    dateFilter.querySelectorAll('option').forEach(opt => {
      const key = opt.getAttribute('data-translate');
      if (key) opt.textContent = getTranslation(key);
    });
  }

  // تحديث خيارات فلتر الأقسام
  populateDepartmentFilter();
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
      setTimeout(searchRejectedFiles, 200);
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