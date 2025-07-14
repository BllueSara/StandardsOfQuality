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

    // تجهيز رفع الملف (منطق فعلي)
    const uploadForm = document.querySelector('.upload-form');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    let selectedFile = null;
    let selectedDept = null;

    // عند الضغط على زر "اختر ملفًا"
    document.querySelector('.upload-btn').addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        if (fileInput.files.length > 0) {
            selectedFile = fileInput.files[0];
            // يمكنك تحديث واجهة المستخدم باسم الملف هنا إذا أردت
        }
    });

    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        selectedDept = sectionSelect.value;
        if (!selectedDept) {
            alert('يرجى اختيار القسم');
            return;
        }
        if (!selectedFile) {
            alert('يرجى اختيار ملف');
            return;
        }
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('title', selectedFile.name);
        formData.append('file', selectedFile);
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
                alert('تم رفع الملف بنجاح!');
                uploadForm.reset();
                selectedFile = null;
            } else {
                alert(data.message || 'حدث خطأ أثناء رفع الملف');
            }
        } catch (err) {
            alert('فشل الاتصال بالسيرفر');
        }
    });
}); 