// حذف جلب الأقسام وكل ما يتعلق بالقسم

document.addEventListener('DOMContentLoaded', function() {
    const apiBase = 'http://localhost:3006/api';

    // استخراج folderId من URL
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = urlParams.get('folderId');
    if (!folderId) {
        alert(getTranslation('no-folder-selected'));
        // يمكنك إعادة التوجيه تلقائياً إذا أردت:
        // window.location.href = 'departments.html';
    }

    // تجهيز رفع الملف (منطق فعلي)
    const uploadForm = document.querySelector('.upload-form');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf'; // فقط PDF
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    let selectedFile = null;

    // عنصر لعرض بيانات الملف
    let fileInfoDiv = document.querySelector('.file-info');
    if (!fileInfoDiv) {
        fileInfoDiv = document.createElement('div');
        fileInfoDiv.className = 'file-info';
        uploadForm.parentNode.insertBefore(fileInfoDiv, uploadForm);
    }
    fileInfoDiv.innerHTML = '';

    // عند الضغط على زر "اختر ملفًا"
    document.querySelector('.upload-btn').addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
            if (!allowedExts.some(ext => file.name.toLowerCase().endsWith(ext))) {
                alert(getTranslation('file-type-not-allowed'));
                fileInput.value = '';
                fileInfoDiv.innerHTML = '';
                selectedFile = null;
                return;
            }
            selectedFile = file;
            // تحديث واجهة المستخدم باسم الملف وحجمه فقط
            const sizeMB = (selectedFile.size / (1024 * 1024)).toFixed(2);
            fileInfoDiv.innerHTML = `
                <div>${getTranslation('file-name-label')}: ${selectedFile.name}</div>
                <div>${getTranslation('file-size-label')}: ${sizeMB} ${getTranslation('mb-label')}</div>
            `;
        } else {
            fileInfoDiv.innerHTML = '';
            selectedFile = null;
        }
    });

    uploadForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!folderId) return;
        if (!selectedFile) {
            alert(getTranslation('select-file-alert'));
            return;
        }

        // جمع قيم التاريخ
        const startDate = document.getElementById('start-date').value;
        const endDate = document.getElementById('end-date').value;

        // التحقق من صحة التواريخ
        if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
            alert('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
            return;
        }

        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('title', selectedFile.name);
        formData.append('file', selectedFile);
        formData.append('notes', ''); // يمكن إضافة ملاحظات من حقل آخر إذا أردت
        
        // إضافة التواريخ إذا تم تحديدها
        if (startDate) {
            formData.append('start_date', startDate);
        }
        if (endDate) {
            formData.append('end_date', endDate);
        }

        try {
            const response = await fetch(`${apiBase}/folders/${folderId}/contents`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                alert(getTranslation('file-upload-success'));
                uploadForm.reset();
                selectedFile = null;
                fileInfoDiv.innerHTML = '';
            } else {
                alert(data.message || getTranslation('file-upload-error'));
            }
        } catch (err) {
            alert(getTranslation('server-connection-failed'));
        }
    });
}); 