// rejected-files.js
const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
let allRejectedFiles = [];
let filteredFiles = [];

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
  } catch (error) {
    console.error('خطأ في جلب الملفات المرفوضة:', error);
    alert('حدث خطأ في تحميل الملفات المرفوضة');
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
        <p style="color: #888; text-align: center;">لا توجد ملفات مرفوضة</p>
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
  const rejectReason = file.reject_reason || 'لا يوجد سبب محدد';

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
          مرفوض
        </span>
        <span class="file-date">${rejectDate}</span>
      </div>
      <div class="reject-reason" style="margin-top: 8px; color: #ef4444; font-size: 0.9rem;">
        <i class="fa fa-exclamation-triangle"></i>
        سبب الرفض: ${rejectReason}
      </div>
    </div>
    <button class="details-btn" onclick="viewFileDetails(${file.id})">
      <i class="fa-regular fa-eye"></i> 
      عرض تفاصيل
    </button>
  `;

  return card;
}

// دالة عرض تفاصيل الملف
async function viewFileDetails(fileId) {
  window.location.href = `rejection-reason.html?contentId=${fileId}`;
}

// دالة عرض مودال تفاصيل الملف
function showFileDetailsModal(file) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  `;

  const fileName = getLocalizedName(file.title);
  const departmentName = getLocalizedName(file.source_name);
  const rejectDate = formatDate(file.rejected_at || file.updated_at);
  const rejectReason = file.reject_reason || 'لا يوجد سبب محدد';

  modal.innerHTML = `
    <div class="modal" style="
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 500px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
    ">
      <div class="modal-header" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        border-bottom: 1px solid #eee;
        padding-bottom: 16px;
      ">
        <h3 style="margin: 0; color: #333;">تفاصيل الملف المرفوض</h3>
        <button onclick="this.closest('.modal-overlay').remove()" style="
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
        ">&times;</button>
      </div>
      
      <div class="modal-body">
        <div style="margin-bottom: 16px;">
          <strong>اسم الملف:</strong>
          <p style="margin: 5px 0; color: #333;">${fileName}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <strong>القسم:</strong>
          <p style="margin: 5px 0; color: #333;">${departmentName}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <strong>تاريخ الرفض:</strong>
          <p style="margin: 5px 0; color: #333;">${rejectDate}</p>
        </div>
        
        <div style="margin-bottom: 16px;">
          <strong>سبب الرفض:</strong>
          <p style="margin: 5px 0; color: #ef4444; background: #fee2e2; padding: 8px; border-radius: 6px;">
            ${rejectReason}
          </p>
        </div>
        
        ${file.file_path ? `
        <div style="margin-bottom: 16px;">
          <strong>الملف الأصلي:</strong>
          <button onclick="downloadFile('${file.file_path}')" style="
            background: #2563eb;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 8px;
          ">
            <i class="fa fa-download"></i> تحميل الملف
          </button>
        </div>
        ` : ''}
      </div>
      
      <div class="modal-footer" style="
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid #eee;
        text-align: center;
      ">
        <button onclick="this.closest('.modal-overlay').remove()" style="
          background: #6b7280;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 6px;
          cursor: pointer;
        ">إغلاق</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
}

// دالة تحميل الملف
function downloadFile(filePath) {
  const baseApiUrl = apiBase.replace('/api', '');
  let fileBaseUrl;
  let path;

  if (filePath.startsWith('backend/uploads/')) {
    fileBaseUrl = `${baseApiUrl}/backend/uploads`;
    path = filePath.replace(/^backend\/uploads\//, '');
  } else if (filePath.startsWith('uploads/')) {
    fileBaseUrl = `${baseApiUrl}/uploads`;
    path = filePath.replace(/^uploads\//, '');
  } else {
    fileBaseUrl = `${baseApiUrl}/uploads`;
    path = filePath;
  }

  const url = `${fileBaseUrl}/${path}`;
  window.open(url, '_blank');
}

// دالة البحث في الملفات المرفوضة
function searchRejectedFiles() {
  const searchTerm = document.querySelector('.search-bar input').value.trim().toLowerCase();
  
  filteredFiles = allRejectedFiles.filter(file => {
    const fileName = getLocalizedName(file.title).toLowerCase();
    const departmentName = getLocalizedName(file.source_name).toLowerCase();
    const rejectReason = (file.reject_reason || '').toLowerCase();
    
    return fileName.includes(searchTerm) || 
           departmentName.includes(searchTerm) || 
           rejectReason.includes(searchTerm);
  });
  
  renderRejectedFiles();
  updateRejectedCount();
}

// دالة تحديث عدد الملفات المرفوضة
function updateRejectedCount() {
  const count = filteredFiles.length;
  const title = document.querySelector('.page-title');
  if (title) {
    title.textContent = `رسائل الرفض (${count})`;
  }
}

// دالة الحصول على الاسم المحلي
function getLocalizedName(name) {
  if (!name) return '';
  
  try {
    const parsed = typeof name === 'string' ? JSON.parse(name) : name;
    const lang = localStorage.getItem('language') || 'ar';
    return parsed?.[lang] || parsed?.ar || parsed?.en || name;
  } catch {
    return name;
  }
}

// دالة تنسيق التاريخ
function formatDate(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateString;
  }
}

// إعداد الأحداث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  // جلب الملفات المرفوضة
  fetchRejectedFiles();
  
  // إعداد البحث
  const searchInput = document.querySelector('.search-bar input');
  if (searchInput) {
    searchInput.addEventListener('input', searchRejectedFiles);
  }
  
  // إعداد زر الرجوع
  const backBtn = document.querySelector('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      history.back();
    });
  }
  
  // إعداد زر الرئيسية
  const homeBtn = document.querySelector('.home-btn');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
});

// دالة إعادة تحميل البيانات
function refreshData() {
  fetchRejectedFiles();
}

// تصدير الدوال للاستخدام الخارجي
window.viewFileDetails = viewFileDetails;
window.downloadFile = downloadFile;
window.refreshData = refreshData; 