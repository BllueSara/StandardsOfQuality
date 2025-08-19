// permissions.js

// Toast notification function
function showToast(message, type = 'info', duration = 3000) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    background-color: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
    color: #fff;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    opacity: 0;
    transform: translateY(-20px);
    transition: opacity 0.5s ease, transform 0.5s ease;
  `;

  toastContainer.appendChild(toast);

  // Force reflow
  toast.offsetWidth;

  // Show the toast
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 10);

  // Set a timeout to remove the toast
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 500);
  }, duration);
}

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
const profileJobTitle = document.getElementById('profile-job-title');
// const profileJobName = document.getElementById('profile-job-name');
const permissionsSection = document.querySelector('.permission-section');
const btnDeleteUser = document.getElementById('btn-delete-user');
const btnResetPwd   = document.getElementById('btn-reset-password');
const btnChangeRole = document.getElementById('btn-change-role');
const btnAddUser    = document.getElementById('add-user-btn');
const btnClearCache = document.getElementById('btn-clear-cache');

// إضافة زر إلغاء التفويضات
const btnRevokeDelegations = document.createElement('button');
btnRevokeDelegations.id = 'btn-revoke-delegations';
btnRevokeDelegations.textContent = getTranslation('revoke-delegations') || 'إلغاء التفويضات';
btnRevokeDelegations.style = 'margin: 0 8px; background: #e53e3e; color: #fff; border: none; border-radius: 6px; padding: 8px 18px; font-size: 1rem; cursor: pointer;';
btnRevokeDelegations.onclick = openRevokeDelegationsPopup;
// إضافة الزر بجانب زر إضافة مستخدم
if (btnAddUser && btnAddUser.parentNode) {
  btnAddUser.parentNode.insertBefore(btnRevokeDelegations, btnAddUser.nextSibling);
}
// إظهار الزر فقط إذا كان للمستخدم صلاحية (admin أو من لديه صلاحية revoke_delegations)
btnRevokeDelegations.style.display = 'none';

// إضافة زر عرض اقرارات التفويض
const btnViewDelegationConfirmations = document.getElementById('btn-view-delegation-confirmations');
if (btnViewDelegationConfirmations) {
  btnViewDelegationConfirmations.onclick = openDelegationConfirmationsModal;
}
// زر مسح الكاش ميموري - للادمن فقط
if (btnClearCache) {
  btnClearCache.onclick = async () => {
    // تحقق من أن المستخدم admin أو لديه صلاحية clear_cache
    const authToken = localStorage.getItem('token') || '';
    const payload = await safeGetUserInfo(authToken);
    if (!payload) {
      showToast('خطأ في جلب معلومات المستخدم', 'error');
      return;
    }
    const myRole = payload.role;
    
    if (myRole !== 'super_admin' && !myPermsSet.has('clear_cache')) {
      showToast('هذا الزر متاح للسوبر ادمن أو من لديه صلاحية مسح الكاش فقط', 'warning');
      return;
    }
    
    if (!confirm('هل أنت متأكد من مسح الكاش ميموري للموقع؟ هذا سيؤدي إلى إعادة تحميل الصفحة.')) {
      return;
    }
    
    try {
      // مسح localStorage
      const keysToKeep = ['token', 'language']; // نحتفظ بالتوكن واللغة
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key);
        }
      });
      
      // مسح sessionStorage
      sessionStorage.clear();
      
      // مسح الكاش ميموري للمتصفح
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      // مسح IndexedDB إذا كان موجود
      if ('indexedDB' in window) {
        const databases = await indexedDB.databases();
        databases.forEach(db => {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        });
      }
      
      showToast('تم مسح الكاش ميموري بنجاح. سيتم إعادة تحميل الصفحة الآن.', 'success');
      
      // إعادة تحميل الصفحة بعد ثانيتين
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('خطأ في مسح الكاش ميموري:', error);
      showToast('حدث خطأ أثناء مسح الكاش ميموري: ' + error.message, 'error');
    }
  };
}

const btnRevokeFiles = document.getElementById('btn-revoke-files');
if (btnRevokeFiles) {
  btnRevokeFiles.onclick = async () => {
    if (!selectedUserId) return showToast(getTranslation('please-select-user'));
    // جلب الملفات من API
    const files = await fetchJSON(`${apiBase}/users/${selectedUserId}/approvals-sequence-files`);
    // بناء Popup
    const overlay = document.createElement('div');
    overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.35);z-index:9999;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style = 'background:#fff;padding:38px 38px 28px 38px;border-radius:18px;max-width:700px;min-width:420px;text-align:center;box-shadow:0 4px 32px #0003;max-height:80vh;overflow:auto;display:flex;flex-direction:column;align-items:center;';
    box.innerHTML = `
      <div style='display:flex;align-items:center;justify-content:center;margin-bottom:22px;'>
        <i class="fas fa-exclamation-triangle" style="color:#e53e3e;font-size:2em;margin-left:14px;"></i>
        <span style='font-size:1.45rem;font-weight:700;'>${getTranslation('revoke_files') || 'سحب الملفات من المستخدم'}</span>
      </div>
    `;
    if (!files.length) {
      box.innerHTML += `<div style='margin:24px 0 12px 0;color:#888;font-size:1.05em;'>${getTranslation('no-contents') || 'لا يوجد ملفات في التسلسل'}</div>`;
    } else {
      box.innerHTML += `<div style='width:100%;text-align:right;margin-bottom:16px;font-size:1.13em;'>${getTranslation('select-files-to-revoke') || 'اختر الملفات التي تريد سحبها:'}</div>`;
      // شبكة الملفات
      const grid = document.createElement('div');
      grid.style = 'display:grid;grid-template-columns:repeat(3,1fr);gap:14px 10px;width:100%;margin-bottom:18px;justify-items:start;';
      files.forEach(f => {
        const item = document.createElement('div');
        item.style = 'display:flex;align-items:center;gap:7px;';
        item.innerHTML = `
          <input type='checkbox' id='file-chk-${f.id}' value='${f.id}' style='accent-color:#e53e3e;width:22px;height:22px;cursor:pointer;'>
          <label for='file-chk-${f.id}' style='cursor:pointer;font-size:1.13em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px;'>${f.title}</label>
        `;
        grid.appendChild(item);
      });
      box.appendChild(grid);
      // أزرار بجانب بعض
      const btnsRow = document.createElement('div');
      btnsRow.style = 'display:flex;gap:18px;justify-content:center;margin-top:16px;width:100%';
      const btnConfirm = document.createElement('button');
      btnConfirm.id = 'confirm-revoke-files';
      btnConfirm.textContent = getTranslation('revoke_files') || 'سحب المحدد';
      btnConfirm.style = 'background:#e53e3e;color:#fff;border:none;border-radius:10px;padding:13px 40px;font-size:1.13em;font-weight:600;cursor:pointer;transition:background 0.2s;';
      const btnClose = document.createElement('button');
      btnClose.textContent = getTranslation('cancel') || 'إغلاق';
      btnClose.style = 'background:#888;color:#fff;border:none;border-radius:10px;padding:10px 38px;font-size:1.08em;cursor:pointer;transition:background 0.2s;';
      btnClose.onmouseover = () => btnClose.style.background = '#555';
      btnClose.onmouseout = () => btnClose.style.background = '#888';
      btnClose.onclick = () => document.body.removeChild(overlay);
      btnsRow.appendChild(btnConfirm);
      btnsRow.appendChild(btnClose);
      box.appendChild(btnsRow);
      // إضافة حدث الضغط بعد تعريف الزر وإضافته للـ DOM
      btnConfirm.addEventListener('click', async () => {
        const checked = Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(i => i.value);
        if (!checked.length) return showToast('اختر ملف واحد على الأقل');
        await fetchJSON(`${apiBase}/users/${selectedUserId}/revoke-files`, {
          method: 'POST',
          body: JSON.stringify({ fileIds: checked })
        });
        showToast('تم سحب الملفات المحددة');
        document.body.removeChild(overlay);
      });
    }
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  };
}
// popup تعديل الدور
const rolePopup     = document.getElementById('role-popup');
const roleSelect    = document.getElementById('role-select');
const btnSaveRole   = document.getElementById('btn-save-role');
const btnCancelRole = document.getElementById('btn-cancel-role');
const departmentSelect = document.getElementById('department');

// زر تعديل معلومات المستخدم
const btnEditUserInfo = document.getElementById('btn-edit-user-info');
const editUserModal = document.getElementById('editUserModal');
const editFirstName = document.getElementById('editFirstName');
const editSecondName = document.getElementById('editSecondName');
const editThirdName = document.getElementById('editThirdName');
const editLastName = document.getElementById('editLastName');
const editUsername = document.getElementById('editUsername');
const editEmployeeNumber = document.getElementById('editEmployeeNumber');
const editNationalId = document.getElementById('editNationalId');
const editJobTitle = document.getElementById('editJobTitle');
const editDepartment = document.getElementById('editDepartment');
const editEmail = document.getElementById('editEmail');
const btnCancelEditUser = document.getElementById('cancelEditUser');
const btnSaveEditUser = document.getElementById('saveEditUser');

  // في البداية أخفِ قسم الصلاحيات
  permissionsSection.style.display = 'none';
  
  // إخفاء زر سحب الملفات في البداية
  if (btnRevokeFiles) {
    btnRevokeFiles.style.display = 'none';
  }

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
      showToast('غير مسموح: يرجى تسجيل الدخول مجدداً', 'error');
    } else {
      showToast(msg, 'error');
    }

    throw new Error(msg);
  }

  // لو OK، رجع data أو الجسم كله
  return body.data ?? body;
}
// =====================
// =====================
// Load current user permissions
// =====================
async function loadMyPermissions() {
  if (!authToken) return;
  try {
    const payload = await safeGetUserInfo(authToken);
    if (!payload) return;
    const myId = payload.id;
    const perms = await fetchJSON(`${apiBase}/users/${myId}/permissions`);
    myPermsSet = new Set(perms);
    
    // إظهار زر سحب الملفات إذا كان admin أو لديه صلاحية revoke_files
    const myRole = payload.role;
    if (btnRevokeFiles) {
      if (myRole === 'super_admin' || myPermsSet.has('revoke_files')) {
        // لا نعرض الزر هنا، سيتم عرضه عند اختيار مستخدم
        // btnRevokeFiles.style.display = '';
      } else {
        btnRevokeFiles.style.display = 'none';
      }
    }
    
    // إظهار زر مسح الكاش ميموري للسوبر ادمن فقط أو من لديه صلاحية
    if (btnClearCache) {
      btnClearCache.style.display = (myRole === 'super_admin' || myPermsSet.has('clear_cache')) ? '' : 'none';
    }
    
    // إظهار زر إلغاء التفويضات إذا كان super_admin أو لديه صلاحية revoke_delegations
    if (btnRevokeDelegations) {
      btnRevokeDelegations.style.display = (myRole === 'super_admin' || myPermsSet.has('revoke_delegations')) ? '' : 'none';
    }
    
    // إظهار زر عرض اقرارات التفويض إذا كان super_admin أو لديه صلاحية view_delegation_confirmations
    const btnViewDelegationConfirmations = document.getElementById('btn-view-delegation-confirmations');
    if (btnViewDelegationConfirmations) {
      btnViewDelegationConfirmations.style.display = (myRole === 'super_admin' || myPermsSet.has('view_delegation_confirmations')) ? '' : 'none';
    }

  } catch (e) {
    showToast('فشل جلب صلاحياتي.', 'error');
  }
}
async function fetchDepartments() {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${apiBase}/departments/all`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error('فشل في جلب الأقسام');
    }

    // التعامل مع الهيكل الجديد للبيانات
    const data = result.data || result;
    if (!Array.isArray(data)) {
      throw new Error('الرد ليس مصفوفة أقسام');
    }

    // تحديث القائمة المنسدلة
const lang = localStorage.getItem('language') || 'ar';
const selectText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
departmentSelect.innerHTML = `<option value="">${selectText}</option>`;


    data.forEach(dept => {
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
    showToast('خطأ في جلب الأقسام.');
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
  
  // إخفاء زر سحب الملفات عند تحميل المستخدمين
  if (btnRevokeFiles) {
    btnRevokeFiles.style.display = 'none';
  }
  
  // لا نحتاج لإخفاء زر مسح الكاش ميموري هنا - سيتم التحكم به في loadMyPermissions
}

// =====================
// 2) Select User
// =====================
async function selectUser(id) {
  const authToken = localStorage.getItem('token') || '';
  const jwtPayload = await safeGetUserInfo(authToken);

  // 2) فعل العرض للمستخدم المحدد
  selectedUserId = id;
  document.querySelectorAll('.user-item')
    .forEach(el => el.classList.toggle('active', el.dataset.id == id));
    
  // إخفاء زر سحب الملفات مؤقتاً حتى يتم تحميل بيانات المستخدم
  if (btnRevokeFiles) {
    btnRevokeFiles.style.display = 'none';
  }
  
  // إخفاء قسم الصلاحيات مؤقتاً
  permissionsSection.style.display = 'none';

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
  if (u.role === 'admin' || u.role === 'super_admin') {
    return;
  }
  // تحقق: فقط admin أو من لديه change_status يمكنه التغيير
  const payload = await safeGetUserInfo(authToken);
 const myRole = payload.role;
    if (!(myRole === 'admin' || myRole === 'super_admin' || myPermsSet.has('change_status'))) {
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
      showToast(getTranslation('logout_due_to_deactivation'), 'warning');
      localStorage.removeItem('token');
      window.location.href = '/frontend/html/login.html';
    }
  } catch {
    showToast(getTranslation('status_change_failed'), 'error');
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
  // profileJobName.textContent = u.job_name      || '—';
  profileJobTitle.textContent = u.job_title    || '—';
document.querySelector('.user-profile-header')?.classList.add('active');

  // دور المستخدم الحالي
  const payload = await safeGetUserInfo(authToken);
  const myRole = payload.role;
  const isAdmin = myRole === 'admin';

  // زر إضافة مستخدم
  btnAddUser.style.display = (isAdmin || myPermsSet.has('add_user')) ? '' : 'none';

  // إذا الهدف Admin: أخفِ القسم كامل وأزرار الإدارة
  if (u.role === 'admin' || u.role === 'super_admin') {
    permissionsSection.style.display = 'none';
    btnDeleteUser.style.display = 'none';
    btnResetPwd.style.display   = 'none';
    btnChangeRole.style.display = 'none';
    if (btnRevokeFiles) {
      btnRevokeFiles.style.display = 'none';
    }
    // لا نضع return هنا لنسمح بتنفيذ showEditUserInfoButton
  }

  // أظهر قسم الصلاحيات للمستخدمين غير Admin
  permissionsSection.style.display = '';

  // أزرار الحذف وإعادة التعيين وتغيير الدور
  btnDeleteUser.style.display = (isAdmin || myPermsSet.has('delete_user')) ? '' : 'none';
  btnResetPwd.style.display   = (isAdmin || myPermsSet.has('change_password')) ? '' : 'none';
  btnChangeRole.style.display = (isAdmin || myPermsSet.has('change_role')) ? '' : 'none';
  
 if (btnRevokeFiles) {
    if (myRole === 'super_admin' || myPermsSet.has('revoke_files')) {
      btnRevokeFiles.style.display = '';
    } else {
      btnRevokeFiles.style.display = 'none';
    }
  }
  
  // جلب الأدوار للمستخدمين غير Admin
// ... existing code ...

  // جلب الأدوار للمستخدمين غير Admin
  if (roleSelect) {
    const roles = await fetchJSON(`${apiBase}/users/roles`);
    
    // إضافة دور hospital_manager إذا كان المستخدم admin
    if (isAdmin && !roles.includes('hospital_manager')) {
      roles.push('hospital_manager');
    }
    
    // تصفية الأدوار حسب صلاحيات المستخدم الحالي
    const filteredRoles = roles.filter(role => {
      // إذا كان المستخدم الحالي super_admin، يعرض جميع الأدوار
      if (myRole === 'super_admin') {
        return true;
      }
      // إذا لم يكن super_admin، يخفي دور super_admin
      return role !== 'super_admin';
    });
    
    roleSelect.innerHTML = filteredRoles.map(r => `
      <option value="${r}" ${u.role===r?'selected':''}>
        ${r === 'hospital_manager' ? 'مدير المستشفى' : r}
      </option>
    `).join('');

  }

// ... existing code ...
  
  if (btnChangeRole) {
    btnChangeRole.onclick = () => {
      const rolePopup = document.getElementById('role-popup');
      if (rolePopup) {
        rolePopup.classList.add('show');
      }
    };
  }

  // صلاحيات المستخدم المستهدف
  const targetPerms = await fetchJSON(`${apiBase}/users/${id}/permissions`);
  const targetSet = new Set(targetPerms);
  const canGrant = isAdmin || myPermsSet.has('grant_permissions');

  document.querySelectorAll('.permission-item').forEach(item => {
    const label = item.querySelector('.switch');
    const input = label.querySelector('input[type="checkbox"]');
    const key   = label.dataset.key;

    // إظهار البنود: Admin يرى الكل، ومُخول grant يرى فقط ما يملكه، ومُخول grant_all_permissions يرى الكل
    if (!isAdmin && myRole !== 'admin' && myRole !== 'super_admin' && !myPermsSet.has(key) && key !== 'grant_permissions' && key !== 'grant_all_permissions' && !canGrantAll) {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }
    // إخفاء الصلاحيات الحساسة إذا لم يكن المستخدم يملكها (إلا إذا كان super_admin)
    const sensitivePermissions = ['clear_cache', 'view_delegation_confirmations', 'revoke_files', 'revoke_delegations'];
    if (sensitivePermissions.includes(key) && myRole !== 'super_admin' && !myPermsSet.has(key)) {
      item.style.display = 'none';
    }

    // تأشير الحالة
    input.checked = targetSet.has(key);
    
    // تمكين الصلاحيات: Admin يمكنه منح الكل، ومُخول grant يمكنه منح ما يملكه، ومُخول grant_all_permissions يمكنه منح الكل
    // للصلاحيات الحساسة: يجب أن يكون المستخدم super_admin أو لديه الصلاحية نفسها (لا يمكن منحها عبر grant_all_permissions)
    if (sensitivePermissions.includes(key)) {
      input.disabled = !(myRole === 'super_admin' || myPermsSet.has(key));
    } else {
    input.disabled = !(isAdmin || myPermsSet.has(key) || canGrantAll);
    }
    
    // معالجة خاصة لصلاحية "منح جميع الصلاحيات"
    if (key === 'grant_all_permissions') {
        input.onchange = async () => {
            const checked = input.checked;
            try {
                if (checked) {
                    // إذا تم تفعيل "منح جميع الصلاحيات"، فعّل جميع الصلاحيات
                    await fetchJSON(`${apiBase}/users/${id}/grant-all-permissions`, { 
                        method: 'POST',
                        body: JSON.stringify({ grantAll: true })
                    });
                    // تحديث جميع الصلاحيات لتظهر مفعلة (باستثناء الصلاحيات المستثناة)
                    // ملاحظة: هذه الصلاحيات لا تُمنح تلقائياً ولكن يمكن منحها يدوياً
                    const excludedPermissions = [
                      'disable_departments',       // اخفاء الاقسام
                      'disable_approvals',         // اخفاء الاعتمادات
                      'disable_notifications',     // إلغاء الإشعارات
                      'disable_emails',            // إلغاء الإيميلات
                      'disable_logs',              // إلغاء اللوقز
                      'view_own_department',       // عرض القسم الموجود

                    ];
                    
                    document.querySelectorAll('.permission-item').forEach(otherItem => {
                        const otherLabel = otherItem.querySelector('.switch');
                        const otherInput = otherLabel.querySelector('input[type="checkbox"]');
                        const otherKey = otherLabel.dataset.key;
                        if (otherKey !== 'grant_all_permissions' && !excludedPermissions.includes(otherKey)) {
                            otherInput.checked = true;
                        }
                    });
                    showToast('تم منح جميع الصلاحيات بنجاح', 'success');
                } else {
                    // إذا تم إلغاء "منح جميع الصلاحيات"، ألغِ جميع الصلاحيات
                    await fetchJSON(`${apiBase}/users/${id}/grant-all-permissions`, { 
                        method: 'POST',
                        body: JSON.stringify({ grantAll: false })
                    });
                    // تحديث جميع الصلاحيات لتظهر ملغية
                    document.querySelectorAll('.permission-item').forEach(otherItem => {
                        const otherLabel = otherItem.querySelector('.switch');
                        const otherInput = otherLabel.querySelector('input[type="checkbox"]');
                        const otherKey = otherLabel.dataset.key;
                        if (otherKey !== 'grant_all_permissions') {
                            otherInput.checked = false;
                        }
                    });
                    showToast('تم إلغاء جميع الصلاحيات بنجاح', 'success');
                }
            } catch (error) {
                input.checked = !checked;
                showToast('فشل تحديث الصلاحيات: ' + error.message, 'error');
            }
        };
    } else {
        // معالجة عادية للصلاحيات الأخرى
        input.onchange = async () => {
            const checked = input.checked;
            try {
                const method = checked ? 'POST' : 'DELETE';
                await fetchJSON(`${apiBase}/users/${id}/permissions/${encodeURIComponent(key)}`, { method });
                
                // إذا تم إلغاء أي صلاحية، ألغِ "منح جميع الصلاحيات" تلقائياً
                if (!checked && targetSet.has('grant_all_permissions')) {
                    const grantAllInput = document.querySelector('label.switch[data-key="grant_all_permissions"] input[type="checkbox"]');
                    if (grantAllInput) {
                        grantAllInput.checked = false;
                        await fetchJSON(`${apiBase}/users/${id}/permissions/grant_all_permissions`, { method: 'DELETE' });
                    }
                }
            } catch {
                input.checked = !checked;
                showToast('فشل تحديث الصلاحية', 'error');
            }
        };
    }
  });


  // إظهار الزر حسب الصلاحية عند اختيار المستخدم
  showEditUserInfoButton(u);

  btnRevokeDelegations.style.display = (myRole === 'super_admin' || myPermsSet.has('revoke_delegations')) ? '' : 'none';
  
  // إظهار زر سحب الملفات إذا كان super_admin أو لديه صلاحية revoke_files
  if (btnRevokeFiles) {
    if (myRole === 'super_admin' || myPermsSet.has('revoke_files')) {
      btnRevokeFiles.style.display = '';
    } else {
      btnRevokeFiles.style.display = 'none';
    }
  }
  
  // لا نحتاج للتحكم في زر مسح الكاش ميموري هنا - سيتم التحكم به في loadMyPermissions
}


// handlers role popup
btnCancelRole.addEventListener('click', () => rolePopup.classList.remove('show'));
btnSaveRole.addEventListener('click', async () => {
  if (!selectedUserId) return showToast('اختر مستخدماً أولاً', 'warning');
  const newRole = roleSelect.value;
  try {
    await fetchJSON(`${apiBase}/users/${selectedUserId}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
    profileRoleEl.textContent = newRole;
    rolePopup.classList.remove('show');
    showToast('تم تغيير الدور', 'success');
  } catch {
    showToast('فشل تغيير الدور', 'error');
  }
});

// Delete User
btnDeleteUser.addEventListener('click', async () => {
  if (!selectedUserId) {
    return showToast('اختر مستخدماً أولاً', 'warning');
  }
  if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
    return;
  }

  try {
    const result = await fetchJSON(`${apiBase}/users/${selectedUserId}`, {
      method: 'DELETE'
    });
    showToast(result.message || 'تم حذف المستخدم بنجاح', 'success');
    loadUsers();
  } catch (err) {
    console.error('خطأ في حذف المستخدم:', err);
    // err.message هنا يحمل "خطأ في حذف المستخدم" أو الرسالة الخاصة من السيرفر
    showToast(err.message, 'error');
  }
});


// Reset Password
btnResetPwd.addEventListener('click', async () => {
  if (!selectedUserId) return showToast('اختر مستخدماً أولاً', 'warning');
  const newPassword = prompt('أدخل كلمة المرور الجديدة للمستخدم:');
  if (!newPassword) return;
  try {
    await fetchJSON(`${apiBase}/users/${selectedUserId}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
    showToast('تم تحديث كلمة المرور بنجاح', 'success');
  } catch (err) {
    showToast('فشل إعادة التعيين: ' + err.message, 'error');
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
    ['userName','userSecondName','userThirdName','userLastName','email','password'].forEach(id => {
      document.getElementById(id).value = '';
    });
    fetchDepartments(); // ✅ هنا تستدعي الأقسام وتعبئها
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
    // جمع الأسماء
    const firstName = document.getElementById('userName').value.trim();
    const secondName = document.getElementById('userSecondName').value.trim();
    const thirdName = document.getElementById('userThirdName').value.trim();
    const lastName = document.getElementById('userLastName').value.trim();
    const username = document.getElementById('userName').value.trim();
    
    // تحقق من الحقول المطلوبة
    if (!firstName || !lastName || !username) {
      showToast('الاسم الأول واسم العائلة واسم المستخدم مطلوبان.', 'warning');
      return;
    }
    
    // تحقق من المسمى الوظيفي إذا كان موجوداً
    const jobName = document.getElementById('jobName');
    if (jobName && !jobName.value.trim()) {
      showToast('يرجى اختيار المسمى الوظيفي.', 'warning');
      return;
    }
    
    // بناء الاسم الكامل
    const names = [firstName, secondName, thirdName, lastName].filter(name => name);
    const fullName = names.join(' ');

    const data = {
      name: username,
      first_name: firstName,
      second_name: secondName,
      third_name: thirdName,
      last_name: lastName,
      departmentId: document.getElementById('department').value,
      email: document.getElementById('email').value,
      password: document.getElementById('password').value,
      role: document.getElementById('role')?.value || 'user',
      employeeNumber: document.getElementById('employeeNumber').value,
      job_title_id: document.getElementById('jobTitle').value,
      job_name_id: document.getElementById('jobName') ? document.getElementById('jobName').value : ''
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
    if (!selectedUserId) return showToast('اختر مستخدماً أولاً', 'warning');
    window.location = `${apiBase}/users/${selectedUserId}/export/excel`;
  });
}
const btnPdf = document.getElementById('btn-export-pdf');
if (btnPdf) {
  btnPdf.addEventListener('click', () => {
    if (!selectedUserId) return showToast('اختر مستخدماً أولاً', 'warning');
    window.location = `${apiBase}/users/${selectedUserId}/export/pdf`;
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  if (!authToken) return console.log('لا يوجد توكن؛ الرجاء تسجيل الدخول');
  await loadMyPermissions();

  loadUsers();
  initializeSectionButtons();
  
  // إخفاء زر سحب الملفات في البداية
  if (btnRevokeFiles) {
    btnRevokeFiles.style.display = 'none';
  }
  
  // لا نحتاج لإخفاء زر مسح الكاش ميموري هنا - سيتم التحكم به في loadMyPermissions
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
  const payload = await safeGetUserInfo(authToken);
  const myRole = payload.role;
  const myId = payload.id;
  
  // إذا كان المستخدم المستهدف admin
  if (u.role === 'admin' || u.role === 'super_admin') {
    // فقط admin نفسه يمكنه تعديل معلوماته
    if ((myRole === 'admin' || myRole === 'super_admin') && Number(u.id) === Number(myId)) {
      btnEditUserInfo.style.display = '';
    } else {
      btnEditUserInfo.style.display = 'none';
    }
    return;
  }
  
  // للمستخدمين غير admin: admin أو من لديه الصلاحية يمكنه التعديل
  if (myRole === 'admin' || myRole === 'super_admin' || myPermsSet.has('change_user_info')) {
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
    const payload = await safeGetUserInfo(authToken);
    
    // تحقق: إذا كان المستهدف admin، فقط admin نفسه يمكنه التعديل
    if (u.role === 'admin' && !((payload.role === 'admin' || payload.role === 'super_admin') && Number(u.id) === Number(payload.id))) {
      showToast('لا يمكن تعديل معلومات admin آخر', 'warning');
      return;
    }
    
    // تعبئة الأسماء المنفصلة مباشرة من البيانات
    editFirstName.value = u.first_name || '';
    editSecondName.value = u.second_name || '';
    editThirdName.value = u.third_name || '';
    editLastName.value = u.last_name || '';
    editUsername.value = u.username || '';
    
    editEmployeeNumber.value = u.employee_number || '';
    editNationalId.value = u.national_id || '';
    // جلب المسميات الوظيفية وتعبئة الدروب داون
    await fetchJobTitlesForEditModal(u.job_title_id, u.job_title);
    editEmail.value = u.email || '';
    editUserRole = u.role || null;
    
    // جلب المسميات الوظيفية وتعبئة الدروب داون
    await fetchJobNamesForEditModal(u.job_name_id, u.job_name);
    
    // جلب الأقسام وتعبئة الدروب داون
    await fetchDepartmentsForEditModal(u.departmentId, u.departmentName);
    
    // Handle "Add New Job Title" selection in edit modal
    editJobTitle.addEventListener('change', function() {
      if (this.value === '__ADD_NEW_JOB_TITLE__') {
        this.value = '';
        document.getElementById('addJobTitleModal').style.display = 'flex';
      }
    });
    
    // Handle "Add New Job Name" selection in edit modal
    if (editJobName) {
      editJobName.addEventListener('change', function() {
        if (this.value === '__ADD_NEW_JOB_NAME__') {
          this.value = '';
          document.getElementById('addJobNameModal').style.display = 'flex';
        }
      });
    }
    
    // إضافة التحقق من صحة رقم الهوية أثناء الكتابة
    editNationalId.addEventListener('input', function() {
      const value = this.value;
      // السماح فقط بالأرقام
      this.value = value.replace(/[^0-9]/g, '');
      
      // التحقق من الطول
      if (value.length > 10) {
        this.value = value.slice(0, 10);
      }
    });

    editNationalId.addEventListener('blur', function() {
      const value = this.value.trim();
      if (value && !/^[1-9]\d{9}$/.test(value)) {
        showToast('رقم الهوية الوطنية أو الإقامة غير صحيح. يجب أن يكون 10 أرقام ولا يبدأ بصفر.', 'warning');
      }
    });

    editUserModal.style.display = 'flex';
  });
}

// دالة لجلب المسميات الوظيفية وتعبئة الدروب داون مع اختيار المسمى الحالي
async function fetchJobTitlesForEditModal(selectedId, selectedTitle) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('لا يوجد توكن مصادقة');
    }

    const response = await fetch(`${apiBase}/job-titles`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 Job Titles API error (edit modal):', response.status, errorText);
      throw new Error(`فشل في جلب المسميات الوظيفية (${response.status})`);
    }

    const result = await response.json();
    
    // Handle both array and object with data property
    const jobTitles = Array.isArray(result) ? result : (result.data || []);
    
    if (!Array.isArray(jobTitles)) {
      console.error('🚨 Invalid job titles response format (edit modal):', result);
      throw new Error('الرد ليس مصفوفة مسميات وظيفية');
    }
    
    const lang = localStorage.getItem('language') || 'ar';
            const selectText = lang === 'ar' ? 'اختر المنصب الإداري' : 'Select Administrative Position';
    editJobTitle.innerHTML = `<option value="">${selectText}</option>`;
    
    jobTitles.forEach(jobTitle => {
      const option = document.createElement('option');
      option.value = jobTitle.id;
      option.textContent = jobTitle.title;
      if (selectedId && Number(jobTitle.id) === Number(selectedId)) {
        option.selected = true;
      }
      editJobTitle.appendChild(option);
    });
    
    // Add "Add New Job Title" option
    const addNewOption = document.createElement('option');
    addNewOption.value = '__ADD_NEW_JOB_TITLE__';
    addNewOption.textContent = getTranslation('add-new-job-title');
    editJobTitle.appendChild(addNewOption);
  } catch (error) {
    console.error('❌ Error fetching job titles for edit modal:', error);
    showToast('فشل في جلب المسميات الوظيفية: ' + error.message, 'error');
  }
}

// دالة لجلب الأقسام وتعبئة الدروب داون مع اختيار القسم الحالي
async function fetchDepartmentsForEditModal(selectedId, selectedName) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('لا يوجد توكن مصادقة');
    }

    const response = await fetch(`${apiBase}/departments/all`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 Department API error (edit modal):', response.status, errorText);
      throw new Error(`فشل في جلب الأقسام (${response.status})`);
    }

    const result = await response.json();
    
    // Handle both array and object with data property
    const departments = Array.isArray(result) ? result : (result.data || []);
    
    if (!Array.isArray(departments)) {
      console.error('🚨 Invalid departments response format (edit modal):', result);
      throw new Error('الرد ليس مصفوفة أقسام');
    }
    
    const lang = localStorage.getItem('language') || 'ar';
    const selectText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
    editDepartment.innerHTML = `<option value="">${selectText}</option>`;
    
    departments.forEach(dept => {
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

    console.log('✅ Successfully loaded', departments.length, 'departments for edit modal');
  } catch (error) {
    console.error('🚨 fetchDepartmentsForEditModal error:', error);
    showToast('خطأ في جلب الأقسام: ' + error.message, 'error');
  }
}

// دالة لجلب المسميات الوظيفية وتعبئة الدروب داون مع اختيار المسمى الحالي
async function fetchJobNamesForEditModal(selectedId, selectedName) {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('لا يوجد توكن مصادقة');
    }

    const response = await fetch(`${apiBase}/job-names`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 Job Names API error (edit modal):', response.status, errorText);
      throw new Error(`فشل في جلب المسميات (${response.status})`);
    }

    const result = await response.json();
    
    // Handle both array and object with data property
    const jobNames = Array.isArray(result) ? result : (result.data || []);
    
    if (!Array.isArray(jobNames)) {
      console.error('🚨 Invalid job names response format (edit modal):', result);
      throw new Error('الرد ليس مصفوفة مسميات');
    }
    
    const editJobName = document.getElementById('editJobName');
    if (editJobName) {
      const lang = localStorage.getItem('language') || 'ar';
      const selectText = lang === 'ar' ? 'اختر المسمى الوظيفي' : 'Select Job Name';
      editJobName.innerHTML = `<option value="">${selectText}</option>`;
      
      jobNames.forEach(jobName => {
        const option = document.createElement('option');
        option.value = jobName.id;
        option.textContent = jobName.name;
        if (selectedId && Number(jobName.id) === Number(selectedId)) {
          option.selected = true;
        }
        editJobName.appendChild(option);
      });
      
      // Add "Add New Job Name" option
      const addNewOption = document.createElement('option');
      addNewOption.value = '__ADD_NEW_JOB_NAME__';
      addNewOption.textContent = getTranslation('add-new-job-name') || 'إضافة مسمى جديد';
      editJobName.appendChild(addNewOption);
    }

    console.log('✅ Successfully loaded', jobNames.length, 'job names for edit modal');
  } catch (error) {
    console.error('🚨 fetchJobNamesForEditModal error:', error);
    showToast('خطأ في جلب المسميات: ' + error.message, 'error');
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
    
    // جمع الأسماء
    const firstName = editFirstName.value.trim();
    const secondName = editSecondName.value.trim();
    const thirdName = editThirdName.value.trim();
    const lastName = editLastName.value.trim();
    const username = editUsername.value.trim();
    
    // تحقق من الحقول المطلوبة
    // للادمن: فقط الاسم الأول واسم العائلة واسم المستخدم مطلوبة
    // للمستخدمين الآخرين: جميع الحقول مطلوبة
    const isAdmin = editUserRole === 'admin' || editUserRole === 'super_admin';
    
    if (isAdmin) {
      // للادمن: فقط الحقول الأساسية مطلوبة
      if (!firstName || !lastName || !username) {
        showToast('الاسم الأول واسم العائلة واسم المستخدم مطلوبة للادمن.', 'warning');
        return;
      }
    } else {
          // للمستخدمين الآخرين: جميع الحقول مطلوبة
    if (!firstName || !lastName || !username || !editEmployeeNumber.value.trim() || !editJobTitle.value.trim() || !editJobName.value.trim() || !editDepartment.value || !editEmail.value.trim()) {
      showToast('الاسم الأول واسم العائلة واسم المستخدم وجميع الحقول الأخرى مطلوبة.', 'warning');
      return;
    }
    }
    
    // التحقق من صحة رقم الهوية إذا تم إدخاله
    const nationalId = editNationalId.value.trim();
    if (nationalId && !/^[1-9]\d{9}$/.test(nationalId)) {
      showToast('رقم الهوية الوطنية أو الإقامة غير صحيح. يجب أن يكون 10 أرقام ولا يبدأ بصفر.', 'warning');
      return;
    }

    // بناء الاسم الكامل
    const names = [firstName, secondName, thirdName, lastName].filter(name => name);
    const fullName = names.join(' ');
    
    const data = {
      name: username,
      first_name: firstName,
      second_name: secondName,
      third_name: thirdName,
      last_name: lastName,
      employee_number: editEmployeeNumber.value,
      national_id: editNationalId.value,
      job_title_id: editJobTitle.value,
      job_name_id: editJobName ? editJobName.value : '',
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
      showToast('تم تحديث معلومات المستخدم بنجاح', 'success');
    } catch (err) {
      showToast('فشل تحديث معلومات المستخدم: ' + err.message, 'error');
    }
  });
}

// دالة إلغاء التفويض بالكامل (تربط على window)
window.__revokeAllToUser = async function(delegatorId, delegateeId, isCommittee, btn) {
  if (!confirm(getTranslation('confirm-revoke-all') || 'هل أنت متأكد من إلغاء جميع التفويضات لهذا الشخص؟')) return;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    let url;
    if (isCommittee === 2) {
      // محاضر
      url = `${apiBase}/protocols/delegations/by-user/${delegatorId}?to=${delegateeId}`;
    } else if (isCommittee === 1) {
      // لجان
      url = `${apiBase}/committee-approvals/delegations/by-user/${delegatorId}?to=${delegateeId}`;
    } else {
      // ملفات
      url = `${apiBase}/approvals/delegations/by-user/${delegatorId}?to=${delegateeId}`;
    }
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const json = await res.json();
    if (json.status === 'success') {
      btn.parentNode.style.opacity = '0.5';
      btn.textContent = getTranslation('revoked') || 'تم الإلغاء';
      btn.disabled = true;
      setTimeout(() => {
        const stillActive = overlay.querySelectorAll('button:not([disabled])').length;
        if (!stillActive) {
          document.body.removeChild(overlay);
          loadUsers();
        }
      }, 700);
    } else {
      btn.disabled = false;
      btn.textContent = getTranslation('revoke-delegations');
      showToast(json.message || getTranslation('error-occurred'), 'error');
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = getTranslation('revoke-delegations');
    showToast(getTranslation('error-occurred'), 'error');
  }
};

// Manage Users Functions
function initializeManageUsers() {
  const btnManageUsers = document.getElementById('btn-manage-users');
  if (btnManageUsers) {
    btnManageUsers.addEventListener('click', () => {
      window.location.href = 'manage-users.html';
    });
  }
}

// Job Titles Management Functions
let currentEditingJobTitleId = null;

// Initialize job titles management
function initializeJobTitlesManagement() {
  const btnManageJobTitles = document.getElementById('btn-manage-job-titles');
  const btnAddJobTitle = document.getElementById('btn-add-job-title');
  const cancelJobTitles = document.getElementById('cancelJobTitles');
  const saveJobTitle = document.getElementById('saveJobTitle');
  const cancelAddEditJobTitle = document.getElementById('cancelAddEditJobTitle');
  const jobTitleName = document.getElementById('jobTitleName');
  const addEditJobTitleTitle = document.getElementById('addEditJobTitleTitle');

  // Open job titles management modal
  btnManageJobTitles.addEventListener('click', openJobTitlesModal);

  // Close job titles management modal
  cancelJobTitles.addEventListener('click', () => {
    document.getElementById('jobTitlesModal').style.display = 'none';
  });

  // Add new job title button
  btnAddJobTitle.addEventListener('click', () => {
    currentEditingJobTitleId = null;
    jobTitleName.value = '';
    addEditJobTitleTitle.textContent = getTranslation('add-job-title');
    document.getElementById('addEditJobTitleModal').style.display = 'flex';
  });

  // Save job title
  saveJobTitle.addEventListener('click', saveJobTitleHandler);

  // Cancel add/edit job title
  cancelAddEditJobTitle.addEventListener('click', () => {
    document.getElementById('addEditJobTitleModal').style.display = 'none';
  });

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    const jobTitlesModal = document.getElementById('jobTitlesModal');
    const addEditJobTitleModal = document.getElementById('addEditJobTitleModal');
    if (event.target === jobTitlesModal) {
      jobTitlesModal.style.display = 'none';
    }
    if (event.target === addEditJobTitleModal) {
      addEditJobTitleModal.style.display = 'none';
    }
  });
}

// Job Names Management Functions
let currentEditingJobNameId = null;

// Initialize job names management
function initializeJobNamesManagement() {
  const btnManageJobNames = document.getElementById('btn-manage-job-names');
  const btnAddJobName = document.getElementById('btn-add-job-name');
  const cancelJobNames = document.getElementById('cancelJobNames');
  const saveJobName = document.getElementById('saveJobName');
  const cancelAddEditJobName = document.getElementById('cancelAddEditJobName');
  const jobNameName = document.getElementById('jobNameName');
  const addEditJobNameTitle = document.getElementById('addEditJobNameTitle');

  // Open job names management modal
  if (btnManageJobNames) {
    btnManageJobNames.addEventListener('click', openJobNamesModal);
  }

  // Close job names management modal
  if (cancelJobNames) {
    cancelJobNames.addEventListener('click', () => {
      document.getElementById('jobNamesModal').style.display = 'none';
    });
  }

  // Add new job name button
  if (btnAddJobName) {
    btnAddJobName.addEventListener('click', () => {
      currentEditingJobNameId = null;
      jobNameName.value = '';
      addEditJobNameTitle.textContent = getTranslation('add-job-name');
      document.getElementById('addEditJobNameModal').style.display = 'flex';
    });
  }

  // Save job name
  if (saveJobName) {
    saveJobName.addEventListener('click', saveJobNameHandler);
  }

  // Cancel add/edit job name
  if (cancelAddEditJobName) {
    cancelAddEditJobName.addEventListener('click', () => {
      document.getElementById('addEditJobNameModal').style.display = 'none';
    });
  }

  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    const jobNamesModal = document.getElementById('jobNamesModal');
    const addEditJobNameModal = document.getElementById('addEditJobNameModal');
    if (event.target === jobNamesModal) {
      jobNamesModal.style.display = 'none';
    }
    if (event.target === addEditJobNameModal) {
      addEditJobNameModal.style.display = 'none';
    }
  });
}

// Open job titles management modal
async function openJobTitlesModal() {
  document.getElementById('jobTitlesModal').style.display = 'flex';
  await loadJobTitles();
}

// Open job names management modal
async function openJobNamesModal() {
  document.getElementById('jobNamesModal').style.display = 'flex';
  await loadJobNames();
}

// Load job titles
async function loadJobTitles() {
  try {
    const response = await fetch(`${apiBase}/job-titles`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    
    if (data.success) {
      renderJobTitlesList(data.data);
    } else {
      showToast(data.message || getTranslation('error-occurred'), 'error');
    }
  } catch (error) {
    console.error('Error loading job titles:', error);
    showToast(getTranslation('error-occurred'), 'error');
  }
}

// Load job names
async function loadJobNames() {
  try {
    const response = await fetch(`${apiBase}/job-names`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    
    if (data.success) {
      renderJobNamesList(data.data);
    } else {
      showToast(data.message || getTranslation('error-occurred'), 'error');
    }
  } catch (error) {
    console.error('Error loading job names:', error);
    showToast(getTranslation('error-occurred'), 'error');
  }
}

// Render job titles list
function renderJobTitlesList(jobTitles) {
  const jobTitlesList = document.getElementById('jobTitlesList');
  
  if (jobTitles.length === 0) {
    jobTitlesList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">لا توجد مسميات وظيفية</div>';
    return;
  }

  jobTitlesList.innerHTML = jobTitles.map(jobTitle => `
    <div class="job-title-item">
      <div class="job-title-name">${jobTitle.title}</div>
      <div class="job-title-actions">
        <button class="btn-edit" onclick="editJobTitleHandler(${jobTitle.id}, '${jobTitle.title}')">
          <i class="fas fa-edit"></i> ${getTranslation('edit') || 'تعديل'}
        </button>
        <button class="btn-delete" onclick="deleteJobTitle(${jobTitle.id})">
          <i class="fas fa-trash"></i> ${getTranslation('delete') || 'حذف'}
        </button>
      </div>
    </div>
  `).join('');
}

// Render job names list
function renderJobNamesList(jobNames) {
  const jobNamesList = document.getElementById('jobNamesList');
  
  if (jobNames.length === 0) {
    jobNamesList.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">لا توجد مسميات</div>';
    return;
  }

  jobNamesList.innerHTML = jobNames.map(jobName => `
    <div class="job-name-item">
      <div class="job-name-name">${jobName.name}</div>
      <div class="job-name-actions">
        <button class="btn-edit" onclick="editJobNameHandler(${jobName.id}, '${jobName.name}')">
          <i class="fas fa-edit"></i> ${getTranslation('edit') || 'تعديل'}
        </button>
        <button class="btn-delete" onclick="deleteJobName(${jobName.id})">
          <i class="fas fa-trash"></i> ${getTranslation('delete') || 'حذف'}
        </button>
      </div>
    </div>
  `).join('');
}

// Edit job title
function editJobTitleHandler(id, title) {
  currentEditingJobTitleId = id;
  document.getElementById('jobTitleName').value = title;
  document.getElementById('addEditJobTitleTitle').textContent = getTranslation('edit-job-title');
  document.getElementById('addEditJobTitleModal').style.display = 'flex';
}

// Edit job name
function editJobNameHandler(id, name) {
  currentEditingJobNameId = id;
  document.getElementById('jobNameName').value = name;
  document.getElementById('addEditJobNameTitle').textContent = getTranslation('edit-job-name') || 'تعديل المسمى الوظيفي';
  document.getElementById('addEditJobNameModal').style.display = 'flex';
}

// Delete job title
async function deleteJobTitle(id) {
  if (!confirm(getTranslation('confirm-delete-job-title'))) {
    return;
  }

  try {
    const response = await fetch(`${apiBase}/job-titles/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    
    if (data.success) {
      showToast(getTranslation('job-title-deleted'), 'success');
      await loadJobTitles();
    } else {
      showToast(data.message || getTranslation('cannot-delete-job-title'), 'error');
    }
  } catch (error) {
    console.error('Error deleting job title:', error);
    showToast(getTranslation('error-occurred'), 'error');
  }
}

// Delete job name
async function deleteJobName(id) {
  if (!confirm(getTranslation('confirm-delete-job-name') || 'هل تريد حذف هذا المسمى؟')) {
    return;
  }

  try {
    const response = await fetch(`${apiBase}/job-names/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    
    if (data.success) {
      showToast(getTranslation('job-name-deleted') || 'تم حذف المسمى بنجاح', 'success');
      await loadJobNames();
    } else {
      showToast(data.message || getTranslation('cannot-delete-job-name') || 'لا يمكن حذف المسمى', 'error');
    }
  } catch (error) {
    console.error('Error deleting job name:', error);
    showToast(getTranslation('error-occurred'), 'error');
  }
}

// Save job title handler
async function saveJobTitleHandler() {
  const jobTitleName = document.getElementById('jobTitleName').value.trim();
  
  if (!jobTitleName) {
    showToast(getTranslation('enter-job-title'), 'warning');
    return;
  }

  try {
    const url = currentEditingJobTitleId 
      ? `${apiBase}/job-titles/${currentEditingJobTitleId}`
      : `${apiBase}/job-titles`;
    
    const method = currentEditingJobTitleId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title: jobTitleName })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(
        currentEditingJobTitleId 
          ? getTranslation('job-title-updated')
          : getTranslation('job-title-added'), 
        'success'
      );
      document.getElementById('addEditJobTitleModal').style.display = 'none';
      await loadJobTitles();
    } else {
      showToast(data.message || getTranslation('error-occurred'), 'error');
    }
  } catch (error) {
    console.error('Error saving job title:', error);
    showToast(getTranslation('error-occurred'), 'error');
  }
}

// Save job name handler
async function saveJobNameHandler() {
  const jobNameName = document.getElementById('jobNameName').value.trim();
  
  if (!jobNameName) {
    showToast(getTranslation('enter-job-name') || 'الرجاء إدخال المسمى', 'warning');
    return;
  }

  try {
    const url = currentEditingJobNameId 
      ? `${apiBase}/job-names/${currentEditingJobNameId}`
      : `${apiBase}/job-names`;
    
    const method = currentEditingJobNameId ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: jobNameName })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(
        currentEditingJobNameId 
          ? getTranslation('job-name-updated') || 'تم تحديث المسمى بنجاح'
          : getTranslation('job-name-added') || 'تم إضافة المسمى بنجاح', 
        'success'
      );
      document.getElementById('addEditJobNameModal').style.display = 'none';
      await loadJobNames();
    } else {
      showToast(data.message || getTranslation('error-occurred'), 'error');
    }
  } catch (error) {
    console.error('Error saving job name:', error);
    showToast(getTranslation('error-occurred'), 'error');
  }
}

// Load job titles for dropdown
async function loadJobTitlesForDropdown(selectElement, selectedValue = '') {
  try {
    const response = await fetch(`${apiBase}/job-titles`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    
    if (data.success) {
      // Clear existing options except the first one
              selectElement.innerHTML = '<option value="" data-translate="select-job-title">اختر المنصب الإداري</option>';
      
      // Add job titles
      data.data.forEach(jobTitle => {
        const option = document.createElement('option');
        option.value = jobTitle.id;
        option.textContent = jobTitle.title;
        if (jobTitle.id.toString() === selectedValue.toString()) {
          option.selected = true;
        }
        selectElement.appendChild(option);
      });
      
      // Add "Add New Job Title" option
      const addNewOption = document.createElement('option');
      addNewOption.value = '__ADD_NEW_JOB_TITLE__';
      addNewOption.textContent = getTranslation('add-new-job-title');
      selectElement.appendChild(addNewOption);
    }
  } catch (error) {
    console.error('Error loading job titles for dropdown:', error);
  }
}

// Load job names for dropdown
async function loadJobNamesForDropdown(selectElement, selectedValue = '') {
  try {
    const response = await fetch(`${apiBase}/job-names`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    
    if (data.success) {
      // Clear existing options except the first one
      selectElement.innerHTML = '<option value="" data-translate="select-job-name">اختر المسمى الوظيفي</option>';
      
      // Add job names
      data.data.forEach(jobName => {
        const option = document.createElement('option');
        option.value = jobName.id;
        option.textContent = jobName.name;
        if (jobName.id.toString() === selectedValue.toString()) {
          option.selected = true;
        }
        selectElement.appendChild(option);
      });
      
      // Add "Add new" option
      const addNewOption = document.createElement('option');
      addNewOption.value = '__ADD_NEW_JOB_NAME__';
      addNewOption.textContent = getTranslation('add-new-job-name') || 'إضافة مسمى جديد';
      selectElement.appendChild(addNewOption);
    }
  } catch (error) {
    console.error('Error loading job names for dropdown:', error);
  }
}

// Initialize job titles for add user modal
function initializeJobTitlesForAddUser() {
  const jobTitleSelect = document.getElementById('jobTitle');
  
  // Load job titles when modal opens
  btnAddUser.addEventListener('click', async () => {
    await loadJobTitlesForDropdown(jobTitleSelect);
  });
  
  // Handle "Add New Job Title" selection
  jobTitleSelect.addEventListener('change', function() {
    if (this.value === '__ADD_NEW_JOB_TITLE__') {
      this.value = '';
      document.getElementById('addJobTitleModal').style.display = 'flex';
    }
  });
}

// Initialize job names for add user modal
function initializeJobNamesForAddUser() {
  const jobNameSelect = document.getElementById('jobName');
  
  // Load job names when modal opens
  btnAddUser.addEventListener('click', async () => {
    await loadJobNamesForDropdown(jobNameSelect);
  });
  
  // Handle "Add New Job Name" selection
  jobNameSelect.addEventListener('change', function() {
    if (this.value === '__ADD_NEW_JOB_NAME__') {
      this.value = '';
      document.getElementById('addJobNameModal').style.display = 'flex';
    }
  });
}

// Handle add new job title from add user modal
function initializeAddJobTitleFromUserModal() {
  const saveAddJobTitle = document.getElementById('saveAddJobTitle');
  const cancelAddJobTitle = document.getElementById('cancelAddJobTitle');
  const jobTitleNameForUser = document.getElementById('jobTitleNameForUser');
  
  saveAddJobTitle.addEventListener('click', async () => {
    const title = jobTitleNameForUser.value.trim();
    
    if (!title) {
      showToast(getTranslation('enter-job-title'), 'warning');
      return;
    }
    
    try {
      const response = await fetch(`${apiBase}/job-titles`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast(getTranslation('job-title-added'), 'success');
        document.getElementById('addJobTitleModal').style.display = 'none';
        jobTitleNameForUser.value = '';
        
        // Refresh job titles dropdowns
        await loadJobTitlesForDropdown(document.getElementById('jobTitle'));
        await fetchJobTitlesForEditModal('', ''); // Refresh edit modal dropdown
        
        // Select the newly added job title in the active modal
        const activeModal = document.getElementById('addUserModal').style.display === 'flex' ? 'addUserModal' : 'editUserModal';
        if (activeModal === 'addUserModal') {
          document.getElementById('jobTitle').value = data.data.id;
        } else {
          document.getElementById('editJobTitle').value = data.data.id;
        }
      } else {
        showToast(data.message || getTranslation('error-occurred'), 'error');
      }
    } catch (error) {
      console.error('Error adding job title:', error);
      showToast(getTranslation('error-occurred'), 'error');
    }
  });
  
  cancelAddJobTitle.addEventListener('click', () => {
    document.getElementById('addJobTitleModal').style.display = 'none';
    jobTitleNameForUser.value = '';
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (event) => {
    const modal = document.getElementById('addJobTitleModal');
    if (event.target === modal) {
      modal.style.display = 'none';
      jobTitleNameForUser.value = '';
    }
  });
}

// Handle add new job name from add user modal
function initializeAddJobNameFromUserModal() {
  const saveAddJobName = document.getElementById('saveAddJobName');
  const cancelAddJobName = document.getElementById('cancelAddJobName');
  const jobNameNameForUser = document.getElementById('jobNameNameForUser');
  
  if (saveAddJobName && cancelAddJobName && jobNameNameForUser) {
    saveAddJobName.addEventListener('click', async () => {
      const name = jobNameNameForUser.value.trim();
      
      if (!name) {
        showToast(getTranslation('enter-job-name') || 'الرجاء إدخال المسمى', 'warning');
        return;
      }
      
      try {
        const response = await fetch(`${apiBase}/job-names`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name })
        });
        
        const data = await response.json();
        
        if (data.success) {
          showToast(getTranslation('job-name-added') || 'تم إضافة المسمى بنجاح', 'success');
          document.getElementById('addJobNameModal').style.display = 'none';
          jobNameNameForUser.value = '';
          
          // Refresh job names dropdowns
          await loadJobNamesForDropdown(document.getElementById('jobName'));
          
          // Also refresh the edit modal dropdown if it exists
          const editJobName = document.getElementById('editJobName');
          if (editJobName) {
            await fetchJobNamesForEditModal('', '');
          }
          
          // Select the newly added job name in the active modal
          const activeModal = document.getElementById('addUserModal').style.display === 'flex' ? 'addUserModal' : 'editUserModal';
          if (activeModal === 'addUserModal') {
            document.getElementById('jobName').value = data.data.id;
          } else {
            document.getElementById('editJobName').value = data.data.id;
          }
        } else {
          showToast(data.message || getTranslation('error-occurred'), 'error');
        }
      } catch (error) {
        console.error('Error adding job name:', error);
        showToast(getTranslation('error-occurred'), 'error');
      }
    });
    
    cancelAddJobName.addEventListener('click', () => {
      document.getElementById('addJobNameModal').style.display = 'none';
      jobNameNameForUser.value = '';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
      const modal = document.getElementById('addJobNameModal');
      if (event.target === modal) {
        modal.style.display = 'none';
        jobNameNameForUser.value = '';
      }
    });
  }
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeJobTitlesManagement();
  initializeJobNamesManagement();
  initializeJobTitlesForAddUser();
  initializeJobNamesForAddUser();
  initializeAddJobTitleFromUserModal();
  initializeAddJobNameFromUserModal();
  initializeManageUsers();
});

// =====================
// Section Selection Buttons
// =====================
const sectionPermissions = {
  general: [
    'view_logs',
    'view_dashboard'
  ],
  departments: [
    'add_section',
    'edit_section', 
    'delete_section'
    // استثناء: view_own_department
  ],
  folder: [
    'add_folder',
    'add_folder_name',
    'edit_folder',
    'edit_folder_name',
    'delete_folder',
    'delete_folder_name'
  ],
  content: [
    'add_content',
    'add_many_content',
    'delete_content'
  ],
  approvals: [
    'transfer_credits'
  ],
  signature: [
    'sign',
    'sign_on_behalf',
    'delegate_all',
    'revoke_delegations'
  ],
  accounts: [
    'add_user',
    'change_status',
    'change_role',
    'delete_user',
    'change_password',
    'change_user_info'
  ]
};

// تهيئة أزرار تحديد الأقسام
function initializeSectionButtons() {
  const sectionButtons = document.querySelectorAll('.btn-select-section');
  
  sectionButtons.forEach(button => {
    button.addEventListener('click', () => {
      const section = button.dataset.section;
      selectSectionPermissions(section);
    });
  });
}

// تحديد صلاحيات قسم معين
async function selectSectionPermissions(section) {
  if (!selectedUserId) {
    showToast(getTranslation('please-select-user') || 'الرجاء اختيار مستخدم أولاً', 'warning');
    return;
  }

  const permissions = sectionPermissions[section];
  if (!permissions) {
    showToast('قسم غير معروف', 'error');
    return;
  }

  try {
    // تحديد جميع الصلاحيات في القسم
    const promises = permissions.map(permission => 
      fetchJSON(`${apiBase}/users/${selectedUserId}/permissions/${encodeURIComponent(permission)}`, {
        method: 'POST'
      })
    );

    await Promise.all(promises);

    // تحديث الواجهة
    permissions.forEach(permission => {
      const checkbox = document.querySelector(`label.switch[data-key="${permission}"] input[type="checkbox"]`);
      if (checkbox) {
        checkbox.checked = true;
      }
    });

    showToast(`تم تحديد جميع صلاحيات قسم ${getSectionName(section)}`, 'success');
  } catch (error) {
    console.error('خطأ في تحديد صلاحيات القسم:', error);
    showToast('فشل في تحديد صلاحيات القسم: ' + error.message, 'error');
  }
}

// الحصول على اسم القسم باللغة الحالية
function getSectionName(section) {
  const sectionNames = {
    general: getTranslation('general-group') || 'عامّ',
    departments: getTranslation('departments-group') || 'الأقسام',
    folder: getTranslation('folder-group') || 'المجلد',
    content: getTranslation('content-group') || 'المحتوى',
    committees: getTranslation('committees-group') || 'اللجان',
    'committee-folders': getTranslation('committee-folders-group') || 'مجلدات اللجان',
    'committee-content': getTranslation('committee-content-group') || 'محتوى اللجان',
    tickets: getTranslation('tickets-group') || 'التذاكر',
    'ticket-reports': getTranslation('report-group-tickets') || 'تقارير التذاكر',
    approvals: getTranslation('approvals-group') || 'الاعتمادات',
    'approval-reports': getTranslation('report-group-approvals') || 'تقارير الاعتمادات',
    signature: getTranslation('signature-group') || 'التوقيع',
    accounts: getTranslation('accounts-group') || 'الحسابات'
  };
  
  return sectionNames[section] || section;
}

// دالة فتح popup إلغاء التفويضات
async function openRevokeDelegationsPopup() {
  if (!selectedUserId) return showToast(getTranslation('please-select-user'));
  // جلب ملخص الأشخاص المفوض لهم (ملفات + أقسام)
  let fileDelegates = [];
  let deptDelegates = [];
  try {
    // جلب ملخص الملفات
    const res = await fetch(`${apiBase}/approvals/delegation-summary/${selectedUserId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.data)) {
      fileDelegates = json.data;
    }
    // جلب ملخص الأقسام (إذا عندك endpoint للأقسام)
    // const resDept = await fetch(`${apiBase}/departments/delegation-summary/${selectedUserId}`, {
    //   headers: { 'Authorization': `Bearer ${authToken}` }
    // });
    // const jsonDept = await resDept.json();
    // if (jsonDept.status === 'success' && Array.isArray(jsonDept.data)) {
    //   deptDelegates = jsonDept.data;
    // }
  } catch (err) {
    showToast(getTranslation('error-occurred'));
    return;
  }
  // بناء popup
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style = 'background:#fff;padding:32px 24px;border-radius:12px;max-width:600px;min-width:340px;text-align:center;box-shadow:0 2px 16px #0002;max-height:80vh;overflow:auto;';
  box.innerHTML = `<div style='font-size:1.2rem;margin-bottom:18px;'>${getTranslation('revoke-delegations')} (${getTranslation('by-person') || 'حسب الشخص'})</div>`;
  if (fileDelegates.length === 0 && deptDelegates.length === 0) {
    box.innerHTML += `<div style='margin:24px 0;'>${getTranslation('no-active-delegations') || 'لا يوجد تفويضات نشطة'}</div>`;
  } else {
    if (fileDelegates.length > 0) {
      box.innerHTML += `<div style='font-weight:bold;margin:12px 0 6px;'>${getTranslation('file-delegations') || 'تفويضات الملفات'}:</div>`;
      fileDelegates.forEach(d => {
        const filesText = d.files_count > 0 
          ? `(${getTranslation('files-count') || 'عدد الملفات'}: ${d.files_count})`
          : `(${getTranslation('permanent-delegation') || 'تفويض دائم'})`;
        
        box.innerHTML += `<div style='margin:8px 0;padding:8px 0;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;'>
          <span style='flex:1;text-align:right;'>${d.approver_name || d.email || (getTranslation('user') || 'مستخدم') + ' ' + d.approver_id} <span style='color:#888;font-size:0.95em;'>${filesText}</span></span>
          <button style='background:#e53e3e;color:#fff;border:none;border-radius:6px;padding:4px 16px;cursor:pointer;margin-right:12px;' onclick='window.__revokeAllToUser(${selectedUserId},${d.approver_id},false,this)'>${getTranslation('revoke-delegations') || 'إلغاء التفويضات'}</button>
        </div>`;
      });
    }
    // إذا أضفت دعم الأقسام أضف هنا
    // if (deptDelegates.length > 0) { ... }
  }
  // زر إغلاق
  const btnClose = document.createElement('button');
  btnClose.textContent = getTranslation('cancel') || 'إغلاق';
  btnClose.style = 'margin-top:18px;background:#888;color:#fff;border:none;border-radius:6px;padding:8px 24px;font-size:1rem;cursor:pointer;';
  btnClose.onclick = () => document.body.removeChild(overlay);
  box.appendChild(btnClose);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  // دالة إلغاء التفويض بالكامل (تربط على window)
  window.__revokeAllToUser = async function(delegatorId, delegateeId, isCommittee, btn) {
    if (!confirm(getTranslation('confirm-revoke-all') || 'هل أنت متأكد من إلغاء جميع التفويضات لهذا الشخص؟')) return;
    btn.disabled = true;
    btn.textContent = '...';
    try {
      // إلغاء التفويضات من approval_logs
      const url = isCommittee
        ? `${apiBase}/committee-approvals/delegations/by-user/${delegatorId}?to=${delegateeId}`
        : `${apiBase}/approvals/delegations/by-user/${delegatorId}?to=${delegateeId}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      const json = await res.json();
      
      // إلغاء التفويض الدائم من active_delegations
      const resActive = await fetch(`${apiBase}/approvals/revoke-active-delegation`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          delegatorId: delegatorId,
          delegateeId: delegateeId
        })
      });
      
      if (json.status === 'success' || resActive.ok) {
        btn.parentNode.style.opacity = '0.5';
        btn.textContent = getTranslation('revoked') || 'تم الإلغاء';
        btn.disabled = true;
        setTimeout(() => {
          const stillActive = overlay.querySelectorAll('button:not([disabled])').length;
          if (!stillActive) {
            document.body.removeChild(overlay);
            loadUsers();
          }
        }, 700);
      } else {
        btn.disabled = false;
        btn.textContent = getTranslation('revoke-delegations');
        showToast(json.message || getTranslation('error-occurred'));
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = getTranslation('revoke-delegations');
      showToast(getTranslation('error-occurred'));
    }
  };
}

// إغلاق المودال عند النقر خارج المحتوى
if (editUserModal) {
  editUserModal.addEventListener('click', function(event) {
    if (event.target === this) {
      editUserModal.style.display = 'none';
    }
  });
}

// دالة فتح modal اقرارات التفويض
async function openDelegationConfirmationsModal() {
  try {
    console.log('Opening delegation confirmations modal...');
    console.log('Current authToken:', authToken ? 'exists' : 'missing');
    
    // إظهار دور المستخدم الحالي للـ debugging
    if (authToken) {
      try {
        const payload = await safeGetUserInfo(authToken);
        console.log('Current user role:', payload.role);
        console.log('Current user ID:', payload.id);
      } catch (e) {
        console.error('Error parsing JWT payload:', e);
      }
    }
    
    // إظهار loading
    const modal = document.getElementById('delegationConfirmationsModal');
    const listContainer = document.getElementById('delegationConfirmationsList');
    
    if (!modal) {
      console.error('Modal element not found');
      showToast('خطأ في فتح النافذة', 'error');
      return;
    }
    
    if (!listContainer) {
      console.error('List container element not found');
      showToast('خطأ في فتح النافذة', 'error');
      return;
    }
    
    listContainer.innerHTML = '<div style="text-align: center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    modal.style.display = 'flex';
    
    // جلب اقرارات التفويض
    const confirmations = await fetchDelegationConfirmations();
    


    if (confirmations.length === 0) {
      listContainer.innerHTML = `
        <div class="delegation-confirmations-empty">
          <i class="fas fa-clipboard-list"></i>
          <h3>لا توجد اقرارات تفويض</h3>
          <p>لم يتم العثور على أي اقرارات تفويض في النظام حتى الآن</p>
          <p style="font-size: 0.9em; color: #666; margin-top: 10px;">
            اقرارات التفويض تظهر هنا عندما يقوم المستخدمون بتفويض صلاحياتهم للآخرين (الأقسام واللجان والمحاضر)
          </p>
        </div>
      `;
    } else {
      await renderDelegationConfirmations(confirmations);
    }
  } catch (error) {
    console.error('Error opening delegation confirmations modal:', error);
    showToast('خطأ في تحميل اقرارات التفويض', 'error');
    
    const listContainer = document.getElementById('delegationConfirmationsList');
    if (listContainer) {
      listContainer.innerHTML = `
        <div class="delegation-confirmations-empty">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>خطأ في التحميل</h3>
          <p>حدث خطأ أثناء تحميل اقرارات التفويض: ${error.message}</p>
        </div>
      `;
    }
  }
}

// دالة إغلاق modal اقرارات التفويض
function closeDelegationConfirmationsModal() {
  const modal = document.getElementById('delegationConfirmationsModal');
  modal.style.display = 'none';
}

// دالة جلب اقرارات التفويض من الخادم
async function fetchDelegationConfirmations() {
  try {
    // التحقق من وجود token
    if (!authToken) {
      console.error('No authentication token found');
      throw new Error('No authentication token found');
    }

    console.log('Fetching delegation confirmations with token:', authToken.substring(0, 20) + '...');
    
    const response = await fetch(`${apiBase}/approvals/delegation-confirmations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Response error text:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Response data:', data);
    
    if (data.status === 'success') {
      return data.data || [];
    } else {
      throw new Error(data.message || 'فشل في جلب اقرارات التفويض');
    }
  } catch (error) {
    console.error('Error fetching delegation confirmations:', error);
    throw error;
  }
}

// دالة استرجاع التوقيع من البيانات المرجعة من الخادم
function getSignatureFromData(confirmation) {
  // electronic_signature هو boolean flag يشير إلى تفعيل التوقيع الإلكتروني
  // signature يحتوي على بيانات التوقيع الفعلية (data URL)
  
  // التحقق من وجود توقيع فعلي
  if (confirmation.signature && 
      typeof confirmation.signature === 'string' && 
      confirmation.signature.trim() !== '') {
    return confirmation.signature;
  }
  
  // إذا لم يكن هناك توقيع فعلي، نتحقق من وجود توقيع إلكتروني
  if (confirmation.electronic_signature && 
      typeof confirmation.electronic_signature === 'string' && 
      confirmation.electronic_signature.trim() !== '') {
    return confirmation.electronic_signature;
  }
  
  return null;
}

// دالة عرض اقرارات التفويض
async function renderDelegationConfirmations(confirmations) {
  // الحصول على معرف المستخدم الحالي
      const currentUserId = await getCurrentUserId();
  
  const listContainer = document.getElementById('delegationConfirmationsList');
  
  const confirmationsHTML = confirmations.map(confirmation => {
    const confirmationDate = new Date(confirmation.created_at).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const delegationTypeText = confirmation.is_bulk ? 'تفويض شامل' : 'تفويض فردي';
    const contentTypeText = 'قسم'; // دائماً قسم في هذا المشروع

    // تحديد نوع التفويض للمديرين - عرض جميع التفويضات
    let delegationTypeBadge = '';
    let delegationTypeClass = '';
    
    // عرض اقرار منفصل حسب نوع التفويض مع فحوصات إضافية
    if (confirmation.delegation_type === 'sender' && confirmation.delegator) {
      delegationTypeBadge = `<span class="delegation-type-badge sender">اقرار المرسل: ${confirmation.delegator.fullName || 'غير معروف'}</span>`;
      delegationTypeClass = 'delegation-sender';
    } else if (confirmation.delegation_type === 'receiver' && confirmation.delegate) {
      delegationTypeBadge = `<span class="delegation-type-badge receiver">اقرار المستقبل: ${confirmation.delegate.fullName || 'غير معروف'}</span>`;
      delegationTypeClass = 'delegation-receiver';
    }

    let filesHTML = '';
    if (confirmation.is_bulk) {
      filesHTML = `
        <div class="delegation-confirmation-files">
          <div class="delegation-confirmation-files-summary">
            تفويض شامل لجميع الملفات المعلقة
          </div>
        </div>
      `;
    } else if (confirmation.files && confirmation.files.length > 0) {
      const filesList = confirmation.files.map(file => `
        <div class="delegation-confirmation-file-item">
          <span class="delegation-confirmation-file-name">${file.title || file.name || 'عنوان غير معروف'}</span>
          <span class="delegation-confirmation-file-type">قسم</span>
        </div>
      `).join('');
      
      filesHTML = `
        <div class="delegation-confirmation-files">
          <div class="delegation-confirmation-files-list">
            ${filesList}
          </div>
        </div>
      `;
    }

    // فحص وجود delegator و delegate
    const delegatorName = confirmation.delegator?.fullName || 'غير معروف';
    const delegatorIdNumber = confirmation.delegator?.idNumber || 'غير محدد';
    const delegateName = confirmation.delegate?.fullName || 'غير معروف';
    const delegateIdNumber = confirmation.delegate?.idNumber || 'غير محدد';

    return `
      <div class="delegation-confirmation-item ${delegationTypeClass}">
        <div class="delegation-confirmation-header">
          <div class="delegation-confirmation-title-section">
            <h3 class="delegation-confirmation-title">اقرار تفويض</h3>
            ${delegationTypeBadge}
          </div>
          <span class="delegation-confirmation-date">${confirmationDate}</span>
        </div>
        
        <div class="delegation-confirmation-type">${delegationTypeText}</div>
        
        <div class="delegation-confirmation-details">
          <div class="delegation-confirmation-section">
            <h4>معلومات الموظف المفوض</h4>
            <div class="delegation-confirmation-info-row">
              <span class="delegation-confirmation-label">الاسم:</span>
              <span class="delegation-confirmation-value">${delegatorName}</span>
            </div>
            <div class="delegation-confirmation-info-row">
              <span class="delegation-confirmation-label">رقم الهوية:</span>
              <span class="delegation-confirmation-value">${delegatorIdNumber}</span>
            </div>
          </div>
          
          <div class="delegation-confirmation-section">
            <h4>معلومات الموظف المفوض له</h4>
            <div class="delegation-confirmation-info-row">
              <span class="delegation-confirmation-label">الاسم:</span>
              <span class="delegation-confirmation-value">${delegateName}</span>
            </div>
            <div class="delegation-confirmation-info-row">
              <span class="delegation-confirmation-label">رقم الهوية:</span>
              <span class="delegation-confirmation-value">${delegateIdNumber}</span>
            </div>
          </div>
        </div>
        
        <div class="delegation-confirmation-statement">
          ${confirmation.delegation_type === 'sender' 
            ? `أقر الموظف <strong>${delegatorName}</strong> 
               ذو رقم الهوية <strong>${delegatorIdNumber}</strong> 
               بأنه يفوض الموظف <strong>${delegateName}</strong> 
               ذو رقم الهوية <strong>${delegateIdNumber}</strong> 
               بالتوقيع بالنيابة عنه على ${confirmation.is_bulk ? 'جميع ملفات القسم المعلقة' : 'الملفات المحددة'}.`
            : `قبل الموظف <strong>${delegateName}</strong> 
               ذو رقم الهوية <strong>${delegateIdNumber}</strong> 
               التفويض من الموظف <strong>${delegatorName}</strong> 
               ذو رقم الهوية <strong>${delegatorIdNumber}</strong> 
               للتوقيع بالنيابة عنه على ${confirmation.is_bulk ? 'جميع ملفات القسم المعلقة' : 'الملفات المحددة'}.`
          }
        </div>
        
        ${confirmation.signature ? `
          <div class="delegation-confirmation-signature">
            <h4>التوقيع</h4>
            <img src="${confirmation.signature}" alt="توقيع الموظف" style="max-width: 200px; border: 1px solid #ccc; border-radius: 4px;" />
          </div>
        ` : ''}
        
        ${filesHTML}
      </div>
    `;
  }).join('');
  
  listContainer.innerHTML = confirmationsHTML;
}

// دالة مساعدة للحصول على معرف المستخدم الحالي
async function getCurrentUserId() {
  if (!authToken) return null;
  try {
    const payload = await safeGetUserInfo(authToken);
    return payload.id;
  } catch (e) {
    console.error('Error parsing JWT payload:', e);
    return null;
  }
}
