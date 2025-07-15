// permissions.js

const apiBase      = 'http://localhost:3006/api';
let authToken      = localStorage.getItem('token') || null;
let selectedUserId = null;
let myPermsSet     = new Set(); // صلاحيات المستخدم الحالي
let editUserRole = null;

// عناصر الـ DOM
const userList      = document.getElementById('user-list');
const userSearch    = document.getElementById('user-search');
const profileName   = document.getElementById('profile-name');
const profileStatus = document.getElementById('profile-status');
const profileDept   = document.getElementById('profile-department');
const profileRoleEl = document.getElementById('profile-role');
const permissionsSection = document.querySelector('.permission-section');
const btnDeleteUser = document.getElementById('btn-delete-user');
const btnResetPwd   = document.getElementById('btn-reset-password');
const btnChangeRole = document.getElementById('btn-change-role');
const btnAddUser    = document.getElementById('add-user-btn');

// popup تعديل الدور
const rolePopup     = document.getElementById('role-popup');
const roleSelect    = document.getElementById('role-select');
const btnSaveRole   = document.getElementById('btn-save-role');
const btnCancelRole = document.getElementById('btn-cancel-role');
const departmentSelect = document.getElementById('department');

// زر تعديل معلومات المستخدم
const btnEditUserInfo = document.getElementById('btn-edit-user-info');
const editUserModal = document.getElementById('editUserModal');
const editUserName = document.getElementById('editUserName');
const editEmployeeNumber = document.getElementById('editEmployeeNumber');
const editDepartment = document.getElementById('editDepartment');
const editEmail = document.getElementById('editEmail');
const btnCancelEditUser = document.getElementById('cancelEditUser');
const btnSaveEditUser = document.getElementById('saveEditUser');

// في البداية أخفِ قسم الصلاحيات
permissionsSection.style.display = 'none';

// =====================
// Helper: fetch with auth
// =====================
async function fetchJSON(url, opts = {}) {
  opts.headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
    ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {})
  };

  const res = await fetch(url, opts);

  // حاول نقرأ الـ JSON حتى لو كان خطأ
  let body;
  try {
    body = await res.json();
  } catch {
    body = {};
  }

  // لو غير OK، خُذ الرسالة من body أو fallback على status
  if (!res.ok) {
    const msg = body.message || body.error || `حدث خطأ (رمز ${res.status})`;

    if (res.status === 401) {
      alert('غير مسموح: يرجى تسجيل الدخول مجدداً');
    } else {
      alert(msg);
    }

    throw new Error(msg);
  }

  // لو OK، رجع data أو الجسم كله
  return body.data ?? body;
}

// =====================
// Load current user permissions
// =====================
async function loadMyPermissions() {
  if (!authToken) return;
  try {
    const payload = JSON.parse(atob(authToken.split('.')[1] || '{}'));
    const myId = payload.id;
    const perms = await fetchJSON(`${apiBase}/users/${myId}/permissions`);
    myPermsSet = new Set(perms);
  } catch (e) {
    alert('فشل جلب صلاحياتي.');
  }
}
async function fetchDepartments() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiBase}/departments`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error('فشل في جلب الأقسام');
    }

    if (!Array.isArray(result)) {
      throw new Error('الرد ليس مصفوفة أقسام');
    }

    // تحديث القائمة المنسدلة
const lang = localStorage.getItem('language') || 'ar';
const selectText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
departmentSelect.innerHTML = `<option value="">${selectText}</option>`;


    result.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept.id;
let name = dept.name;
try {
  if (typeof name === 'string' && name.trim().startsWith('{')) {
    name = JSON.parse(name);
  }
  option.textContent = typeof name === 'object'
    ? (name[lang] || name.ar || name.en || '')
    : name;
} catch {
  option.textContent = '';
}

      departmentSelect.appendChild(option);
    });
  } catch (error) {
    console.error('🚨 fetchDepartments error:', error);
    alert('خطأ في جلب الأقسام.');
  }
}




// =====================
// 1) Load Users
// =====================
async function loadUsers() {
  const users = await fetchJSON(`${apiBase}/users`);
  userList.innerHTML = '';
  users.forEach(u => {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.dataset.id = u.id;
    div.innerHTML = `
      <i class=\"fas fa-user-circle user-avatar-icon\"></i>
      <div class=\"user-info\">
        <div class=\"user-name\">${u.name}</div>
        <div class=\"user-email\">${u.email}</div>
      </div>
      <span class=\"user-status ${u.status}\"></span>
    `;
    div.addEventListener('click', () => selectUser(u.id));
    userList.append(div);
  });
}

// =====================
// 2) Select User
// =====================
async function selectUser(id) {
  const authToken = localStorage.getItem('token') || '';
  const jwtPayload = JSON.parse(atob(authToken.split('.')[1] || '{}'));

  // 2) فعل العرض للمستخدم المحدد
  selectedUserId = id;
  document.querySelectorAll('.user-item')
    .forEach(el => el.classList.toggle('active', el.dataset.id == id));

  // 3) جلب بيانات المستخدم وتحديث الواجهة
  const u = await fetchJSON(`${apiBase}/users/${id}`);
profileName.textContent = u.name;

// 1) عرض الحالة مع الترجمة
const isActive = u.status === 'active';
profileStatus.textContent = getTranslation(
  isActive ? 'status_active' : 'status_inactive'
);
profileStatus.classList.toggle('active',   isActive);
profileStatus.classList.toggle('inactive', !isActive);
profileStatus.style.cursor = 'pointer';
profileStatus.title = getTranslation(
  isActive ? 'status_confirm_inactive' : 'status_confirm_active'
);

// 2) ربط حدث التغيير مع التأكيد المترجم
profileStatus.onclick = async () => {
  // تحقق: لا يمكن تغيير حالة مستخدم admin
  if (u.role === 'admin') {
    return;
  }
  // تحقق: فقط admin أو من لديه change_status يمكنه التغيير
  const payload = JSON.parse(atob(authToken.split('.')[1] || '{}'));
  const myRole = payload.role;
  if (!(myRole === 'admin' || myPermsSet.has('change_status'))) {
    return;
  }

  const newStatus = profileStatus.classList.contains('active')
    ? 'inactive'
    : 'active';

  // جملة التأكيد المترجمة
  const confirmMsg = `${getTranslation('confirm_status_change')} "` +
    `${getTranslation(newStatus === 'active' ? 'status_active' : 'status_inactive')}"؟`;

  if (!confirm(confirmMsg)) return;

  try {
    await fetchJSON(`${apiBase}/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });

    // 3) حدّث الواجهة بعد التغيير
    const nowActive = newStatus === 'active';
    profileStatus.textContent = getTranslation(
      nowActive ? 'status_active' : 'status_inactive'
    );
    profileStatus.classList.toggle('active',   nowActive);
    profileStatus.classList.toggle('inactive', !nowActive);
    profileStatus.title = getTranslation(
      nowActive ? 'status_confirm_inactive' : 'status_confirm_active'
    );

    // 4) طرد نفسك لو عطّلت حسابك
    if (Number(id) === payload.id && newStatus === 'inactive') {
      alert(getTranslation('logout_due_to_deactivation'));
      localStorage.removeItem('token');
      window.location.href = '/frontend/html/login.html';
    }
  } catch {
    alert(getTranslation('status_change_failed'));
  }
};



try {
  const lang = localStorage.getItem('language') || 'ar';
  const name = typeof u.departmentName === 'string' && u.departmentName.trim().startsWith('{')
    ? JSON.parse(u.departmentName)[lang] || JSON.parse(u.departmentName).ar || JSON.parse(u.departmentName).en
    : u.departmentName;
  profileDept.textContent = name || '—';
} catch (err) {
  profileDept.textContent = '—';
}
  profileRoleEl.textContent = u.role           || '—';
document.querySelector('.user-profile-header')?.classList.add('active');

  // دور المستخدم الحالي
  const payload = JSON.parse(atob(authToken.split('.')[1] || '{}'));
  const myRole = payload.role;
  const isAdmin = myRole === 'admin';

  // زر إضافة مستخدم
  btnAddUser.style.display = (isAdmin || myPermsSet.has('add_user')) ? '' : 'none';

  // إذا الهدف Admin: أخفِ القسم كامل وأزرار الإدارة
  if (u.role === 'admin') {
    permissionsSection.style.display = 'none';
    btnDeleteUser.style.display = 'none';
    btnResetPwd.style.display   = 'none';
    btnChangeRole.style.display = 'none';
    return;
  }

  // أظهر قسم الصلاحيات للمستخدمين غير Admin
  permissionsSection.style.display = '';

  // أزرار الحذف وإعادة التعيين وتغيير الدور
  btnDeleteUser.style.display = (isAdmin || myPermsSet.has('delete_user')) ? '' : 'none';
  btnResetPwd.style.display   = (isAdmin || myPermsSet.has('change_password')) ? '' : 'none';
  btnChangeRole.style.display = (isAdmin || myPermsSet.has('change_role')) ? '' : 'none';

  // جلب الأدوار للمستخدمين غير Admin
  const roles = await fetchJSON(`${apiBase}/users/roles`);
  roleSelect.innerHTML = roles.map(r => `
    <option value=\"${r}\" ${u.role===r?'selected':''}>${r}</option>
  `).join('');
  btnChangeRole.onclick = () => rolePopup.classList.add('show');

  // صلاحيات المستخدم المستهدف
  const targetPerms = await fetchJSON(`${apiBase}/users/${id}/permissions`);
  const targetSet = new Set(targetPerms);
  const canGrant = isAdmin || myPermsSet.has('grant_permissions');

  document.querySelectorAll('.permission-item').forEach(item => {
    const label = item.querySelector('.switch');
    const input = label.querySelector('input[type="checkbox"]');
    const key   = label.dataset.key;

    // إظهار البنود: Admin يرى الكل، ومُخول grant يرى فقط ما يملكه
    if (!isAdmin && myRole !== 'admin' && !myPermsSet.has(key) && key !== 'grant_permissions') {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }

    // تأشير الحالة
    input.checked = targetSet.has(key);
    input.disabled = !(isAdmin || myPermsSet.has(key));
    input.onchange = async () => {
      const checked = input.checked;
      try {
        const method = checked ? 'POST' : 'DELETE';
        await fetchJSON(`${apiBase}/users/${id}/permissions/${encodeURIComponent(key)}`, { method });
      } catch {
        input.checked = !checked;
        alert('فشل تحديث الصلاحية');
      }
    };
  });

  // إظهار الزر حسب الصلاحية عند اختيار المستخدم
  showEditUserInfoButton(u);
}


// handlers role popup
btnCancelRole.addEventListener('click', () => rolePopup.classList.remove('show'));
btnSaveRole.addEventListener('click', async () => {
  if (!selectedUserId) return alert('اختر مستخدماً أولاً');
  const newRole = roleSelect.value;
  try {
    await fetchJSON(`${apiBase}/users/${selectedUserId}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
    profileRoleEl.textContent = newRole;
    rolePopup.classList.remove('show');
    alert('تم تغيير الدور');
  } catch {
    alert('فشل تغيير الدور');
  }
});

// Delete User
btnDeleteUser.addEventListener('click', async () => {
  if (!selectedUserId) {
    return alert('اختر مستخدماً أولاً');
  }
  if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
    return;
  }

  try {
    const result = await fetchJSON(`${apiBase}/users/${selectedUserId}`, {
      method: 'DELETE'
    });
    alert(result.message || 'تم حذف المستخدم بنجاح');
    loadUsers();
  } catch (err) {
    console.error('خطأ في حذف المستخدم:', err);
    // err.message هنا يحمل "خطأ في حذف المستخدم" أو الرسالة الخاصة من السيرفر
    alert(err.message);
  }
});


// Reset Password
btnResetPwd.addEventListener('click', async () => {
  if (!selectedUserId) return alert('اختر مستخدماً أولاً');
  const newPassword = prompt('أدخل كلمة المرور الجديدة للمستخدم:');
  if (!newPassword) return;
  try {
    await fetchJSON(`${apiBase}/users/${selectedUserId}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
    alert('تم تحديث كلمة المرور بنجاح');
  } catch (err) {
    alert('فشل إعادة التعيين: ' + err.message);
  }
});

// Search Users
userSearch?.addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.user-item').forEach(el => {
    const name  = el.querySelector('.user-name').textContent.toLowerCase();
    const email = el.querySelector('.user-email').textContent.toLowerCase();
    el.style.display = (name.includes(q)||email.includes(q)) ? 'flex' : 'none';
  });
});



// =====================
// 8) Open Add/Edit Modal
// =====================
const btnAdd = document.getElementById('add-user-btn');
if (btnAdd) {
  btnAdd.addEventListener('click', () => {
    selectedUserId = null;
    document.getElementById('addUserModal').style.display = 'flex';
document.querySelector('.modal-title').textContent = getTranslation('add-user');
    ['userName','email','password'].forEach(id => {
      document.getElementById(id).value = '';
        fetchDepartments(); // ✅ هنا تستدعي الأقسام وتعبئها

    });
  });
}
const btnCancel = document.getElementById('cancelAddUser');
if (btnCancel) {
  btnCancel.addEventListener('click', () => {
    document.getElementById('addUserModal').style.display = 'none';
  });
}

// =====================
// 9) Save or Update User
// =====================
const btnSaveUser = document.getElementById('saveUser');
if (btnSaveUser) {
  btnSaveUser.addEventListener('click', async () => {

const data = {
  name: document.getElementById('userName').value,
  departmentId: document.getElementById('department').value,
  email: document.getElementById('email').value,
  password: document.getElementById('password').value,
  role: document.getElementById('role')?.value || 'user',
  employeeNumber: document.getElementById('employeeNumber').value  // ✅ أضف هذا
};

console.log('🚀 departmentId:', data.departmentId);

        console.log('🚀 Sending user data:', data);

    const method = selectedUserId ? 'PUT' : 'POST';
    const url    = selectedUserId
      ? `${apiBase}/users/${selectedUserId}`
      : `${apiBase}/users`;
    await fetchJSON(url, { method, body: JSON.stringify(data) });
    document.getElementById('addUserModal').style.display = 'none';
    await loadUsers();
  });
}

// =====================
// 10) Export Excel/PDF
// =====================
const btnExcel = document.getElementById('btn-export-excel');
if (btnExcel) {
  btnExcel.addEventListener('click', () => {
    if (!selectedUserId) return alert('اختر مستخدماً أولاً');
    window.location = `${apiBase}/users/${selectedUserId}/export/excel`;
  });
}
const btnPdf = document.getElementById('btn-export-pdf');
if (btnPdf) {
  btnPdf.addEventListener('click', () => {
    if (!selectedUserId) return alert('اختر مستخدماً أولاً');
    window.location = `${apiBase}/users/${selectedUserId}/export/pdf`;
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (!authToken) return console.log('لا يوجد توكن؛ الرجاء تسجيل الدخول');
  await loadMyPermissions();

  loadUsers();
});



function updateDropdownButtonText() {
  console.log('🔄 Updating dropdown button text...');
  const dropdownBtn = document.querySelector('.dropdown-btn span');
  if (!dropdownBtn) {
    console.log('❌ Dropdown button span not found');
    return;
  }

  console.log('📝 Selected committees count:', selectedCommittees.size);

  if (selectedCommittees.size === 0) {
    dropdownBtn.textContent = getTranslation('select-committees');
    console.log('✅ Set button text to:', getTranslation('select-committees'));
  } else if (selectedCommittees.size === 1) {
    const committeeId = Array.from(selectedCommittees)[0];
    const committee = allCommittees.find(c => c.id.toString() === committeeId);
    if (committee) {
      const lang = localStorage.getItem('language') || 'ar';
      let committeeName;
      try {
        const parsed = JSON.parse(committee.name);
        committeeName = parsed[lang] || parsed['ar'] || committee.name;
      } catch {
        committeeName = committee.name;
      }
      dropdownBtn.textContent = committeeName;
      console.log('✅ Set button text to single committee:', committeeName);
    }
  } else {
    dropdownBtn.textContent = `${selectedCommittees.size} ${getTranslation('committee-selected')}`;
    console.log('✅ Set button text to multiple committees:', `${selectedCommittees.size} ${getTranslation('committee-selected')}`);
  }
}

// Update search placeholder translation in dropdown
function setCommitteeSearchPlaceholder() {
  const searchInput = document.querySelector('.committee-search');
  if (searchInput) {
    searchInput.placeholder = getTranslation('search-committee-placeholder');
  }
}

// Call setCommitteeSearchPlaceholder on language change and after rendering dropdown
window.addEventListener('languageChanged', setCommitteeSearchPlaceholder);
document.addEventListener('DOMContentLoaded', setCommitteeSearchPlaceholder);

// Show/hide dropdown based on permission checkbox
document.addEventListener('change', (e) => {
  console.log('🔍 Change event detected:', e.target);
  
  if (e.target.type === 'checkbox') {
    const label = e.target.closest('.switch');
    console.log('🔍 Label found:', label);
    console.log('🔍 Label data-key:', label?.dataset?.key);
    
    if (label && label.dataset.key === 'view_own_committees') {
      console.log('✅ Found view_own_committees checkbox, updating dropdown visibility');
      const dropdown = document.getElementById('committees-dropdown');
      console.log('🔍 Dropdown element:', dropdown);
      
      if (dropdown) {
        dropdown.style.display = e.target.checked ? 'block' : 'none';
        console.log('✅ Dropdown visibility changed to:', e.target.checked ? 'block' : 'none');
        if (e.target.checked && selectedUserId) {
          // تحميل لجان المستخدم مباشرة عند التفعيل
          loadUserCommittees(selectedUserId);
        }
      }
    }
  }
});

// إظهار الزر حسب الصلاحية عند اختيار المستخدم
async function showEditUserInfoButton(u) {
  const authToken = localStorage.getItem('token') || '';
  const payload = JSON.parse(atob(authToken.split('.')[1] || '{}'));
  const myRole = payload.role;
  const myId = payload.id;
  // إذا كان المستخدم المستهدف admin، فقط admin نفسه يمكنه التعديل
  if (u.role === 'admin') {
    if (myRole === 'admin' && Number(u.id) === Number(myId)) {
      btnEditUserInfo.style.display = '';
    } else {
      btnEditUserInfo.style.display = 'none';
    }
    return;
  }
  // غير admin: admin أو من لديه الصلاحية
  if (myRole === 'admin' || myPermsSet.has('change_user_info')) {
    btnEditUserInfo.style.display = '';
  } else {
    btnEditUserInfo.style.display = 'none';
  }
}

// عند الضغط على زر تعديل معلومات المستخدم
if (btnEditUserInfo) {
  btnEditUserInfo.addEventListener('click', async () => {
    if (!selectedUserId) return;
    // جلب بيانات المستخدم الحالي
    const u = await fetchJSON(`${apiBase}/users/${selectedUserId}`);
    const authToken = localStorage.getItem('token') || '';
    const payload = JSON.parse(atob(authToken.split('.')[1] || '{}'));
    // تحقق: إذا كان المستهدف admin، فقط admin نفسه يمكنه التعديل
    if (u.role === 'admin' && !(payload.role === 'admin' && Number(u.id) === Number(payload.id))) {
      return;
    }
    editUserName.value = u.name || '';
    editEmployeeNumber.value = u.employee_number || '';
    editEmail.value = u.email || '';
    editUserRole = u.role || null;
    // جلب الأقسام وتعبئة الدروب داون
    await fetchDepartmentsForEditModal(u.departmentId, u.departmentName);
    editUserModal.style.display = 'flex';
  });
}

// دالة لجلب الأقسام وتعبئة الدروب داون مع اختيار القسم الحالي
async function fetchDepartmentsForEditModal(selectedId, selectedName) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiBase}/departments`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error('الرد ليس مصفوفة أقسام');
    const lang = localStorage.getItem('language') || 'ar';
    const selectText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
    editDepartment.innerHTML = `<option value="">${selectText}</option>`;
    result.forEach(dept => {
      const option = document.createElement('option');
      option.value = dept.id;
      let name = dept.name;
      try {
        if (typeof name === 'string' && name.trim().startsWith('{')) {
          name = JSON.parse(name);
        }
        option.textContent = typeof name === 'object'
          ? (name[lang] || name.ar || name.en || '')
          : name;
      } catch {
        option.textContent = '';
      }
      if (dept.id == selectedId) option.selected = true;
      editDepartment.appendChild(option);
    });
  } catch (error) {
    alert('خطأ في جلب الأقسام.');
  }
}

// إغلاق المودال
if (btnCancelEditUser) {
  btnCancelEditUser.addEventListener('click', () => {
    editUserModal.style.display = 'none';
  });
}

// حفظ التعديلات
if (btnSaveEditUser) {
  btnSaveEditUser.addEventListener('click', async () => {
    if (!selectedUserId) return;
    // تحقق من الحقول المطلوبة
    if (!editUserName.value.trim() || !editEmployeeNumber.value.trim() || !editDepartment.value || !editEmail.value.trim()) {
      alert('جميع الحقول مطلوبة.');
      return;
    }
    const data = {
      name: editUserName.value,
      employee_number: editEmployeeNumber.value,
      departmentId: editDepartment.value,
      email: editEmail.value,
      role: editUserRole
    };
    try {
      await fetchJSON(`${apiBase}/users/${selectedUserId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      editUserModal.style.display = 'none';
      await selectUser(selectedUserId); // تحديث بيانات العرض
      alert('تم تحديث معلومات المستخدم بنجاح');
    } catch (err) {
      alert('فشل تحديث معلومات المستخدم: ' + err.message);
    }
  });
}
