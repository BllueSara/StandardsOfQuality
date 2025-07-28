// approvals.js
const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
let approvals = [];
let filteredApprovals = [];

// DOM elements
const tableBody = document.querySelector('.files-table tbody');
const searchInput = document.querySelector('#searchInput');
const statusFilter = document.querySelector('#statusFilter');
const deptFilter = document.querySelector('#deptFilter');

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

  // تحديث نص الرسالة بناءً على الترجمة
  const translatedMessage = getTranslation(message) || message;
  toast.textContent = translatedMessage;

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

// دالة تحويل اسم القسم حسب اللغة
function getLocalizedDepartmentName(deptName) {
  const currentLang = localStorage.getItem('language') || 'ar';
  try {
    const parsed = JSON.parse(deptName);
    return parsed[currentLang] || parsed.ar || parsed.en || deptName;
  } catch {
    return deptName;
  }
}

// دالة ترجمة النصوص
function getTranslation(key) {
  const lang = localStorage.getItem('language') || 'ar';
  if (window.translations && window.translations[lang] && window.translations[lang][key]) {
    return window.translations[lang][key];
  }
  return key;
}

// Fetch approvals from backend
async function fetchApprovals() {
  if (!token) return showToast(getTranslation('please-login'), 'error');
  try {
    const res = await fetch(`${apiBase}/contents/my-uploads`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(await res.text());
    const { data } = await res.json();
    approvals = data || [];
    filteredApprovals = approvals;
    renderApprovals();
    updateFilesCount();
    await setupFilters();
  } catch (err) {
    console.error('Error fetching approvals:', err);
    showToast(getTranslation('error-fetching-files'), 'error');
  }
}

// Update files count
function updateFilesCount() {
  const countElement = document.querySelector('.files-count');
  if (countElement) {
    countElement.textContent = `(${filteredApprovals.length})`;
  }
}

// Setup filters
async function setupFilters() {
  // جلب الأقسام من قاعدة البيانات
  try {
    const res = await fetch(`${apiBase}/departments`, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    const data = await res.json();
    const departments = Array.isArray(data) ? data : (data.data || []);
    const currentLang = localStorage.getItem('language') || 'ar';
    
    deptFilter.innerHTML = `<option value="all" data-translate="all-departments">${getTranslation('all-departments')}</option>`;
    departments.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept.id;
      opt.textContent = getLocalizedDepartmentName(dept.name);
      deptFilter.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load departments:', err);
  }
}

// Render approvals in the table
function renderApprovals() {
  tableBody.innerHTML = '';
  if (filteredApprovals.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" data-translate="no-uploaded-files">${getTranslation('no-uploaded-files')}</td></tr>`;
    return;
  }
  filteredApprovals.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.title}</td>
      <td>${item.source_name ? getLocalizedDepartmentName(item.source_name) : '-'}</td>
      <td>${formatDate(item.created_at)}</td>
      <td><span class="status ${item.approval_status}">${statusLabel(item.approval_status)}</span></td>
      <td>
        <button class="track-btn" data-id="${item.id}" data-translate="track">${getTranslation('track')}</button>
        <i class="fa-regular fa-eye fa-blue action-icon" title="${getTranslation('view')}" data-id="${item.id}" data-file="${item.file_path}"></i>
      </td>
    `;
    tableBody.appendChild(tr);
  });
  updateFilesCount();
}

// Format date as yyyy/mm/dd
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// Status label in current language
function statusLabel(status) {
  const lang = localStorage.getItem('language') || 'ar';
  switch (status) {
    case 'pending': return getTranslation('pending');
    case 'approved': return getTranslation('approved');
    case 'rejected': return getTranslation('rejected');
    default: return status;
  }
}

// Filter approvals
function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const dept = deptFilter.value;
  
  filteredApprovals = approvals.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(search);
    const matchesStatus = status === 'all' || item.approval_status === status;
    const matchesDept = dept === 'all' || item.source_name === dept;
    
    return matchesSearch && matchesStatus && matchesDept;
  });
  renderApprovals();
}

// Event listeners
searchInput.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);
deptFilter.addEventListener('change', applyFilters);

tableBody.addEventListener('click', function(e) {
  if (e.target.classList.contains('track-btn')) {
    const id = e.target.getAttribute('data-id');
    if (id) {
      const numericId = id.replace(/\D/g, ''); // استخراج الرقم فقط
      window.location.href = `../html/track-request.html?id=${numericId}`;
    }
  }
  if (e.target.classList.contains('fa-eye')) {
    const id = e.target.getAttribute('data-id');
    if (id) {
      const numericId = id.replace(/\D/g, '');
      window.location.href = `../html/file-details.html?id=${numericId}`;
    }
  }
});

document.addEventListener('DOMContentLoaded', fetchApprovals); 