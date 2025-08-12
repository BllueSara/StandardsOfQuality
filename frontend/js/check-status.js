
function startStatusPolling() {
  const token = localStorage.getItem('token');
  if (!token) return;
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
  const myId = payload.id;

  setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:3006/api/users/${myId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error();
      const { data: user } = await res.json();
      if (user.status !== 'active') {
      alert(getTranslation('logout_due_to_deactivation'));
        localStorage.removeItem('token');
        window.location.href = '/frontend/html/login.html';
      }
    } catch {
      localStorage.removeItem('token');
      window.location.href = '/frontend/html/login.html';
    }
  }, 10_000);
}

// دالة للتحقق من اكتمال بيانات المستخدم
function checkUserProfileCompletion() {
  const token = localStorage.getItem('token');
  if (!token) return;
  
  const payload = JSON.parse(atob(token.split('.')[1] || '{}'));
  const myId = payload.id;
  const username = payload.username;

  // إذا كان المستخدم admin، لا نحتاج للتحقق من اكتمال البيانات
  if (username && username.toLowerCase() === 'admin') {
    return;
  }

  // التحقق من اكتمال البيانات كل 30 ثانية
  setInterval(async () => {
    try {
      const res = await fetch(`http://localhost:3006/api/users/${myId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error();
      
      const { data: user } = await res.json();
      
      // التحقق من اكتمال البيانات المطلوبة للمستخدمين العاديين
      const isProfileComplete = user.first_name && 
                               user.last_name && 
                               user.departmentId && 
                               user.employee_number && 
                               user.job_title_id && 
                               user.national_id &&
                               user.job_name_id;
      
      // إذا كانت البيانات غير مكتملة وليس في صفحة البروفايل، توجيه لصفحة البروفايل فوراً
      if (!isProfileComplete && !window.location.pathname.includes('profile.html')) {
        // التحقق من أن المستخدم ليس في صفحة تسجيل أو تسجيل دخول
        const currentPage = window.location.pathname;
        const excludedPages = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html'];
        const isExcludedPage = excludedPages.some(page => currentPage.includes(page));
        
        if (!isExcludedPage) {
          // إظهار تنبيه للمستخدم وإذا ضغط OK يذهب للبروفايل
          const userConfirmed = confirm('يرجى إكمال بياناتك الشخصية في صفحة البروفايل');
          if (userConfirmed) {
            window.location.href = '/frontend/html/profile.html';
          }
        }
      }
    } catch (error) {
      console.error('خطأ في التحقق من اكتمال البيانات:', error);
    }
  }, 30_000); // التحقق كل 30 ثانية
}

document.addEventListener('DOMContentLoaded', function() {
  startStatusPolling();
  checkUserProfileCompletion();
});
