// جلب الأقسام من الباك اند وتعبئة القائمة المنسدلة حسب اللغة

document.addEventListener('DOMContentLoaded', function() {
    const sectionSelect = document.querySelector('.section-select select');
    const apiBase = 'http://localhost:3006/api';


    // تجهيز رفع الملف الرئيسي
    const mainUploadBtn = document.querySelector('.main-upload-btn');
    const mainFileInput = document.createElement('input');
    mainFileInput.type = 'file';
    mainFileInput.accept = '.pdf'; // فقط PDF
    mainFileInput.multiple = false;
    mainFileInput.style.display = 'none';
    document.body.appendChild(mainFileInput);
    let selectedMainFile = null;
    const mainFileList = document.querySelector('.main-file-list');

    mainUploadBtn.addEventListener('click', function(e) {
        e.preventDefault();
        mainFileInput.click();
    });
    mainFileInput.addEventListener('change', function(e) {
        const file = mainFileInput.files[0] || null;
        const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
        if (file && !allowedExts.some(ext => file.name.toLowerCase().endsWith(ext))) {
            alert('فقط الملفات التالية مسموح بها: PDF, DOC, DOCX, XLS, XLSX');
            mainFileInput.value = '';
            selectedMainFile = null;
            renderMainFileList();
            return;
        }
        selectedMainFile = file;
        renderMainFileList();
    });
    function renderMainFileList() {
        if (selectedMainFile) {
            mainFileList.innerHTML = `<div class="file-row"><i class="fa-regular fa-file-lines file-icon"></i> <span>${selectedMainFile.name}</span> <button class="delete-btn" title="حذف"><i class="fa-regular fa-trash-can"></i></button></div>`;
            // زر حذف الملف الرئيسي
            const delBtn = mainFileList.querySelector('.delete-btn');
            if (delBtn) {
                delBtn.addEventListener('click', function() {
                    selectedMainFile = null;
                    mainFileInput.value = '';
                    renderMainFileList();
                });
            }
        } else {
            mainFileList.innerHTML = '<div class="file-row" style="color:#888"><span>لم يتم اختيار ملف رئيسي بعد</span></div>';
        }
    }
    // عرض القائمة دائمًا عند التحميل
    renderMainFileList();

    // استخراج folderId من URL
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = urlParams.get('folderId');
    if (!folderId) {
        alert('لا يمكن رفع الملفات بدون تحديد مجلد. يرجى العودة واختيار المجلد أولاً.');
        // يمكنك إعادة التوجيه تلقائياً إذا أردت:
        // window.location.href = 'departments.html';
    }

    // منطق رفع الملف الرئيسي (يمكنك تعديله حسب API الباك)
    mainFileList.addEventListener('dblclick', async function(e) {
        if (!selectedMainFile) return;
        if (!folderId) return;
        const token = localStorage.getItem('token');
        const formData = new FormData();
        formData.append('file', selectedMainFile);
        formData.append('notes', '');
        try {
            const response = await fetch(`${apiBase}/folders/${folderId}/main-file`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                alert('تم رفع الملف الرئيسي بنجاح!');
                selectedMainFile = null;
                mainFileInput.value = '';
                renderMainFileList();
            } else {
                alert(data.message || 'حدث خطأ أثناء رفع الملف الرئيسي');
            }
        } catch (err) {
            alert('فشل الاتصال بالسيرفر');
        }
    });

    // تجهيز رفع الملفات الفرعية (كما هو)
    const uploadBtn = document.querySelector('.upload-btn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf'; // فقط PDF
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    let selectedFiles = [];
    let selectedDept = null;
    const filesList = document.querySelector('.files-list');
    const filesCount = document.querySelector('.files-count');

    uploadBtn.addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.click();
    });
    fileInput.addEventListener('change', function(e) {
        const newFiles = Array.from(fileInput.files);
        let validFiles = [];
        const allowedExts = ['.pdf', '.doc', '.docx', '.xls', '.xlsx'];
        newFiles.forEach(file => {
            if (allowedExts.some(ext => file.name.toLowerCase().endsWith(ext))) {
                if (!selectedFiles.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) {
                    validFiles.push(file);
                }
            } else {
                alert('فقط الملفات التالية مسموح بها: PDF, DOC, DOCX, XLS, XLSX\n' + file.name);
            }
        });
        selectedFiles = selectedFiles.concat(validFiles);
        renderFilesList();
    });
    function renderFilesList() {
        filesList.innerHTML = '';
        if (selectedFiles.length) {
            selectedFiles.forEach((file) => {
                const row = document.createElement('div');
                row.className = 'file-row';
                row.innerHTML = `<i class=\"fa-regular fa-file-lines file-icon\"></i> <span>${file.name}</span> <button class=\"delete-btn\" title=\"حذف\"><i class=\"fa-regular fa-trash-can\"></i></button>`;
                row.querySelector('.delete-btn').addEventListener('click', function() {
                    // حذف الملف بناءً على اسمه وحجمه (لضمان الدقة)
                    const idx = selectedFiles.findIndex(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
                    if (idx !== -1) {
                        selectedFiles.splice(idx, 1);
                        renderFilesList();
                    }
                });
                filesList.appendChild(row);
            });
        } else {
            filesList.innerHTML = '<div class="file-row" style="color:#888"><span>لم يتم اختيار ملفات بعد</span></div>';
        }
        // عرض عدد الملفات أسفل القائمة
        if (filesCount) {
            filesCount.textContent = selectedFiles.length ? `تم رفع ${selectedFiles.length} ملف${selectedFiles.length > 1 ? 'ات' : ''}` : '';
        }
    }
    // عرض القائمة دائمًا عند التحميل
    renderFilesList();

    // زر رفع جميع الملفات
    const uploadAllBtn = document.querySelector('.upload-all-btn');
    uploadAllBtn.addEventListener('click', async function() {
        if (!folderId) return;
        if (!selectedMainFile && !selectedFiles.length) {
            alert('يرجى اختيار ملف رئيسي أو ملفات فرعية');
            return;
        }
        const token = localStorage.getItem('token');
        let mainFileUploaded = false;
        let subFilesUploaded = false;
        let mainFileId = null;
        // رفع الملف الرئيسي أولاً إذا كان موجودًا
        if (selectedMainFile) {
            const formData = new FormData();
            formData.append('file', selectedMainFile);
            formData.append('notes', '');
            formData.append('title', selectedMainFile.name);
            formData.append('is_main_file', 'true'); // مهم جداً
            try {
                const response = await fetch(`${apiBase}/folders/${folderId}/contents`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const data = await response.json();
                if (response.ok) {
                    mainFileUploaded = true;
                    mainFileId = data.contentId; // احفظ id الملف الرئيسي
                } else {
                    alert(data.message || 'حدث خطأ أثناء رفع الملف الرئيسي');
                    return;
                }
            } catch (err) {
                alert('فشل الاتصال بالسيرفر عند رفع الملف الرئيسي');
                return;
            }
        }
        // رفع الملفات الفرعية إذا كانت موجودة
        if (selectedFiles.length) {
            if (!mainFileId) {
                alert('يجب رفع الملف الرئيسي أولاً للحصول على معرفه.');
                return;
            }
            for (const file of selectedFiles) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('notes', '');
                formData.append('title', file.name);
                formData.append('related_content_id', mainFileId); // أرسل id الملف الرئيسي للفرعي
                try {
                    const response = await fetch(`${apiBase}/folders/${folderId}/contents`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    const data = await response.json();
                    if (response.ok) {
                        subFilesUploaded = true;
                    } else {
                        alert(data.message || 'حدث خطأ أثناء رفع أحد الملفات الفرعية');
                        return;
                    }
                } catch (err) {
                    alert('فشل الاتصال بالسيرفر عند رفع أحد الملفات الفرعية');
                    return;
                }
            }
        }
        // بعد النجاح
        if (mainFileUploaded && subFilesUploaded) {
            alert('تم رفع الملف الرئيسي والملفات الفرعية بنجاح!');
        } else if (mainFileUploaded) {
            alert('تم رفع الملف الرئيسي بنجاح!');
        } else if (subFilesUploaded) {
            alert('تم رفع الملفات الفرعية بنجاح!');
        }
        selectedMainFile = null;
        mainFileInput.value = '';
        renderMainFileList();
        selectedFiles = [];
        fileInput.value = '';
        renderFilesList();
    });

    // زر رفع الملفات الفرعية (كما هو)
    const mainUploadFilesBtn = document.querySelector('.upload-drop .main-upload-btn'); // احتياطي لو فيه زر
    const uploadDropMainBtn = document.querySelector('.upload-drop .main-upload-btn');
    const uploadDropBtn = document.querySelector('.upload-drop .upload-btn');
    // رفع الملفات الفرعية عند الضغط على زر upload-btn الموجود في كارد الملفات الفرعية
    if (uploadDropBtn) {
        uploadDropBtn.addEventListener('dblclick', async function(e) {
            e.preventDefault();
            if (!selectedFiles.length) {
                alert('يرجى اختيار ملفات');
                return;
            }
            if (!folderId) return;
            const token = localStorage.getItem('token');
            const formData = new FormData();
            selectedFiles.forEach(file => {
                formData.append('files', file);
            });
            formData.append('notes', '');
            try {
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
                    renderFilesList();
                } else {
                    alert(data.message || 'حدث خطأ أثناء رفع الملفات');
                }
            } catch (err) {
                alert('فشل الاتصال بالسيرفر');
            }
        });
    }
}); 