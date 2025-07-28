document.addEventListener('DOMContentLoaded', async () => {
  await checkDelegationStatus();
  loadDelegations();
});

// تعريف المتغيرات العامة
const apiBaseDept = 'http://localhost:3006/api/approvals/proxy';
const token = localStorage.getItem('token');
const currentLang = localStorage.getItem('language') || 'ar';
let currentUserId = localStorage.getItem('userId');

// دالة لاستخراج userId من الـ token إذا لم يكن موجوداً في localStorage
function getCurrentUserId() {
  if (currentUserId) {
    return currentUserId;
  }
  
  const token = localStorage.getItem('token');
  if (!token) {
    return null;
  }
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    currentUserId = payload.id;
    localStorage.setItem('userId', currentUserId);
    return currentUserId;
  } catch (e) {
    console.error('خطأ في استخراج userId من الـ token:', e);
    return null;
  }
}

// تحديث currentUserId
currentUserId = getCurrentUserId();

// دالة فحص حالة التفويض مباشرة من قاعدة البيانات
async function checkDelegationStatus() {
  const token = localStorage.getItem('token');
  const userId = getCurrentUserId();
  
  if (!token || !userId) {
    return;
  }
  
  console.log('🔍 Checking delegation status for userId:', userId);
  
  try {
    // 1. فحص التفويض المباشر من جدول active_delegations
    const delegationUrl = `http://localhost:3006/api/approvals/delegation-status/${userId}`;
    const delegationRes = await fetch(delegationUrl, { 
      headers: authHeaders() 
    });
    
    if (!delegationRes.ok) {
      console.error('❌ Delegation status request failed:', delegationRes.status, delegationRes.statusText);
      const errorText = await delegationRes.text();
      console.error('Error response:', errorText);
      return;
    }
    
    const delegationJson = await delegationRes.json();
    
    if (delegationJson.status === 'success' && delegationJson.data && delegationJson.data.delegated_by) {
      console.log('✅ Found direct delegation from user:', delegationJson.data.delegated_by);
      
      // تحقق من سجلات الموافقة قبل عرض البوب أب
      const hasProcessedDelegation = await checkDelegationApprovalLogs(delegationJson.data.delegated_by, 'direct');
      if (!hasProcessedDelegation) {
        // المستخدم مفوض له - عرض بوب أب التفويض المباشر
        await showDirectDelegationPopup(delegationJson.data.delegated_by);
      } else {
        console.log('✅ Direct delegation already processed, skipping popup');
      }
      return;
    } else {
      console.log('❌ No direct delegation found');
    }
    
    // 2. فحص التفويضات المعلقة الموحدة (أقسام فقط)
    const pendingDelegationsUrl = `http://localhost:3006/api/approvals/pending-delegations-unified/${userId}`;
    console.log('Calling pending delegations unified URL:', pendingDelegationsUrl);
    const pendingDelegationsRes = await fetch(pendingDelegationsUrl, { 
      headers: authHeaders() 
    });
    
    if (!pendingDelegationsRes.ok) {
      console.error('❌ Pending delegations unified request failed:', pendingDelegationsRes.status, pendingDelegationsRes.statusText);
      const errorText = await pendingDelegationsRes.text();
      console.error('Error response:', errorText);
      return;
    }
    
    const pendingDelegationsJson = await pendingDelegationsRes.json();
    console.log('Pending delegations unified response:', pendingDelegationsJson);
    
    if (pendingDelegationsJson.status === 'success' && pendingDelegationsJson.data && pendingDelegationsJson.data.length > 0) {
      console.log('✅ Found pending unified delegations:', pendingDelegationsJson.data.length);
      
      // تحقق من سجلات الموافقة قبل عرض البوب أب
      const latestDelegation = pendingDelegationsJson.data[0]; // أحدث تفويض
      const hasProcessedDelegation = await checkDelegationApprovalLogs(latestDelegation.delegated_by, 'bulk', latestDelegation.id);
      if (!hasProcessedDelegation) {
        // هناك تفويضات معلقة - عرض بوب أب التفويض الجماعي الموحد
        await showBulkDelegationPopup(latestDelegation.id, latestDelegation.delegated_by_name);
      } else {
        console.log('✅ Bulk delegation already processed, skipping popup');
      }
      return;
    } else {
      console.log('❌ No pending unified delegations found');
    }
    
    console.log('🔍 No delegations found for user:', userId);
    
  } catch (err) {
    console.error('خطأ في فحص حالة التفويض:', err);
    if (err.response) {
      console.error('Error response:', await err.response.text());
    }
  }
}

// دالة موحدة للتحقق من سجلات الموافقة للتفويض
async function checkDelegationApprovalLogs(delegatorId, delegationType, delegationId = null) {
  try {
    const userId = getCurrentUserId();
    console.log('🔍 Checking delegation approval logs:', { delegatorId, delegationType, delegationId, userId });
    
    // التحقق من سجلات الموافقة للأقسام
    const deptLogsUrl = `http://localhost:3006/api/approvals/delegation-logs/${userId}/${delegatorId}`;
    const deptLogsRes = await fetch(deptLogsUrl, { headers: authHeaders() });
    
    if (deptLogsRes.ok) {
      const deptLogsJson = await deptLogsRes.json();
      console.log('Department delegation logs:', deptLogsJson);
      
      if (deptLogsJson.status === 'success' && deptLogsJson.data && deptLogsJson.data.length > 0) {
        // تحقق من وجود سجلات مقبولة أو مرفوضة
        const hasProcessed = deptLogsJson.data.some(log => 
          log.status === 'accepted' || log.status === 'rejected'
        );
        if (hasProcessed) {
          console.log('✅ Found processed department delegation logs');
          return true;
        }
      }
    }
    
    console.log('❌ No processed delegation logs found');
    return false;
    
  } catch (err) {
    console.error('خطأ في فحص سجلات الموافقة للتفويض:', err);
    return false;
  }
}

// دالة عرض بوب أب التفويض المباشر
async function showDirectDelegationPopup(delegatorId) {
  try {
    console.log('🎯 Showing direct delegation popup for delegator:', delegatorId);
    
    // جلب اسم المفوض
    const userRes = await fetch(`http://localhost:3006/api/users/${delegatorId}`, { headers: authHeaders() });
    const userJson = await userRes.json();
    const delegatorName = userJson.data?.name || userJson.data?.username || 'المفوض';
    
    const message = `${delegatorName} قام بتفويضك بالنيابة عنه في جميع ملفاته. هل توافق على التفويض المباشر؟`;
    
    showDelegationPopup(
      message,
      async () => {
        try {
          await processDirectDelegationUnified(delegatorId, 'accept');
        } catch (err) {
          alert('خطأ في قبول التفويض المباشر');
        }
      },
      async () => {
        try {
          await processDirectDelegationUnified(delegatorId, 'reject');
          alert('تم رفض التفويض المباشر');
        } catch (err) {
          alert('خطأ في رفض التفويض المباشر');
        }
      }
    );
    
  } catch (err) {
    console.error('خطأ في عرض بوب أب التفويض المباشر:', err);
  }
}

// دالة عرض بوب أب التفويض الجماعي الموحد
async function showBulkDelegationPopup(delegationId, delegatorName) {
  try {
    console.log('🎯 Showing bulk delegation popup for delegation:', delegationId);
    
    const message = `${delegatorName} قام بتفويضك بالنيابة عنه في جميع ملفاته. هل توافق على التفويض الجماعي؟`;
    
    showDelegationPopup(
      message,
      async () => {
        try {
          await processBulkDelegationUnified(delegationId, 'accept');
        } catch (err) {
          alert('خطأ في قبول التفويض الجماعي');
        }
      },
      async () => {
        try {
          await processBulkDelegationUnified(delegationId, 'reject');
          alert('تم رفض التفويض الجماعي');
        } catch (err) {
          alert('خطأ في رفض التفويض الجماعي');
        }
      }
    );
    
  } catch (err) {
    console.error('خطأ في عرض بوب أب التفويض الجماعي:', err);
  }
}

// دالة موحدة لعرض بوب أب التفويض
function showDelegationPopup(message, onAccept, onReject) {
  const overlay = document.createElement('div');
  overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.4);z-index:9999;display:flex;align-items:center;justify-content:center;';
  
  const box = document.createElement('div');
  box.style = 'background:#fff;padding:32px 24px;border-radius:12px;max-width:400px;text-align:center;box-shadow:0 2px 16px #0002;';
  box.innerHTML = `<div style='font-size:1.2rem;margin-bottom:18px;'>${message}</div>`;
  
  const btnAccept = document.createElement('button');
  btnAccept.textContent = 'موافقة';
  btnAccept.style = 'background:#1eaa7c;color:#fff;padding:8px 24px;border:none;border-radius:6px;font-size:1rem;margin:0 8px;cursor:pointer;';
  
  const btnReject = document.createElement('button');
  btnReject.textContent = 'رفض';
  btnReject.style = 'background:#e53e3e;color:#fff;padding:8px 24px;border:none;border-radius:6px;font-size:1rem;margin:0 8px;cursor:pointer;';
  
  btnAccept.onclick = async () => {
    try {
      await onAccept();
    } catch (err) {
      console.error('خطأ في قبول التفويض:', err);
    }
    document.body.removeChild(overlay);
  };
  
  btnReject.onclick = async () => {
    try {
      await onReject();
    } catch (err) {
      console.error('خطأ في رفض التفويض:', err);
    }
    document.body.removeChild(overlay);
  };
  
  box.appendChild(btnAccept);
  box.appendChild(btnReject);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// دالة معالجة التفويض المباشر الموحد
async function processDirectDelegationUnified(delegatorId, action) {
  try {
    const res = await fetch('http://localhost:3006/api/approvals/direct-delegation-unified/process', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ delegatorId, action })
    });
    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.message);
    }
    console.log('✅ Direct delegation unified result:', json);
  } catch (err) {
    console.error('خطأ في معالجة التفويض المباشر الموحد:', err);
    throw err;
  }
}

// دالة معالجة التفويض الجماعي الموحد
async function processBulkDelegationUnified(delegationId, action) {
  try {
    const res = await fetch('http://localhost:3006/api/approvals/bulk-delegation-unified/process', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ delegationId, action })
    });
    const json = await res.json();
    if (json.status !== 'success') {
      throw new Error(json.message);
    }
    console.log('✅ Bulk delegation unified result:', json);
  } catch (err) {
    console.error('خطأ في معالجة التفويض الجماعي الموحد:', err);
    throw err;
  }
}

// دالة الترجمة
function getTranslation(key) {
  const translations = {
    ar: {
      'error-loading': 'خطأ في تحميل البيانات',
      'no-documents': 'لا توجد مستندات',
      'accept': 'قبول',
      'reject': 'رفض',
      'accept-message': 'هل أنت متأكد من قبول التفويض؟',
      'reject-message': 'هل أنت متأكد من رفض التفويض؟',
      'reason-required': 'يرجى إدخال سبب الرفض',
      'reject-success': 'تم رفض التفويض بنجاح',
      'error-rejecting': 'خطأ في رفض التفويض'
    },
    en: {
      'error-loading': 'Error loading data',
      'no-documents': 'No documents found',
      'accept': 'Accept',
      'reject': 'Reject',
      'accept-message': 'Are you sure you want to accept the delegation?',
      'reject-message': 'Are you sure you want to reject the delegation?',
      'reason-required': 'Please enter a rejection reason',
      'reject-success': 'Delegation rejected successfully',
      'error-rejecting': 'Error rejecting delegation'
    }
  };
  
  return translations[currentLang]?.[key] || translations.ar[key] || key;
}

function getLocalizedName(jsonString) {
  try {
    const obj = JSON.parse(jsonString);
    return obj[currentLang] || obj.ar || obj.en || '';
  } catch (e) {
    // لو مش JSON، رجع النص كما هو
    return jsonString;
  }
}
let selectedContentId = null;
let selectedContentType = null;

async function loadDelegations() {
  const tbody = document.querySelector('.proxy-table tbody');
  tbody.innerHTML = '';

  try {
    const [deptRes] = await Promise.all([
      fetch(apiBaseDept, { headers: authHeaders() }),
    ]);
    const deptJson = await deptRes.json();

    if (deptJson.status !== 'success') {
      throw new Error(getTranslation('error-loading'));
    }

    const deptData = deptJson.data.map(d => ({ ...d, type: 'dept' }));
    const allData = [...deptData,];

    if (allData.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px;">${getTranslation('no-documents')}</td></tr>`;
      return;
    }

    allData.forEach(d => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
 <td>${escapeHtml(getLocalizedName(d.title))}</td>
         <td class="col-signer">
          ${escapeHtml(d.delegated_by_name || d.delegated_by || '—')}
        </td>
        <td class="col-action">
          <button class="btn-accept" data-id="${d.id}" data-type="${d.type}" data-delegatedby="${d.delegated_by}">${getTranslation('accept')}</button>
          <button class="btn-reject" data-id="${d.id}" data-type="${d.type}">${getTranslation('reject')}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // زر القبول
    document.querySelectorAll('.btn-accept').forEach(btn => {
      btn.addEventListener('click', async () => {
        let contentId = btn.dataset.id;
        const contentType = btn.dataset.type;
        const page = 'pending-approvals.html';

        // استخراج الرقم فقط من id (مثلاً dept-10 => 10)
        if (typeof contentId === 'string' && contentId.includes('-')) {
          const match = contentId.match(/\d+$/);
          if (match) contentId = match[0];
        }

        showPopup(getTranslation('accept-message'), async () => {
          try {
            const endpointRoot = (contentType === 'committee') ? 'committee-approvals' : 'approvals';
            const res = await fetch(`http://localhost:3006/api/${endpointRoot}/proxy/accept/${contentId}`, {
              method: 'POST',
              headers: authHeaders()
            });
            const json = await res.json();
            if (json.status === 'success') {
              window.location.href = `/frontend/html/${page}?id=${contentId}`;
            } else {
              alert(json.message || 'خطأ أثناء قبول التفويض');
            }
          } catch (err) {
            alert('خطأ أثناء قبول التفويض');
          }
        });
      });
    });

    // زر الرفض
    document.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedContentId = btn.dataset.id;
        selectedContentType = btn.dataset.type;

        showPopup(
          getTranslation('reject-message'),
          submitReject,
          true
        );
      });
    });

  } catch (err) {
    console.error(err);
    alert(getTranslation('error-loading'));
  }
}

function authHeaders() {
  const currentToken = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${currentToken}`
  };
}

function closeRejectModal() {
  const overlay = document.getElementById('popupOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function submitReject() {
  const reason = document.getElementById('rejectReason').value.trim();
  if (!reason) return alert(getTranslation('reason-required'));

  const endpointRoot = (selectedContentType === 'dept')
    ? 'approvals'
    : 'committee-approvals';

  try {
    const res = await fetch(`http://localhost:3006/api/${endpointRoot}/${selectedContentId}/approve`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        approved: false,
        signature: null,
        electronic_signature: false,
        notes: reason
      })
    });
    const json = await res.json();
    if (json.status === 'success') {
      alert(getTranslation('reject-success'));
      loadDelegations();
    } else {
      throw new Error(json.message);
    }
  } catch (err) {
    console.error(err);
    alert(getTranslation('error-rejecting'));
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showPopup(message, onConfirm, showReason = false) {
  const overlay = document.getElementById('popupOverlay');
  const msgEl = document.getElementById('popupMessage');
  const reasonEl = document.getElementById('rejectReason');
  const btnConfirm = document.getElementById('popupConfirm');
  const btnCancel = document.getElementById('popupCancel');

  msgEl.textContent = message;
  reasonEl.style.display = showReason ? 'block' : 'none';

  btnConfirm.replaceWith(btnConfirm.cloneNode(true));
  btnCancel.replaceWith(btnCancel.cloneNode(true));

  document.getElementById('popupConfirm').addEventListener('click', () => {
    overlay.style.display = 'none';
    onConfirm();
  });
  document.getElementById('popupCancel').addEventListener('click', () => {
    overlay.style.display = 'none';
  });

  overlay.style.display = 'flex';
}

function setupSignatureCanvas() {
  canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  document.getElementById('btnClear').addEventListener('click', () => {
    clearCanvas();
  });

  document.getElementById('btnConfirm').addEventListener('click', async () => {
    try {
      const signatureDataUrl = canvas.toDataURL('image/png');
      // ... existing code ...
    } catch (err) {
      // console.error(err);
      alert('خطأ أثناء إرسال التوقيع.');
    }
  });
}

async function fetchContentAndApprovals(contentId) {
  try {
    // ... existing code ...
  } catch (err) {
    // console.error(err);
    alert('خطأ في جلب بيانات المحتوى والاعتمادات.');
  }
}

async function sendApproval(contentId, approvalData) {
  try {
    // ... existing code ...
  } catch (err) {
    // console.error(err);
    alert('خطأ أثناء إرسال الاعتماد.');
  }
}

