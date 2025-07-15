// file-details.js
// Script to fetch and display file details dynamically on file-details.html

console.log('file-details.js loaded');

document.addEventListener('DOMContentLoaded', function () {
    console.log('DOMContentLoaded fired');
    const contentId = getContentId();
    if (!contentId) return;

    fetch(`http://localhost:3006/api/contents/track/${contentId}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
    })
    .then(res => res.json())
    .then(data => {
        console.log('data from backend:', data);
        if (data.status === 'success') {
            renderFileInfo(data.content);
            renderReviewerInfo(data.timeline, data.pending);
            renderHistoryTable(data.timeline);
            renderAttachments(data.attachments);
        } else {
            showError('تعذر جلب بيانات الملف');
        }
    })
    .catch(() => showError('حدث خطأ أثناء الاتصال بالخادم'));

    function getContentId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || '1';
    }

    function renderFileInfo(content) {
        if (!content) return;
        document.querySelector('.file-info .info-value').textContent = content.title || '-';
        document.querySelectorAll('.file-info .info-value')[1].textContent = content.created_at ? formatDate(content.created_at) : '-';
        document.querySelectorAll('.file-info .info-value')[2].innerHTML = `<span class="status ${content.approval_status}">${statusLabel(content.approval_status)}</span>`;
    }

    function renderReviewerInfo(timeline, pending) {
        let reviewer = null;
        if (pending && pending.length > 0) {
            reviewer = pending[0];
        } else if (timeline && timeline.length > 0) {
            reviewer = timeline[timeline.length - 1];
        }
        if (!reviewer) return;
        document.getElementById('reviewer-name').textContent = reviewer.approver || '-';
        document.getElementById('reviewer-position').textContent = reviewer.role || '-';
        document.getElementById('reviewer-department').textContent = getLocalizedName(reviewer.department) || '-';
        document.getElementById('reviewer-email').textContent = reviewer.email || '-';
    }

    function renderHistoryTable(timeline) {
        const tbody = document.querySelector('.history-table tbody');
        tbody.innerHTML = '';
        if (!timeline || timeline.length === 0) return;
        timeline.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.comments || '-'}</td>
                <td>${actionLabel(row.status)}</td>
                <td>${row.approver || '-'}</td>
                <td>${row.created_at ? formatDate(row.created_at) : '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderAttachments(attachments) {
        const container = document.querySelector('.attachments-list');
        container.innerHTML = '';
        if (!attachments || attachments.length === 0) {
            container.innerHTML = '<div>لا توجد ملفات مرتبطة</div>';
            return;
        }
        
        console.log('Rendering attachments:', attachments);
        
        attachments.forEach(att => {
            const item = document.createElement('div');
            item.className = 'attachment-item';
            
            // تحديد نوع الملف (رئيسي أو فرعي)
            const isMainFile = att.file_type === 'main';
            const iconClass = isMainFile ? 'fa-solid fa-file-circle-check' : 'fa-regular fa-file-lines';
            const fileTypeLabel = isMainFile ? '<span class="main-file-label">الملف الرئيسي</span>' : '';
            
            console.log('File:', att.title, 'Type:', att.file_type, 'IsMain:', isMainFile);
            
            item.innerHTML = `
                <i class="${iconClass}"></i>
                <div>
                    <div class="attachment-name">
                        <a href="http://localhost:3006/${att.file_path}" target="_blank">${att.title || att.file_path}</a>
                        ${fileTypeLabel}
                    </div>
                </div>
            `;
            container.appendChild(item);
        });
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d)) return '-';
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    function statusLabel(status) {
        switch (status) {
            case 'pending': return 'قيد المراجعة';
            case 'approved': return 'معتمد';
            case 'rejected': return 'مرفوض';
            default: return status || '-';
        }
    }
    function actionLabel(status) {
        switch (status) {
            case 'approved': return 'تمت المراجعة';
            case 'rejected': return 'تم الرفض';
            case 'pending': return 'تم التحويل';
            default: return status || '-';
        }
    }
    function showError(msg) {
        alert(msg);
    }

    // دالة ترجمة اسم القسم حسب اللغة
    function getLocalizedName(name) {
        const lang = localStorage.getItem('language') || 'ar';
        try {
            const parsed = typeof name === 'string' ? JSON.parse(name) : name;
            return parsed?.[lang] || parsed?.ar || parsed?.en || name;
        } catch {
            return name;
        }
    }

    // تحويل الملف: جلب الأقسام والأشخاص
    const deptSelect = document.querySelector('.transfer-card .department-select');
    const userSelect = document.querySelector('.transfer-card .user-select');
    // جلب الأقسام من الباك مثل transfer.js
    async function fetchDepartments() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('http://localhost:3006/api/departments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'فشل جلب الأقسام');

            const lang = localStorage.getItem('language') || 'ar';
            const defaultText = lang === 'ar' ? 'اختر القسم' : 'Select Department';
            deptSelect.innerHTML = `<option value="">${defaultText}</option>`;

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
                deptSelect.appendChild(opt);
            });
        } catch (err) {
            console.error(err);
            deptSelect.innerHTML = `<option value=\"\">فشل جلب الأقسام</option>`;
        }
    }
    // Call fetchDepartments on page load
    fetchDepartments();
    // Update department list when language changes
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            fetchDepartments();
        }
    });
    // عند اختيار قسم، جلب الموظفين في هذا القسم
    deptSelect.addEventListener('change', async function() {
        const deptId = deptSelect.value;
        if (!deptId || deptId === '') {
            userSelect.innerHTML = '<option>اختر الموظف المطلوب</option>';
            return;
        }
        userSelect.innerHTML = '<option>جاري التحميل...</option>';
        try {
            const res = await fetch(`http://localhost:3006/api/users?departmentId=${deptId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
            });
            const data = await res.json();
            userSelect.innerHTML = '<option>اختر الموظف المطلوب</option>';
            (data.data || []).forEach(user => {
                const opt = document.createElement('option');
                opt.value = user.id;
                opt.textContent = user.name || user.username;
                userSelect.appendChild(opt);
            });
        } catch {
            userSelect.innerHTML = '<option>تعذر جلب الأشخاص</option>';
        }
    });
});
