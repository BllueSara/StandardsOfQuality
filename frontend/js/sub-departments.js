// sub-departments.js
const apiBase = 'http://localhost:3006/api';

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
    const manageContentBtn = document.getElementById('manageContentButton');
    const addDepartmentModal = document.getElementById('addDepartmentModal');
    const addModalSaveBtn = document.getElementById('saveAddDepartment');
    const addModalCancelBtn = document.getElementById('cancelAddDepartment');
    const addDepartmentTypeInput = document.getElementById('departmentType');
    const addDepartmentNameArInput = document.getElementById('departmentNameAr');
    const addDepartmentNameEnInput = document.getElementById('departmentNameEn');
    const addDepartmentImageInput = document.getElementById('departmentImage');
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

    const deleteDepartmentModal = document.getElementById('deleteDepartmentModal');
    const deleteModalConfirmBtn = document.getElementById('confirmDeleteDepartment');
    const deleteModalCancelBtn = document.getElementById('cancelDeleteDepartment');

    // Parent info elements
    const parentInfo = document.getElementById('parentInfo');
    const parentTitle = document.getElementById('parentTitle');
    const parentType = document.getElementById('parentType');
    const parentName = document.getElementById('parentName');

    // Store original departments data for filtering
    let allDepartments = [];
    let currentParentId = null;
    let currentParent = null;
    
    // Pagination variables
    let currentPage = 1;
    const departmentsPerPage = 20;
    let filteredDepartments = [];

    // Utility to get token
    function getToken() { return localStorage.getItem('token'); }

    // Decode JWT to extract user ID
    async function getUserId() {
        const token = getToken();
        if (!token) return null;
        try {
            const decoded = await safeGetUserInfo(token);
            return decoded ? (decoded.id || decoded.userId || decoded.sub || null) : null;
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

    // Get department ID from URL
    function getDepartmentIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const departmentId = urlParams.get('departmentId');
        console.log('🔍 Department ID from URL:', departmentId);
        return departmentId;
    }

    // Permissions state
    const permissions = { canAdd: false, canEdit: false, canDelete: false };

    // فتح بوب اب اضافه القسم 
    addDepartmentBtn.addEventListener('click', () => openModal(addDepartmentModal));

    // زر إدارة المحتويات - الانتقال لصفحة محتويات القسم الأساسي
    manageContentBtn.addEventListener('click', () => {
        if (currentParentId) {
            window.location.href = `department-content.html?departmentId=${currentParentId}`;
        } else {
            showToast(getTranslation('no-parent-department-found') || 'لم يتم العثور على القسم الأساسي', 'error');
        }
    });

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
        
        filteredDepartments = allDepartments.filter(dept => {
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
        
        currentPage = 1; // Reset to first page when filtering
        renderDepartments();
        renderPagination();
    }

    // Calculate pagination
    function getPaginatedDepartments() {
        const startIndex = (currentPage - 1) * departmentsPerPage;
        const endIndex = startIndex + departmentsPerPage;
        return filteredDepartments.slice(startIndex, endIndex);
    }

    // Render pagination controls
    function renderPagination() {
        const totalPages = Math.ceil(filteredDepartments.length / departmentsPerPage);
        
        // Remove existing pagination
        const existingPagination = document.querySelector('.pagination');
        if (existingPagination) {
            existingPagination.remove();
        }

        if (totalPages <= 1) return;

        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination';
        
        // Previous button (السابق)
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.disabled = currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderDepartments();
                renderPagination();
            }
        });

        // Next button (التالي)
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.disabled = currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderDepartments();
                renderPagination();
            }
        });

        // Page info
        const pageInfo = document.createElement('span');
        pageInfo.className = 'page-info';
        pageInfo.textContent = `${getTranslation('page') || 'صفحة'} ${currentPage} ${getTranslation('of') || 'من'} ${totalPages}`;

        // Total departments info
        const totalInfo = document.createElement('span');
        totalInfo.className = 'total-info';
        totalInfo.textContent = `${getTranslation('total-departments') || 'إجمالي الأقسام'}: ${filteredDepartments.length}`;

        paginationContainer.appendChild(prevBtn);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(nextBtn);
        paginationContainer.appendChild(totalInfo);

        // Insert pagination after cards grid
        cardsGrid.parentNode.insertBefore(paginationContainer, cardsGrid.nextSibling);
    }

    // Fetch user permissions
    async function fetchPermissions() {
        const userId = await getUserId();
        if (!userId) return;

        const headers = { 'Authorization': `Bearer ${getToken()}` };

        // جلب دور المستخدم
        const userRes = await fetch(`${apiBase}/users/${userId}`, { headers });
        const { data: user } = await userRes.json();
        const role = user.role;
        if (role === 'admin' || role === 'super_admin') {
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
    function openModal(modal) { 
        if (modal) {
            console.log('🔍 openModal: opening modal', modal.id || 'unknown modal');
            modal.style.display = 'flex';
            modal.classList.add('show');
            modal.classList.add('active');
            
            // Force reflow
            modal.offsetHeight;
            console.log('🔍 openModal: modal opened successfully');
        } else {
            console.log('🔍 openModal: modal is null or undefined');
        }
    }
    
    function closeModal(modal) {
        if (!modal) {
            console.log('🔍 closeModal: modal is null or undefined');
            return;
        }
        
        console.log('🔍 closeModal: closing modal', modal.id || 'unknown modal');
        
        // Multiple approaches to ensure modal closes
        modal.style.display = 'none';
        modal.classList.remove('show');
        modal.classList.remove('active');
        
        // Force reflow
        modal.offsetHeight;
        
        console.log('🔍 closeModal: modal display set to none');

        if (modal === addDepartmentModal) {
            if (addDepartmentTypeInput) addDepartmentTypeInput.value = '';
            if (addDepartmentNameArInput) addDepartmentNameArInput.value = '';
            if (addDepartmentNameEnInput) addDepartmentNameEnInput.value = '';
            if (addDepartmentImageInput) addDepartmentImageInput.value = '';
            console.log('🔍 closeModal: add modal form cleared');
        } else if (modal === editDepartmentModal) {
            if (editDepartmentIdInput) {
                editDepartmentIdInput.value = '';
                editDepartmentIdInput.dataset.level = '';
                editDepartmentIdInput.dataset.parentId = '';
            }
            if (editDepartmentTypeInput) editDepartmentTypeInput.value = '';
            if (editDepartmentNameArInput) editDepartmentNameArInput.value = '';
            if (editDepartmentNameEnInput) editDepartmentNameEnInput.value = '';
            if (editDepartmentImageInput) editDepartmentImageInput.value = '';
            console.log('🔍 closeModal: edit modal form cleared');
        } else if (modal === deleteDepartmentModal) {
            if (deleteModalConfirmBtn) {
                deleteModalConfirmBtn.dataset.departmentId = '';
            }
            console.log('🔍 closeModal: delete modal data cleared');
        }
    }

    // Show/hide Add button
    function updateAddButtonVisibility() {
        if (addDepartmentBtn) addDepartmentBtn.style.display = permissions.canAdd ? '' : 'none';
    }

    // Render departments to the grid
    function renderDepartments() {
        const departmentsToRender = getPaginatedDepartments();
        cardsGrid.innerHTML = '';
        const lang = localStorage.getItem('language') || 'ar';

        if (departmentsToRender.length === 0) {
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

        departmentsToRender.forEach(dept => {
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
            let typeText, typeClass;
            if (dept.type === 'department') {
                typeText = getTranslation('department-type-text');
                typeClass = 'department';
            } else if (dept.type === 'administration') {
                typeText = getTranslation('administration-type-text');
                typeClass = 'administration';
            } else if (dept.type === 'executive_administration') {
                typeText = getTranslation('executive-administration-type-text');
                typeClass = 'executive-administration';
            } else {
                typeText = getTranslation('department-type-text');
                typeClass = 'department';
            }

            let icons = '';
            if (permissions.canEdit || permissions.canDelete) {
                icons = '<div class="card-icons">';
                if (permissions.canEdit)
                    icons += `<a href="#" class="edit-icon" data-id="${dept.id}" data-name='${dept.name}' data-type="${dept.type}" data-level="${dept.level || ''}" data-parent-id="${dept.parent_id || ''}"><img src="../images/edit.svg" alt="${getTranslation('edit')}"></a>`;

                if (permissions.canDelete)
                    icons += `<a href="#" class="delete-icon" data-id="${dept.id}"><img src="../images/delet.svg" alt="${getTranslation('delete')}"></a>`;
                icons += '</div>';
            }

            // إنشاء عنصر الصورة مع التعامل مع الحالات التي لا توجد فيها صورة
            const imageElement = dept.image ? 
                `<img src="http://localhost:3006/${dept.image}" alt="${deptName}">` :
                `<div style="font-size: 24px; color: #fff;">${deptName.charAt(0).toUpperCase()}</div>`;

            card.innerHTML = icons +
                `<div class="card-icon bg-blue">${imageElement}</div>` +
                `<div class="card-title">${deptName}</div>` +
                `<div class="card-subtitle"><span class="type-badge ${typeClass}">${typeText}</span></div>`;

            cardsGrid.appendChild(card);

            card.addEventListener('click', e => {
                if (e.target.closest('.card-icons')) return;
                
                // التحقق من وجود تابعين
                checkForSubDepartments(dept.id, dept.name, dept.type);
            });
        });

        if (permissions.canEdit)
            document.querySelectorAll('.edit-icon').forEach(el => el.addEventListener('click', handleEdit));
        if (permissions.canDelete)
            document.querySelectorAll('.delete-icon').forEach(el => el.addEventListener('click', handleDeleteOpen));
    }

    // Check for sub-departments and redirect accordingly
    async function checkForSubDepartments(departmentId, departmentName, departmentType) {
        try {
            console.log('🔍 Checking sub-departments for department:', departmentId);
            // For sub-departments, always redirect to content page since they can't have sub-departments
            console.log('🔍 Sub-department clicked, redirecting to content page');
            window.location.href = `department-content.html?departmentId=${departmentId}`;
        } catch (error) {
            console.error('Error checking sub-departments:', error);
            window.location.href = `department-content.html?departmentId=${departmentId}`;
        }
    }

    // Fetch sub-departments
    async function fetchSubDepartments() {
        try {
            currentParentId = getDepartmentIdFromUrl();
            console.log('🔍 Fetching sub-departments for parent ID:', currentParentId);
            
            if (!currentParentId) {
                showToast(getTranslation('invalid-department-id'), 'error');
                window.location.href = 'departments.html';
                return;
            }

            const response = await fetch(`${apiBase}/departments/${currentParentId}/sub-departments`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('🔍 Sub-departments API response:', result);

            if (result.success) {
                allDepartments = result.data || [];
                filteredDepartments = [...allDepartments]; // Initialize filtered departments
                console.log('🔍 All sub-departments:', allDepartments);
                renderDepartments();
                renderPagination();
                
                // Use parent info from the response
                if (result.parent) {
                    currentParent = result.parent;
                    displayParentInfo(currentParent);
                }
            } else {
                console.error('Failed to fetch sub-departments:', result.message);
                showToast(result.message || getTranslation('failed-to-fetch-sub-departments'), 'error');
            }
        } catch (error) {
            console.error('Error fetching sub-departments:', error);
            showToast(getTranslation('error-fetching-sub-departments'), 'error');
        }
    }

    // Display parent department info
    function displayParentInfo(parent) {
        if (!parent) return;

        const lang = localStorage.getItem('language') || 'ar';
        let parentNameText;
        try {
            const parsed = JSON.parse(parent.name);
            parentNameText = parsed[lang] || parsed['ar'] || parent.name;
        } catch {
            parentNameText = parent.name;
        }

        // Update breadcrumb
        if (parentName) {
            parentName.textContent = parentNameText;
        }

        // Update parent info section
        if (parentTitle) {
            parentTitle.textContent = parentNameText;
        }

        if (parentType) {
            let typeText, typeClass;
            if (parent.type === 'department') {
                typeText = getTranslation('department-type-text');
                typeClass = 'department';
            } else if (parent.type === 'administration') {
                typeText = getTranslation('administration-type-text');
                typeClass = 'administration';
            } else if (parent.type === 'executive_administration') {
                typeText = getTranslation('executive-administration-type-text');
                typeClass = 'executive-administration';
            } else {
                typeText = getTranslation('department-type-text');
                typeClass = 'department';
            }
            parentType.textContent = typeText;
            parentType.className = `type-badge ${typeClass}`;
        }

        // Show parent info section
        if (parentInfo) {
            parentInfo.style.display = 'block';
        }
    }

    // Handle edit button click
    function handleEdit(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const el = e.currentTarget;
        const id = el.dataset.id;
        const name = el.dataset.name;
        const type = el.dataset.type;
        const level = el.dataset.level;
        const parentId = el.dataset.parentId;

        console.log('🔍 Edit department:', { id, name, type, level, parentId });

        // Parse name JSON
        let nameAr = '', nameEn = '';
        try {
            const parsed = JSON.parse(name);
            nameAr = parsed.ar || '';
            nameEn = parsed.en || '';
        } catch {
            nameAr = name;
            nameEn = name;
        }

        // Populate edit form
        editDepartmentIdInput.value = id;
        editDepartmentTypeInput.value = type;
        editDepartmentNameArInput.value = nameAr;
        editDepartmentNameEnInput.value = nameEn;

        // Store level and parent_id for update
        editDepartmentIdInput.dataset.level = level;
        editDepartmentIdInput.dataset.parentId = parentId;

        openModal(editDepartmentModal);
    }

    // Handle delete button click
    function handleDeleteOpen(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const el = e.currentTarget;
        const id = el.dataset.id;
        
        console.log('🔍 Delete department:', id);
        
        // Store department ID for deletion
        deleteModalConfirmBtn.dataset.departmentId = id;
        openModal(deleteDepartmentModal);
    }

    // Modal event listeners
    addModalCancelBtn.addEventListener('click', () => closeModal(addDepartmentModal));
    editModalCancelBtn.addEventListener('click', () => closeModal(editDepartmentModal));
    deleteModalCancelBtn.addEventListener('click', () => closeModal(deleteDepartmentModal));

    // Add department
    addModalSaveBtn.addEventListener('click', async () => {
        const type = addDepartmentTypeInput.value.trim();
        const nameAr = addDepartmentNameArInput.value.trim();
        const nameEn = addDepartmentNameEnInput.value.trim();
        const imageFile = addDepartmentImageInput.files[0];

        if (!type || !nameAr || !nameEn) {
            showToast(getTranslation('please-fill-all-required-fields'), 'error');
            return;
        }

        const fd = new FormData();
        fd.append('type', type);
        fd.append('name', JSON.stringify({ ar: nameAr, en: nameEn }));
        if (imageFile) {
            fd.append('image', imageFile);
        }
        fd.append('parentId', currentParentId.toString());

        try {
            const response = await fetch(`${apiBase}/departments`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: fd
            });

            const result = await response.json();
            console.log('🔍 Add department response:', result);

            if (result.success || result.status === 'success') {
                showToast(getTranslation('department-added-success'), 'success');
                closeModal(addDepartmentModal);
                
                // إضافة القسم الجديد إلى المصفوفات
                const newDepartment = result.department || result.data || {
                    id: result.departmentId || result.id,
                    name: JSON.stringify({ ar: nameAr, en: nameEn }),
                    type: type,
                    image: imageFile ? `backend/uploads/images/${imageFile.name}` : ''
                };
                
                allDepartments.unshift(newDepartment);
                filteredDepartments.unshift(newDepartment);
                
                // إعادة عرض الأقسام مع الصفحات
                renderDepartments();
                renderPagination();
            } else {
                showToast(result.message || getTranslation('failed-to-add-department'), 'error');
            }
        } catch (error) {
            console.error('Error adding department:', error);
            showToast(getTranslation(error), 'error');
        }
    });

    // Edit department
    editModalSaveBtn.addEventListener('click', async () => {
        const id = editDepartmentIdInput.value;
        const type = editDepartmentTypeInput.value.trim();
        const nameAr = editDepartmentNameArInput.value.trim();
        const nameEn = editDepartmentNameEnInput.value.trim();
        const imageFile = editDepartmentImageInput.files[0];
        const level = editDepartmentIdInput.dataset.level;
        const parentId = editDepartmentIdInput.dataset.parentId;

        if (!type || !nameAr || !nameEn) {
            showToast(getTranslation('please-fill-all-required-fields'), 'error');
            return;
        }

        const fd = new FormData();
        fd.append('type', type);
        fd.append('name', JSON.stringify({ ar: nameAr, en: nameEn }));
        if (imageFile) {
            fd.append('image', imageFile);
        }
        
        // Preserve level and parent_id
        if (level) {
            fd.append('level', level);
        }
        if (parentId) {
            fd.append('parentId', parentId);
        }

        try {
            const response = await fetch(`${apiBase}/departments/${id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: fd
            });

            const result = await response.json();
            console.log('🔍 Edit department response:', result);

            if (result.success || result.status === 'success') {
                console.log('🔍 Success condition met, closing modal...');
                showToast(getTranslation('department-updated-success'), 'success');
                
                console.log('🔍 Closing edit modal...');
                
                // Force close modal with multiple approaches
                if (editDepartmentModal) {
                    editDepartmentModal.style.display = 'none';
                    editDepartmentModal.classList.remove('show');
                    editDepartmentModal.classList.remove('active');
                    console.log('🔍 Edit modal display set to none');
                }
                
                // Clear form data manually to ensure it's cleared
                if (editDepartmentIdInput) editDepartmentIdInput.value = '';
                if (editDepartmentTypeInput) editDepartmentTypeInput.value = '';
                if (editDepartmentNameArInput) editDepartmentNameArInput.value = '';
                if (editDepartmentNameEnInput) editDepartmentNameEnInput.value = '';
                if (editDepartmentImageInput) editDepartmentImageInput.value = '';
                if (editDepartmentIdInput) {
                    editDepartmentIdInput.dataset.level = '';
                    editDepartmentIdInput.dataset.parentId = '';
                }
                
                console.log('🔍 Form data cleared');
                
                // تحديث القسم في المصفوفات
                const updatedDepartment = result.department || result.data || {
                    id: id,
                    name: JSON.stringify({ ar: nameAr, en: nameEn }),
                    type: type,
                    image: imageFile ? `backend/uploads/images/${imageFile.name}` : ''
                };
                
                const allIndex = allDepartments.findIndex(d => d.id == id);
                const filteredIndex = filteredDepartments.findIndex(d => d.id == id);
                
                if (allIndex !== -1) {
                    allDepartments[allIndex] = updatedDepartment;
                }
                if (filteredIndex !== -1) {
                    filteredDepartments[filteredIndex] = updatedDepartment;
                }
                
                // إعادة عرض الأقسام مع الصفحات
                renderDepartments();
                renderPagination();
            } else {
                showToast(result.message || getTranslation('failed-to-update-department'), 'error');
            }
        } catch (error) {
            console.error('Error editing department:', error);
            showToast(getTranslation(error), 'error');
        }
    });

    // Delete department
    deleteModalConfirmBtn.addEventListener('click', async () => {
        const id = deleteModalConfirmBtn.dataset.departmentId;
        
        if (!id) {
            showToast(getTranslation('invalid-department-id'), 'error');
            return;
        }

        try {
            const response = await fetch(`${apiBase}/departments/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            const result = await response.json();
            console.log('🔍 Delete department response:', result);

            if (result.success || result.status === 'success') {
                console.log('🔍 Success condition met, closing delete modal...');
                showToast(getTranslation('department-deleted-success'), 'success');
                
                console.log('🔍 Closing delete modal...');
                
                // Force close modal with multiple approaches
                if (deleteDepartmentModal) {
                    deleteDepartmentModal.style.display = 'none';
                    deleteDepartmentModal.classList.remove('show');
                    deleteDepartmentModal.classList.remove('active');
                    console.log('🔍 Delete modal display set to none');
                }
                
                // Clear stored department ID manually
                if (deleteModalConfirmBtn) {
                    deleteModalConfirmBtn.dataset.departmentId = '';
                    console.log('🔍 Delete modal data cleared');
                }
                
                // حذف القسم من المصفوفات
                allDepartments = allDepartments.filter(d => d.id != id);
                filteredDepartments = filteredDepartments.filter(d => d.id != id);
                
                // إعادة عرض الأقسام مع الصفحات
                renderDepartments();
                renderPagination();
            } else {
                showToast(result.message || getTranslation('failed-to-delete-department'), 'error');
            }
        } catch (error) {
            console.error('Error deleting department:', error);
            showToast(getTranslation('error-deleting-department'), 'error');
        }
    });

    // Overlay click closes
    document.querySelectorAll('.modal-overlay').forEach(m => m.addEventListener('click', e => { 
        if (e.target === m) closeModal(m); 
    }));

    // Escape key closes modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (addDepartmentModal && addDepartmentModal.style.display === 'flex') {
                closeModal(addDepartmentModal);
            } else if (editDepartmentModal && editDepartmentModal.style.display === 'flex') {
                closeModal(editDepartmentModal);
            } else if (deleteDepartmentModal && deleteDepartmentModal.style.display === 'flex') {
                closeModal(deleteDepartmentModal);
            }
        }
    });

    // Listen for language changes
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            updateSearchPlaceholder();
            if (currentParent) {
                displayParentInfo(currentParent);
            }
            renderDepartments();
            renderPagination();
        }
    });

    // Init
    await fetchPermissions();
    updateAddButtonVisibility();
    updateSearchPlaceholder();
    await fetchSubDepartments();

    window.goBack = () => window.history.back();
}); 