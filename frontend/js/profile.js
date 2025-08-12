

function getTranslation(key) {
    const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
    if (window.translations && window.translations[lang] && window.translations[lang][key]) {
        return window.translations[lang][key];
    }
    return key;
}
// في أعلى الملف، بعد parseJwt:
function parseLocalized(text) {
  console.log('🔤 parseLocalized input:', text, 'type:', typeof text);
  
  // إذا كان النص فارغاً أو null أو undefined
  if (!text || text === null || text === undefined) {
    console.log('🔤 parseLocalized: النص فارغ، إرجاع نص فارغ');
    return '';
  }
  
  try {
    const obj = typeof text==='string' && text.trim().startsWith('{')
      ? JSON.parse(text)
      : text;
    const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
    const result = (obj && obj[lang]) || (obj && obj.ar) || text || '';
    console.log('🔤 parseLocalized result:', result);
    return result;
  } catch (error) {
    console.log('🔤 parseLocalized error, returning original text:', text);
    return text;
  }
}

document.addEventListener('DOMContentLoaded', function() {
    const fullNameSpan = document.getElementById('profile-full-name');
    const usernameSpan = document.getElementById('profile-username');
    const emailSpan = document.getElementById('profile-email');
    const departmentSpan = document.getElementById('profile-department');
    const employeeNumberSpan = document.getElementById('profile-employee-number');
    const nationalIdSpan = document.getElementById('profile-national-id');
    const jobTitleSpan = document.getElementById('profile-job-title');
    const jobNameSpan = document.getElementById('profile-job-name');

    const logoutButton = document.getElementById('logout-button');

    // إضافة زر تعديل معلومات الشخص
    const profileActions = document.querySelector('.profile-actions');
    const editProfileButton = document.createElement('button');
    editProfileButton.id = 'edit-profile-button';
    editProfileButton.className = 'btn-secondary';
    editProfileButton.innerHTML = '<i class="fas fa-edit"></i> ' + (getTranslation('edit-profile') || 'تعديل الملف الشخصي');
    editProfileButton.onclick = openEditProfileModal;
    
    // إضافة الزر في الوسط بين زر إعادة تعيين كلمة المرور وزر تسجيل الخروج
    const resetPasswordLink = profileActions.querySelector('a[href="forgot-password.html"]');
    
    // إزالة زر تسجيل الخروج مؤقتاً
    profileActions.removeChild(logoutButton);
    
    // إضافة الزر في الوسط
    profileActions.appendChild(editProfileButton);
    profileActions.appendChild(logoutButton);

    // إنشاء مودال تعديل الملف الشخصي
    createEditProfileModal();

    // دالة لفك تشفير JWT والحصول على معلومات المستخدم
    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Error parsing JWT:', e);
            return null;
        }
    }

    // دالة لجلب معلومات المستخدم من الخادم
    async function fetchUserProfile(userId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No token available');
            }

            const response = await fetch(`http://localhost:3006/api/users/${userId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized - Please login again');
                } else if (response.status === 404) {
                    throw new Error('User not found');
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            }

            const result = await response.json();
            console.log('📡 استجابة الخادم:', result);
            
            if (result.status === 'success' && result.data) {
                console.log('✅ بيانات المستخدم من الخادم:', result.data);
                console.log('🎯 المنصب الإداري من الخادم:', result.data.job_title);
                return result.data;
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
    }

    // جلب التوكن من localStorage
    const token = localStorage.getItem('token');

    if (token) {
        const user = parseJwt(token);
        if (user) {
            // عرض رسالة تحميل مؤقتة
            fullNameSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            emailSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            usernameSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            employeeNumberSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            nationalIdSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            jobTitleSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            jobNameSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            departmentSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            
            // جلب جميع بيانات البروفايل من الخادم
            fetchUserProfile(user.id).then(userData => {
                if (userData) {
                    console.log('🎨 عرض البيانات في الواجهة:', userData);
                    console.log('🎯 المنصب الإداري قبل العرض:', userData.job_title);
                    console.log('🎯 المنصب الإداري بعد parseLocalized:', parseLocalized(userData.job_title));
                    
                    // ✅ عرض جميع المعلومات من الخادم (البيانات الأحدث والأكثر دقة)
                    // بناء الاسم الكامل من الأجزاء
                    const buildFullName = (firstName, secondName, thirdName, lastName) => {
                        const nameParts = [firstName, secondName, thirdName, lastName].filter(part => part && part.trim());
                        return nameParts.join(' ');
                    };
                    const fullName = buildFullName(
                        userData.first_name,
                        userData.second_name,
                        userData.third_name,
                        userData.last_name
                    );
                    fullNameSpan.textContent = fullName || getTranslation('not-available');
                    emailSpan.textContent = userData.email || getTranslation('not-available');
                    usernameSpan.textContent = userData.username || getTranslation('not-available');
                    employeeNumberSpan.textContent = userData.employee_number || getTranslation('not-available');
                    nationalIdSpan.textContent = userData.national_id || getTranslation('not-available');
                    
                    // معالجة خاصة للمسمى الوظيفي
                    const jobTitle = userData.job_title;
                    if (jobTitle && jobTitle.trim() !== '') {
                        jobTitleSpan.textContent = parseLocalized(jobTitle);
                    } else {
                        jobTitleSpan.textContent = getTranslation('not-available');
                    }
                    
                    // معالجة خاصة للمسمى
                    const jobName = userData.job_name;
                    if (jobName && jobName.trim() !== '') {
                        jobNameSpan.textContent = jobName;
                    } else {
                        jobNameSpan.textContent = getTranslation('not-available');
                    }
                    
                    departmentSpan.textContent = parseLocalized(userData.departmentName) || getTranslation('not-available');
                } else {
                    // ⚠️ إذا فشل جلب البيانات من الخادم، استخدم البيانات من JWT كاحتياطي
                    // بناء الاسم الكامل من JWT
                    const buildFullNameFromJWT = (firstName, secondName, thirdName, lastName) => {
                        const nameParts = [firstName, secondName, thirdName, lastName].filter(part => part && part.trim());
                        return nameParts.join(' ');
                    };
                    const fullNameFromJWT = buildFullNameFromJWT(
                        user.first_name,
                        user.second_name,
                        user.third_name,
                        user.last_name
                    );
                    fullNameSpan.textContent = fullNameFromJWT || getTranslation('not-available');
                    emailSpan.textContent = user.email || getTranslation('not-available');
                    usernameSpan.textContent = user.username || getTranslation('not-available');
                    employeeNumberSpan.textContent = user.employee_number || getTranslation('not-available');
                    nationalIdSpan.textContent = user.national_id || getTranslation('not-available');
                    
                    // معالجة خاصة للمسمى الوظيفي (احتياطي)
                    const jobTitle = user.job_title;
                    if (jobTitle && jobTitle.trim() !== '') {
                        jobTitleSpan.textContent = parseLocalized(jobTitle);
                    } else {
                        jobTitleSpan.textContent = getTranslation('not-available');
                    }
                    
                    // معالجة خاصة للمسمى (احتياطي)
                    const jobName = user.job_name;
                    if (jobName && jobName.trim() !== '') {
                        jobNameSpan.textContent = jobName;
                    } else {
                        jobNameSpan.textContent = getTranslation('not-available');
                    }
                    
                    departmentSpan.textContent = parseLocalized(user.department_name) || getTranslation('not-available');
                }
            }).catch(error => {
                console.error('Error loading user profile:', error);
                // ⚠️ في حالة الخطأ، استخدم البيانات من JWT كاحتياطي
                // بناء الاسم الكامل من JWT في حالة الخطأ
                const buildFullNameFromJWTError = (firstName, secondName, thirdName, lastName) => {
                    const nameParts = [firstName, secondName, thirdName, lastName].filter(part => part && part.trim());
                    return nameParts.join(' ');
                };
                const fullNameFromJWTError = buildFullNameFromJWTError(
                    user.first_name,
                    user.second_name,
                    user.third_name,
                    user.last_name
                );
                fullNameSpan.textContent = fullNameFromJWTError || getTranslation('not-available');
                emailSpan.textContent = user.email || getTranslation('not-available');
                usernameSpan.textContent = user.username || getTranslation('not-available');
                employeeNumberSpan.textContent = user.employee_number || getTranslation('not-available');
                nationalIdSpan.textContent = user.national_id || getTranslation('not-available');
                
                // معالجة خاصة للمسمى الوظيفي (في حالة الخطأ)
                const jobTitle = user.job_title;
                if (jobTitle && jobTitle.trim() !== '') {
                    jobTitleSpan.textContent = parseLocalized(jobTitle);
                } else {
                    jobTitleSpan.textContent = getTranslation('not-available');
                }
                
                // معالجة خاصة للمسمى (في حالة الخطأ)
                const jobName = user.job_name;
                if (jobName && jobName.trim() !== '') {
                    jobNameSpan.textContent = jobName;
                } else {
                    jobNameSpan.textContent = getTranslation('not-available');
                }
                
                departmentSpan.textContent = parseLocalized(user.department_name) || getTranslation('not-available');
            });

        } else {
            // إذا كان التوكن غير صالح، توجيه المستخدم لصفحة تسجيل الدخول
            alert(getTranslation('invalid-session'));
            window.location.href = 'login.html';
        }
    } else {
        // إذا لم يكن هناك توكن، توجيه المستخدم لصفحة تسجيل الدخول
        alert(getTranslation('please-login'));
        window.location.href = 'login.html';
    }

    // التعامل مع زر تسجيل الخروج
    logoutButton.addEventListener('click', function() {
        localStorage.removeItem('token'); // حذف التوكن
        alert(getTranslation('logout-success'));
        window.location.href = 'login.html'; // التوجيه لصفحة تسجيل الدخول
    });
}); 

// دالة إنشاء مودال تعديل الملف الشخصي
function createEditProfileModal() {
    const modal = document.createElement('div');
    modal.id = 'editProfileModal';
    modal.className = 'modal';
    modal.style.display = 'none';
    
    modal.innerHTML = `
        <div class="modal-content">
            <h2 class="modal-title" data-translate="edit-profile">تعديل الملف الشخصي</h2>
            <div class="modal-section">
                <h3 data-translate="user-info">معلومات المستخدم</h3>
                
                <div class="form-row">
                    <div class="form-group">
                        <label for="editFirstName" data-translate="first-name-label">الاسم الأول *</label>
                        <input type="text" id="editFirstName" data-translate-placeholder="first-name-placeholder" placeholder="أدخل الاسم الأول" required>
                    </div>
                    <div class="form-group">
                        <label for="editLastName" data-translate="last-name-label">اسم العائلة *</label>
                        <input type="text" id="editLastName" data-translate-placeholder="last-name-placeholder" placeholder="أدخل اسم العائلة" required>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="editSecondName" data-translate="second-name-label">الاسم الثاني</label>
                        <input type="text" id="editSecondName" data-translate-placeholder="second-name-placeholder" placeholder="أدخل الاسم الثاني">
                    </div>
                    <div class="form-group">
                        <label for="editThirdName" data-translate="third-name-label">الاسم الثالث</label>
                        <input type="text" id="editThirdName" data-translate-placeholder="third-name-placeholder" placeholder="أدخل الاسم الثالث">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="editUsername" data-translate="username-label">اسم المستخدم *</label>
                        <input type="text" id="editUsername" data-translate-placeholder="username-placeholder" placeholder="أدخل اسم المستخدم" required>
                    </div>
                    <div class="form-group">
                        <label for="editEmail" data-translate="email-label">البريد الإلكتروني *</label>
                        <input type="email" id="editEmail" data-translate-placeholder="email-placeholder" placeholder="أدخل البريد الإلكتروني" required>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="editEmployeeNumber" data-translate="employee-number-label">الرقم الوظيفي</label>
                        <input type="text" id="editEmployeeNumber" data-translate-placeholder="employee-number-placeholder" placeholder="أدخل الرقم الوظيفي">
                    </div>
                    <div class="form-group">
                        <label for="editNationalId" data-translate="national-id">رقم الهوية الوطنية / الإقامة</label>
                        <input type="text" id="editNationalId" data-translate-placeholder="enter-national-id" placeholder="أدخل رقم الهوية الوطنية أو الإقامة" maxlength="10" pattern="[0-9]{10}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="editJobTitle" data-translate="job-title-label">المنصب الإداري</label>
                        <div class="custom-select-container">
                            <div class="custom-select" id="customJobTitleSelect">
                                <div class="custom-select__trigger">
                                    <span id="selectedJobTitleText">اختر المنصب الإداري</span>
                                    <div class="arrow"></div>
                                </div>
                                <div class="custom-options" id="jobTitleOptions">
                                    <span class="custom-option" data-value="">اختر المنصب الإداري</span>
                                    <div class="add-new-option" id="addNewJobTitle">
                                        <i class="fas fa-plus"></i>
                                        <span>إضافة منصب إداري جديد</span>
                                    </div>
                                </div>
                            </div>
                            <input type="hidden" id="editJobTitle" value="">
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="editJobName" data-translate="job-name-label">المسمى الوظيفي</label>
                        <div class="custom-select-container">
                            <div class="custom-select" id="customJobNameSelect">
                                <div class="custom-select__trigger">
                                    <span id="selectedJobNameText">اختر المسمى الوظيفي</span>
                                    <div class="arrow"></div>
                                </div>
                                <div class="custom-options" id="jobNameOptions">
                                    <span class="custom-option" data-value="">اختر المسمى الوظيفي</span>
                                    <div class="add-new-option" id="addNewJobName">
                                        <i class="fas fa-plus"></i>
                                        <span>إضافة مسمى وظيفي جديد</span>
                                    </div>
                                </div>
                            </div>
                            <input type="hidden" id="editJobName" value="">
                        </div>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="editDepartment" data-translate="department-label">القسم</label>
                        <select id="editDepartment">
                            <option value="" data-translate="select-department">اختر القسم</option>
                        </select>
                    </div>
                </div>


            </div>
            <div class="modal-actions">
                <button class="btn-secondary" id="cancelEditProfile"><span data-translate="cancel">إلغاء</span></button>
                <button class="btn-primary" id="saveEditProfile"><span data-translate="save-user">حفظ التعديلات</span></button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // إضافة أحداث الإغلاق
    document.getElementById('cancelEditProfile').onclick = closeEditProfileModal;
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeEditProfileModal();
        }
    };
    
    // إضافة حدث حفظ النموذج
    document.getElementById('saveEditProfile').onclick = saveProfileChanges;
    
    // إضافة حدث إضافة مسمى وظيفي جديد
    document.getElementById('addNewJobTitle').onclick = openAddJobTitleModal;
    
    // إضافة أحداث القائمة المخصصة
    setupCustomJobTitleSelect();
    setupCustomJobNameSelect();
}

// دالة فتح مودال تعديل الملف الشخصي
async function openEditProfileModal() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert(getTranslation('please-login') || 'يرجى تسجيل الدخول');
        return;
    }
    
    try {
        const user = parseJwt(token);
        const userData = await fetchUserProfile(user.id);
        
        if (userData) {
            // تقسيم الاسم الكامل إلى أسماء منفصلة
            const nameParts = (userData.name || '').split(' ').filter(part => part.trim());
            document.getElementById('editFirstName').value = nameParts[0] || '';
            document.getElementById('editSecondName').value = nameParts[1] || '';
            document.getElementById('editThirdName').value = nameParts[2] || '';
            document.getElementById('editLastName').value = nameParts.slice(3).join(' ') || '';
            document.getElementById('editUsername').value = userData.username || '';
            document.getElementById('editEmployeeNumber').value = userData.employee_number || '';
            document.getElementById('editNationalId').value = userData.national_id || '';
            document.getElementById('editEmail').value = userData.email || '';
            
                         // جلب الأقسام والمسميات الوظيفية
             await fetchDepartmentsForEditModal(userData.departmentId, userData.departmentName);
             await fetchJobTitlesForEditModal(userData.job_title_id, userData.job_title);
             await fetchJobNamesForEditModal(userData.job_name_id, userData.job_name);
            
            document.getElementById('editProfileModal').style.display = 'flex';
        }
    } catch (error) {
        console.error('Error opening edit profile modal:', error);
        alert(getTranslation('error-occurred') || 'حدث خطأ');
    }
}

// دالة إغلاق مودال تعديل الملف الشخصي
function closeEditProfileModal() {
    document.getElementById('editProfileModal').style.display = 'none';
}

// دالة حفظ التغييرات
async function saveProfileChanges() {
    
    const token = localStorage.getItem('token');
    if (!token) {
        alert(getTranslation('please-login') || 'يرجى تسجيل الدخول');
        return;
    }
    
    try {
        const user = parseJwt(token);
        
        // جلب بيانات المستخدم الحالية للحصول على الدور
        const userData = await fetchUserProfile(user.id);
        if (!userData) {
            throw new Error('فشل في جلب بيانات المستخدم');
        }
        
        // جمع البيانات من النموذج
        const firstName = document.getElementById('editFirstName').value.trim();
        const secondName = document.getElementById('editSecondName').value.trim();
        const thirdName = document.getElementById('editThirdName').value.trim();
        const lastName = document.getElementById('editLastName').value.trim();
        const username = document.getElementById('editUsername').value.trim();
        const employeeNumber = document.getElementById('editEmployeeNumber').value.trim();
        const nationalId = document.getElementById('editNationalId').value.trim();
                 const email = document.getElementById('editEmail').value.trim();
         const departmentId = document.getElementById('editDepartment').value;
         const jobTitleId = document.getElementById('editJobTitle').value;
         const jobNameId = document.getElementById('editJobName') ? document.getElementById('editJobName').value : '';
        
        // التحقق من الحقول المطلوبة
        if (!firstName || !lastName || !username || !email) {
            alert(getTranslation('required-fields') || 'يرجى ملء جميع الحقول المطلوبة');
            return;
        }

        // التحقق من صحة رقم الهوية إذا تم إدخاله
        if (nationalId && !/^[1-9]\d{9}$/.test(nationalId)) {
            alert('رقم الهوية الوطنية أو الإقامة غير صحيح. يجب أن يكون 10 أرقام ولا يبدأ بصفر.');
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
             employee_number: employeeNumber,
             national_id: nationalId,
             email: email,
             departmentId: departmentId,
             job_title_id: jobTitleId,
             job_name_id: jobNameId,
             role: userData.role // إضافة الدور من بيانات المستخدم الحالية
         };
        
        // إرسال البيانات للخادم
        const response = await fetch(`http://localhost:3006/api/users/${user.id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            alert( 'تم تحديث الملف الشخصي بنجاح');
            closeEditProfileModal();
            // إعادة تحميل الصفحة لتحديث البيانات المعروضة
            window.location.reload();
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'فشل في تحديث الملف الشخصي');
        }
    } catch (error) {
        console.error('Error saving profile changes:', error);
        alert(error.message || getTranslation('error-occurred') || 'حدث خطأ');
    }
}

// دالة جلب الأقسام لمودال التعديل
async function fetchDepartmentsForEditModal(selectedId, selectedName) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3006/api/departments/all', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        const data = result.data || result;
        
        if (!Array.isArray(data)) {
            throw new Error('الرد ليس مصفوفة أقسام');
        }
        
        const select = document.getElementById('editDepartment');
        const lang = localStorage.getItem('language') || 'ar';
        const selectText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
        select.innerHTML = `<option value="">${selectText}</option>`;
        
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
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching departments for edit modal:', error);
    }
}

// دالة جلب المسميات الوظيفية لمودال التعديل
async function fetchJobTitlesForEditModal(selectedId, selectedTitle) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3006/api/job-titles', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        const jobTitles = Array.isArray(result) ? result : (result.data || []);
        
        if (!Array.isArray(jobTitles)) {
            throw new Error('الرد ليس مصفوفة مناصب إدارية');
        }
        
        // تحديث القائمة المخصصة
        const optionsContainer = document.getElementById('jobTitleOptions');
        const lang = localStorage.getItem('language') || 'ar';
        const selectText = lang === 'ar' ? 'اختر المنصب الإداري' : 'Select Administrative Position';
        
        // إزالة الخيارات القديمة (باستثناء الخيار الافتراضي وزر الإضافة)
        const defaultOption = optionsContainer.querySelector('.custom-option[data-value=""]');
        const addButton = optionsContainer.querySelector('.add-new-option');
        optionsContainer.innerHTML = '';
        
        // إعادة إضافة الخيار الافتراضي
        if (defaultOption) {
            optionsContainer.appendChild(defaultOption);
        } else {
            const newDefaultOption = document.createElement('span');
            newDefaultOption.className = 'custom-option';
            newDefaultOption.setAttribute('data-value', '');
            newDefaultOption.textContent = selectText;
            optionsContainer.appendChild(newDefaultOption);
        }
        
        // إضافة خيارات المناصب الإدارية
        jobTitles.forEach(jobTitle => {
            const option = document.createElement('span');
            option.className = 'custom-option';
            option.setAttribute('data-value', jobTitle.id);
            option.textContent = jobTitle.title;
            
            if (selectedId && Number(jobTitle.id) === Number(selectedId)) {
                option.classList.add('selected');
                document.getElementById('selectedJobTitleText').textContent = jobTitle.title;
                document.getElementById('editJobTitle').value = jobTitle.id;
            }
            
            optionsContainer.appendChild(option);
        });
        
        // إعادة إضافة زر الإضافة
        if (addButton) {
            optionsContainer.appendChild(addButton);
        } else {
            const newAddButton = document.createElement('div');
            newAddButton.className = 'add-new-option';
            newAddButton.id = 'addNewJobTitle';
            newAddButton.innerHTML = '<i class="fas fa-plus"></i><span>إضافة منصب إداري جديد</span>';
            newAddButton.onclick = openAddJobTitleModal;
            optionsContainer.appendChild(newAddButton);
        }
        
    } catch (error) {
        console.error('Error fetching job titles for edit modal:', error);
    }
}

// دالة لجلب المسميات الوظيفية وتعبئة الدروب داون مع اختيار المسمى الحالي
async function fetchJobNamesForEditModal(selectedId, selectedName) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3006/api/job-names', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        const jobNames = Array.isArray(result) ? result : (result.data || []);
        
        if (!Array.isArray(jobNames)) {
            throw new Error('الرد ليس مصفوفة مسميات وظيفية');
        }
        
        // تحديث القائمة المخصصة
        const optionsContainer = document.getElementById('jobNameOptions');
        if (optionsContainer) {
            const lang = localStorage.getItem('language') || 'ar';
            const selectText = lang === 'ar' ? 'اختر المسمى الوظيفي' : 'Select Job Name';
            
            // إزالة الخيارات القديمة (باستثناء الخيار الافتراضي وزر الإضافة)
            const defaultOption = optionsContainer.querySelector('.custom-option[data-value=""]');
            const addButton = optionsContainer.querySelector('.add-new-option');
            optionsContainer.innerHTML = '';
            
            // إعادة إضافة الخيار الافتراضي
            if (defaultOption) {
                optionsContainer.appendChild(defaultOption);
            } else {
                const newDefaultOption = document.createElement('span');
                newDefaultOption.className = 'custom-option';
                newDefaultOption.setAttribute('data-value', '');
                newDefaultOption.textContent = selectText;
                optionsContainer.appendChild(newDefaultOption);
            }
            
            // إضافة خيارات المسميات الوظيفية
            jobNames.forEach(jobName => {
                const option = document.createElement('span');
                option.className = 'custom-option';
                option.setAttribute('data-value', jobName.id);
                option.textContent = jobName.name;
                
                if (selectedId && Number(jobName.id) === Number(selectedId)) {
                    option.classList.add('selected');
                    if (document.getElementById('selectedJobNameText')) {
                        document.getElementById('selectedJobNameText').textContent = jobName.name;
                    }
                    if (document.getElementById('editJobName')) {
                        document.getElementById('editJobName').value = jobName.id;
                    }
                }
                
                optionsContainer.appendChild(option);
            });
            
            // إعادة إضافة زر الإضافة
            if (addButton) {
                optionsContainer.appendChild(addButton);
            } else {
                const newAddButton = document.createElement('div');
                newAddButton.className = 'add-new-option';
                newAddButton.id = 'addNewJobName';
                newAddButton.innerHTML = '<i class="fas fa-plus"></i><span>إضافة مسمى وظيفي جديد</span>';
                newAddButton.onclick = openAddJobNameModal;
                optionsContainer.appendChild(newAddButton);
            }
        }
        
    } catch (error) {
        console.error('Error fetching job names for edit modal:', error);
    }
}

// دالة مساعدة لجلب بيانات المستخدم
async function fetchUserProfile(userId) {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('No token available');
        }

        const response = await fetch(`http://localhost:3006/api/users/${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Unauthorized - Please login again');
            } else if (response.status === 404) {
                throw new Error('User not found');
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        }

        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            return result.data;
        } else {
            throw new Error('Invalid response format');
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return null;
    }
}

// دالة مساعدة لفك تشفير JWT
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Error parsing JWT:', e);
        return null;
    }
}

// دالة فتح مودال إضافة مسمى وظيفي جديد
function openAddJobTitleModal() {
    // إنشاء مودال إضافة مسمى وظيفي جديد
    const modal = document.createElement('div');
    modal.id = 'addJobTitleModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content">
            <h2 class="modal-title">إضافة منصب إداري جديد</h2>
            <div class="modal-section">
                <div class="form-group">
                                            <label for="newJobTitleName" data-translate="job-title-label">المنصب الإداري *</label>
                        <input type="text" id="newJobTitleName" placeholder="أدخل المنصب الإداري الجديد" required>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" id="cancelAddJobTitle">إلغاء</button>
                <button class="btn-primary" id="saveNewJobTitle">حفظ</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // إضافة أحداث الإغلاق
    document.getElementById('cancelAddJobTitle').onclick = closeAddJobTitleModal;
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeAddJobTitleModal();
        }
    };
    
            // إضافة حدث حفظ المنصب الإداري الجديد
    document.getElementById('saveNewJobTitle').onclick = saveNewJobTitle;
}

// دالة إغلاق مودال إضافة مسمى وظيفي جديد
function closeAddJobTitleModal() {
    const modal = document.getElementById('addJobTitleModal');
    if (modal) {
        modal.remove();
    }
}

    // دالة حفظ المنصب الإداري الجديد
async function saveNewJobTitle() {
    const jobTitleName = document.getElementById('newJobTitleName').value.trim();
    
    if (!jobTitleName) {
        alert('يرجى إدخال المنصب الإداري');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('يرجى تسجيل الدخول');
            return;
        }
        
        const response = await fetch('http://localhost:3006/api/job-titles', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: jobTitleName
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('تم إضافة المنصب الإداري بنجاح');
            
            // إغلاق مودال إضافة المنصب الإداري
            closeAddJobTitleModal();
            
            // تحديث قائمة المناصب الإدارية في مودال التعديل
            await refreshJobTitlesList();
            
            // تحديد المنصب الإداري الجديد
            const jobTitleSelect = document.getElementById('editJobTitle');
            if (result.data && result.data.id) {
                jobTitleSelect.value = result.data.id;
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'فشل في إضافة المنصب الإداري');
        }
    } catch (error) {
        console.error('Error saving new job title:', error);
        alert(error.message || 'حدث خطأ في إضافة المنصب الإداري');
    }
}

// دالة تحديث قائمة المسميات الوظيفية
async function refreshJobTitlesList() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3006/api/job-titles', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        const jobTitles = Array.isArray(result) ? result : (result.data || []);
        
        if (!Array.isArray(jobTitles)) {
            throw new Error('الرد ليس مصفوفة مسميات وظيفية');
        }
        
        // تحديث القائمة المخصصة
        const optionsContainer = document.getElementById('jobTitleOptions');
        const lang = localStorage.getItem('language') || 'ar';
        const selectText = lang === 'ar' ? 'اختر المنصب الاداري' : 'Select Job Title';
        
        // إزالة الخيارات القديمة (باستثناء الخيار الافتراضي وزر الإضافة)
        const defaultOption = optionsContainer.querySelector('.custom-option[data-value=""]');
        const addButton = optionsContainer.querySelector('.add-new-option');
        optionsContainer.innerHTML = '';
        
        // إعادة إضافة الخيار الافتراضي
        if (defaultOption) {
            optionsContainer.appendChild(defaultOption);
        } else {
            const newDefaultOption = document.createElement('span');
            newDefaultOption.className = 'custom-option';
            newDefaultOption.setAttribute('data-value', '');
            newDefaultOption.textContent = selectText;
            optionsContainer.appendChild(newDefaultOption);
        }
        
        // إضافة خيارات المناصب الإدارية
        jobTitles.forEach(jobTitle => {
            const option = document.createElement('span');
            option.className = 'custom-option';
            option.setAttribute('data-value', jobTitle.id);
            option.textContent = jobTitle.title;
            optionsContainer.appendChild(option);
        });
        
        // إعادة إضافة زر الإضافة
        if (addButton) {
            optionsContainer.appendChild(addButton);
        } else {
            const newAddButton = document.createElement('div');
            newAddButton.className = 'add-new-option';
            newAddButton.id = 'addNewJobTitle';
            newAddButton.innerHTML = '<i class="fas fa-plus"></i><span>إضافة منصب إداري جديد</span>';
            newAddButton.onclick = openAddJobTitleModal;
            optionsContainer.appendChild(newAddButton);
        }
        
    } catch (error) {
        console.error('Error refreshing job titles list:', error);
    }
}

// دالة إعداد القائمة المخصصة للمناصب الإدارية
function setupCustomJobTitleSelect() {
    const customSelect = document.getElementById('customJobTitleSelect');
    const trigger = customSelect.querySelector('.custom-select__trigger');
    const options = customSelect.querySelector('.custom-options');
    const hiddenInput = document.getElementById('editJobTitle');
    const selectedText = document.getElementById('selectedJobTitleText');
    
    // فتح/إغلاق القائمة
    trigger.addEventListener('click', function() {
        const isOpen = customSelect.classList.contains('open');
        
        // إغلاق جميع القوائم المفتوحة الأخرى
        document.querySelectorAll('.custom-select.open').forEach(select => {
            select.classList.remove('open');
        });
        
        if (!isOpen) {
            customSelect.classList.add('open');
        }
    });
    
    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', function(e) {
        if (!customSelect.contains(e.target)) {
            customSelect.classList.remove('open');
        }
    });
    
    // اختيار خيار
    options.addEventListener('click', function(e) {
        if (e.target.classList.contains('custom-option')) {
            const value = e.target.getAttribute('data-value');
            const text = e.target.textContent;
            
            // إزالة التحديد من جميع الخيارات
            options.querySelectorAll('.custom-option').forEach(option => {
                option.classList.remove('selected');
            });
            
            // تحديد الخيار المختار
            e.target.classList.add('selected');
            
            // تحديث النص والقيمة
            selectedText.textContent = text;
            hiddenInput.value = value;
            
            // إغلاق القائمة
            customSelect.classList.remove('open');
                }
    });
}

// دالة إعداد القائمة المخصصة للمسميات الوظيفية
function setupCustomJobNameSelect() {
    const customSelect = document.getElementById('customJobNameSelect');
    const trigger = customSelect.querySelector('.custom-select__trigger');
    const options = customSelect.querySelector('.custom-options');
    const hiddenInput = document.getElementById('editJobName');
    const selectedText = document.getElementById('selectedJobNameText');
    
    // فتح/إغلاق القائمة
    trigger.addEventListener('click', function() {
        const isOpen = customSelect.classList.contains('open');
        
        // إغلاق جميع القوائم المفتوحة الأخرى
        document.querySelectorAll('.custom-select.open').forEach(select => {
            select.classList.remove('open');
        });
        
        if (!isOpen) {
            customSelect.classList.add('open');
        }
    });
    
    // إغلاق القائمة عند النقر خارجها
    document.addEventListener('click', function(e) {
        if (!customSelect.contains(e.target)) {
            customSelect.classList.remove('open');
        }
    });
    
    // اختيار خيار
    options.addEventListener('click', function(e) {
        if (e.target.classList.contains('custom-option')) {
            const value = e.target.getAttribute('data-value');
            const text = e.target.textContent;
            
            // إزالة التحديد من جميع الخيارات
            options.querySelectorAll('.custom-option').forEach(option => {
                option.classList.remove('selected');
            });
            
            // تحديد الخيار المختار
            e.target.classList.add('selected');
            
            // تحديث النص والقيمة
            selectedText.textContent = text;
            hiddenInput.value = value;
            
            // إغلاق القائمة
            customSelect.classList.remove('open');
        }
    });
}

// دالة تحديث قائمة المسميات الوظيفية
async function refreshJobNamesList() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3006/api/job-names', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        const jobNames = Array.isArray(result) ? result : (result.data || []);
        
        if (!Array.isArray(jobNames)) {
            throw new Error('الرد ليس مصفوفة مسميات وظيفية');
        }
        
        // تحديث القائمة المخصصة
        const optionsContainer = document.getElementById('jobNameOptions');
        if (optionsContainer) {
            const lang = localStorage.getItem('language') || 'ar';
            const selectText = lang === 'ar' ? 'اختر المسمى الوظيفي' : 'Select Job Name';
            
            // إزالة الخيارات القديمة (باستثناء الخيار الافتراضي وزر الإضافة)
            const defaultOption = optionsContainer.querySelector('.custom-option[data-value=""]');
            const addButton = optionsContainer.querySelector('.add-new-option');
            optionsContainer.innerHTML = '';
            
            // إعادة إضافة الخيار الافتراضي
            if (defaultOption) {
                optionsContainer.appendChild(defaultOption);
            } else {
                const newDefaultOption = document.createElement('span');
                newDefaultOption.className = 'custom-option';
                newDefaultOption.setAttribute('data-value', '');
                newDefaultOption.textContent = selectText;
                optionsContainer.appendChild(newDefaultOption);
            }
            
            // إضافة خيارات المسميات الوظيفية
            jobNames.forEach(jobName => {
                const option = document.createElement('span');
                option.className = 'custom-option';
                option.setAttribute('data-value', jobName.id);
                option.textContent = jobName.name;
                optionsContainer.appendChild(option);
            });
            
            // إعادة إضافة زر الإضافة
            if (addButton) {
                optionsContainer.appendChild(addButton);
            } else {
                const newAddButton = document.createElement('div');
                newAddButton.className = 'add-new-option';
                newAddButton.id = 'addNewJobName';
                newAddButton.innerHTML = '<i class="fas fa-plus"></i><span>إضافة مسمى وظيفي جديد</span>';
                newAddButton.onclick = openAddJobNameModal;
                optionsContainer.appendChild(newAddButton);
            }
        }
        
    } catch (error) {
        console.error('Error refreshing job names list:', error);
    }
}

// دالة فتح مودال إضافة مسمى وظيفي جديد
function openAddJobNameModal() {
    // إنشاء مودال إضافة مسمى وظيفي جديد
    const modal = document.createElement('div');
    modal.id = 'addJobNameModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    
    modal.innerHTML = `
        <div class="modal-content">
            <h2 class="modal-title">إضافة مسمى وظيفي جديد</h2>
            <div class="modal-section">
                <div class="form-group">
                    <label for="newJobNameName" data-translate="job-name-label">المسمى الوظيفي *</label>
                    <input type="text" id="newJobNameName" placeholder="أدخل المسمى الوظيفي الجديد" required>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" id="cancelAddJobName">إلغاء</button>
                <button class="btn-primary" id="saveNewJobName">حفظ</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // إضافة أحداث الإغلاق
    document.getElementById('cancelAddJobName').onclick = closeAddJobNameModal;
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeAddJobNameModal();
        }
    };
    
    // إضافة حدث حفظ المسمى الوظيفي الجديد
    document.getElementById('saveNewJobName').onclick = saveNewJobName;
}

// دالة إغلاق مودال إضافة مسمى وظيفي جديد
function closeAddJobNameModal() {
    const modal = document.getElementById('addJobNameModal');
    if (modal) {
        modal.remove();
    }
}

// دالة حفظ مسمى وظيفي جديد
async function saveNewJobName() {
    const name = document.getElementById('newJobNameName').value.trim();
    
    if (!name) {
        alert('يرجى إدخال المسمى الوظيفي');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('يرجى تسجيل الدخول');
            return;
        }
        
        const response = await fetch('http://localhost:3006/api/job-names', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('تم إضافة المسمى الوظيفي بنجاح');
            
            // إغلاق مودال إضافة المسمى الوظيفي
            closeAddJobNameModal();
            
            // تحديث قائمة المسميات الوظيفية في مودال التعديل
            await refreshJobNamesList();
            
            // تحديد المسمى الوظيفي الجديد
            const jobNameSelect = document.getElementById('editJobName');
            if (result.data && result.data.id) {
                jobNameSelect.value = result.data.id;
                
                // تحديث النص المعروض
                const selectedJobNameText = document.getElementById('selectedJobNameText');
                if (selectedJobNameText) {
                    selectedJobNameText.textContent = name;
                }
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || 'فشل في إضافة المسمى الوظيفي');
        }
    } catch (error) {
        console.error('Error saving new job name:', error);
        alert(error.message || 'حدث خطأ في إضافة المسمى الوظيفي');
    }
}