// approvals.js
const apiBase = 'http://localhost:3006/api';
const token = localStorage.getItem('token');
let approvals = [];
let filteredApprovals = [];

// DOM elements
const tableBody = document.querySelector('.files-table tbody');
const searchInput = document.querySelector('.search-input');
const statusFilter = document.querySelector('.status-filter');

// Fetch approvals from backend
async function fetchApprovals() {
  if (!token) return alert('الرجاء تسجيل الدخول');
  try {
    const res = await fetch(`${apiBase}/contents/my-uploads`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(await res.text());
    const { data } = await res.json();
    approvals = data || [];
    filteredApprovals = approvals;
    renderApprovals();
    populateStatusFilter();
  } catch (err) {
    console.error('Error fetching approvals:', err);
    alert('حدث خطأ أثناء جلب طلباتك');
  }
}

// Render approvals in the table
function renderApprovals() {
  tableBody.innerHTML = '';
  if (filteredApprovals.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4">لا توجد بيانات</td></tr>';
    return;
  }
  filteredApprovals.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.title}</td>
      <td>${formatDate(item.created_at)}</td>
      <td><span class="status ${item.approval_status}">${statusLabel(item.approval_status)}</span></td>
      <td>
        <button class="track-btn" data-id="${item.id}">تتبع الملف</button>
        <i class="fa-regular fa-eye fa-blue action-icon" title="عرض" data-id="${item.id}" data-file="${item.file_path}"></i>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}

// Format date as yyyy/mm/dd
function formatDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// Status label in Arabic
function statusLabel(status) {
  switch (status) {
    case 'pending': return 'قيد الاعتماد';
    case 'approved': return 'معتمد';
    case 'rejected': return 'مرفوض';
    default: return status;
  }
}

// Populate status filter
function populateStatusFilter() {
  const statuses = ['جميع الحالات', 'قيد الاعتماد', 'معتمد', 'مرفوض'];
  statusFilter.innerHTML = '';
  statuses.forEach(label => {
    const opt = document.createElement('option');
    opt.value = label;
    opt.textContent = label;
    statusFilter.appendChild(opt);
  });
}

// Filter approvals
function applyFilters() {
  const search = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  filteredApprovals = approvals.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(search);
    let matchesStatus = true;
    if (status !== 'جميع الحالات') {
      if (status === 'قيد الاعتماد') matchesStatus = item.approval_status === 'pending';
      else if (status === 'معتمد') matchesStatus = item.approval_status === 'approved';
      else if (status === 'مرفوض') matchesStatus = item.approval_status === 'rejected';
    }
    return matchesSearch && matchesStatus;
  });
  renderApprovals();
}

// Event listeners
searchInput.addEventListener('input', applyFilters);
statusFilter.addEventListener('change', applyFilters);

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