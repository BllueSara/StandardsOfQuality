document.addEventListener('DOMContentLoaded', async () => {
  await checkDelegationStatus();
  loadDelegations();
});

// تعريف المتغيرات العامة
const apiBaseDept = 'http://localhost:3006/api/approvals/proxy';
const token = localStorage.getItem('token');
const currentLang = localStorage.getItem('language') || 'ar';
let currentUserId = localStorage.getItem('userId');

// متغيرات نظام الإقرار
let currentDelegationData = null;
let pendingDelegationData = null;

// دالة لاستخراج userId من الـ token إذا لم يكن موجوداً في localStorage
async function getCurrentUserId() {
  if (currentUserId) {
    return currentUserId;
  }
  
  const token = localStorage.getItem('token');
  if (!token) {
    return null;
  }
  
  try {
    const payload = await safeGetUserInfo(token);
    currentUserId = payload.id;
    localStorage.setItem('userId', currentUserId);
    return currentUserId;
  } catch (e) {
    console.error('خطأ في استخراج userId من الـ token:', e);
    return null;
  }
}

// تحديث currentUserId
getCurrentUserId().then(id => {
  currentUserId = id;
});

// دالة فحص حالة التفويض مباشرة من قاعدة البيانات
async function checkDelegationStatus() {
  const token = localStorage.getItem('token');
  const userId = await getCurrentUserId();
  
  if (!token || !userId) {
    return;
  }
  
  console.log('🔍 Checking delegation status for userId:', userId);
  
  try {
    // 1. فحص تفويض جميع الملفات من جدول active_delegations
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
      console.log('✅ Found bulk delegation from user:', delegationJson.data.delegated_by);
      
      // تحقق من سجلات الموافقة قبل عرض البوب أب
      const hasProcessedDelegation = await checkDelegationApprovalLogs(delegationJson.data.delegated_by, 'bulk');
      if (!hasProcessedDelegation) {
        // المستخدم مفوض له - عرض بوب أب تفويض جميع الملفات
        console.log('🎯 Showing bulk delegation popup for user:', delegationJson.data.delegated_by_name);
        await showBulkDelegationPopup('bulk-' + delegationJson.data.delegated_by, delegationJson.data.delegated_by_name, delegationJson.data);
      } else {
        console.log('✅ Bulk delegation already processed, skipping popup');
      }
      return;
    } else {
      console.log('❌ No bulk delegation found');
    }
    
    // 2. فحص التفويضات الجماعية المعلقة من approval_logs
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
      console.log('✅ Found pending bulk delegations:', pendingDelegationsJson.data.length);
      
      // تحقق من سجلات الموافقة قبل عرض البوب أب
      const latestDelegation = pendingDelegationsJson.data[0]; // أحدث تفويض
      const hasProcessedDelegation = await checkDelegationApprovalLogs(latestDelegation.delegated_by, 'bulk', latestDelegation.id);
      if (!hasProcessedDelegation) {
        // هناك تفويضات جماعية معلقة - عرض بوب أب التفويض الجماعي
        await showBulkDelegationPopup(latestDelegation.id, latestDelegation.delegated_by_name, latestDelegation);
      } else {
        console.log('✅ Bulk delegation already processed, skipping popup');
      }
      return;
    } else {
      console.log('❌ No pending bulk delegations found');
    }
    
    // 3. فحص التوقيع بالنيابة الفردي - عرض بوب أب له أيضاً
    console.log('🔍 Checking for individual proxy delegations...');
    const individualDelegationsUrl = `http://localhost:3006/api/approvals/proxy`;
    const individualDelegationsRes = await fetch(individualDelegationsUrl, { 
      headers: authHeaders() 
    });
    
    if (individualDelegationsRes.ok) {
      const individualDelegationsJson = await individualDelegationsRes.json();
      console.log('Individual delegations response:', individualDelegationsJson);
      
      if (individualDelegationsJson.status === 'success' && individualDelegationsJson.data && individualDelegationsJson.data.length > 0) {
        console.log('✅ Found individual delegations:', individualDelegationsJson.data.length);
        
        // عرض بوب أب الإقرار للتفويض الفردي الأول
        const firstDelegation = individualDelegationsJson.data[0];
        console.log('🎯 Showing individual delegation popup for:', firstDelegation.title);
        await showIndividualDelegationPopup(firstDelegation);
        return;
      } else {
        console.log('❌ No individual delegations found');
      }
    } else {
      console.log('❌ Individual delegations request failed:', individualDelegationsRes.status, individualDelegationsRes.statusText);
    }
    
    console.log('🔍 No delegations found to show popup for');
    
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
    const userId = await getCurrentUserId();
    console.log('🔍 Checking delegation approval logs:', { delegatorId, delegationType, delegationId, userId });
    
    // التحقق من سجلات الموافقة للتفويض
    const deptLogsUrl = `http://localhost:3006/api/approvals/delegation-logs/${userId}/${delegatorId}`;
    console.log('🔍 Calling delegation logs URL:', deptLogsUrl);
    
    const deptLogsRes = await fetch(deptLogsUrl, { headers: authHeaders() });
    
    if (deptLogsRes.ok) {
      const deptLogsJson = await deptLogsRes.json();
      console.log('Delegation logs response:', deptLogsJson);
      
      if (deptLogsJson.status === 'success' && deptLogsJson.data && deptLogsJson.data.length > 0) {
        // تحقق من وجود سجلات مقبولة أو مرفوضة
        const hasProcessed = deptLogsJson.data.some(log => 
          log.status === 'accepted' || log.status === 'rejected'
        );
        if (hasProcessed) {
          console.log('✅ Found processed delegation logs');
          return true;
        }
      }
    } else {
      console.log('❌ Delegation logs request failed:', deptLogsRes.status, deptLogsRes.statusText);
    }
    
    console.log('❌ No processed delegation logs found');
    return false;
    
  } catch (err) {
    console.error('خطأ في فحص سجلات الموافقة للتفويض:', err);
    return false;
  }
}

// دالة للحصول على اسم المستخدم الحالي
async function getCurrentUserName() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    
    const response = await fetch(`http://localhost:3006/api/users/${userId}`, {
      headers: authHeaders()
    });
    
    if (response.ok) {
      const userData = await response.json();
      if (userData.status === 'success' && userData.data) {
        return userData.data.full_name || userData.data.name || 'مستخدم غير معروف';
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching user name:', error);
    return null;
  }
}

// دالة للحصول على رقم الهوية الوطني للمستخدم الحالي
async function getCurrentUserNationalId() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const response = await fetch(`http://localhost:3006/api/users/${userId}`, {
      headers: authHeaders()
    });

    if (response.ok) {
      const userData = await response.json();
      if (userData.status === 'success' && userData.data) {
        return userData.data.national_id || 'N/A';
      }
    }
    return null;
  } catch (error) {
    console.error('Error fetching user national ID:', error);
    return null;
  }
}

// دالة عرض بوب أب تفويض جميع الملفات
async function showBulkDelegationPopup(delegationId, delegatorName, delegatorData = null) {
  try {
    console.log('🎯 Showing bulk delegation popup for delegation:', delegationId);
    
    // الحصول على اسم المستخدم الحالي
    const currentUserName = await getCurrentUserName();
    
    // إنشاء بيانات التفويض للعرض
    const delegationData = {
      isBulk: true,
      delegationData: {
        delegationId: delegationId
      }
    };
    
    // إنشاء معلومات المفوض والمفوض له
    const delegatorInfo = {
      fullName: delegatorName,
      idNumber: delegatorData?.delegated_by_national_id || 'N/A'
    };
    
    const delegateInfo = {
      fullName: currentUserName || 'مستخدم غير معروف',
      idNumber: await getCurrentUserNationalId() || 'N/A'
    };
    
    // عرض بوب أب الإقرار المفصل
    showDelegationConfirmationPopup(delegatorInfo, delegateInfo, [], true, delegationData);
    
  } catch (err) {
    console.error('خطأ في عرض بوب أب التفويض:', err);
  }
}

// دالة عرض بوب أب الإقرار والتوقيع
function showDelegationConfirmationPopup(delegatorInfo, delegateInfo, files, isBulk = false, delegationData = null) {
  // تخزين بيانات التفويض الحالي
  currentDelegationData = delegationData;
  
  // إزالة أي بوب أب موجود مسبقاً
  const existingPopup = document.getElementById('delegationConfirmationPopup');
  if (existingPopup) {
    existingPopup.remove();
  }

  // إنشاء البوب أب
  const popup = document.createElement('div');
  popup.id = 'delegationConfirmationPopup';
  popup.className = 'delegation-confirmation-popup';
  
  // إضافة inline styles للتأكد من الظهور
  popup.style.position = 'fixed';
  popup.style.top = '0';
  popup.style.left = '0';
  popup.style.width = '100%';
  popup.style.height = '100%';
  popup.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  popup.style.display = 'flex';
  popup.style.justifyContent = 'center';
  popup.style.alignItems = 'center';
  popup.style.zIndex = '10000';
  popup.style.direction = 'rtl';
  
  // منع إغلاق البوب أب بالضغط خارجه
  popup.addEventListener('click', (e) => {
    if (e.target === popup) {
      // لا تفعل شيئاً - منع الإغلاق
      console.log('🔒 Popup click blocked - user must respond to delegation');
    }
  });
  
  // تحضير قائمة الملفات
  let filesList = '';
  if (isBulk) {
    filesList = `<p class="files-summary" style="padding: 15px; background: #e3f2fd; border-radius: 4px; color: #1976d2; text-align: center; margin: 10px 0;">${getTranslation('comprehensive-delegation')}</p>`;
  } else {
    filesList = '<div class="files-list">';
    files.forEach(file => {
      filesList += `<div class="file-item" style="padding: 10px; background: #f8f9fa; border-radius: 4px; margin: 5px 0; border-left: 3px solid #007bff;">
        <span class="file-name" style="font-weight: bold;">${file.title || file.name}</span>
        <span class="file-type" style="color: #666; margin-right: 10px;">${getTranslation('department-report')}</span>
      </div>`;
    });
    filesList += '</div>';
  }

  // إنشاء المحتوى باستخدام innerHTML مباشرة
  popup.innerHTML = `
    <div class="delegation-confirmation-content" style="background: white; border-radius: 8px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);">
      <div class="delegation-header" style="padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; color: #333;">${getTranslation('delegation-confirmation')}</h3>
        <button class="close-btn" onclick="closeDelegationConfirmationPopup()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">&times;</button>
      </div>
      
      <div class="delegation-body" style="padding: 20px;">
        <div class="delegator-info" style="margin-bottom: 20px;">
          <h4 style="color: #333; margin-bottom: 15px;">${getTranslation('delegator-info')}</h4>
          <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            <span class="label" style="font-weight: bold;">${getTranslation('full-name')}:</span>
            <span class="value">${delegatorInfo.fullName}</span>
          </div>
          <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            <span class="label" style="font-weight: bold;">${getTranslation('id-number')}:</span>
            <span class="value">${delegatorInfo.idNumber}</span>
          </div>
        </div>
        
        <div class="delegate-info" style="margin-bottom: 20px;">
          <h4 style="color: #333; margin-bottom: 15px;">${getTranslation('delegate-info')}</h4>
          <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            <span class="label" style="font-weight: bold;">${getTranslation('full-name')}:</span>
            <span class="value">${delegateInfo.fullName}</span>
          </div>
          <div class="info-row" style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            <span class="label" style="font-weight: bold;">${getTranslation('id-number')}:</span>
            <span class="value">${delegateInfo.idNumber}</span>
          </div>
        </div>
        
        <div class="delegation-details" style="margin-bottom: 20px;">
          <h4 style="color: #333; margin-bottom: 15px;">${getTranslation('delegation-details')}</h4>
          <div class="delegation-type" style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: #f8f9fa; border-radius: 4px;">
            <span class="label" style="font-weight: bold;">${getTranslation('delegation-type')}:</span>
            <span class="value">${isBulk ? getTranslation('comprehensive-delegation') : getTranslation('single-delegation')}</span>
          </div>
          ${filesList}
        </div>
        
        <div class="delegation-statement" style="margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 4px;">
          <p class="statement-text" style="margin: 0; line-height: 1.6; color: #333;">
            ${getTranslation('delegation-confirmation-message')} <strong>${delegatorInfo.fullName}</strong> 
            ${getTranslation('delegation-confirmation-message-2')} <strong>${delegatorInfo.idNumber}</strong> 
            ${getTranslation('delegation-confirmation-message-3')} ${isBulk ? getTranslation('delegation-confirmation-message-5') : getTranslation('delegation-confirmation-message-4')}.
          </p>
        </div>
        
        <div style="padding: 15px; background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 4px; margin-bottom: 20px;">
          <p style="margin: 0; color: #856404; font-weight: bold; text-align: center;">
            ⚠️ ${getTranslation('delegation-error-no-signature')}
          </p>
        </div>
      </div>
      
      <div class="delegation-footer" style="padding: 20px; border-top: 1px solid #eee; display: flex; justify-content: space-between; gap: 10px;">
        <button class="btn btn-danger" onclick="rejectDelegation()" style="background: #dc3545; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">${getTranslation('reject-delegation')}</button>
        <button class="btn btn-secondary" onclick="closeDelegationConfirmationPopup()" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">${getTranslation('cancel-delegation')}</button>
        <button class="btn btn-primary" onclick="confirmDelegation()" style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">${getTranslation('confirm-delegation')}</button>
      </div>
    </div>
  `;

  // إضافة ملف CSS للبوب أب
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '../css/delegation-confirmation.css';
  link.id = 'delegation-confirmation-css';
  
  // إزالة أي ملف CSS سابق
  const existingCSS = document.getElementById('delegation-confirmation-css');
  if (existingCSS) {
    existingCSS.remove();
  }
  
  document.head.appendChild(link);
  document.body.appendChild(popup);
  
  console.log('🎯 Delegation confirmation popup created and displayed');
  
  // إضافة تنبيه صوتي (اختياري)
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
    audio.play().catch(e => console.log('Audio play failed:', e));
  } catch (e) {
    console.log('Audio not supported');
  }
}

// دالة إغلاق بوب أب الإقرار
function closeDelegationConfirmationPopup() {
  const popup = document.getElementById('delegationConfirmationPopup');
  if (popup) {
    popup.remove();
  }
  
  console.log('🔍 Delegation confirmation popup closed');
}

// دالة تأكيد التفويض
function confirmDelegation() {
  console.log('🔍 confirmDelegation called');
  console.log('🔍 currentDelegationData:', currentDelegationData);
  
  if (!currentDelegationData) {
    showToast('خطأ: لا توجد بيانات تفويض', 'error');
    return;
  }
  
  // معالجة قبول التفويض حسب النوع
  if (currentDelegationData.isBulk) {
    // قبول تفويض شامل
    console.log('🔍 Processing bulk delegation');
    processBulkDelegation(currentDelegationData);
  } else {
    // قبول تفويض فردي
    console.log('🔍 Processing single delegation');
    processSingleDelegation(currentDelegationData);
  }
  
  // إغلاق البوب أب
  closeDelegationConfirmationPopup();
  
  // مسح البيانات المؤقتة
  currentDelegationData = null;
}

// دالة رفض التفويض
function rejectDelegation() {
  if (!currentDelegationData) {
    showToast('خطأ: لا توجد بيانات تفويض', 'error');
    return;
  }
  
  // إغلاق البوب أب
  closeDelegationConfirmationPopup();
  
  // مسح البيانات المؤقتة
  currentDelegationData = null;
  
  showToast('تم رفض التفويض', 'info');
}

// دالة معالجة تفويض فردي
async function processSingleDelegation(data) {
  try {
    console.log('🔍 Processing single delegation with data:', data);
    
    // استخراج contentId من البيانات
    let contentId = data.delegationData.id;
    
    // إذا كان contentId يبدأ بـ 'dept-' أو 'committee-'، قم بإزالته
    if (contentId && typeof contentId === 'string') {
      if (contentId.includes('-')) {
        const match = contentId.match(/\d+$/);
        if (match) contentId = match[0];
      }
    }
    
    console.log('🔍 Using contentId:', contentId);
    
    // تحديد نوع المحتوى
    const contentType = data.delegationData.type || 'dept';
    const endpointRoot = (contentType === 'committee') ? 'committee-approvals' : 'approvals';
    
    const response = await fetch(`http://localhost:3006/api/${endpointRoot}/proxy/accept/${contentId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API response error:', response.status, errorText);
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    if (result.status === 'success') {
      showToast(getTranslation('delegation-sent-success'), 'success');
      closeDelegationConfirmationPopup();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showToast(result.message || getTranslation('delegation-failed'), 'error');
    }
  } catch (error) {
    console.error('Error accepting single delegation:', error);
    showToast('خطأ في قبول التفويض', 'error');
  }
}

// دالة معالجة تفويض شامل
async function processBulkDelegation(data) {
  try {
    console.log('🔍 Processing bulk delegation with data:', data);
    
    // استخراج delegationId من البيانات
    let delegationId = data.delegationData.delegationId;
    
    // إذا كان delegationId يبدأ بـ 'bulk-'، قم بإزالته
    if (delegationId && delegationId.startsWith('bulk-')) {
      delegationId = delegationId.replace('bulk-', '');
    }
    
    console.log('🔍 Using delegationId:', delegationId);
    
    const response = await fetch('http://localhost:3006/api/approvals/bulk-delegation-unified/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({
        delegationId: delegationId,
        action: 'accept',
        signature: null
      })
    });
    
    const result = await response.json();
    if (result.status === 'success') {
      showToast(getTranslation('delegation-bulk-sent'), 'success');
      closeDelegationConfirmationPopup();
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } else {
      showToast(result.message || getTranslation('delegation-failed'), 'error');
    }
  } catch (error) {
    console.error('Error accepting bulk delegation:', error);
    showToast('خطأ في قبول التفويض الشامل', 'error');
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

// دالة معالجة تفويض جميع الملفات
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
    console.error('خطأ في معالجة تفويض جميع الملفات:', err);
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
  if (!tbody) {
    console.error('❌ Table body not found');
    return;
  }
  
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

        // عرض بوب أب الإقرار للتفويض الفردي
        const delegationData = allData.find(item => item.id == contentId);
        if (delegationData) {
          await showIndividualDelegationPopup(delegationData);
        } else {
          // إذا لم نجد البيانات، استخدم الطريقة القديمة
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
        }
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

// دالة عرض بوب أب تفويض فردي
async function showIndividualDelegationPopup(delegationData) {
  try {
    console.log('🎯 Showing individual delegation popup for delegation:', delegationData);
    
    // الحصول على اسم المستخدم الحالي
    const currentUserName = await getCurrentUserName();
    
    // إنشاء معلومات المفوض والمفوض له
    const delegatorInfo = {
      fullName: delegationData.delegated_by_name || 'مستخدم غير معروف',
      idNumber: delegationData.delegated_by_national_id || delegationData.delegated_by || 'N/A'
    };
    
    const delegateInfo = {
      fullName: currentUserName || 'مستخدم غير معروف',
      idNumber: await getCurrentUserNationalId() || 'N/A'
    };
    
    // إنشاء قائمة الملفات
    const files = [{
      title: delegationData.title || 'ملف غير محدد',
      name: delegationData.title || 'ملف غير محدد'
    }];
    
    // عرض بوب أب الإقرار المفصل
    showDelegationConfirmationPopup(delegatorInfo, delegateInfo, files, false, {
      isBulk: false,
      delegationData: delegationData
    });
    
  } catch (err) {
    console.error('خطأ في عرض بوب أب التفويض الفردي:', err);
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

  if (!overlay || !msgEl || !reasonEl || !btnConfirm || !btnCancel) {
    console.error('❌ Popup elements not found');
    return;
  }

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

// دالة عرض رسائل Toast
function showToast(message, type = 'info', duration = 3000) {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      pointer-events: none;
    `;
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : type === 'warning' ? '#ffc107' : '#17a2b8'};
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    margin-bottom: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
    pointer-events: auto;
    max-width: 300px;
    word-wrap: break-word;
  `;

  toastContainer.appendChild(toast);

  // Force reflow to ensure animation plays from start
  toast.offsetWidth;

  // Animate in
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 10);

  // Set a timeout to remove the toast
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    // Remove element after animation completes
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  }, duration);
}

