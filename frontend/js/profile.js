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
    const usernameSpan = document.getElementById('profile-username');
    const emailSpan = document.getElementById('profile-email');
    const departmentSpan = document.getElementById('profile-department');
    const employeeNumberSpan = document.getElementById('profile-employee-number');
    const jobTitleSpan = document.getElementById('profile-job-title');

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
                console.log('🎯 المسمى الوظيفي من الخادم:', result.data.job_title);
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
            emailSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            usernameSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            employeeNumberSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            jobTitleSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            departmentSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            
            // جلب جميع بيانات البروفايل من الخادم
            fetchUserProfile(user.id).then(userData => {
                if (userData) {
                    console.log('🎨 عرض البيانات في الواجهة:', userData);
                    console.log('🎯 المسمى الوظيفي قبل العرض:', userData.job_title);
                    console.log('🎯 المسمى الوظيفي بعد parseLocalized:', parseLocalized(userData.job_title));
                    
                    // ✅ عرض جميع المعلومات من الخادم (البيانات الأحدث والأكثر دقة)
                    emailSpan.textContent = userData.email || getTranslation('not-available');
                    usernameSpan.textContent = userData.name || getTranslation('not-available');
                    employeeNumberSpan.textContent = userData.employee_number || getTranslation('not-available');
                    
                    // معالجة خاصة للمسمى الوظيفي
                    const jobTitle = userData.job_title;
                    if (jobTitle && jobTitle.trim() !== '') {
                        jobTitleSpan.textContent = parseLocalized(jobTitle);
                    } else {
                        jobTitleSpan.textContent = getTranslation('not-available');
                    }
                    
                    departmentSpan.textContent = parseLocalized(userData.departmentName) || getTranslation('not-available');
                } else {
                    // ⚠️ إذا فشل جلب البيانات من الخادم، استخدم البيانات من JWT كاحتياطي
                    emailSpan.textContent = user.email || getTranslation('not-available');
                    usernameSpan.textContent = user.username || getTranslation('not-available');
                    employeeNumberSpan.textContent = user.employee_number || getTranslation('not-available');
                    
                    // معالجة خاصة للمسمى الوظيفي (احتياطي)
                    const jobTitle = user.job_title;
                    if (jobTitle && jobTitle.trim() !== '') {
                        jobTitleSpan.textContent = parseLocalized(jobTitle);
                    } else {
                        jobTitleSpan.textContent = getTranslation('not-available');
                    }
                    
                    departmentSpan.textContent = parseLocalized(user.department_name) || getTranslation('not-available');
                }
            }).catch(error => {
                console.error('Error loading user profile:', error);
                // ⚠️ في حالة الخطأ، استخدم البيانات من JWT كاحتياطي
                emailSpan.textContent = user.email || getTranslation('not-available');
                usernameSpan.textContent = user.username || getTranslation('not-available');
                employeeNumberSpan.textContent = user.employee_number || getTranslation('not-available');
                
                // معالجة خاصة للمسمى الوظيفي (في حالة الخطأ)
                const jobTitle = user.job_title;
                if (jobTitle && jobTitle.trim() !== '') {
                    jobTitleSpan.textContent = parseLocalized(jobTitle);
                } else {
                    jobTitleSpan.textContent = getTranslation('not-available');
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
                        <label for="editJobTitle" data-translate="job-title-label">المسمى الوظيفي</label>
                        <select id="editJobTitle">
                            <option value="" data-translate="select-job-title">اختر المسمى الوظيفي</option>
                        </select>
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
            document.getElementById('editEmail').value = userData.email || '';
            
                         // جلب الأقسام والمسميات الوظيفية
             await fetchDepartmentsForEditModal(userData.departmentId, userData.departmentName);
             await fetchJobTitlesForEditModal(userData.job_title_id, userData.job_title);
            
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
        
        // جمع البيانات من النموذج
        const firstName = document.getElementById('editFirstName').value.trim();
        const secondName = document.getElementById('editSecondName').value.trim();
        const thirdName = document.getElementById('editThirdName').value.trim();
        const lastName = document.getElementById('editLastName').value.trim();
        const username = document.getElementById('editUsername').value.trim();
        const employeeNumber = document.getElementById('editEmployeeNumber').value.trim();
                 const email = document.getElementById('editEmail').value.trim();
         const departmentId = document.getElementById('editDepartment').value;
         const jobTitleId = document.getElementById('editJobTitle').value;
        
        // التحقق من الحقول المطلوبة
        if (!firstName || !lastName || !username || !email) {
            alert(getTranslation('required-fields') || 'يرجى ملء جميع الحقول المطلوبة');
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
             email: email,
             departmentId: departmentId,
             job_title_id: jobTitleId
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
            alert(getTranslation('profile-updated') || 'تم تحديث الملف الشخصي بنجاح');
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
            throw new Error('الرد ليس مصفوفة مسميات وظيفية');
        }
        
        const select = document.getElementById('editJobTitle');
        const lang = localStorage.getItem('language') || 'ar';
        const selectText = lang === 'ar' ? 'اختر المسمى الوظيفي' : 'Select Job Title';
        select.innerHTML = `<option value="">${selectText}</option>`;
        
        jobTitles.forEach(jobTitle => {
            const option = document.createElement('option');
            option.value = jobTitle.id;
            option.textContent = jobTitle.title;
            if (selectedId && Number(jobTitle.id) === Number(selectedId)) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching job titles for edit modal:', error);
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
