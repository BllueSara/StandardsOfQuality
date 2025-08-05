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
const profileJobTitle = document.getElementById('profile-job-title');

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
const editFirstName = document.getElementById('editFirstName');
const editSecondName = document.getElementById('editSecondName');
const editThirdName = document.getElementById('editThirdName');
const editLastName = document.getElementById('editLastName');
const editUsername = document.getElementById('editUsername');
const editEmployeeNumber = document.getElementById('editEmployeeNumber');
const editDepartment = document.getElementById('editDepartment');
const editEmail = document.getElementById('editEmail');
const btnCancelEditUser = document.getElementById('cancelEditUser');
const btnSaveEditUser = document.getElementById('saveEditUser');
const editJobTitle = document.getElementById('editJobTitle');

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
    profileJobTitle.textContent = u.job_title    || '—';

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
      job_title_id: document.getElementById('jobTitle').value
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
  
  // إذا كان المستخدم المستهدف admin
  if (u.role === 'admin') {
    // فقط admin نفسه يمكنه تعديل معلوماته
    if (myRole === 'admin' && Number(u.id) === Number(myId)) {
      btnEditUserInfo.style.display = '';
    } else {
      btnEditUserInfo.style.display = 'none';
    }
    return;
  }
  
  // للمستخدمين غير admin: admin أو من لديه الصلاحية يمكنه التعديل
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
      showToast('لا يمكن تعديل معلومات admin آخر', 'warning');
      return;
    }
    
    // تقسيم الاسم الكامل إلى أسماء منفصلة
    const nameParts = (u.name || '').split(' ').filter(part => part.trim());
    editFirstName.value = nameParts[0] || '';
    editSecondName.value = nameParts[1] || '';
    editThirdName.value = nameParts[2] || '';
    editLastName.value = nameParts.slice(3).join(' ') || '';
    editUsername.value = u.username || '';
    
    editEmployeeNumber.value = u.employee_number || '';
    // جلب المسميات الوظيفية وتعبئة الدروب داون
    await fetchJobTitlesForEditModal(u.job_title_id, u.job_title);
    editEmail.value = u.email || '';
    editUserRole = u.role || null;
    
    // جلب الأقسام وتعبئة الدروب داون
    await fetchDepartmentsForEditModal(u.departmentId, u.departmentName);
    
    // Handle "Add New Job Title" selection in edit modal
    editJobTitle.addEventListener('change', function() {
      if (this.value === '__ADD_NEW_JOB_TITLE__') {
        this.value = '';
        document.getElementById('addJobTitleModal').style.display = 'flex';
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
    const selectText = lang === 'ar' ? 'اختر المسمى الوظيفي' : 'Select Job Title';
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
    
    // جمع الأسماء
    const firstName = editFirstName.value.trim();
    const secondName = editSecondName.value.trim();
    const thirdName = editThirdName.value.trim();
    const lastName = editLastName.value.trim();
    const username = editUsername.value.trim();
    
    // تحقق من الحقول المطلوبة
    // للادمن: فقط الاسم الأول واسم العائلة واسم المستخدم مطلوبة
    // للمستخدمين الآخرين: جميع الحقول مطلوبة
    const isAdmin = editUserRole === 'admin';
    
    if (isAdmin) {
      // للادمن: فقط الحقول الأساسية مطلوبة
      if (!firstName || !lastName || !username) {
        showToast('الاسم الأول واسم العائلة واسم المستخدم مطلوبة للادمن.', 'warning');
        return;
      }
    } else {
      // للمستخدمين الآخرين: جميع الحقول مطلوبة
      if (!firstName || !lastName || !username || !editEmployeeNumber.value.trim() || !editJobTitle.value.trim() || !editDepartment.value || !editEmail.value.trim()) {
        showToast('الاسم الأول واسم العائلة واسم المستخدم وجميع الحقول الأخرى مطلوبة.', 'warning');
        return;
      }
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
      job_title_id: editJobTitle.value,
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

// Open job titles management modal
async function openJobTitlesModal() {
  document.getElementById('jobTitlesModal').style.display = 'flex';
  await loadJobTitles();
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

// Edit job title
function editJobTitleHandler(id, title) {
  currentEditingJobTitleId = id;
  document.getElementById('jobTitleName').value = title;
  document.getElementById('addEditJobTitleTitle').textContent = getTranslation('edit-job-title');
  document.getElementById('addEditJobTitleModal').style.display = 'flex';
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

// Load job titles for dropdown
async function loadJobTitlesForDropdown(selectElement, selectedValue = '') {
  try {
    const response = await fetch(`${apiBase}/job-titles`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await response.json();
    
    if (data.success) {
      // Clear existing options except the first one
      selectElement.innerHTML = '<option value="" data-translate="select-job-title">اختر المسمى الوظيفي</option>';
      
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

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeJobTitlesManagement();
  initializeJobTitlesForAddUser();
  initializeAddJobTitleFromUserModal();
});
