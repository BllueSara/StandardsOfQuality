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
    const departmentGroup = departmentSelect.closest('.form-group');
    const employeeInput   = document.getElementById('reg-employee');
    const employeeGroup   = employeeInput.closest('.form-group');

    // عناصر النموذج المنبثق لإضافة قسم
    const addDepartmentModal = document.getElementById('addDepartmentModal');
    const saveAddDepartmentBtn = document.getElementById('saveAddDepartment');
    const cancelAddDepartmentBtn = document.getElementById('cancelAddDepartment');
    const departmentNameInput = document.getElementById('departmentName');
    const departmentImageInput = document.getElementById('departmentImage');
    const departmentNameArInput = document.getElementById('departmentNameAr');
const departmentNameEnInput = document.getElementById('departmentNameEn');


    // دالة لفتح المودال
    function openModal(modal) {
        modal.style.display = 'flex';
    }

    // دالة لإغلاق المودال
function closeModal(modal) {
    modal.style.display = 'none';
    departmentNameArInput.value = '';
    departmentNameEnInput.value = '';
    departmentImageInput.value = '';
}


  // دالة لبناء اسم المستخدم من الأسماء للتحقق من admin
  function buildUsername() {
    const firstName = firstNameInput.value.trim();
    const secondName = secondNameInput.value.trim();
    const thirdName = thirdNameInput.value.trim();
    const lastName = lastNameInput.value.trim();
    
    const names = [firstName, secondName, thirdName, lastName].filter(name => name);
    return names.join(' ').toLowerCase().replace(/\s+/g, '');
  }

  // مراقبة تغييرات الأسماء للتحقق من admin
  [firstNameInput, secondNameInput, thirdNameInput, lastNameInput].forEach(input => {
    input.addEventListener('input', function() {
      const username = buildUsername();
      if (username === 'admin') {
        // أخفِ القسم والموظف
        departmentGroup.style.display = 'none';
        departmentSelect.removeAttribute('required');
        departmentSelect.value = '';

        employeeGroup.style.display = 'none';
        employeeInput.removeAttribute('required');
        employeeInput.value = '';
      } else {
        // أعِد ظهورهما
        departmentGroup.style.display = 'block';
        departmentSelect.setAttribute('required', 'required');

        employeeGroup.style.display = 'block';
        employeeInput.setAttribute('required', 'required');
      }
    });
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
            fetchDepartments();
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

registerForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  // جمع البيانات من النموذج
  const firstName = firstNameInput.value.trim();
  const secondName = secondNameInput.value.trim();
  const thirdName = thirdNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const username = usernameInput.value.trim();
  
  const formData = {
    first_name: firstName,
    second_name: secondName,
    third_name: thirdName,
    last_name: lastName,
    username: username,
    email: document.getElementById('reg-email').value.trim(),
    password: document.getElementById('reg-password').value,
    department_id: departmentSelect.value,
    employee_number: document.getElementById('reg-employee').value.trim(),
    job_title: document.getElementById('reg-job-title').value.trim()
  };

  // تحقق من الأسماء المطلوبة
  if (!firstName || !lastName || !username) {
    showToast('الاسم الأول واسم العائلة واسم المستخدم مطلوبان.', 'warning');
    return;
  }

  // تحقق من القسم (مال admins)
  if (username.toLowerCase() !== 'admin') {
    if (!formData.department_id || formData.department_id === '__ADD_NEW_DEPARTMENT__') {
      showToast('الرجاء اختيار قسم أو إضافة قسم جديد.', 'warning');
      return;
    }
  }

  // تحقق من تطابق كلمتي المرور
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  if (formData.password !== confirmPassword) {
    showToast('كلمتا المرور غير متطابقتين', 'warning');
    return;
  }

  // **تحقق من وجود الرقم الوظيفي**
  if (username !== 'admin' && !formData.employee_number) {
    showToast('الرجاء إدخال الرقم الوظيفي.', 'warning');
    return;
  }

  // **تحقق من وجود المسمى الوظيفي**
  if (username !== 'admin' && !formData.job_title) {
    showToast('الرجاء إدخال المسمى الوظيفي.', 'warning');
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
      showToast(data.message);
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