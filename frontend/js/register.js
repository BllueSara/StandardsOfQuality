// دالة إظهار التوست - خارج DOMContentLoaded لتكون متاحة في كل مكان
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
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 500);
    }, duration);
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('register.js script loaded and DOMContentLoaded event fired.');
    const registerForm = document.getElementById('registerForm');
    const departmentSelect = document.getElementById('reg-department');
    const firstNameInput = document.getElementById('reg-first-name');
    const secondNameInput = document.getElementById('reg-second-name');
    const thirdNameInput = document.getElementById('reg-third-name');
    const lastNameInput = document.getElementById('reg-last-name');
    const usernameInput = document.getElementById('reg-username');
    const departmentGroup = document.getElementById('departmentGroup');
    const employeeInput   = document.getElementById('reg-employee');
    const employeeGroup   = document.getElementById('employeeGroup');
    const jobTitleGroup = document.getElementById('jobTitleGroup');
    const firstNameGroup = document.getElementById('firstNameGroup');
    const secondNameGroup = document.getElementById('secondNameGroup');
    const thirdNameGroup = document.getElementById('thirdNameGroup');
    const lastNameGroup = document.getElementById('lastNameGroup');
    const nationalIdGroup = document.getElementById('nationalIdGroup');
    const nationalIdInput = document.getElementById('reg-national-id');

    // عناصر النموذج المنبثق لإضافة قسم
    const addDepartmentModal = document.getElementById('addDepartmentModal');
    const saveAddDepartmentBtn = document.getElementById('saveAddDepartment');
    const cancelAddDepartmentBtn = document.getElementById('cancelAddDepartment');
    const departmentNameInput = document.getElementById('departmentName');
    const departmentImageInput = document.getElementById('departmentImage');
    const departmentNameArInput = document.getElementById('departmentNameAr');
    const departmentNameEnInput = document.getElementById('departmentNameEn');

    // عناصر النموذج المنبثق لإضافة مسمى وظيفي
    const addJobTitleModal = document.getElementById('addJobTitleModal');
    const saveAddJobTitleBtn = document.getElementById('saveAddJobTitle');
    const cancelAddJobTitleBtn = document.getElementById('cancelAddJobTitle');
    const jobTitleNameInput = document.getElementById('jobTitleName');
    const jobTitleSelect = document.getElementById('reg-job-title');

    // عناصر النموذج المنبثق لإضافة مسمى
    const addJobNameModal = document.getElementById('addJobNameModal');
    const saveAddJobNameBtn = document.getElementById('saveAddJobName');
    const cancelAddJobNameBtn = document.getElementById('cancelAddJobName');
    const jobNameNameInput = document.getElementById('jobNameName');
    const jobNameSelect = document.getElementById('reg-job-name');


    // دالة لفتح المودال
    function openModal(modal) {
        modal.style.display = 'flex';
    }

    // دالة لإغلاق المودال
function closeModal(modal) {
    modal.style.display = 'none';
    
    // إعادة ضبط حقول مودال القسم
    if (modal === addDepartmentModal) {
        departmentNameArInput.value = '';
        departmentNameEnInput.value = '';
        departmentImageInput.value = '';
    }
    
    // إعادة ضبط حقول مودال المنصب الإداري
    if (modal === addJobTitleModal) {
        jobTitleNameInput.value = '';
    }
}




    // دالة للتحقق من اسم المستخدم وإخفاء/إظهار الحقول المناسبة
    function checkUsernameAndToggleFields() {
        const username = usernameInput.value.trim().toLowerCase();
        
        if (username === 'admin') {
            // إخفاء الحقول غير المطلوبة للمدير
            firstNameGroup.style.display = 'none';
            secondNameGroup.style.display = 'none';
            thirdNameGroup.style.display = 'none';
            lastNameGroup.style.display = 'none';
            departmentGroup.style.display = 'none';
            employeeGroup.style.display = 'none';
            jobTitleGroup.style.display = 'none';
            nationalIdGroup.style.display = 'none';
            
            // إزالة required من الحقول المخفية
            firstNameInput.removeAttribute('required');
            lastNameInput.removeAttribute('required');
            departmentSelect.removeAttribute('required');
            employeeInput.removeAttribute('required');
            document.getElementById('reg-job-title').removeAttribute('required');
            nationalIdInput.removeAttribute('required');
            
            // مسح قيم الحقول المخفية
            firstNameInput.value = '';
            secondNameInput.value = '';
            thirdNameInput.value = '';
            lastNameInput.value = '';
            departmentSelect.value = '';
            employeeInput.value = '';
            document.getElementById('reg-job-title').value = '';
            nationalIdInput.value = '';
            
        } else {
            // إظهار جميع الحقول للمستخدمين العاديين
            firstNameGroup.style.display = 'block';
            secondNameGroup.style.display = 'block';
            thirdNameGroup.style.display = 'block';
            lastNameGroup.style.display = 'block';
            departmentGroup.style.display = 'block';
            employeeGroup.style.display = 'block';
            jobTitleGroup.style.display = 'block';
            nationalIdGroup.style.display = 'block';
            
            // إعادة required للحقول المطلوبة
            firstNameInput.setAttribute('required', 'required');
            lastNameInput.setAttribute('required', 'required');
            departmentSelect.setAttribute('required', 'required');
            employeeInput.setAttribute('required', 'required');
            document.getElementById('reg-job-title').setAttribute('required', 'required');
            nationalIdInput.setAttribute('required', 'required');
        }
    }

    // مراقبة تغييرات اسم المستخدم
    usernameInput.addEventListener('input', checkUsernameAndToggleFields);
    usernameInput.addEventListener('blur', checkUsernameAndToggleFields);

    // تشغيل الدالة عند تحميل الصفحة
    checkUsernameAndToggleFields();

    // دالة للتحقق من صحة رقم الهوية الوطنية أو الإقامة
    function validateNationalId(nationalId) {
        // التحقق من أن الرقم مكون من 10 أرقام
        if (!/^\d{10}$/.test(nationalId)) {
            return false;
        }
        
        // التحقق من أن الرقم لا يبدأ بصفر
        if (nationalId.startsWith('0')) {
            return false;
        }
        
        return true;
    }

    // مراقبة تغييرات رقم الهوية للتحقق من صحته
    nationalIdInput.addEventListener('input', function() {
        const value = this.value;
        // السماح فقط بالأرقام
        this.value = value.replace(/[^0-9]/g, '');
        
        // التحقق من الطول
        if (value.length > 10) {
            this.value = value.slice(0, 10);
        }
    });

    nationalIdInput.addEventListener('blur', function() {
        const value = this.value.trim();
        if (value && !validateNationalId(value)) {
            showToast('رقم الهوية الوطنية أو الإقامة غير صحيح. يجب أن يكون 10 أرقام ولا يبدأ بصفر.', 'warning');
        }
    });

    // دالة لجلب الأقسام من الباك اند وتعبئة قائمة الاختيار
async function fetchDepartments() {
  try {
    const response = await fetch('http://localhost:3006/api/departments/all', {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      throw new Error(`فشل جلب الأقسام: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    
    // Handle both array and object with data property
    const departments = Array.isArray(result) ? result : (result.data || []);

    if (!Array.isArray(departments)) {
      throw new Error('الرد ليس مصفوفة أقسام');
    }

    // حدّد اللغة الحالية:
    const lang = localStorage.getItem('language') || 'ar';
    // نص الخيار الافتراضي:
    const defaultText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
    departmentSelect.innerHTML = `<option value="">${defaultText}</option>`;

    departments.forEach(dept => {
      let parsed;
      try {
        // تأكد من تحويل الاسم من string JSON إلى كائن دائماً
        parsed = JSON.parse(dept.name);
      } catch {
        // لو فشل الـ parse خذ الاسم كنص وحضّره لكائن
        parsed = { ar: dept.name, en: dept.name };
      }
      // اختر التسمية بناءً على اللغة، أو احتياطياً العربي ثم الإنجليزي
      const label = parsed[lang] ?? parsed.ar ?? parsed.en;

      const opt = document.createElement('option');
      opt.value       = dept.id;
      opt.textContent = label;
      departmentSelect.appendChild(opt);
    });

    console.log('تم تحميل الأقسام بنجاح:', departments.length);

    // خيار "إضافة جديد"


  } catch (err) {
    console.error('خطأ في جلب الأقسام:', err);
    showToast(err.message || 'حدث خطأ أثناء جلب الأقسام', 'error');
  }
}



    // استدعاء الدالة عند تحميل الصفحة
    fetchDepartments();

    // إعادة تعبئة القائمة عند تغيير اللغة
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            fetchJobTitles();
            fetchJobNames();
        }
    });

    // معالجة حدث التغيير على القائمة المنسدلة للقسم
    departmentSelect.addEventListener('change', function() {
        console.log('Department select changed. New value:', this.value);
        if (this.value === '__ADD_NEW_DEPARTMENT__') {
            console.log('__ADD_NEW_DEPARTMENT__ selected. Attempting to open modal...');
            openModal(addDepartmentModal);
            // إعادة ضبط القائمة المنسدلة إلى "اختر القسم" بعد فتح المودال
            this.value = '';
            console.log('Modal should be open and dropdown reset.');
        }
    });

    // معالجة حفظ القسم الجديد من المودال
saveAddDepartmentBtn.addEventListener('click', async function () {
  const nameAr = departmentNameArInput.value.trim();
  const nameEn = departmentNameEnInput.value.trim();
  const imageFile = departmentImageInput.files[0];

  if (!nameAr || !nameEn || !imageFile) {
    showToast('جميع الحقول مطلوبة (الاسمين + الصورة)', 'warning');
    return;
  }

const formData = new FormData();
formData.append('name', JSON.stringify({ ar: nameAr, en: nameEn }));
formData.append('image', imageFile);


  try {
    const response = await fetch('http://localhost:3006/api/departments/all', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      showToast(data.message);
      closeModal(addDepartmentModal);
      await fetchDepartments();

      const lang = localStorage.getItem('language') || 'ar';
      const options = departmentSelect.options;
      for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        const isMatch = opt.textContent.trim() === (lang === 'ar' ? nameAr : nameEn);
        if (isMatch) {
          departmentSelect.selectedIndex = i;
          break;
        }
      }
    } else {
      showToast(data.message || 'حدث خطأ عند إضافة القسم.', 'error');
    }
  } catch (error) {
    console.error('خطأ في إضافة القسم:', error);
    showToast('حدث خطأ في الاتصال.', 'error');
  }
});


    // معالجة إلغاء إضافة قسم من المودال
    cancelAddDepartmentBtn.addEventListener('click', () => {
        closeModal(addDepartmentModal);
        departmentSelect.value = ''; // إعادة ضبط القائمة المنسدلة
    });

    // إغلاق المودال عند النقر خارج المحتوى
    addDepartmentModal.addEventListener('click', function(event) {
        if (event.target === this) {
            closeModal(addDepartmentModal);
            departmentSelect.value = ''; // إعادة ضبط القائمة المنسدلة
        }
    });

    // تأكد من أن أيقونة السهم الأصلية (إن وجدت) مرئية ولا تتعارض مع الأنماط
    // هذه الأيقونة أزيلت من `input-icon-wrapper` في HTML، لذا هذا السطر قد لا يكون ضرورياً
    const selectArrowIcon = document.querySelector('.input-icon-wrapper .select-arrow-icon');
    if (selectArrowIcon) {
        selectArrowIcon.style.display = 'block'; // أو أي نمط مناسب لجعله مرئياً
    }

    // دالة لجلب المناصب الإدارية من الباك اند وتعبئة قائمة الاختيار
    async function fetchJobTitles() {
        try {
            const response = await fetch('http://localhost:3006/api/job-titles', {
                method: 'GET',
                headers: { 
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', errorText);
                throw new Error(`فشل جلب المناصب الإدارية: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // Handle both array and object with data property
            const jobTitles = Array.isArray(result) ? result : (result.data || []);

            if (!Array.isArray(jobTitles)) {
                throw new Error('الرد ليس مصفوفة مناصب إدارية');
            }

            // حدّد اللغة الحالية:
            const lang = localStorage.getItem('language') || 'ar';
            // نص الخيار الافتراضي:
            const defaultText = lang === 'ar' ? 'اختر المنصب الإداري' : 'Select Administrative Position';
            jobTitleSelect.innerHTML = `<option value="">${defaultText}</option>`;

            jobTitles.forEach(jobTitle => {
                const opt = document.createElement('option');
                opt.value = jobTitle.id;
                opt.textContent = jobTitle.title;
                jobTitleSelect.appendChild(opt);
            });

            // خيار "إضافة جديد"
            const addNewOption = document.createElement('option');
            addNewOption.value = '__ADD_NEW_JOB_TITLE__';
            addNewOption.textContent = lang === 'ar' ? 'إضافة منصب إداري جديد' : 'Add New Administrative Position';
            jobTitleSelect.appendChild(addNewOption);

            console.log('تم تحميل المناصب الإدارية بنجاح:', jobTitles.length);

        } catch (err) {
            console.error('خطأ في جلب المناصب الإدارية:', err);
            showToast(err.message || 'حدث خطأ أثناء جلب المناصب الإدارية', 'error');
        }
    }

    // استدعاء الدالة عند تحميل الصفحة
    fetchJobTitles();

    // إعادة تعبئة القائمة عند تغيير اللغة
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            fetchJobTitles();
            fetchJobNames();
        }
    });

    // دالة لجلب المسميات الوظيفية من الباك اند وتعبئة قائمة الاختيار
    async function fetchJobNames() {
        try {
            const response = await fetch('http://localhost:3006/api/job-names', {
                method: 'GET',
                headers: { 
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error:', errorText);
                throw new Error(`فشل جلب المسميات الوظيفية: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            // Handle both array and object with data property
            const jobNames = Array.isArray(result) ? result : (result.data || []);

            if (!Array.isArray(jobNames)) {
                throw new Error('الرد ليس مصفوفة مسميات وظيفية');
            }

            // حدّد اللغة الحالية:
            const lang = localStorage.getItem('language') || 'ar';
            // نص الخيار الافتراضي:
            const defaultText = lang === 'ar' ? 'اختر المسمى الوظيفي' : 'Select Job Name';
            jobNameSelect.innerHTML = `<option value="">${defaultText}</option>`;

            jobNames.forEach(jobName => {
                const opt = document.createElement('option');
                opt.value = jobName.id;
                opt.textContent = jobName.name;
                jobNameSelect.appendChild(opt);
            });

            // خيار "إضافة جديد"
            const addNewOption = document.createElement('option');
            addNewOption.value = '__ADD_NEW_JOB_NAME__';
            addNewOption.textContent = lang === 'ar' ? 'إضافة مسمى وظيفي جديد' : 'Add New Job Name';
            jobNameSelect.appendChild(addNewOption);

            console.log('تم تحميل المسميات الوظيفية بنجاح:', jobNames.length);

        } catch (err) {
            console.error('خطأ في جلب المسميات الوظيفية:', err);
            showToast(err.message || 'حدث خطأ أثناء جلب المسميات الوظيفية', 'error');
        }
    }

    // استدعاء الدالة عند تحميل الصفحة
    fetchJobNames();

    // معالجة حدث التغيير على القائمة المنسدلة للمسمى الوظيفي
    jobNameSelect.addEventListener('change', function() {
        console.log('Job name select changed. New value:', this.value);
        if (this.value === '__ADD_NEW_JOB_NAME__') {
            console.log('__ADD_NEW_JOB_NAME__ selected. Attempting to open modal...');
            openModal(addJobNameModal);
            // إعادة ضبط القائمة المنسدلة إلى "اختر المسمى الوظيفي" بعد فتح المودال
            this.value = '';
            console.log('Modal should be open and dropdown reset.');
        }
    });

    // معالجة حدث التغيير على القائمة المنسدلة للمنصب الإداري
    jobTitleSelect.addEventListener('change', function() {
        console.log('Job title select changed. New value:', this.value);
        if (this.value === '__ADD_NEW_JOB_TITLE__') {
            console.log('__ADD_NEW_JOB_TITLE__ selected. Attempting to open modal...');
            openModal(addJobTitleModal);
            // إعادة ضبط القائمة المنسدلة إلى "اختر المنصب الإداري" بعد فتح المودال
            this.value = '';
            console.log('Modal should be open and dropdown reset.');
        }
    });

    // معالجة حفظ المنصب الإداري الجديد من المودال
    saveAddJobTitleBtn.addEventListener('click', async function () {
        const jobTitleName = jobTitleNameInput.value.trim();

        if (!jobTitleName) {
            showToast('الرجاء إدخال المنصب الإداري', 'warning');
            return;
        }

        try {
            const response = await fetch('http://localhost:3006/api/job-titles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: jobTitleName })
            });

            const data = await response.json();

            if (response.ok) {
                showToast(data.message);
                closeModal(addJobTitleModal);
                await fetchJobTitles();

                // تحديد المنصب الإداري الجديد
                const options = jobTitleSelect.options;
                for (let i = 0; i < options.length; i++) {
                    const opt = options[i];
                    if (opt.textContent.trim() === jobTitleName) {
                        jobTitleSelect.selectedIndex = i;
                        break;
                    }
                }
            } else {
                showToast(data.message || 'حدث خطأ عند إضافة المنصب الإداري.', 'error');
            }
        } catch (error) {
            console.error('خطأ في إضافة المنصب الإداري:', error);
            showToast('حدث خطأ في الاتصال.', 'error');
        }
    });

    // معالجة إلغاء إضافة منصب إداري من المودال
    cancelAddJobTitleBtn.addEventListener('click', () => {
        closeModal(addJobTitleModal);
        jobTitleSelect.value = ''; // إعادة ضبط القائمة المنسدلة
    });

    // إغلاق المودال عند النقر خارج المحتوى
    addJobTitleModal.addEventListener('click', function(event) {
        if (event.target === this) {
            closeModal(addJobTitleModal);
            jobTitleSelect.value = ''; // إعادة ضبط القائمة المنسدلة
        }
    });

    // معالجة حفظ المسمى الوظيفي الجديد من المودال
    saveAddJobNameBtn.addEventListener('click', async function () {
        const jobNameName = jobNameNameInput.value.trim();

        if (!jobNameName) {
            showToast('الرجاء إدخال المسمى الوظيفي', 'warning');
            return;
        }

        try {
            const response = await fetch('http://localhost:3006/api/job-names', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: jobNameName })
            });

            const data = await response.json();

            if (response.ok) {
                showToast(data.message);
                closeModal(addJobNameModal);
                await fetchJobNames();

                // تحديد المسمى الوظيفي الجديد
                const options = jobNameSelect.options;
                for (let i = 0; i < options.length; i++) {
                    const opt = options[i];
                    if (opt.textContent.trim() === jobNameName) {
                        jobNameSelect.selectedIndex = i;
                        break;
                    }
                }
            } else {
                showToast(data.message || 'حدث خطأ عند إضافة المسمى الوظيفي.', 'error');
            }
        } catch (error) {
            console.error('خطأ في إضافة المسمى الوظيفي:', error);
            showToast('حدث خطأ في الاتصال.', 'error');
        }
    });

    // معالجة إلغاء إضافة مسمى وظيفي من المودال
    cancelAddJobNameBtn.addEventListener('click', () => {
        closeModal(addJobNameModal);
        jobNameSelect.value = ''; // إعادة ضبط القائمة المنسدلة
    });

    // إغلاق المودال عند النقر خارج المحتوى
    addJobNameModal.addEventListener('click', function(event) {
        if (event.target === this) {
            closeModal(addJobNameModal);
            jobNameSelect.value = ''; // إعادة ضبط القائمة المنسدلة
        }
    });

registerForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  // جمع البيانات من النموذج
  const username = usernameInput.value.trim();
  const isAdmin = username.toLowerCase() === 'admin';
  
  const formData = {
    username: username,
    email: document.getElementById('reg-email').value.trim(),
    password: document.getElementById('reg-password').value,
    first_name: '',
    second_name: '',
    third_name: '',
    last_name: '',
    department_id: '',
    employee_number: '',
    job_title_id: '',
    job_name_id: '',
    national_id: ''
  };

  // إذا لم يكن admin، أضف البيانات الإضافية
  if (!isAdmin) {
    formData.first_name = firstNameInput.value.trim();
    formData.second_name = secondNameInput.value.trim();
    formData.third_name = thirdNameInput.value.trim();
    formData.last_name = lastNameInput.value.trim();
    formData.department_id = departmentSelect.value;
    formData.employee_number = document.getElementById('reg-employee').value.trim();
    formData.job_title_id = document.getElementById('reg-job-title').value.trim();
    formData.job_name_id = document.getElementById('reg-job-name').value.trim();
    formData.national_id = nationalIdInput.value.trim();
  }

  // تحقق من البيانات المطلوبة
  if (!username) {
    showToast('اسم المستخدم مطلوب.', 'warning');
    return;
  }

  if (!formData.email) {
    showToast('البريد الإلكتروني مطلوب.', 'warning');
    return;
  }

  // تحقق من البيانات المطلوبة للمستخدمين العاديين
  if (!isAdmin) {
    if (!formData.first_name || !formData.last_name) {
      showToast('الاسم الأول واسم العائلة مطلوبان.', 'warning');
      return;
    }

    if (!formData.department_id || formData.department_id === '__ADD_NEW_DEPARTMENT__') {
      showToast('الرجاء اختيار قسم أو إضافة قسم جديد.', 'warning');
      return;
    }

    if (!formData.employee_number) {
      showToast('الرجاء إدخال الرقم الوظيفي.', 'warning');
      return;
    }

            if (!formData.job_title_id) {
            showToast('الرجاء اختيار المنصب الإداري.', 'warning');
            return;
        }

        if (!formData.job_name_id || formData.job_name_id === '__ADD_NEW_JOB_NAME__') {
            showToast('الرجاء اختيار المسمى الوظيفي أو إضافة مسمى جديد.', 'warning');
            return;
        }

    if (!formData.national_id) {
      showToast('الرجاء إدخال رقم الهوية الوطنية أو الإقامة.', 'warning');
      return;
    }

    if (!validateNationalId(formData.national_id)) {
      showToast('رقم الهوية الوطنية أو الإقامة غير صحيح. يجب أن يكون 10 أرقام ولا يبدأ بصفر.', 'warning');
      return;
    }
  }

  // تحقق من تطابق كلمتي المرور
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  if (formData.password !== confirmPassword) {
    showToast('كلمتا المرور غير متطابقتين', 'warning');
    return;
  }

  try {
    const response = await fetch('http://localhost:3006/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok) {
      if (isAdmin) {
        showToast('تم إنشاء حساب المدير بنجاح!', 'success');
      } else {
        showToast(data.message || 'تم إنشاء الحساب بنجاح!', 'success');
      }
      localStorage.setItem('token', data.token);
      window.location.href = 'index.html';
    } else {
      showToast(data.message, 'error');
    }
  } catch (error) {
    console.error('خطأ في التسجيل:', error);
    showToast('حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.', 'error');
  }
});

});  