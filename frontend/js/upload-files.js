// جلب الأقسام من الباك اند وتعبئة القائمة المنسدلة حسب اللغة

document.addEventListener('DOMContentLoaded', function() {
    const sectionSelect = document.querySelector('.section-select select');
    const apiBase = 'http://localhost:3006/api';

    async function fetchDepartments() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiBase}/departments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'فشل جلب الأقسام');

            const lang = localStorage.getItem('language') || 'ar';
            const defaultText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
            sectionSelect.innerHTML = `<option value="">${defaultText}</option>`;

            data.forEach(dept => {
                let parsed;
                try {
                    parsed = JSON.parse(dept.name);
                } catch {
                    parsed = { ar: dept.name, en: dept.name };
                }
                const label = parsed[lang] ?? parsed.ar ?? parsed.en;
                const opt = document.createElement('option');
                opt.value = dept.id;
                opt.textContent = label;
                sectionSelect.appendChild(opt);
            });
        } catch (err) {
            console.error(err);
            sectionSelect.innerHTML = `<option value="">فشل جلب الأقسام</option>`;
        }
    }

    fetchDepartments();

    // تحديث القائمة عند تغيير اللغة
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            fetchDepartments();
        }
    });

    // تجهيز رفع الملفات (منطق فعلي)
    const uploadBtn = document.querySelector('.upload-btn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    let selectedFiles = [];
    let selectedDept = null;

    uploadBtn.addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        selectedFiles = Array.from(fileInput.files);
        // يمكنك تحديث واجهة المستخدم بعدد أو أسماء الملفات هنا إذا أردت
    });

    // زر رفع الملفات (يفترض أن تضيف زر أو تستخدم زر موجود)
    // هنا سنضيف منطق الرفع على زر .main-upload-btn إذا كان موجوداً أو يمكنك تعديله حسب تصميمك
    const mainUploadBtn = document.querySelector('.main-upload-btn');
    if (mainUploadBtn) {
        mainUploadBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            selectedDept = sectionSelect.value;
            if (!selectedDept) {
                alert('يرجى اختيار القسم');
                return;
            }
            if (!selectedFiles.length) {
                alert('يرجى اختيار ملفات');
                return;
            }
            const token = localStorage.getItem('token');
            const formData = new FormData();
            selectedFiles.forEach(file => {
                formData.append('files', file);
            });
            formData.append('notes', ''); // يمكن إضافة ملاحظات من حقل آخر إذا أردت
            // يمكنك إضافة حقول أخرى حسب الحاجة

            try {
                // يجب أن تحدد folderId المناسب للقسم المختار (هنا مثال فقط)
                // تحتاج لجلب folderId الخاص بالقسم المختار من الباك اند أو من اختيار المستخدم
                const folderId = selectedDept; // إذا كان القسم هو نفسه معرف المجلد
                const response = await fetch(`${apiBase}/folders/${folderId}/contents`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const data = await response.json();
                if (response.ok) {
                    alert('تم رفع الملفات بنجاح!');
                    selectedFiles = [];
                    fileInput.value = '';
                } else {
                    alert(data.message || 'حدث خطأ أثناء رفع الملفات');
                }
            } catch (err) {
                alert('فشل الاتصال بالسيرفر');
            }
        });
    }
}); 