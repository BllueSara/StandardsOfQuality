// approvals-recived.js
let filteredItems = [];

const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
let permissionsKeys = [];
let selectedContentId = null;
let canvas, ctx;
const currentLang = localStorage.getItem('language') || 'ar';
let currentPage   = 1;
const itemsPerPage = 5;
let allItems = [];
// بعد تعريف itemsPerPage …
const statusList = ['pending', 'approved', 'rejected'];
let currentGroupIndex = 0;

// جلب صلاحيات المستخدم
async function fetchPermissions() {
  if (!token) return;
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
  const userId = payload.id, role = payload.role;
  if (role === 'admin') {
    permissionsKeys = ['*'];
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
}

async function fetchJSON(url, opts = {}) {
  opts.headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
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
document.addEventListener('DOMContentLoaded', async () => {
  if (!token) return alert(getTranslation('please-login'));
  // تعيين اسم المستخدم الحالي من JWT token
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
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
    alert(getTranslation('error-loading'));
  }
  setupSignatureModal();
  setupCloseButtons();
  setupDateFilter();

  // ربط زر إرسال سبب الرفض
  const btnSendReason = document.getElementById('btnSendReason');
  if (btnSendReason) {
    btnSendReason.addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) return alert(getTranslation('please-enter-reason'));
      try {
        await fetchJSON(`${apiBase}/contents/rejections/${selectedContentId}`, {
          method: 'POST',
          body: JSON.stringify({ reason })
        });
        alert(getTranslation('success-rejected'));
        closeModal('rejectModal');
        updateApprovalStatusInUI(selectedContentId, 'rejected');
        disableActionsFor(selectedContentId);
      } catch (e) {
        console.error('Failed to send rejection:', e);
        alert(getTranslation('error-sending'));
      }
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
    const res = await fetch(`${apiBase}/departments`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    departments = Array.isArray(data) ? data : (data.data || []);
  } catch (err) {
    // fallback: use only items' source_name
    departments = [];
  }
  const lang = localStorage.getItem('language') || 'ar';
  deptFilter.innerHTML = `<option value="all">${lang === 'ar' ? 'جميع الأقسام' : 'All Departments'}</option>`;
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

  // 3) إنشاء البطاقات
  const canSign = permissionsKeys.includes('*') || permissionsKeys.includes('sign');
  const canDel  = permissionsKeys.includes('*') || permissionsKeys.includes('sign_on_behalf');

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
      actions += `<button class="btn-delegate">${getTranslation('delegate')}</button>`;
      actions += `<button class="btn-qr">${getTranslation('electronic')}</button>`;
      
      // إخفاء زر الرفض إذا كان الملف مرفوض والمرسل الحالي هو من رفضه
      const currentUsername = window.currentUsername || '';
      const isRejectedByCurrentUser = item.approval_status === 'rejected' && 
                                     item.rejected_by_username && 
                                     item.rejected_by_username.toLowerCase() === currentUsername.toLowerCase();
      
      if (!isRejectedByCurrentUser) {
        actions += `<button class="btn-reject">${getTranslation('reject')}</button>`;
      }
      
      actions += `<button class="btn-preview">${getTranslation('preview')}</button>`;
      actions += `<button class="btn-transfer-file">${getTranslation('transfer-file')}</button>`;
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
            <span class="user-meta"><i class="fa-regular fa-calendar"></i> ${item.created_at ? new Date(item.created_at).toLocaleDateString('ar-EG') : ''}</span>
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
      { label: 'اليوم', value: 'today', date: today },
      { label: 'أمس', value: 'yesterday', date: yesterday },
      { label: 'آخر أسبوع', value: 'lastWeek', date: lastWeek },
      { label: 'آخر شهر', value: 'lastMonth', date: lastMonth },
      { label: 'الكل', value: 'all', date: null }
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
  document.querySelectorAll('.approval-card .btn-sign').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('.approval-card').dataset.id;
      openSignatureModal(id);
    });
  });

  document.querySelectorAll('.approval-card .btn-delegate').forEach(btn => {
    btn.addEventListener('click', (e) => {
      selectedContentId = e.target.closest('.approval-card').dataset.id;
      openModal('delegateModal');
      loadDepartments();
    });
  });
  
  document.querySelectorAll('.approval-card .btn-qr').forEach(btn => {
    btn.addEventListener('click', e => {
      selectedContentId = e.target.closest('.approval-card').dataset.id;
      openModal('qrModal');
    });
  });

  document.querySelectorAll('.approval-card .btn-reject').forEach(btn => {
    btn.addEventListener('click', e => {
      selectedContentId = e.target.closest('.approval-card').dataset.id;
      openModal('rejectModal');
    });
  });

  document.querySelectorAll('.approval-card .btn-preview').forEach(btn => {
    btn.addEventListener('click', async e => {
      const card     = e.target.closest('.approval-card');
      const itemId = card.dataset.id;
      const item   = allItems.find(i => i.id == itemId);

      if (!item || !item.file_path) {
        alert(getTranslation('no-content'));
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

  // Attach event for transfer file button
  document.querySelectorAll('.approval-card .btn-transfer-file').forEach(btn => {
    btn.addEventListener('click', openFileTransferModal);
  });
}

document.getElementById('btnElectronicApprove')?.addEventListener('click', async () => {
  if (!selectedContentId) return alert(getTranslation('please-select-user'));

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
    alert(getTranslation('success-approved'));
    closeModal('qrModal');
    updateApprovalStatusInUI(selectedContentId, 'approved');
    disableActionsFor(selectedContentId);
  } catch (err) {
    console.error('Failed to electronically approve:', err);
    alert(getTranslation('error-sending'));
  }
});

function openSignatureModal(contentId) {
  selectedContentId = contentId;
  const modal = document.getElementById('signatureModal');
  modal.style.display = 'flex';

  setTimeout(() => {
    resizeCanvas();
    clearCanvas();
  }, 50);
}

function closeSignatureModal() {
  document.getElementById('signatureModal').style.display = 'none';
  clearCanvas();
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

function setupSignatureModal() {
  canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;

  ctx = canvas.getContext('2d');
  let drawing = false;

  window.addEventListener('resize', resizeCanvas);

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

  canvas.addEventListener('mouseup', () => drawing = false);
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

  canvas.addEventListener('touchend', () => drawing = false);

  document.getElementById('btnClear').addEventListener('click', () => {
    clearCanvas();
  });

  document.getElementById('btnConfirmSignature').addEventListener('click', async () => {
    const base64Signature = canvas.toDataURL('image/png');
    const contentType = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`).dataset.type;
    const endpoint = contentType === 'committee' ? 'committee-approvals' : 'approvals';

    try {
      await fetchJSON(`${apiBase}/${endpoint}/${selectedContentId}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          approved: true,
          signature: base64Signature,
          notes: ''
        })
      });
      alert(getTranslation('success-sent'));
      closeSignatureModal();
      updateApprovalStatusInUI(selectedContentId, 'approved');
      disableActionsFor(selectedContentId);
    } catch (err) {
      console.error('Failed to send signature:', err);
      alert(getTranslation('error-sending'));
    }
  });
}

async function loadDepartments() {
  const deptSelect = document.getElementById('delegateDept');
  if (!deptSelect) return;

  try {
    const res = await fetchJSON(`${apiBase}/departments`);
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
    alert(getTranslation('error-loading'));
  }
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
    alert(getTranslation('error-loading'));
  }
});

document.getElementById('btnDelegateConfirm').addEventListener('click', async () => {
  const userId = document.getElementById('delegateUser').value;
  const notes = document.getElementById('delegateNotes').value;

  if (!userId) return alert(getTranslation('please-select-user'));

  const contentType = document.querySelector(`.approval-card[data-id="${selectedContentId}"]`).dataset.type;
  const endpoint = contentType === 'committee' ? 'committee-approvals' : 'approvals';

  try {
    await fetchJSON(`${apiBase}/${endpoint}/${selectedContentId}/delegate`, {
      method: 'POST',
      body: JSON.stringify({
        delegateTo: userId,
        notes: notes
      })
    });
    alert(getTranslation('success-delegated'));
    closeModal('delegateModal');
    disableActionsFor(selectedContentId);
  } catch (err) {
    console.error('Failed to delegate:', err);
    alert(getTranslation('error-sending'));
  }
});

function disableActionsFor(contentId) {
  const row = document.querySelector(`.approval-card[data-id="${contentId}"]`);
  if (!row) return;
  const actionsCell = row.querySelector('.actions');
  if (actionsCell) actionsCell.innerHTML = '';
}

// === File Transfer Modal Logic ===
function openFileTransferModal() {
  document.getElementById('fileTransferModal').style.display = 'flex';
  loadTransferDepartments();
  setupPersonCountHandler();
}

function closeFileTransferModal() {
  document.getElementById('fileTransferModal').style.display = 'none';
  // إعادة تعيين الحقول
  document.getElementById('personCount').value = '';
  document.getElementById('transferDept').value = '';
  document.getElementById('personsFields').innerHTML = '';
  document.getElementById('transferPersonsChain').innerHTML = '';
}

function setupPersonCountHandler() {
  const personCountSelect = document.getElementById('personCount');
  if (!personCountSelect) return;
  
  personCountSelect.addEventListener('change', function() {
    const count = parseInt(this.value);
    const personsFields = document.getElementById('personsFields');
    personsFields.innerHTML = '';
    
    if (count > 0) {
      for (let i = 1; i <= count; i++) {
        const formGroup = document.createElement('div');
        formGroup.className = 'form-group';
        formGroup.innerHTML = `
          <label>اختر الشخص ${i}</label>
          <select class="person-select" data-person="${i}" required>
            <option value="" disabled selected>اختر الشخص</option>
          </select>
        `;
        personsFields.appendChild(formGroup);
      }
      
      // إضافة مستمعي الأحداث للحقول الجديدة
      setupPersonSelectHandlers();
    }
  });
}

function setupPersonSelectHandlers() {
  document.querySelectorAll('.person-select').forEach(select => {
    if (select.id === 'qualityUserSelectPopup') return; // تجاهل دروب داون الجودة
    select.addEventListener('change', updatePersonsChainPopup);
  });
}

async function loadTransferDepartments() {
  const deptSelect = document.getElementById('transferDept');
  if (!deptSelect) return;
  try {
    const res = await fetch(`${apiBase}/departments`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    const departments = Array.isArray(json) ? json : (json.data || []);
    const lang = localStorage.getItem('language') || 'ar';
    deptSelect.innerHTML = `<option value="" disabled selected>اختر القسم</option>`;
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
    deptSelect.innerHTML = `<option value="" disabled selected>اختر القسم</option>`;
  }
}

document.getElementById('transferDept').addEventListener('change', async (e) => {
  const deptId = e.target.value;
  try {
    const res = await fetch(`${apiBase}/users?departmentId=${deptId}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    const users = json.data || [];
    
    // تحديث جميع حقول اختيار الأشخاص
    document.querySelectorAll('.person-select').forEach(select => {
      if (select.id === 'qualityUserSelectPopup') return; // تجاهل دروب داون الجودة
      select.innerHTML = `<option value="" disabled selected>اختر الشخص</option>`;
      users.forEach(user => {
        const opt = document.createElement('option');
        opt.value = user.id;
        opt.textContent = user.name;
        select.appendChild(opt);
      });
    });
  } catch (err) {
    document.querySelectorAll('.person-select').forEach(select => {
      if (select.id === 'qualityUserSelectPopup') return; // تجاهل دروب داون الجودة
      select.innerHTML = `<option value="" disabled selected>اختر الشخص</option>`;
    });
  }
  document.getElementById('transferPersonsChain').innerHTML = '';
});

function updatePersonsChain() {
  const chainDiv = document.getElementById('transferPersonsChain');
  chainDiv.innerHTML = '';
  
  const selectedPersons = [];
  document.querySelectorAll('.person-select').forEach(select => {
    if (select.id === 'qualityUserSelectPopup') return; // تجاهل دروب داون الجودة
    if (select.value) {
      const userName = select.options[select.selectedIndex].textContent;
      selectedPersons.push({
        id: select.value,
        name: userName,
        personNum: select.dataset.person
      });
    }
  });
  
  if (selectedPersons.length > 0) {
    selectedPersons.forEach((person, index) => {
      const node = document.createElement('div');
      node.className = 'person-node';
      
      // إضافة سهم بين الأشخاص (إلا للأول)
      if (index > 0) {
        const arrow = document.createElement('div');
        arrow.className = 'arrow-line';
        arrow.innerHTML = '<div class="dashed"></div>';
        chainDiv.appendChild(arrow);
      }
      
      node.innerHTML = `
        <div class="person-circle"><i class="fa fa-user"></i></div>
        <div class="person-name">${person.name}</div>
      `;
      chainDiv.appendChild(node);
    });
  }
}

// عنصر اختيار شخص من قسم الجودة فوق السلسلة
let qualityUserSelectDiv = null;

async function renderQualityUserSelectPopup() {
    // إزالة العنصر القديم إذا وجد
    if (qualityUserSelectDiv && qualityUserSelectDiv.parentNode) {
        qualityUserSelectDiv.parentNode.removeChild(qualityUserSelectDiv);
    }
    qualityUserSelectDiv = document.createElement('div');
    qualityUserSelectDiv.className = 'quality-user-select-group';
    qualityUserSelectDiv.style.marginBottom = '18px';
    qualityUserSelectDiv.innerHTML = `
        <label style="font-weight:600;display:block;margin-bottom:8px;">
            اختيار الشخص المسؤول في قسم الجودة <span style='color:red;'>*</span>
        </label>
        <select id="qualityUserSelectPopup" class="person-select" style="width:100%;max-width:300px;" required>
            <option value="">اختر الشخص</option>
        </select>
    `;
    const chainDiv = document.getElementById('transferPersonsChain');
    chainDiv.parentNode.insertBefore(qualityUserSelectDiv, chainDiv);
    // جلب الأشخاص من قسم الجودة (departmentId=9) فقط
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${apiBase}/users?departmentId=9`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'فشل جلب مستخدمي الجودة');
        const select = qualityUserSelectDiv.querySelector('#qualityUserSelectPopup');
        (data.data || []).forEach(user => {
            // فلترة إضافية في الفرونت اند إذا لزم الأمر
            if (user.departmentId == 9 || user.department_id == 9) {
                const opt = document.createElement('option');
                opt.value = user.id;
                opt.textContent = user.name;
                select.appendChild(opt);
            }
        });
        select.addEventListener('change', updatePersonsChainPopup);
    } catch (err) {
        console.error('فشل جلب مستخدمي الجودة:', err);
    }
}

function updatePersonsChainPopup() {
    const chainDiv = document.getElementById('transferPersonsChain');
    chainDiv.innerHTML = '';
    const selectedPersons = [];
    document.querySelectorAll('.person-select').forEach(select => {
        if (select.id === 'qualityUserSelectPopup') return; // تجاهل دروب داون الجودة
        if (select.value) {
            const userName = select.options[select.selectedIndex].textContent;
            selectedPersons.push({
                id: select.value,
                name: userName,
                personNum: select.dataset.person
            });
        }
    });
    // أضف الأشخاص المختارين من القسم
    if (selectedPersons.length > 0) {
        selectedPersons.forEach((person, index) => {
            // لا تكرر الشخص إذا كان هو نفسه المختار للجودة
            const qualitySelect = document.getElementById('qualityUserSelectPopup');
            if (qualitySelect && qualitySelect.value && person.id === qualitySelect.value) return;
            const node = document.createElement('div');
            node.className = 'person-node';
            // إضافة سهم بين الأشخاص (إلا للأول)
            if (index > 0) {
                const arrow = document.createElement('div');
                arrow.className = 'arrow-line';
                arrow.innerHTML = '<div class="dashed"></div>';
                chainDiv.appendChild(arrow);
            }
            node.innerHTML = `
                <div class="person-circle no-bg"><i class="fa fa-user"></i></div>
                <div class="person-name">${person.name}</div>
            `;
            chainDiv.appendChild(node);
        });
    }
    // أضف الشخص المختار من الجودة إذا لم يكن مكرر
    const qualitySelect = document.getElementById('qualityUserSelectPopup');
    if (qualitySelect && qualitySelect.value) {
        // تحقق أنه لم يتم عرضه سابقاً
        if (!selectedPersons.some(p => p.id === qualitySelect.value)) {
            if (selectedPersons.length > 0) {
                const arrow = document.createElement('div');
                arrow.className = 'arrow-line';
                arrow.innerHTML = '<div class="dashed"></div>';
                chainDiv.appendChild(arrow);
            }
            const qualityNode = document.createElement('div');
            qualityNode.className = 'person-node';
            qualityNode.innerHTML = `
                <div class="person-circle no-bg"><i class="fa fa-user"></i></div>
                <div class="person-name">${qualitySelect.options[qualitySelect.selectedIndex].textContent}</div>
            `;
            chainDiv.appendChild(qualityNode);
        }
    }
    // أضف مدير المستشفى
    if ((selectedPersons.length > 0 || (qualitySelect && qualitySelect.value))) {
        const arrow = document.createElement('div');
        arrow.className = 'arrow-line';
        arrow.innerHTML = '<div class="dashed"></div>';
        chainDiv.appendChild(arrow);
        const managerNode = document.createElement('div');
        managerNode.className = 'person-node';
        managerNode.innerHTML = `
            <div class="person-circle no-bg"><i class="fa fa-user"></i></div>
            <div class="person-name">مدير المستشفى</div>
        `;
        chainDiv.appendChild(managerNode);
    }
}

// استدعِ اختيار الجودة عند فتح البوب أب
const oldOpenFileTransferModal = openFileTransferModal;
openFileTransferModal = function() {
    oldOpenFileTransferModal();
    renderQualityUserSelectPopup();
    // اربط تحديث السلسلة
    setupPersonSelectHandlers = function() {
        document.querySelectorAll('.person-select').forEach(select => {
            if (select.id === 'qualityUserSelectPopup') return; // تجاهل دروب داون الجودة
            select.addEventListener('change', updatePersonsChainPopup);
        });
    };
};

document.querySelectorAll('.modal-close[data-modal="fileTransferModal"]').forEach(btn => {
  btn.addEventListener('click', closeFileTransferModal);
});

document.getElementById('btnTransferConfirm').addEventListener('click', function(e) {
  e.preventDefault();
  
  // التحقق من صحة البيانات
  const personCount = document.getElementById('personCount').value;
  const deptId = document.getElementById('transferDept').value;
  const selectedPersons = [];
  
  document.querySelectorAll('.person-select').forEach(select => {
    if (select.id === 'qualityUserSelectPopup') return; // تجاهل دروب داون الجودة
    if (select.value) {
      selectedPersons.push({
        id: select.value,
        name: select.options[select.selectedIndex].textContent
      });
    }
  });
  
  if (!personCount || !deptId || selectedPersons.length === 0) {
    alert('يرجى ملء جميع الحقول المطلوبة');
    return;
  }
  
  // تنفيذ منطق التحويل هنا
  console.log('تحويل الملف إلى:', selectedPersons);
  closeFileTransferModal();
  alert('تم تأكيد التحويل!');
});

// Example: Add event listener to open modal from a button (replace selector as needed)
// This block is now moved inside initActions()

// دالة ترجمة مؤقتة لتفادي الخطأ
function getTranslation(key) {
  const translations = {
    'please-login': 'الرجاء تسجيل الدخول',
    'error-loading': 'حدث خطأ أثناء التحميل',
    'success-rejected': 'تم الرفض بنجاح',
    'please-enter-reason': 'يرجى إدخال سبب الرفض',
    'success-approved': 'تم الاعتماد بنجاح',
    'success-sent': 'تم الإرسال بنجاح',
    'error-sending': 'حدث خطأ أثناء الإرسال',
    'sign': 'اعتماد',
    'delegate': 'تفويض',
    'electronic': 'اعتماد إلكتروني',
    'reject': 'رفض',
    'preview': 'عرض',
    'transfer-file': 'تحويل الملف',
    'committee-file': 'ملف لجنة',
    'department-report': 'تقرير قسم',
    'approved': 'معتمد',
    'rejected': 'مرفوض',
    'pending': 'قيد الاعتماد',
    'no-content': 'لا يوجد محتوى',
    'select-department': 'اختر القسم',
    'select-user': 'اختر المستخدم',
    'success-delegated': 'تم التفويض بنجاح',
  };
  return translations[key] || key;
}
