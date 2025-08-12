// دالة تحميل المسميات (job_names)
async function loadJobNames() {
    try {
        const response = await fetch('http://localhost:3006/api/job-names');
        const result = await response.json();
        
        if (result.success) {
            return result.data;
        } else {
            console.error('خطأ في تحميل المسميات:', result.message);
            return [];
        }
    } catch (error) {
        console.error('خطأ في تحميل المسميات:', error);
        return [];
    }
}

// دالة إضافة مسمى جديد
async function addJobName(name) {
    try {
        const response = await fetch('http://localhost:3006/api/job-names', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name })
        });
        
        const result = await response.json();
        
        if (result.success) {
            return result.data;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        console.error('خطأ في إضافة المسمى:', error);
        throw error;
    }
}

// دالة تحديث قائمة المسميات في select
function updateJobNamesSelect(selectElement, jobNames, selectedValue = '') {
    // حفظ القيمة المحددة حالياً
    const currentValue = selectElement.value;
    
    // مسح الخيارات الموجودة (مع الاحتفاظ بالخيارات الخاصة)
    const specialOptions = Array.from(selectElement.querySelectorAll('option[value^="__"]'));
    selectElement.innerHTML = '';
    
    // إعادة إضافة الخيارات الخاصة
    specialOptions.forEach(option => {
        selectElement.appendChild(option.cloneNode(true));
    });
    
    // إضافة الخيارات الجديدة
    jobNames.forEach(jobName => {
        const option = document.createElement('option');
        option.value = jobName.id;
        option.textContent = jobName.name;
        selectElement.appendChild(option);
    });
    
    // إعادة تحديد القيمة السابقة إذا كانت موجودة
    if (selectedValue && selectElement.querySelector(`option[value="${selectedValue}"]`)) {
        selectElement.value = selectedValue;
    } else if (currentValue && selectElement.querySelector(`option[value="${currentValue}"]`)) {
        selectElement.value = currentValue;
    }
}

// دالة تهيئة إدارة المسميات
function initializeJobNamesManagement() {
    // البحث عن جميع عناصر select للمسميات
    const jobNameSelects = document.querySelectorAll('select[name="job_name"], #reg-job-name');
    
    jobNameSelects.forEach(select => {
        // تحميل المسميات عند تحميل الصفحة
        loadJobNames().then(jobNames => {
            updateJobNamesSelect(select, jobNames);
        });
        
        // مراقبة التغييرات
        select.addEventListener('change', async function() {
            if (this.value === '__ADD_NEW_JOB_NAME__') {
                // إظهار modal إضافة مسمى جديد
                const modal = document.getElementById('addJobNameModal');
                if (modal) {
                    modal.style.display = 'flex';
                }
            }
        });
    });
    
    // إعداد modal إضافة مسمى جديد
    const addJobNameModal = document.getElementById('addJobNameModal');
    if (addJobNameModal) {
        const saveBtn = addJobNameModal.querySelector('#saveAddJobName');
        const cancelBtn = addJobNameModal.querySelector('#cancelAddJobName');
        const nameInput = addJobNameModal.querySelector('#jobNameName');
        
        // حفظ المسمى الجديد
        saveBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                alert('يرجى إدخال اسم المسمى');
                return;
            }
            
            try {
                const newJobName = await addJobName(name);
                
                // إغلاق modal
                addJobNameModal.style.display = 'none';
                nameInput.value = '';
                
                // تحديث جميع قوائم المسميات
                const allJobNames = await loadJobNames();
                jobNameSelects.forEach(select => {
                    updateJobNamesSelect(select, allJobNames, newJobName.id);
                });
                
                // تحديد المسمى الجديد
                jobNameSelects.forEach(select => {
                    if (select.name === 'job_name' || select.id === 'reg-job-name') {
                        select.value = newJobName.id;
                    }
                });
                
                showToast('تم إضافة المسمى بنجاح', 'success');
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
        
        // إلغاء
        cancelBtn.addEventListener('click', () => {
            addJobNameModal.style.display = 'none';
            nameInput.value = '';
        });
        
        // إغلاق modal عند النقر خارجه
        addJobNameModal.addEventListener('click', (e) => {
            if (e.target === addJobNameModal) {
                addJobNameModal.style.display = 'none';
                nameInput.value = '';
            }
        });
    }
}

// دالة عرض رسالة toast
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    // إزالة toast بعد 3 ثوان
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

// تهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    initializeJobNamesManagement();
});

// تصدير الدوال للاستخدام في ملفات أخرى
window.jobNamesManager = {
    loadJobNames,
    addJobName,
    updateJobNamesSelect,
    initializeJobNamesManagement
};
