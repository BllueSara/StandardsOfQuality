// permissions.js

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
    toast.textContent = message;

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

const apiBase      = 'http://localhost:3006/api';
let authToken      = localStorage.getItem('token') || null;
let selectedUserId = null;
let myPermsSet     = new Set(); // صلاحيات المستخدم الحالي
let editUserRole = null;
let canGrantAll    = false; // للتحقق من صلاحية منح جميع الصلاحيات

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
const btnClearCache = document.getElementById('btn-clear-cache');

// إضافة زر إلغاء جميع التفويضات
const btnRevokeDelegations = document.createElement('button');
btnRevokeDelegations.id = 'btn-revoke-delegations';
btnRevokeDelegations.textContent = getTranslation('revoke-delegations') || 'إلغاء التفويضات';
btnRevokeDelegations.style = 'margin: 0 8px; background: #e53e3e; color: #fff; border: none; border-radius: 6px; padding: 8px 18px; font-size: 1rem; cursor: pointer;';
btnRevokeDelegations.onclick = openRevokeDelegationsPopup;
if (btnAddUser && btnAddUser.parentNode) {
  btnAddUser.parentNode.insertBefore(btnRevokeDelegations, btnAddUser.nextSibling);
}
btnRevokeDelegations.style.display = 'none'; // أظهره فقط إذا كان لديك الصلاحية المناسبة

// زر مسح الكاش ميموري - للادمن فقط
if (btnClearCache) {
  btnClearCache.onclick = async () => {
    // تحقق من أن المستخدم admin
    const authToken = localStorage.getItem('token') || '';
    const payload = JSON.parse(atob(authToken.split('.')[1] || '{}'));
    const myRole = payload.role;
    
    if (myRole !== 'admin') {
      showToast('هذا الزر متاح للادمن فقط', 'error');
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

// زر سحب الملفات
const btnRevokeFiles = document.getElementById('btn-revoke-files');
if (btnRevokeFiles) {
  // تحقق من الدور مباشرة من التوكن
  let isAdmin = false;
  try {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
      isAdmin = payload.role === 'admin';
    }
  } catch {}
  btnRevokeFiles.style.display = (myPermsSet.has('revoke_files') || isAdmin) ? '' : 'none';
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
      showToast('غير مسموح: يرجى تسجيل الدخول مجدداً');
    } else {
      showToast(msg);
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
    
    // تحديث متغير canGrantAll
    canGrantAll = myPermsSet.has('grant_all_permissions');
    
    // أظهر زر إلغاء جميع التفويضات إذا كان لديك الصلاحية
    const myRole = payload.role;
    if (myRole === 'admin' || myPermsSet.has('grant_permissions') || myPermsSet.has('revoke_delegations')) {
      btnRevokeDelegations.style.display = '';
    } else {
      btnRevokeDelegations.style.display = 'none';
    }
    
    // إظهار زر مسح الكاش ميموري للادمن فقط
    if (btnClearCache) {
      btnClearCache.style.display = (myRole === 'admin') ? '' : 'none';
    }
  } catch (e) {
    showToast('فشل جلب صلاحياتي.');
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
      showToast(getTranslation('logout_due_to_deactivation'));
      localStorage.removeItem('token');
      window.location.href = '/frontend/html/login.html';
    }
  } catch {
    showToast(getTranslation('status_change_failed'));
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
  if (isAdmin && !roles.includes('hospital_manager')) {
    roles.push('hospital_manager');
  }
  roleSelect.innerHTML = roles.map(r => `
    <option value="${r}" ${u.role===r?'selected':''}>
      ${r === 'hospital_manager' ? 'مدير المستشفى' : r}
    </option>
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

    // إظهار البنود: Admin يرى الكل، ومُخول grant يرى فقط ما يملكه، ومُخول grant_all_permissions يرى الكل
    if (!isAdmin && myRole !== 'admin' && !myPermsSet.has(key) && key !== 'grant_permissions' && key !== 'grant_all_permissions' && !canGrantAll) {
      item.style.display = 'none';
    } else {
      item.style.display = '';
    }

    // تأشير الحالة
    input.checked = targetSet.has(key);
    // تمكين الصلاحيات: Admin يمكنه منح الكل، ومُخول grant يمكنه منح ما يملكه، ومُخول grant_all_permissions يمكنه منح الكل
    input.disabled = !(isAdmin || myPermsSet.has(key) || canGrantAll);
    
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
}


// handlers role popup
btnCancelRole.addEventListener('click', () => rolePopup.classList.remove('show'));
btnSaveRole.addEventListener('click', async () => {
  if (!selectedUserId) return showToast('اختر مستخدماً أولاً');
  const newRole = roleSelect.value;
  try {
    await fetchJSON(`${apiBase}/users/${selectedUserId}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
    profileRoleEl.textContent = newRole;
    rolePopup.classList.remove('show');
    showToast('تم تغيير الدور');
  } catch {
    showToast('فشل تغيير الدور');
  }
});

// Delete User
btnDeleteUser.addEventListener('click', async () => {
  if (!selectedUserId) {
    return showToast('اختر مستخدماً أولاً');
  }
  if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) {
    return;
  }

  try {
    const result = await fetchJSON(`${apiBase}/users/${selectedUserId}`, {
      method: 'DELETE'
    });
    showToast(result.message || 'تم حذف المستخدم بنجاح');
    loadUsers();
  } catch (err) {
    console.error('خطأ في حذف المستخدم:', err);
    // err.message هنا يحمل "خطأ في حذف المستخدم" أو الرسالة الخاصة من السيرفر
    showToast(err.message);
  }
});


// Reset Password
btnResetPwd.addEventListener('click', async () => {
  if (!selectedUserId) return showToast('اختر مستخدماً أولاً');
  const newPassword = prompt('أدخل كلمة المرور الجديدة للمستخدم:');
  if (!newPassword) return;
  try {
    await fetchJSON(`${apiBase}/users/${selectedUserId}/reset-password`, { method: 'PUT', body: JSON.stringify({ newPassword }) });
    showToast('تم تحديث كلمة المرور بنجاح');
  } catch (err) {
    showToast('فشل إعادة التعيين: ' + err.message);
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
    if (!selectedUserId) return showToast('اختر مستخدماً أولاً');
    window.location = `${apiBase}/users/${selectedUserId}/export/excel`;
  });
}
const btnPdf = document.getElementById('btn-export-pdf');
if (btnPdf) {
  btnPdf.addEventListener('click', () => {
    if (!selectedUserId) return showToast('اختر مستخدماً أولاً');
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
    const response = await fetch(`${apiBase}/departments/all`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const result = await response.json();
    const data = result.data || result;
    if (!Array.isArray(data)) throw new Error('الرد ليس مصفوفة أقسام');
    const lang = localStorage.getItem('language') || 'ar';
    const selectText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
    editDepartment.innerHTML = `<option value="">${selectText}</option>`;
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
      if (dept.id == selectedId) option.selected = true;
      editDepartment.appendChild(option);
    });
  } catch (error) {
    showToast('خطأ في جلب الأقسام.');
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
      showToast('جميع الحقول مطلوبة.');
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
      showToast('تم تحديث معلومات المستخدم بنجاح');
    } catch (err) {
      showToast('فشل تحديث معلومات المستخدم: ' + err.message);
    }
  });
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
        box.innerHTML += `<div style='margin:8px 0;padding:8px 0;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;'>
          <span style='flex:1;text-align:right;'>${d.approver_name || d.email || (getTranslation('user') || 'مستخدم') + ' ' + d.approver_id} <span style='color:#888;font-size:0.95em;'>(${getTranslation('files-count') || 'عدد الملفات'}: ${d.files_count})</span></span>
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
      const url = isCommittee
        ? `${apiBase}/committee-approvals/delegations/by-user/${delegatorId}?to=${delegateeId}`
        : `${apiBase}/approvals/delegations/by-user/${delegatorId}?to=${delegateeId}`;
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
        showToast(json.message || getTranslation('error-occurred'));
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = getTranslation('revoke-delegations');
      showToast(getTranslation('error-occurred'));
    }
  };
}
