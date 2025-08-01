// departments.js
// Add JavaScript specific to the departments page here
const apiBase      = 'http://localhost:3006/api';

document.addEventListener('DOMContentLoaded', async function() {
    // دالة إظهار التوست
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

        // تفعيل التوست
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Set a timeout to remove the toast
        setTimeout(() => {
            toast.classList.remove('show');
            // Remove element after animation completes
            setTimeout(() => {
                toast.remove();
            }, 500); // Should match CSS animation duration
        }, duration);
    }
    // Get references to elements
    const addDepartmentBtn = document.getElementById('addDepartmentButton');
    const addDepartmentModal = document.getElementById('addDepartmentModal');
    const addModalSaveBtn = document.getElementById('saveAddDepartment');
    const addModalCancelBtn = document.getElementById('cancelAddDepartment');
    const addDepartmentTypeInput = document.getElementById('departmentType');
    const addDepartmentNameArInput = document.getElementById('departmentNameAr');
    const addDepartmentNameEnInput = document.getElementById('departmentNameEn');
    const addDepartmentImageInput = document.getElementById('departmentImage');
    const addDepartmentHasSubDepartmentsYes = document.getElementById('hasSubDepartmentsYes');
    const addDepartmentHasSubDepartmentsNo = document.getElementById('hasSubDepartmentsNo');
    const cardsGrid = document.querySelector('.cards-grid');
    const searchInput = document.getElementById('searchInput');

    const editDepartmentModal = document.getElementById('editDepartmentModal');
    const editModalSaveBtn = document.getElementById('saveEditDepartment');
    const editModalCancelBtn = document.getElementById('cancelEditDepartment');
    const editDepartmentIdInput = document.getElementById('editDepartmentId');
    const editDepartmentTypeInput = document.getElementById('editDepartmentType');
    const editDepartmentNameArInput = document.getElementById('editDepartmentNameAr');
    const editDepartmentNameEnInput = document.getElementById('editDepartmentNameEn');
    const editDepartmentImageInput = document.getElementById('editDepartmentImage');
    const editDepartmentHasSubDepartmentsYes = document.getElementById('editHasSubDepartmentsYes');
    const editDepartmentHasSubDepartmentsNo = document.getElementById('editHasSubDepartmentsNo');

    const deleteDepartmentModal = document.getElementById('deleteDepartmentModal');
    const deleteModalConfirmBtn = document.getElementById('confirmDeleteDepartment');
    const deleteModalCancelBtn = document.getElementById('cancelDeleteDepartment');

    // Store original departments data for filtering
    let allDepartments = [];

    // Utility to get token
    function getToken() { return localStorage.getItem('token'); }

    // Decode JWT to extract user ID
    function getUserId() {
        const token = getToken();
        if (!token) return null;
        try {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(atob(payload));
            return decoded.id || decoded.userId || decoded.sub || null;
        } catch (e) {
            console.warn('Failed to decode token for user ID:', e);
            return null;
        }
    }

    // Ensure authentication
    function checkAuth() {
        if (!getToken()) {
            showToast(getTranslation('please-login'), 'error');
            window.location.href = 'login.html';
        }
    }
    checkAuth();

    // Permissions state
    const permissions = { canAdd: false, canEdit: false, canDelete: false };

    // فتح بوب اب اضافه القسم 
    addDepartmentBtn.addEventListener('click', () => openModal(addDepartmentModal));

    // Search functionality
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.trim().toLowerCase();
        filterDepartments(searchTerm);
        
        // Add visual feedback
        if (searchTerm.length > 0) {
            searchInput.style.borderColor = '#007bff';
            searchInput.style.boxShadow = '0 0 0 2px rgba(0, 123, 255, 0.25)';
        } else {
            searchInput.style.borderColor = '';
            searchInput.style.boxShadow = '';
        }
    });

    // Add clear search functionality
    searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            this.value = '';
            filterDepartments('');
            this.style.borderColor = '';
            this.style.boxShadow = '';
        }
    });

    // Update search placeholder based on language
    function updateSearchPlaceholder() {
        const lang = localStorage.getItem('language') || 'ar';
        if (lang === 'ar') {
            searchInput.placeholder = getTranslation('search-department-placeholder');
        } else {
            searchInput.placeholder = getTranslation('search-department-placeholder');
        }
    }

    // Filter departments based on search term
    function filterDepartments(searchTerm) {
        const lang = localStorage.getItem('language') || 'ar';
        
        const filteredDepartments = allDepartments.filter(dept => {
            let deptName;
            let parsed;
            try {
                parsed = JSON.parse(dept.name);
                deptName = parsed[lang] || parsed['ar'] || dept.name;
            } catch {
                deptName = dept.name;
                parsed = null;
            }
            
            // Search in both Arabic and English names
            const nameAr = (parsed && parsed.ar) ? parsed.ar.toLowerCase() : '';
            const nameEn = (parsed && parsed.en) ? parsed.en.toLowerCase() : '';
            
            return deptName.toLowerCase().includes(searchTerm) || 
                   nameAr.includes(searchTerm) || 
                   nameEn.includes(searchTerm);
        });
        
        renderDepartments(filteredDepartments);
    }

    // Fetch user permissions
async function fetchPermissions() {
  const userId = getUserId();
  if (!userId) return;

  const headers = { 'Authorization': `Bearer ${getToken()}` };

  // جلب دور المستخدم
  const userRes      = await fetch(`${apiBase}/users/${userId}`, { headers });
  const { data: user } = await userRes.json();
  const role = user.role;
  if (role === 'admin') {
    permissions.canAdd = permissions.canEdit = permissions.canDelete = true;
  }

  // جلب قائمة الصلاحيات
  const permsRes = await fetch(`${apiBase}/users/${userId}/permissions`, { headers });
  const { data: perms } = await permsRes.json();

  console.log('raw permissions:', perms);

  // تعامُل مع النصوص و objects
  const keys = perms.map(p => 
    (typeof p === 'string' ? p : p.permission)
  );
  console.log('mapped keys:', keys);

  // ضبط صلاحيات العرض
  if (keys.includes('add_section'))    permissions.canAdd    = true;
  if (keys.includes('edit_section'))   permissions.canEdit   = true;
  if (keys.includes('delete_section')) permissions.canDelete = true;
}


    // Modal handlers
    function openModal(modal) { modal.style.display = 'flex'; }
function closeModal(modal) {
  modal.style.display = 'none';

  if (modal === addDepartmentModal) {
    addDepartmentTypeInput.value = '';
    addDepartmentNameArInput.value = '';
    addDepartmentNameEnInput.value = '';
    addDepartmentImageInput.value = '';
    addDepartmentHasSubDepartmentsNo.checked = true; // إعادة تعيين للقيمة الافتراضية
  } else if (modal === editDepartmentModal) {
    editDepartmentIdInput.value = '';
    editDepartmentTypeInput.value = '';
    editDepartmentNameArInput.value = '';
    editDepartmentNameEnInput.value = '';
    editDepartmentImageInput.value = '';
    editDepartmentHasSubDepartmentsNo.checked = true; // إعادة تعيين للقيمة الافتراضية
  }
}


    // Show/hide Add button
    function updateAddButtonVisibility() {
        if (addDepartmentBtn) addDepartmentBtn.style.display = permissions.canAdd ? '' : 'none';
    }

    // Render departments to the grid
    function renderDepartments(departments) {
        cardsGrid.innerHTML = '';
        const lang = localStorage.getItem('language') || 'ar';

        if (departments.length === 0) {
            const noResultsDiv = document.createElement('div');
            noResultsDiv.className = 'no-results';
            noResultsDiv.style.cssText = 'text-align: center; padding: 40px; color: #666; font-size: 18px; grid-column: 1 / -1;';
            noResultsDiv.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <i class="fas fa-search" style="font-size: 48px; color: #ccc;"></i>
                </div>
                <div>${getTranslation('no-results-found') || 'لا توجد نتائج مطابقة للبحث'}</div>
            `;
            cardsGrid.appendChild(noResultsDiv);
            return;
        }

        departments.forEach(dept => {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.id = dept.id;

            // ✅ استخراج اسم القسم من JSON حسب اللغة
            let deptName;
            try {
                const parsed = JSON.parse(dept.name);
                deptName = parsed[lang] || parsed['ar'] || dept.name;
            } catch {
                deptName = dept.name;
            }

            // إضافة نوع القسم/الإدارة
            const typeText = dept.type === 'department' ? getTranslation('department-type-text') : getTranslation('administration-type-text');
            const typeClass = dept.type === 'department' ? 'department' : 'administration';

            let icons = '';
            if (permissions.canEdit || permissions.canDelete) {
                icons = '<div class="card-icons">';
                            if (permissions.canEdit)
                icons += `<a href="#" class="edit-icon" data-id="${dept.id}" data-name='${dept.name}' data-type="${dept.type}" data-has-sub-departments="${dept.has_sub_departments || false}"><img src="../images/edit.svg" alt="${getTranslation('edit')}"></a>`;

                if (permissions.canDelete)
                    icons += `<a href="#" class="delete-icon" data-id="${dept.id}"><img src="../images/delet.svg" alt="${getTranslation('delete')}"></a>`;
                icons += '</div>';
            }

            card.innerHTML = icons +
                `<div class="card-icon bg-blue"><img src="http://localhost:3006/${dept.image}" alt="${deptName}"></div>` +
                `<div class="card-title">${deptName}</div>` +
                `<div class="card-subtitle"><span class="type-badge ${typeClass}">${typeText}</span></div>`;

            cardsGrid.appendChild(card);

            card.addEventListener('click', e => {
                if (e.target.closest('.card-icons')) return;
                
                // التحقق من وجود تابعين
                checkForSubDepartments(dept.id, dept.name, dept.type, dept.has_sub_departments);
            });
        });

        if (permissions.canEdit)
            document.querySelectorAll('.edit-icon').forEach(el => el.addEventListener('click', handleEdit));
        if (permissions.canDelete)
            document.querySelectorAll('.delete-icon').forEach(el => el.addEventListener('click', handleDeleteOpen));
    }

    // Check if department has sub-departments
    async function checkForSubDepartments(departmentId, departmentName, departmentType, hasSubDepartments) {
        try {
            console.log('🔍 Checking sub-departments for department:', departmentId, 'hasSubDepartments:', hasSubDepartments);
            
            if (hasSubDepartments) {
                // إذا كان القسم يسمح بإضافة تابعين، انتقل لصفحة التابعين
                console.log('🔍 Department allows sub-departments, redirecting to sub-departments page');
                window.location.href = `sub-departments.html?departmentId=${departmentId}`;
            } else {
                // إذا كان القسم لا يسمح بإضافة تابعين، انتقل لصفحة المحتويات
                console.log('🔍 Department does not allow sub-departments, redirecting to content page');
                window.location.href = `department-content.html?departmentId=${departmentId}`;
            }
        } catch (error) {
            console.error('Error checking sub-departments:', error);
            // في حالة الخطأ، انتقل لصفحة المحتويات
            window.location.href = `department-content.html?departmentId=${departmentId}`;
        }
    }

    // Fetch and render departments
async function fetchDepartments() {
    try {
        const res = await fetch('http://localhost:3006/api/departments', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message);

        // Store all departments for filtering
        allDepartments = result.success ? result.data : result;
        
        // Render all departments initially
        renderDepartments(allDepartments);

    } catch (err) {
        console.error('Error fetching departments:', err);
        showToast(getTranslation('error-fetching-departments'), 'error');
    }
}


    // Handlers for edit/delete open
function handleEdit(e) {
  e.preventDefault();
  e.stopPropagation();

  const el = e.currentTarget;
  editDepartmentIdInput.value = el.dataset.id;
  editDepartmentTypeInput.value = el.dataset.type;

  try {
    const parsedName = JSON.parse(el.dataset.name);
    editDepartmentNameArInput.value = parsedName.ar || '';
    editDepartmentNameEnInput.value = parsedName.en || '';
  } catch {
    editDepartmentNameArInput.value = el.dataset.name || '';
    editDepartmentNameEnInput.value = '';
  }

  // تحميل قيمة has_sub_departments
  const hasSubDepartments = el.dataset.hasSubDepartments === 'true';
  if (hasSubDepartments) {
    editDepartmentHasSubDepartmentsYes.checked = true;
  } else {
    editDepartmentHasSubDepartmentsNo.checked = true;
  }

  openModal(editDepartmentModal);
}

    function handleDeleteOpen(e) {
        e.preventDefault(); e.stopPropagation();
        deleteDepartmentModal.dataset.departmentId = e.currentTarget.dataset.id;
        openModal(deleteDepartmentModal);
    }

    // Add department
addModalSaveBtn.addEventListener('click', async () => {
  if (!permissions.canAdd) return;

  const type = addDepartmentTypeInput.value;
  const nameAr = addDepartmentNameArInput.value.trim();
  const nameEn = addDepartmentNameEnInput.value.trim();
  const file   = addDepartmentImageInput.files[0];
  const hasSubDepartments = addDepartmentHasSubDepartmentsYes.checked;

  if (!type || !nameAr || !nameEn || !file) {
    showToast(getTranslation('please-enter-all-required-data'), 'error');
    return;
  }

  const name = JSON.stringify({ ar: nameAr, en: nameEn });

  const fd = new FormData();
  fd.append('name', name);
  fd.append('type', type);
  fd.append('parentId', null); // الأقسام الرئيسية ليس لها أب
  fd.append('hasSubDepartments', hasSubDepartments);
  fd.append('image', file);

  try {
    const res = await fetch(`${apiBase}/departments`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: fd
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.message);
    showToast(getTranslation('department-added-success'), 'success');
    closeModal(addDepartmentModal);
    fetchDepartments();
  } catch (err) {
    console.error(err);
    showToast(getTranslation('error-adding-department'), 'error');
  }
});


    // Edit department
editModalSaveBtn.addEventListener('click', async () => {
  if (!permissions.canEdit) return;

  const id     = editDepartmentIdInput.value;
  const type   = editDepartmentTypeInput.value;
  const nameAr = editDepartmentNameArInput.value.trim();
  const nameEn = editDepartmentNameEnInput.value.trim();
  const file   = editDepartmentImageInput.files[0];
  const hasSubDepartments = editDepartmentHasSubDepartmentsYes.checked;

  if (!id || !type || !nameAr || !nameEn) {
    showToast(getTranslation('please-enter-all-required-data'), 'error');
    return;
  }

  const name = JSON.stringify({ ar: nameAr, en: nameEn });

  const fd = new FormData();
  fd.append('name', name);
  fd.append('type', type);
  fd.append('parentId', null); // الأقسام الرئيسية ليس لها أب
  fd.append('hasSubDepartments', hasSubDepartments);
  if (file) fd.append('image', file);

  try {
    const res = await fetch(`${apiBase}/departments/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: fd
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.message);
    showToast(getTranslation('department-updated-success'), 'success');
    closeModal(editDepartmentModal);
    fetchDepartments();
  } catch (err) {
    console.error(err);
    showToast(getTranslation('error-updating-department'), 'error');
  }
});


    // Delete department
    deleteModalConfirmBtn.addEventListener('click', async () => {
        if (!permissions.canDelete) return;
        const id = deleteDepartmentModal.dataset.departmentId;
        try {
            const res = await fetch(`http://localhost:3006/api/departments/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } });
            const r = await res.json(); if (!res.ok) throw new Error(r.message);
            showToast(getTranslation('department-deleted-success'), 'success'); closeModal(deleteDepartmentModal); fetchDepartments();
        } catch (err) { console.error(err); showToast(getTranslation('error-deleting-department'), 'error'); }
    });

    // Cancel buttons
    addModalCancelBtn.addEventListener('click', () => closeModal(addDepartmentModal));
    editModalCancelBtn.addEventListener('click', () => closeModal(editDepartmentModal));
    deleteModalCancelBtn.addEventListener('click', () => closeModal(deleteDepartmentModal));

    // Overlay click closes
    document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m); }));

    // Listen for language changes
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            updateSearchPlaceholder();
        }
    });

    // Init
await fetchPermissions();
updateAddButtonVisibility();
await fetchDepartments();
updateSearchPlaceholder();

    window.goBack = () => window.history.back();
});
