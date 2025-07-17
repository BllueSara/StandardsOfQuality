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
            updateCounters(data.timeline, data.attachments);
        } else {
            showError(getTranslation('error-loading-data'));
        }
    })
    .catch(() => showError(getTranslation('connection-error')));

    function getContentId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || '1';
    }

    function renderFileInfo(content) {
        if (!content) return;
        document.getElementById('file-name').textContent = content.title || '-';
        document.getElementById('upload-date').textContent = content.created_at ? formatDate(content.created_at) : '-';
        document.getElementById('file-status').innerHTML = `<span class="status ${content.approval_status}">${statusLabel(content.approval_status)}</span>`;
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
        document.getElementById('reviewer-department').textContent = getLocalizedName(reviewer.department) || '-';
        document.getElementById('reviewer-email').textContent = reviewer.email || '-';
    }

    function renderHistoryTable(timeline) {
        const tbody = document.getElementById('history-tbody');
        tbody.innerHTML = '';
        if (!timeline || timeline.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4">${getTranslation('no-logs-found')}</td></tr>`;
            return;
        }
        timeline.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.created_at ? formatDate(row.created_at) : '-'}</td>
                <td>${row.approver || '-'}</td>
                <td>${actionLabel(row.status)}</td>
                <td>${row.comments || '-'}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderAttachments(attachments) {
        const container = document.getElementById('attachments-list');
        container.innerHTML = '';
        if (!attachments || attachments.length === 0) {
            container.innerHTML = `<div>${getTranslation('no-contents')}</div>`;
            return;
        }
        
        console.log('Rendering attachments:', attachments);
        
        attachments.forEach(att => {
            const item = document.createElement('div');
            item.className = 'attachment-item';
            
            // تحديد نوع الملف (رئيسي أو فرعي)
            const isMainFile = att.file_type === 'main';
            const iconClass = isMainFile ? 'fa-solid fa-file-circle-check' : 'fa-regular fa-file-lines';
            const fileTypeLabel = isMainFile ? `<span class="main-file-label">${getTranslation('main-file') || (getTranslation('main-file-ar') || 'الملف الرئيسي')}</span>` : '';
            
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

    // دالة تحديث العدادات
    function updateCounters(timeline, attachments) {
        const historyCount = timeline ? timeline.length : 0;
        const attachmentsCount = attachments ? attachments.length : 0;
        
        const historyCounter = document.querySelector('.history-count');
        const attachmentsCounter = document.querySelector('.attachments-count');
        
        if (historyCounter) {
            historyCounter.textContent = `(${historyCount})`;
        }
        
        if (attachmentsCounter) {
            attachmentsCounter.textContent = `(${attachmentsCount})`;
        }
    }

    function formatDate(dateStr) {
        const d = new Date(dateStr);
        if (isNaN(d)) return '-';
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    
    function statusLabel(status) {
        const lang = localStorage.getItem('language') || 'ar';
        
        switch (status) {
            case 'pending': 
                return lang === 'ar' ? 'قيد المراجعة' : 'Under Review';
            case 'approved': 
                return lang === 'ar' ? 'تمت الموافقة' : 'Approved';
            case 'rejected': 
                return lang === 'ar' ? 'تم الرفض' : 'Rejected';
            default: 
                return status || '-';
        }
    }
    
    function actionLabel(status) {
        const lang = localStorage.getItem('language') || 'ar';
        
        switch (status) {
            case 'approved':
            case 'reviewed':
                if (lang === 'ar') {
                    return 'تمت المراجعة';
                } else {
                    return 'Reviewed';
                }
            case 'rejected':
                if (lang === 'ar') {
                    return 'تم الرفض';
                } else {
                    return 'Rejected';
                }
            case 'pending':
            case 'transferred':
                if (lang === 'ar') {
                    return 'تم التحويل';
                } else {
                    return 'Transferred';
                }
            default:
                return status || '-';
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
});
