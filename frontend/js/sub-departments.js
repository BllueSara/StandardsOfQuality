// sub-departments.js
const apiBase = 'http://localhost:3006/api';

document.addEventListener('DOMContentLoaded', async function() {
    // دالة إظهار التوست
    function showToast(message, type = 'info', duration = 3006) {
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
    const addDepartmentImagePreview = document.createElement('div');
    addDepartmentImagePreview.className = 'image-preview';
    addDepartmentImagePreview.id = 'addDepartmentImagePreview';
    
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
    const editDepartmentImagePreview = document.createElement('div');
    editDepartmentImagePreview.className = 'image-preview';
    editDepartmentImagePreview.id = 'editDepartmentImagePreview';

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

    // Utility function to clean image paths
    function cleanImagePath(imagePath) {
        if (!imagePath) return '';
        if (imagePath.startsWith('http://localhost:3006/')) {
            return imagePath.replace('http://localhost:3006/', '');
        }
        if (imagePath.startsWith('/')) {
            return imagePath.substring(1);
        }
        return imagePath;
    }

    // Available images list (from frontend/images folder)
    const availableImagesList = [
    'health information.png',
        'wheat allergy centre.png',
        'blood bank.png',
        'patient experience.png',
        'family management.png',
        'admissions management and access support.png',
        'oral and maxillofacial surgery.png',
        'ophthalmology unit.png',
        'vascular surgery.png',
        'internal medicine rheumatology.png',
        'internal medicine endocrinology.png',
        'internal medicine palliative care.png',
        'internal medicine neurology.png',
        'internal medicine nephrology.png',
        'internal medicine infectious diseases.png',
        'internal medicine pulmonary.png',
        'internal medicine cardiology.png',
        'internal medicine hematology.png',
        'digital health.png',
        'cybersecurity.png',
        'admissions office.png',
        'patient affairs.png',
        'medical services office.png',
        'surgery.png',
        'Virtual Clinics.png',
        'Strategic and Transformation Management.png',
        'Social Care Services.png',
        'Self Resources.png',
        'Respiratory Care Services.png',
        'research and innovation.png',
        'Rehabilitation.png',
        'Radiology.png',
        'quality and patient safety.png',
        'QPS KPIs.png',
        'Public Health.png',
        'Provision of Care.png',
        'Procurement.png',
        'privileges and competencies.png',
        'Pharmacy.png',
        'Patient and Family Rights.png',
        'Outpatient.png',
        'Occupational Health.png',
        'Nursing.png',
        'Neurosurgery.png',
        'Medical Statistics.png',
        'Manual.png',
        'Management of Information.png',
        'Legal Affairs.png',
        'Laboratory.png',
        'internal control and audit.png',
        'intensive care unit.png',
        'Improvement Projects.png',
        'Human Resources.png',
        'Home Care Services.png',
        'Hemodialysis.png',
        'health informatics.png',
        'Guest Services.png',
        'Geriatric Medicine.png',
        'financial management.png',
        'finance.png',
        'ent.png',
        'Endoscopy.png',
        'Emergency.png',
        'Emergency Medicine.png',
        'Dermatology.png',
        'Dental Services.png',
        'Day Procedure Unit.png',
        'CSSD.png',
        'Communications.png',
        'Commitment.png',
        'Clinics.png',
        'Clinical Audit.png',
        'CEO Office.png',
        'Capacity Management.png',
        'Anesthesia Care.png',
        'ADAA KPIs.png',
        'Urology.png',
        'Supply Chain.png',
        'Supervisor of Managers on Duty.png',
        'Religious Awareness.png',
        'Psychiatric Medical Care.png',
        'Patient Safety KPIs.png',
        'Orthopedic.png',
        'Optometry Clinic.png',
        'Operation Room.png',
        'Mortuary.png',
        'Medical Staff.png',
        'Medical Coordinator.png',
        'Leadership.png',
        'Investment.png',
        'Inventory Control.png',
        'Internal Medicine.png',
        'Infection Prevention andControl.png',
        'Infection Prevention and Control.png',
        'Health Education.png',
        'General Services.png',
        'Facilities Management and Safety.png',
        'esr.png',
        'Emergency Planning and Preparedness.png',
        'Education and Academic Affairs.png'
    ];

    // Fetch available images (returns from local list instead of API)
    function fetchAvailableImages() {
        return availableImagesList.map(imageName => ({
            name: imageName,
            path: `frontend/images/${imageName}`
        }));
    }

    // Open image selector modal
    function openImageSelector(currentImage, onImageSelect) {
        // Create modal container
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.zIndex = '9999';
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modalContent.style.maxWidth = '800px';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        
        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.borderBottom = '1px solid #ddd';
        modalHeader.style.paddingBottom = '15px';
        modalHeader.style.marginBottom = '20px';
        
        const title = document.createElement('h3');
        title.textContent = getTranslation('image-selection') || 'اختيار الصورة';
        title.style.margin = '0 0 10px 0';
        
        const subtitle = document.createElement('p');
        subtitle.textContent = getTranslation('select-existing-image') || 'اختر من الصور الموجودة أو ارفع صورة جديدة';
        subtitle.style.margin = '0';
        subtitle.style.color = '#666';
        
        modalHeader.appendChild(title);
        modalHeader.appendChild(subtitle);
        
        // Create image grid
        const imageGrid = document.createElement('div');
        imageGrid.style.display = 'grid';
        imageGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(120px, 1fr))';
        imageGrid.style.gap = '15px';
        imageGrid.style.marginBottom = '20px';
        
        // Get available images
        const availableImages = fetchAvailableImages();
        
        // Check which images are already in use
        availableImages.forEach(image => {
            const imageContainer = document.createElement('div');
            imageContainer.style.position = 'relative';
            imageContainer.style.cursor = 'pointer';
            imageContainer.style.border = '2px solid transparent';
            imageContainer.style.borderRadius = '8px';
            imageContainer.style.overflow = 'hidden';
            imageContainer.style.transition = 'all 0.3s ease';
            
            // Check if image is already in use
            const isUsed = allDepartments.some(dept => dept.image === image.path);
            
            if (isUsed) {
                imageContainer.style.opacity = '0.5';
                imageContainer.style.cursor = 'not-allowed';
                imageContainer.title = getTranslation('image-already-in-use') || 'هذه الصورة مستخدمة بالفعل';
            }
            
            const img = document.createElement('img');
            img.src = `../${image.path}`;
            img.style.width = '100%';
            img.style.height = '100px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '6px';
            
            const imageName = document.createElement('div');
            imageName.textContent = image.name.replace('.png', '');
            imageName.style.fontSize = '11px';
            imageName.style.textAlign = 'center';
            imageName.style.padding = '5px';
            imageName.style.background = '#f8f9fa';
            imageName.style.borderTop = '1px solid #eee';
            
            imageContainer.appendChild(img);
            imageContainer.appendChild(imageName);
            
            if (!isUsed) {
                imageContainer.addEventListener('click', () => {
                    onImageSelect(image);
                    modal.remove();
                });
                
                imageContainer.addEventListener('mouseenter', () => {
                    imageContainer.style.borderColor = '#007bff';
                    imageContainer.style.transform = 'scale(1.05)';
                });
                
                imageContainer.addEventListener('mouseleave', () => {
                    imageContainer.style.borderColor = 'transparent';
                    imageContainer.style.transform = 'scale(1)';
                });
            }
            
            imageGrid.appendChild(imageContainer);
        });
        
        // Create upload section
        const uploadSection = document.createElement('div');
        uploadSection.style.borderTop = '1px solid #ddd';
        uploadSection.style.paddingTop = '20px';
        uploadSection.style.marginTop = '20px';
        
        const uploadTitle = document.createElement('h4');
        uploadTitle.textContent = getTranslation('upload-new-image') || 'رفع صورة جديدة';
        uploadTitle.style.margin = '0 0 15px 0';
        
        const uploadInput = document.createElement('input');
        uploadInput.type = 'file';
        uploadInput.accept = 'image/*';
        uploadInput.style.width = '100%';
        uploadInput.style.padding = '10px';
        uploadInput.style.border = '2px dashed #ddd';
        uploadInput.style.borderRadius = '8px';
        uploadInput.style.background = '#f8f9fa';
        
        uploadInput.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                const file = e.target.files[0];
                const newImage = {
                    name: file.name,
                    path: URL.createObjectURL(file),
                    isNew: true,
                    file: file
                };
                onImageSelect(newImage);
                modal.remove();
            }
        });
        
        uploadSection.appendChild(uploadTitle);
        uploadSection.appendChild(uploadInput);
        
        // Create modal footer
        const modalFooter = document.createElement('div');
        modalFooter.style.borderTop = '1px solid #ddd';
        modalFooter.style.paddingTop = '20px';
        modalFooter.style.marginTop = '20px';
        modalFooter.style.textAlign = 'center';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = getTranslation('cancel-image-selection') || 'إلغاء';
        cancelBtn.addEventListener('click', () => modal.remove());
        
        modalFooter.appendChild(cancelBtn);
        
        // Assemble modal
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(imageGrid);
        modalContent.appendChild(uploadSection);
        modalContent.appendChild(modalFooter);
        modal.appendChild(modalContent);
        
        // Add to body and show
        document.body.appendChild(modal);
        modal.style.display = 'flex';
        
        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') modal.remove();
        });
    }

    // Handle image selection
    function handleImageSelection(selectedImage, imageInput, imagePreview, isEdit) {
        if (selectedImage.isNew) {
            // New image uploaded
            imageInput.files = selectedImage.file;
            imagePreview.innerHTML = `
                <img src="${selectedImage.path}" alt="Preview" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px;">
                <div style="font-size: 12px; text-align: center; margin-top: 5px; color: #666;">
                    ${selectedImage.name}
                </div>
            `;
            imagePreview.style.display = 'block';
            
            // Clear any existing image selection
            if (isEdit) {
                editDepartmentModal.dataset.selectedExistingImage = '';
            } else {
                addDepartmentModal.dataset.selectedExistingImage = '';
            }
        } else {
            // Existing image selected
            imageInput.value = '';
            imagePreview.innerHTML = `
                <img src="../${selectedImage.path}" alt="Preview" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px;">
                <div style="font-size: 12px; text-align: center; margin-top: 5px; color: #666;">
                    ${selectedImage.name}
                </div>
            `;
            imagePreview.style.display = 'block';
            
            // Store selected existing image path
            if (isEdit) {
                editDepartmentModal.dataset.selectedExistingImage = selectedImage.path;
            } else {
                addDepartmentModal.dataset.selectedExistingImage = selectedImage.path;
            }
        }
    }

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
            if (addDepartmentImagePreview) addDepartmentImagePreview.style.display = 'none';
            if (addDepartmentModal.dataset.selectedExistingImage) {
                addDepartmentModal.dataset.selectedExistingImage = '';
            }
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
            if (editDepartmentImagePreview) editDepartmentImagePreview.style.display = 'none';
            if (editDepartmentModal.dataset.selectedExistingImage) {
                editDepartmentModal.dataset.selectedExistingImage = '';
            }
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

    // Add image selection buttons
    function addImageSelectionButtons() {
        // Add button for add modal
        const addImageButton = document.createElement('button');
        addImageButton.type = 'button';
        addImageButton.className = 'btn-secondary';
        addImageButton.style.marginTop = '10px';
        addImageButton.innerHTML = `
            <i class="fas fa-images" style="margin-left: 8px;"></i>
            ${getTranslation('choose-image') || 'اختر صورة'}
        `;
        
        addImageButton.addEventListener('click', () => {
            openImageSelector(null, (selectedImage) => {
                handleImageSelection(selectedImage, addDepartmentImageInput, addDepartmentImagePreview, false);
            });
        });
        
        // Insert button after the hidden file input
        const addImageContainer = addDepartmentImageInput.parentNode;
        addImageContainer.appendChild(addImageButton);
        addImageContainer.appendChild(addDepartmentImagePreview);
        
        // Add button for edit modal
        const editImageButton = document.createElement('button');
        editImageButton.type = 'button';
        editImageButton.className = 'btn-secondary';
        editImageButton.style.marginTop = '10px';
        editImageButton.innerHTML = `
            <i class="fas fa-images" style="margin-left: 8px;"></i>
            ${getTranslation('choose-image') || 'اختر صورة'}
        `;
        
        editImageButton.addEventListener('click', () => {
            openImageSelector(null, (selectedImage) => {
                handleImageSelection(selectedImage, editDepartmentImageInput, editDepartmentImagePreview, true);
            });
        });
        
        // Insert button after the hidden file input
        const editImageContainer = editDepartmentImageInput.parentNode;
        editImageContainer.appendChild(editImageButton);
        editImageContainer.appendChild(editDepartmentImagePreview);
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
                `<img src="../${cleanImagePath(dept.image)}" alt="${deptName}" onerror="this.parentNode.innerHTML='<div style=\\'font-size: 24px; color: #fff;\\'>${deptName.charAt(0).toUpperCase()}</div>'">` :
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

        // Display current image if exists
        if (dept.image) {
            const cleanPath = cleanImagePath(dept.image);
            editDepartmentImagePreview.innerHTML = `
                <img src="../${cleanPath}" alt="Current Image" style="width: 100%; height: 100px; object-fit: cover; border-radius: 8px;">
                <div style="font-size: 12px; text-align: center; margin-top: 5px; color: #666;">
                    الصورة الحالية
                </div>
            `;
            editDepartmentImagePreview.style.display = 'block';
        } else {
            editDepartmentImagePreview.style.display = 'none';
        }

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
        } else if (addDepartmentModal.dataset.selectedExistingImage) {
            // If no new file uploaded, use selected existing image
            fd.append('existingImage', addDepartmentModal.dataset.selectedExistingImage);
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
        } else if (editDepartmentModal.dataset.selectedExistingImage) {
            // If no new file uploaded, use selected existing image
            fd.append('existingImage', editDepartmentModal.dataset.selectedExistingImage);
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
    addImageSelectionButtons();
    await fetchSubDepartments();

    window.goBack = () => window.history.back();
}); 