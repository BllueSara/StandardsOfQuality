document.addEventListener('DOMContentLoaded', function() {
    console.log('register.js script loaded and DOMContentLoaded event fired.');
    const registerForm = document.getElementById('registerForm');
    const departmentSelect = document.getElementById('reg-department');
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


  usernameInput.addEventListener('input', function() {
    const username = this.value.trim().toLowerCase();
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

    // دالة لجلب الأقسام من الباك اند وتعبئة قائمة الاختيار
async function fetchDepartments() {
  try {
    const token    = localStorage.getItem('token');
    const response = await fetch('http://localhost:3006/api/departments', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data     = await response.json();
    if (!response.ok) throw new Error(data.message || 'فشل جلب الأقسام');

    // حدّد اللغة الحالية:
    const lang = localStorage.getItem('language') || 'ar';
    // نص الخيار الافتراضي:
    const defaultText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
    departmentSelect.innerHTML = `<option value="">${defaultText}</option>`;

    data.forEach(dept => {
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

    // خيار "إضافة جديد"


  } catch (err) {
    console.error(err);
    alert(err.message || 'حدث خطأ أثناء جلب الأقسام');
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
  const token = localStorage.getItem('token');

  if (!nameAr || !nameEn || !imageFile) {
    alert('جميع الحقول مطلوبة (الاسمين + الصورة)');
    return;
  }

const formData = new FormData();
formData.append('name', JSON.stringify({ ar: nameAr, en: nameEn }));
formData.append('image', imageFile);


  try {
    const response = await fetch('http://localhost:3006/api/departments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      alert(data.message);
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
      alert(data.message || 'حدث خطأ عند إضافة القسم.');
    }
  } catch (error) {
    console.error('خطأ في إضافة القسم:', error);
    alert('حدث خطأ في الاتصال.');
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
  const formData = {
    username: document.getElementById('reg-username').value.trim(),
    email:    document.getElementById('reg-email').value.trim(),
    password: document.getElementById('reg-password').value,
    department_id: departmentSelect.value,
    employee_number: document.getElementById('reg-employee').value.trim()  // ← هنا
  };

  // تحقق من القسم (مال admins)
  const username = formData.username.toLowerCase();
  if (username !== 'admin') {
    if (!formData.department_id || formData.department_id === '__ADD_NEW_DEPARTMENT__') {
      alert('الرجاء اختيار قسم أو إضافة قسم جديد.');
      return;
    }
  }

  // تحقق من تطابق كلمتي المرور
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  if (formData.password !== confirmPassword) {
    alert('كلمتا المرور غير متطابقتين');
    return;
  }

  // **تحقق من وجود الرقم الوظيفي**
if (username !== 'admin' && !formData.employee_number) {
  alert('الرجاء إدخال الرقم الوظيفي.');
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
      alert(data.message);
      localStorage.setItem('token', data.token);
      window.location.href = 'index.html';
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error('خطأ في التسجيل:', error);
    alert('حدث خطأ أثناء التسجيل. يرجى المحاولة مرة أخرى.');
  }
});

});  