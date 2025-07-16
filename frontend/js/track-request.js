// track-request.js
// Script to fetch and display request tracking info on track-request.html

document.addEventListener('DOMContentLoaded', function () {
    // استخراج رقم الطلب من الرابط أو استخدم رقم افتراضي
    const contentId = getContentId();
    if (!contentId) return;

    fetch(`http://localhost:3006/api/contents/track/${contentId}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            renderRequestInfo(data.content);
            renderTrackList(data.timeline, data.pending);
            renderTimeline(data.timeline, data.pending);
            renderFooterInfo(data.content);
        } else {
            showError(getTranslation('failed-to-load-request'));
        }
    })
    .catch(() => showError(getTranslation('error-loading-data')));

    function getContentId() {
        // استخراج من الرابط (?id=) أو استخدم رقم افتراضي
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('id') || '1'; // عدل الافتراضي حسب الحاجة
    }

    function renderRequestInfo(content) {
        if (!content) return;
        // تعبئة معلومات الطلب
        document.querySelector('.info-value i.fa-file-lines').nextSibling.textContent = ` #${content.id}`;
        document.querySelectorAll('.info-item')[1].querySelector('.info-value').textContent = content.title || '-';
        document.querySelectorAll('.info-item')[2].querySelector('.info-value').innerHTML = `<i class="fa-regular fa-calendar"></i> ${content.created_at ? content.created_at.split('T')[0] : '-'}`;
        document.querySelectorAll('.info-item')[3].querySelector('.info-value').innerHTML = `<i class="fa-regular fa-user"></i> ${content.created_by_username || '-'}`;
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

    function renderTrackList(timeline, pending) {
        const trackList = document.querySelector('.track-list');
        trackList.innerHTML = '';
        // المراحل المعتمدة أو المراجعة
        timeline.forEach(stage => {
            const card = document.createElement('div');
            card.className = `track-card ${stage.status}`;
            card.innerHTML = `
                <div class="track-content">
                    <div class="track-title">${getLocalizedName(stage.department) || '-'}</div>
                    <div class="track-user">${stage.approver || '-'}</div>
                    <div class="track-date"><i class="fa-regular fa-calendar"></i> ${stage.created_at ? stage.created_at.split('T')[0] : '-'}</div>
                </div>
                <div class="track-status ${stage.status}">${getStatusText(stage.status)}</div>
            `;
            trackList.appendChild(card);
        });
        // المراحل المعلقة (لم يوقعوا بعد)
        pending.forEach(stage => {
            const card = document.createElement('div');
            card.className = 'track-card pending';
            card.innerHTML = `
                <div class="track-content">
                    <div class="track-title">${getLocalizedName(stage.department) || '-'}</div>
                    <div class="track-user">${stage.approver || '-'}</div>
                    <div class="track-date"><i class="fa-regular fa-calendar"></i> -</div>
                </div>
                <div class="track-status pending">${getTranslation('under-review')}</div>
            `;
            trackList.appendChild(card);
        });
    }

    function renderTimeline(timeline, pending) {
        const timelineDiv = document.querySelector('.track-timeline');
        if (!timelineDiv) return;
        timelineDiv.innerHTML = '';
        const allStages = [...timeline.map(s => s.status), ...pending.map(() => 'pending')];
        allStages.forEach((status, idx) => {
            const step = document.createElement('div');
            step.className = `timeline-step ${status}`;
            step.innerHTML = status === 'approved' ? '<i class="fa fa-check"></i>' : '<i class="fa fa-clock"></i>';
            timelineDiv.appendChild(step);
            if (idx < allStages.length - 1) {
                const line = document.createElement('div');
                line.className = 'timeline-line';
                timelineDiv.appendChild(line);
            }
        });
    }

    function renderFooterInfo(content) {
        if (!content) return;
        // مثال تعبئة زمن المعالجة المتوقع وعدد الأيام
        document.querySelector('.footer-row span').textContent = content.updated_at ? content.updated_at.split('T')[0] : '-';
        document.querySelector('.footer-row div:last-child').textContent = '—';
        document.querySelector('.footer-update').textContent = content.updated_at ? content.updated_at.split('T')[0] : '-';
    }

    function getStatusText(status) {
        if (status === 'approved') return getTranslation('approved');
        if (status === 'rejected') return getTranslation('rejected');
        return getTranslation('under-review');
    }

    function showError(msg) {
        alert(msg);
    }
}); 