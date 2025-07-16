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
            alert('Only the following file types are allowed: PDF, DOC, DOCX, XLS, XLSX');
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
            mainFileList.innerHTML = `<div class="file-row"><i class="fa-regular fa-file-lines file-icon"></i> <span>${selectedMainFile.name}</span> <button class="delete-btn" title="Delete"><i class="fa-regular fa-trash-can"></i></button></div>`;
            // Delete main file button
            const delBtn = mainFileList.querySelector('.delete-btn');
            if (delBtn) {
                delBtn.addEventListener('click', function() {
                    selectedMainFile = null;
                    mainFileInput.value = '';
                    renderMainFileList();
                });
            }
        } else {
            mainFileList.innerHTML = '<div class="file-row" style="color:#888"><span>No main file selected yet</span></div>';
        }
    }
    // عرض القائمة دائمًا عند التحميل
    renderMainFileList();

    // استخراج folderId من URL
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = urlParams.get('folderId');
    if (!folderId) {
        alert('Cannot upload files without selecting a folder. Please go back and select a folder first.');
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
                alert('Main file uploaded successfully!');
                selectedMainFile = null;
                mainFileInput.value = '';
                renderMainFileList();
            } else {
                alert(data.message || 'An error occurred while uploading the main file');
            }
        } catch (err) {
            alert('Failed to connect to the server');
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
                alert('Only the following file types are allowed: PDF, DOC, DOCX, XLS, XLSX\n' + file.name);
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
                row.innerHTML = `<i class=\"fa-regular fa-file-lines file-icon\"></i> <span>${file.name}</span> <button class=\"delete-btn\" title=\"Delete\"><i class=\"fa-regular fa-trash-can\"></i></button>`;
                row.querySelector('.delete-btn').addEventListener('click', function() {
                    // Delete file by name and size (for accuracy)
                    const idx = selectedFiles.findIndex(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified);
                    if (idx !== -1) {
                        selectedFiles.splice(idx, 1);
                        renderFilesList();
                    }
                });
                filesList.appendChild(row);
            });
        } else {
            filesList.innerHTML = '<div class="file-row" style="color:#888"><span>No files selected yet</span></div>';
        }
        // Show number of files below the list
        if (filesCount) {
            filesCount.textContent = selectedFiles.length ? `${selectedFiles.length} file${selectedFiles.length > 1 ? 's have' : ' has'} been selected` : '';
        }
    }
    // عرض القائمة دائمًا عند التحميل
    renderFilesList();

    // زر رفع جميع الملفات
    const uploadAllBtn = document.querySelector('.upload-all-btn');
    uploadAllBtn.addEventListener('click', async function() {
        if (!folderId) return;
        if (!selectedMainFile && !selectedFiles.length) {
            alert('Please select a main file or sub files');
            return;
        }
        const token = localStorage.getItem('token');
        let mainFileUploaded = false;
        let subFilesUploaded = false;
        let mainFileId = null;
        // Upload main file first if present
        if (selectedMainFile) {
            const formData = new FormData();
            formData.append('file', selectedMainFile);
            formData.append('notes', '');
            formData.append('title', selectedMainFile.name);
            formData.append('is_main_file', 'true'); // Very important
            try {
                const response = await fetch(`${apiBase}/folders/${folderId}/contents`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
                const data = await response.json();
                if (response.ok) {
                    mainFileUploaded = true;
                    mainFileId = data.contentId; // Save main file id
                } else {
                    alert(data.message || 'An error occurred while uploading the main file');
                    return;
                }
            } catch (err) {
                alert('Failed to connect to the server while uploading the main file');
                return;
            }
        }
        // Upload sub files if present
        if (selectedFiles.length) {
            if (!mainFileId) {
                alert('You must upload the main file first to get its ID.');
                return;
            }
            for (const file of selectedFiles) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('notes', '');
                formData.append('title', file.name);
                formData.append('related_content_id', mainFileId); // Send main file id for sub file
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
                        alert(data.message || 'An error occurred while uploading one of the sub files');
                        return;
                    }
                } catch (err) {
                    alert('Failed to connect to the server while uploading one of the sub files');
                    return;
                }
            }
        }
        // After success
        if (mainFileUploaded && subFilesUploaded) {
            alert('Main file and sub files uploaded successfully!');
        } else if (mainFileUploaded) {
            alert('Main file uploaded successfully!');
        } else if (subFilesUploaded) {
            alert('Sub files uploaded successfully!');
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
                alert('Please select files');
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
                    alert('Files uploaded successfully!');
                    selectedFiles = [];
                    fileInput.value = '';
                    renderFilesList();
                } else {
                    alert(data.message || 'An error occurred while uploading the files');
                }
            } catch (err) {
                alert('Failed to connect to the server');
            }
        });
    }
}); 