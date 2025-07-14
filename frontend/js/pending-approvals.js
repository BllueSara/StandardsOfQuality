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

  await fetchPermissions();

  try {
    const deptResp      = await fetchJSON(`${apiBase}/approvals/assigned-to-me`);
    const commResp      = await fetchJSON(`${apiBase}/committee-approvals/assigned-to-me`);
    const combined      = [...(deptResp.data||[]), ...(commResp.data||[])];
    const uniqueMap     = new Map();
    combined.forEach(item => uniqueMap.set(item.id, item));
    allItems = Array.from(uniqueMap.values());
    filteredItems = allItems;

    await setupFilters(allItems);
    renderApprovals(filteredItems);
  } catch (err) {
    console.error("Error loading approvals:", err);
    alert(getTranslation('error-loading'));
  }
document.getElementById("prevPage").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderApprovals(filteredItems);
  }
});

document.getElementById("nextPage").addEventListener("click", () => {
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    renderApprovals(filteredItems);
  }
});
  setupSignatureModal();
  setupCloseButtons();

  // ربط زر إرسال سبب الرفض
  const btnSendReason = document.getElementById('btnSendReason');
  if (btnSendReason) {
    btnSendReason.addEventListener('click', async () => {
      const reason = document.getElementById('rejectReason').value.trim();
      if (!reason) return alert(getTranslation('please-enter-reason'));
      const type     = document.querySelector(`tr[data-id="${selectedContentId}"]`).dataset.type;
      const endpoint = type === 'committee' ? 'committee-approvals' : 'approvals';
      try {
        await fetchJSON(`${apiBase}/${endpoint}/${selectedContentId}/approve`, {
          method: 'POST',
          body: JSON.stringify({ approved: false, signature: null, notes: reason })
        });
        alert(getTranslation('success-rejected'));
        closeModal('rejectModal');
        updateApprovalStatusInUI(selectedContentId, 'rejected');
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
  const deptSet    = new Set(items.map(i => i.source_name).filter(Boolean));
  deptFilter.innerHTML = `<option value="all">${getTranslation('all-departments')}</option>`;
  deptSet.forEach(name => {
    const opt = document.createElement('option');
    opt.value       = name;
    opt.textContent = getLocalizedName(name);
    deptFilter.appendChild(opt);
  });
  deptFilter.addEventListener('change', applyFilters);
  document.getElementById('statusFilter').addEventListener('change', applyFilters);
  document.getElementById('searchInput').addEventListener('input', applyFilters);
}

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
  const tbody = document.getElementById("approvalsBody");
  tbody.innerHTML = "";

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

  // 3) إنشاء الصفوف
  const canSign = permissionsKeys.includes('*') || permissionsKeys.includes('sign');
  const canDel  = permissionsKeys.includes('*') || permissionsKeys.includes('sign_on_behalf');

  pageItems.forEach(item => {
    const tr = document.createElement("tr");
    tr.dataset.id     = item.id;
    tr.dataset.status = item.approval_status;
    tr.dataset.source = item.source_name;
    tr.dataset.type   = item.type;

    let actions = "";
    if (item.approval_status === 'pending') {
      actions += `<button class="btn-sign"><i class="fas fa-user-check"></i> ${getTranslation('sign')}</button>`;
      actions += `<button class="btn-delegate"><i class="fas fa-user-friends"></i> ${getTranslation('delegate')}</button>`;
      actions += `<button class="btn-qr"><i class="fas fa-qrcode"></i> ${getTranslation('electronic')}</button>`;
      actions += `<button class="btn-reject"><i class="fas fa-times"></i> ${getTranslation('reject')}</button>`;
      actions += `<button class="btn-preview"><i class="fas fa-eye"></i> ${getTranslation('preview')}</button>`;
    }

    const contentType = item.type === 'committee'
      ? getTranslation('committee-file')
      : getTranslation('department-report');

    tr.innerHTML = `
      <td class="col-id">${item.id}</td>
      <td>
        ${getLocalizedName(item.title)}
        <div class="content-meta">(${contentType} - ${getLocalizedName(item.source_name)} - ${getLocalizedName(item.folder_name || item.folderName || '')})</div>
      </td>
      <td>${getLocalizedName(item.source_name) || '-'}</td>
      <td class="col-response">${statusLabel(item.approval_status)}</td>
      <td class="col-actions">${actions}</td>
    `;
    tbody.appendChild(tr);

    if (!canDel) tr.querySelector('.btn-delegate')?.remove();
    if (!canSign) tr.querySelector('.btn-qr')?.remove();
  });

  // 4) حدّث الباجينج
  renderPagination(totalItems);

  // 5) حدّث نص العدّادة
  updateRecordsInfo(totalItems, startIdx, endIdx);

  // 6) أربط الأزرار
  initActions();
}

function updateApprovalStatusInUI(id, newStatus) {
  const item = allItems.find(i => i.id == id);
  if (!item) return;
  item.approval_status = newStatus;
  applyFilters();
}

function renderPagination(totalItems) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  document.getElementById("prevPage").disabled = currentPage === 1;
  document.getElementById("nextPage").disabled = currentPage === totalPages;

  const container = document.getElementById("pageNumbers");
  container.innerHTML = "";
  for (let i = 1; i <= totalPages; i++) {
    const span = document.createElement("span");
    span.textContent = i;
    span.className   = "page-number" + (i === currentPage ? " active" : "");
    span.addEventListener("click", () => {
      currentPage = i;
      renderApprovals(filteredItems);
    });
    container.appendChild(span);
  }
}

function statusLabel(status) {
  switch (status) {
    case 'approved':  return getTranslation('approved');
    case 'rejected':  return getTranslation('rejected');
    default:          return getTranslation('pending');
  }
}

// (بقية دوال initActions و signature modal و delegate تبقى كما كانت)


function initActions() {
  document.querySelectorAll('.btn-sign').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.closest('tr').dataset.id;
      openSignatureModal(id);
    });
  });

  document.querySelectorAll('.btn-delegate').forEach(btn => {
    btn.addEventListener('click', (e) => {
      selectedContentId = e.target.closest('tr').dataset.id;
      openModal('delegateModal');
      loadDepartments();
    });
  });
  
  document.querySelectorAll('.btn-qr').forEach(btn => {
    btn.addEventListener('click', e => {
      selectedContentId = e.target.closest('tr').dataset.id;
      openModal('qrModal');
    });
  });

  document.querySelectorAll('.btn-reject').forEach(btn => {
    btn.addEventListener('click', e => {
      selectedContentId = e.target.closest('tr').dataset.id;
      openModal('rejectModal');
    });
  });

// لو عندك apiBase من قبل:
// أو بدل هذا استخدم origin ديناميكي:
// const serverUrl = window.location.origin;


document.querySelectorAll('.btn-preview').forEach(btn => {
  btn.addEventListener('click', async e => {
    const tr     = e.target.closest('tr');
    const itemId = tr.dataset.id;
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

}

document.getElementById('btnElectronicApprove')?.addEventListener('click', async () => {
  if (!selectedContentId) return alert(getTranslation('please-select-user'));

  const contentType = document.querySelector(`tr[data-id="${selectedContentId}"]`).dataset.type;
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
    const contentType = document.querySelector(`tr[data-id="${selectedContentId}"]`).dataset.type;
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

  const contentType = document.querySelector(`tr[data-id="${selectedContentId}"]`).dataset.type;
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
  const row = document.querySelector(`tr[data-id="${contentId}"]`);
  if (!row) return;
  const actionsCell = row.querySelector('.col-actions');
  if (actionsCell) actionsCell.innerHTML = '';
}
function updateRecordsInfo(totalItems, startIdx, endIdx) {
  document.getElementById('startRecord').textContent = totalItems === 0 ? 0 : startIdx + 1;
  document.getElementById('endRecord').textContent   = endIdx;
  document.getElementById('totalCount').textContent  = totalItems;
}
