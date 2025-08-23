// departments.js
// Add JavaScript specific to the departments page here
const apiBase      = 'http://localhost:3006/api';

// Wait for all scripts to load and DOM to be ready
function initializeDeletedItemsButton() {
    console.log('Initializing deleted items button...');
    console.log('Document ready state:', document.readyState);
    console.log('Page header elements:', document.querySelectorAll('.page-header'));
    console.log('H1 elements:', document.querySelectorAll('h1'));
    
    // Initialize deleted items modal
    let deletedItemsModal;
    if (typeof DeletedItemsModal !== 'undefined') {
        deletedItemsModal = new DeletedItemsModal();
        console.log('DeletedItemsModal initialized successfully');
    } else {
        console.error('DeletedItemsModal class not found');
        console.log('Available global objects:', Object.keys(window));
        return;
    }
    
    // Add deleted items button
    const pageHeader = document.querySelector('.page-header');
    console.log('Page header found:', pageHeader);
    
    if (pageHeader) {
        const deletedItemsBtn = document.createElement('button');
        deletedItemsBtn.className = 'btn-primary deleted-items-btn';
        deletedItemsBtn.style.cssText = 'background: red !important; color: white !important; padding: 10px 20px !important; border: none !important; border-radius: 5px !important; cursor: pointer !important; margin-left: 20px !important; display: inline-block !important;';
        deletedItemsBtn.innerHTML = `
            <i class="fas fa-trash-restore"></i>
            <span data-translate="deleted-items">ما تم حذفه</span>
        `;
        
        const title = pageHeader.querySelector('h1');
        console.log('Title element found:', title);
        
        if (title) {
            title.parentNode.insertBefore(deletedItemsBtn, title.nextSibling);
            console.log('Deleted items button inserted successfully');
        } else {
            console.log('Title element not found, inserting at end of page-header');
            pageHeader.appendChild(deletedItemsBtn);
        }
        
        // Add click event to open modal
        deletedItemsBtn.addEventListener('click', () => {
            if (deletedItemsModal) {
                deletedItemsModal.show('departments');
            } else {
                console.error('DeletedItemsModal not initialized');
            }
        });
    } else {
        console.log('Page header not found');
        // Try to find alternative elements
        const h1Elements = document.querySelectorAll('h1');
        console.log('Found H1 elements:', h1Elements);
        if (h1Elements.length > 0) {
            console.log('First H1 parent:', h1Elements[0].parentElement);
        }
    }
}

// Try to initialize immediately if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeDeletedItemsButton, 100);
    });
} else {
    // DOM is already ready
    setTimeout(initializeDeletedItemsButton, 100);
}

// Main function to initialize the page
async function initializeDepartmentsPage() {
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
    const addDepartmentImagePreview = document.getElementById('departmentImagePreview') || document.createElement('div');
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
    const editDepartmentImagePreview = document.getElementById('editDepartmentImagePreview') || document.createElement('div');
    const editDepartmentHasSubDepartmentsYes = document.getElementById('editHasSubDepartmentsYes');
    const editDepartmentHasSubDepartmentsNo = document.getElementById('editHasSubDepartmentsNo');

    const deleteDepartmentModal = document.getElementById('deleteDepartmentModal');
    const deleteModalConfirmBtn = document.getElementById('confirmDeleteDepartment');
    const deleteModalCancelBtn = document.getElementById('cancelDeleteDepartment');

    // Store original departments data for filtering
    let allDepartments = [];
    
    // Pagination variables
    let currentPage = 1;
    const departmentsPerPage = 20;
    let filteredDepartments = [];

    // Utility to get token
    function getToken() { return localStorage.getItem('token'); }

    // Utility to clean image path
    function cleanImagePath(imagePath) {
        if (!imagePath) return '';
        
        // إزالة http://localhost:3006/ من بداية المسار إذا كان موجوداً
        if (imagePath.startsWith('http://localhost:3006/')) {
            return imagePath.replace('http://localhost:3006/', '');
        }
        
        // إزالة / من بداية المسار إذا كان موجوداً
        if (imagePath.startsWith('/')) {
            return imagePath.substring(1);
        }
        
        return imagePath;
    }

    // قائمة الصور المتاحة من مجلد frontend/images
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

    // دالة جلب الصور المتاحة
    async function fetchAvailableImages() {
        try {
            const images = availableImagesList.map(imageName => ({
                name: imageName,
                path: `frontend/images/${imageName}`
            }));
            return images;
        } catch (err) {
            console.error('Error fetching available images:', err);
            return [];
        }
    }

    // دالة معالجة اختيار الصور
    function handleImageSelection(selectedImage, imageInput, imagePreview, isEdit = false) {
        if (selectedImage.isNew) {
            // صورة جديدة
            const file = selectedImage.file;
            imageInput.files = new DataTransfer().files; // مسح الملفات السابقة
            const dt = new DataTransfer();
            dt.items.add(file);
            imageInput.files = dt.files;
            
            // عرض معاينة الصورة
            const reader = new FileReader();
            reader.onload = function(e) {
                imagePreview.innerHTML = `
                    <div style="margin-top: 10px; text-align: center;">
                        <img src="${e.target.result}" alt="معاينة" style="max-width: 150px; max-height: 150px; border-radius: 8px; border: 2px solid #007bff;">
                        <div style="margin-top: 5px; font-size: 12px; color: #007bff;">صورة جديدة: ${file.name}</div>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        } else {
            // صورة موجودة
            imageInput.value = ''; // مسح input الملف
            
            // عرض معاينة الصورة
            const imageName = selectedImage.replace('frontend/images/', '');
            imagePreview.innerHTML = `
                <div style="margin-top: 10px; text-align: center;">
                    <img src="../images/${imageName}" alt="معاينة" style="max-width: 150px; max-height: 150px; border-radius: 8px; border: 2px solid #28a745;">
                    <div style="margin-top: 10px; font-size: 12px; color: #28a745;">صورة موجودة: ${imageName}</div>
                </div>
            `;
            
            // حفظ مسار الصورة في dataset
            if (isEdit) {
                editDepartmentModal.dataset.selectedExistingImage = selectedImage;
            } else {
                addDepartmentModal.dataset.selectedExistingImage = selectedImage;
            }
        }
    }

    // دالة فتح نافذة اختيار الصور
    function openImageSelector(currentImage = '', onImageSelect) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 10000;';
        
        modal.innerHTML = `
            <div class="modal-content" style="background: white; padding: 20px; border-radius: 8px; max-width: 800px; max-height: 80vh; overflow-y: auto; position: relative;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0;">${getTranslation('select-image') || 'اختر صورة'}</h3>
                    <button class="close-btn" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 10px; font-weight: bold;">
                        ${getTranslation('upload-new-image') || 'رفع صورة جديدة:'}
                    </label>
                    <input type="file" id="newImageInput" accept="image/*" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 10px; font-weight: bold;">
                        ${getTranslation('select-existing-image') || 'أو اختر من الصور الموجودة:'}
                    </label>
                    <div id="imagesGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; max-height: 400px; overflow-y: auto;">
                        <div style="text-align: center; padding: 20px; color: #666;">
                            ${getTranslation('loading-images') || 'جاري تحميل الصور...'}
                        </div>
                    </div>
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="cancelImageSelect" style="padding: 8px 16px; border: 1px solid #ddd; background: #f8f9fa; border-radius: 4px; cursor: pointer;">
                        ${getTranslation('cancel') || 'إلغاء'}
                    </button>
                    <button id="confirmImageSelect" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; display: none;">
                        ${getTranslation('confirm') || 'تأكيد'}
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // إغلاق النافذة
        const closeModal = () => {
            modal.remove();
        };
        
        modal.querySelector('.close-btn').addEventListener('click', closeModal);
        modal.querySelector('#cancelImageSelect').addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        
        // تحميل الصور المتاحة
        let availableImages = [];
        let selectedImage = null;
        
        fetchAvailableImages().then(images => {
            availableImages = images;
            const imagesGrid = modal.querySelector('#imagesGrid');
            
            if (images.length === 0) {
                imagesGrid.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #666; grid-column: 1 / -1;">
                        ${getTranslation('no-images-available') || 'لا توجد صور متاحة'}
                    </div>
                `;
                return;
            }
            
            imagesGrid.innerHTML = '';
            images.forEach(image => {
                const imageCard = document.createElement('div');
                imageCard.className = 'image-card';
                imageCard.style.cssText = 'border: 2px solid #ddd; border-radius: 8px; padding: 10px; cursor: pointer; text-align: center; transition: all 0.3s;';
                imageCard.dataset.imagePath = image.path;
                imageCard.dataset.imageName = image.name;
                
                // التحقق من استخدام الصورة
                const isUsed = allDepartments.some(dept => dept.image === image.path);
                if (isUsed) {
                    imageCard.style.opacity = '0.5';
                    imageCard.style.cursor = 'not-allowed';
                    imageCard.title = getTranslation('image-already-used') || 'هذه الصورة مستخدمة بالفعل';
                }
                
                imageCard.innerHTML = `
                    <img src="../images/${image.name}" alt="${image.name}" 
                         style="width: 100%; height: 80px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;">
                    <div style="font-size: 12px; color: #666; word-break: break-word;">${image.name}</div>
                    ${isUsed ? '<div style="font-size: 10px; color: #ff6b6b; margin-top: 4px;">مستخدمة</div>' : ''}
                `;
                
                if (!isUsed) {
                    imageCard.addEventListener('click', () => {
                        // إزالة التحديد من جميع الصور
                        modal.querySelectorAll('.image-card').forEach(card => {
                            card.style.borderColor = '#ddd';
                            card.style.backgroundColor = 'transparent';
                        });
                        
                        // تحديد الصورة المختارة
                        imageCard.style.borderColor = '#007bff';
                        imageCard.style.backgroundColor = '#e3f2fd';
                        selectedImage = `frontend/images/${image.name}`;
                        
                        // إظهار زر التأكيد
                        modal.querySelector('#confirmImageSelect').style.display = 'inline-block';
                    });
                }
                
                imagesGrid.appendChild(imageCard);
            });
        });
        
        // معالجة اختيار صورة جديدة
        const newImageInput = modal.querySelector('#newImageInput');
        newImageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                // إزالة التحديد من الصور الموجودة
                modal.querySelectorAll('.image-card').forEach(card => {
                    card.style.borderColor = '#ddd';
                    card.style.backgroundColor = 'transparent';
                });
                
                selectedImage = { file: file, isNew: true };
                modal.querySelector('#confirmImageSelect').style.display = 'inline-block';
            }
        });
        
        // تأكيد الاختيار
        modal.querySelector('#confirmImageSelect').addEventListener('click', () => {
            if (selectedImage) {
                onImageSelect(selectedImage);
                closeModal();
            }
        });
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

    // Permissions state
    const permissions = { canAdd: false, canEdit: false, canDelete: false };

    // فتح بوب اب اضافه القسم 
    addDepartmentBtn.addEventListener('click', () => openModal(addDepartmentModal));

    // إضافة أزرار اختيار الصور
    function addImageSelectionButtons() {
        // إضافة زر اختيار الصور في نموذج الإضافة
        const addImageContainer = addDepartmentImageInput.parentElement;
        if (addImageContainer && !addImageContainer.querySelector('.image-selector-btn')) {
            const imageSelectorBtn = document.createElement('button');
            imageSelectorBtn.type = 'button';
            imageSelectorBtn.className = 'image-selector-btn';
            imageSelectorBtn.innerHTML = `
                <i class="fas fa-images"></i>
                ${getTranslation('choose-image') || 'اختر صورة'}
            `;
            imageSelectorBtn.style.cssText = 'margin-left: 10px; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;';
            
            imageSelectorBtn.addEventListener('click', () => {
                openImageSelector('', (selectedImage) => {
                    handleImageSelection(selectedImage, addDepartmentImageInput, addDepartmentImagePreview, false);
                });
            });
            
            addImageContainer.appendChild(imageSelectorBtn);
            
            // إضافة div للمعاينة
            const previewDiv = document.createElement('div');
            previewDiv.id = 'departmentImagePreview';
            previewDiv.className = 'image-preview';
            addImageContainer.appendChild(previewDiv);
        }

        // إضافة زر اختيار الصور في نموذج التعديل
        const editImageContainer = editDepartmentImageInput.parentElement;
        if (editImageContainer && !editImageContainer.querySelector('.image-selector-btn')) {
            const imageSelectorBtn = document.createElement('button');
            imageSelectorBtn.type = 'button';
            imageSelectorBtn.className = 'image-selector-btn';
            imageSelectorBtn.innerHTML = `
                <i class="fas fa-images"></i>
                ${getTranslation('choose-image') || 'اختر صورة'}
            `;
            imageSelectorBtn.style.cssText = 'margin-left: 10px; padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;';
            
            imageSelectorBtn.addEventListener('click', () => {
                const currentImage = editDepartmentModal.dataset.currentImage || '';
                openImageSelector(currentImage, (selectedImage) => {
                    handleImageSelection(selectedImage, editDepartmentImageInput, editDepartmentImagePreview, true);
                });
            });
            
            editImageContainer.appendChild(imageSelectorBtn);
            
            // إضافة div للمعاينة
            const previewDiv = document.createElement('div');
            previewDiv.id = 'editDepartmentImagePreview';
            previewDiv.className = 'image-preview';
            editImageContainer.appendChild(previewDiv);
        }
    }

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
  const userRes      = await fetch(`${apiBase}/users/${userId}`, { headers });
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
    function openModal(modal) { modal.style.display = 'flex'; }
function closeModal(modal) {
  modal.style.display = 'none';

  if (modal === addDepartmentModal) {
    addDepartmentTypeInput.value = '';
    addDepartmentNameArInput.value = '';
    addDepartmentNameEnInput.value = '';
    addDepartmentImageInput.value = '';
    addDepartmentHasSubDepartmentsNo.checked = true; // إعادة تعيين للقيمة الافتراضية
    
    // مسح معاينة الصورة
    const previewDiv = document.getElementById('departmentImagePreview');
    if (previewDiv) previewDiv.innerHTML = '';
    
    // مسح الصورة المختارة
    delete addDepartmentModal.dataset.selectedExistingImage;
  } else if (modal === editDepartmentModal) {
    editDepartmentIdInput.value = '';
    editDepartmentTypeInput.value = '';
    editDepartmentNameArInput.value = '';
    editDepartmentNameEnInput.value = '';
    editDepartmentImageInput.value = '';
    editDepartmentHasSubDepartmentsNo.checked = true; // إعادة تعيين للقيمة الافتراضية
    
    // مسح معاينة الصورة
    const previewDiv = document.getElementById('editDepartmentImagePreview');
    if (previewDiv) previewDiv.innerHTML = '';
    
    // مسح الصورة المختارة
    delete editDepartmentModal.dataset.selectedExistingImage;
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
                icons += `<a href="#" class="edit-icon" data-id="${dept.id}" data-name='${dept.name}' data-type="${dept.type}" data-has-sub-departments="${dept.has_sub_departments || false}"><img src="../images/edit.svg" alt="${getTranslation('edit')}"></a>`;

                if (permissions.canDelete)
                    icons += `<a href="#" class="delete-icon" data-id="${dept.id}"><img src="../images/delet.svg" alt="${getTranslation('delete')}"></a>`;
                icons += '</div>';
            }

            // إنشاء عنصر الصورة مع التعامل مع الحالات التي لا توجد فيها صورة
            let imageElement;
            if (dept.image && dept.image.trim() !== '') {
                // تنظيف مسار الصورة وإضافة localhost إذا لم يكن موجوداً
                const cleanPath = cleanImagePath(dept.image);
                const fullPath = cleanPath.startsWith('http') ? cleanPath : `http://localhost:3006/${cleanPath}`;
                imageElement = `<img src="${fullPath}" alt="${deptName}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" onload="this.nextElementSibling.style.display='none';">`;
            } else {
                imageElement = `<div style="font-size: 24px; color: #fff; display: block;">${deptName.charAt(0).toUpperCase()}</div>`;
            }

            card.innerHTML = icons +
                `<div class="card-icon bg-blue">${imageElement}<div style="font-size: 24px; color: #fff; display: none;">${deptName.charAt(0).toUpperCase()}</div></div>` +
                `<div class="card-title">${deptName}</div>` +
                `<div class="card-subtitle"><span class="type-badge ${typeClass}">${typeText}</span></div>`;
            
            // إضافة معالج الأحداث للصورة
            const imgElement = card.querySelector('img');
            if (imgElement) {
                imgElement.addEventListener('error', function() {
                    console.warn('فشل تحميل الصورة:', this.src);
                    this.style.display = 'none';
                    const fallback = this.nextElementSibling;
                    if (fallback) fallback.style.display = 'block';
                });
                
                imgElement.addEventListener('load', function() {
                    console.log('تم تحميل الصورة بنجاح:', this.src);
                    const fallback = this.nextElementSibling;
                    if (fallback) fallback.style.display = 'none';
                });
            }

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
        filteredDepartments = [...allDepartments]; // Initialize filtered departments
        
        // Render departments and pagination
        renderDepartments();
        renderPagination();

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

  // حفظ الصورة الحالية في dataset
  const cardIcon = el.closest('.card').querySelector('.card-icon');
  let currentImage = '';
  
  // البحث عن الصورة في card-icon
  const imgElement = cardIcon.querySelector('img');
  if (imgElement && imgElement.src) {
    currentImage = imgElement.src;
  } else {
    // إذا لم توجد صورة، استخدم الصورة من البيانات الأصلية
    const card = el.closest('.card');
    const deptId = card.dataset.id;
    const originalDept = allDepartments.find(d => d.id == deptId);
    if (originalDept && originalDept.image) {
      currentImage = `http://localhost:3006/${originalDept.image}`;
    }
  }
  
  // تنظيف مسار الصورة وحفظه
  editDepartmentModal.dataset.currentImage = cleanImagePath(currentImage);

  // عرض معاينة الصورة الحالية
  const previewDiv = document.getElementById('editDepartmentImagePreview');
  if (previewDiv && currentImage) {
    previewDiv.innerHTML = `
      <div style="margin-top: 10px; text-align: center;">
        <img src="${currentImage}" alt="الصورة الحالية" style="max-width: 150px; max-height: 150px; border-radius: 8px; border: 2px solid #6c757d;">
        <div style="margin-top: 5px; font-size: 12px; color: #6c757d;">الصورة الحالية</div>
      </div>
    `;
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

  if (!type || !nameAr || !nameEn) {
    showToast(getTranslation('please-enter-all-required-data'), 'error');
    return;
  }

  const name = JSON.stringify({ ar: nameAr, en: nameEn });

  const fd = new FormData();
  fd.append('name', name);
  fd.append('type', type);
  fd.append('parentId', null); // الأقسام الرئيسية ليس لها أب
  fd.append('hasSubDepartments', hasSubDepartments);
  
  // معالجة الصورة
  if (file) {
    fd.append('image', file);
  } else if (addDepartmentModal.dataset.selectedExistingImage) {
    // إذا تم اختيار صورة موجودة
    fd.append('existingImage', addDepartmentModal.dataset.selectedExistingImage);
  }

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
    
    // إضافة القسم الجديد إلى المصفوفات
    const newDepartment = r.department || r.data || {
        id: r.departmentId || r.id,
        name: name,
        type: type,
        has_sub_departments: hasSubDepartments,
        image: file ? `backend/uploads/images/${file.name}` : ''
    };
    
    allDepartments.unshift(newDepartment);
    filteredDepartments.unshift(newDepartment);
    
    // إعادة عرض الأقسام مع الصفحات
    renderDepartments();
    renderPagination();
  } catch (err) {
    console.error(err);
    showToast(getTranslation(err), 'error');
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
  
  // معالجة الصورة
  if (file) {
    fd.append('image', file);
    console.log('تم رفع صورة جديدة:', file.name);
  } else if (editDepartmentModal.dataset.selectedExistingImage) {
    // إذا تم اختيار صورة موجودة
    fd.append('existingImage', editDepartmentModal.dataset.selectedExistingImage);
    console.log('تم اختيار صورة موجودة:', editDepartmentModal.dataset.selectedExistingImage);
  } else {
    // إذا لم يتم رفع صورة جديدة، أرسل الصورة الحالية كمسار نصي
    const currentImage = editDepartmentModal.dataset.currentImage;
    if (currentImage && currentImage.trim() !== '') {
      fd.append('currentImage', currentImage);
      console.log('تم حفظ الصورة الحالية:', currentImage);
    }
  }

  try {
    const res = await fetch(`${apiBase}/departments/${id}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: fd
    });
    const r = await res.json();
    if (!res.ok) throw new Error(r.message);
    
    console.log('استجابة الخادم:', r);
    showToast(getTranslation('department-updated-success'), 'success');
    closeModal(editDepartmentModal);
    
    // تحديث القسم في المصفوفات
    let updatedImage = '';
    if (file) {
      // إذا تم رفع صورة جديدة
      updatedImage = `backend/uploads/images/${file.name}`;
    } else if (editDepartmentModal.dataset.selectedExistingImage) {
      // إذا تم اختيار صورة موجودة
      updatedImage = editDepartmentModal.dataset.selectedExistingImage;
    } else {
      // إذا لم يتم رفع صورة جديدة، استخدم الصورة الحالية
      const currentImage = editDepartmentModal.dataset.currentImage;
      updatedImage = cleanImagePath(currentImage);
    }
    
    // استخدام البيانات من الخادم إذا كانت متوفرة، وإلا استخدم البيانات المحلية
    let updatedDepartment = r.department || r.data || {
        id: id,
        name: name,
        type: type,
        has_sub_departments: hasSubDepartments,
        image: updatedImage
    };
    
    // إذا كان الخادم لم يُرجع صورة، استخدم الصورة المحلية
    if (!updatedDepartment.image && updatedImage) {
        updatedDepartment.image = updatedImage;
    }
    
    // تأكد من أن جميع الحقول موجودة
    if (!updatedDepartment.id) updatedDepartment.id = id;
    if (!updatedDepartment.name) updatedDepartment.name = name;
    if (!updatedDepartment.type) updatedDepartment.type = type;
    if (updatedDepartment.has_sub_departments === undefined) updatedDepartment.has_sub_departments = hasSubDepartments;
    
    // تأكد من أن الصورة موجودة
    if (!updatedDepartment.image && updatedImage) {
        updatedDepartment.image = updatedImage;
    }
    
    // تنظيف مسار الصورة
    if (updatedDepartment.image) {
        updatedDepartment.image = cleanImagePath(updatedDepartment.image);
    }
    
    // تأكد من أن الصورة صالحة
    if (updatedDepartment.image && updatedDepartment.image.trim() === '') {
        updatedDepartment.image = '';
    }
    
    // تأكد من أن الصورة تحتوي على مسار صحيح
    if (updatedDepartment.image && !updatedDepartment.image.includes('uploads/')) {
        console.warn('مسار الصورة غير صحيح:', updatedDepartment.image);
    }
    
    // تأكد من أن الصورة تحتوي على امتداد صحيح
    if (updatedDepartment.image && !updatedDepartment.image.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
        console.warn('امتداد الصورة غير صحيح:', updatedDepartment.image);
    }
    
    console.log('القسم المُحدث:', updatedDepartment);
    
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
  } catch (err) {
    console.error(err);
    showToast(getTranslation(err), 'error');
  }
});


    // Delete department
    deleteModalConfirmBtn.addEventListener('click', async () => {
        if (!permissions.canDelete) return;
        const id = deleteDepartmentModal.dataset.departmentId;
        try {
            const res = await fetch(`http://localhost:3006/api/departments/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } });
            const r = await res.json(); if (!res.ok) throw new Error(r.message);
            showToast(getTranslation('department-deleted-success'), 'success'); 
            closeModal(deleteDepartmentModal); 
            
            // حذف القسم من المصفوفات
            allDepartments = allDepartments.filter(d => d.id != id);
            filteredDepartments = filteredDepartments.filter(d => d.id != id);
            
            // إعادة عرض الأقسام مع الصفحات
            renderDepartments();
            renderPagination();
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
    
    // إضافة أزرار اختيار الصور
    addImageSelectionButtons();

    window.goBack = () => window.history.back();
}

// Call the main function when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDepartmentsPage);
} else {
    // DOM is already ready
    initializeDepartmentsPage();
}
