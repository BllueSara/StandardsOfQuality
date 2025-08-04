function getTranslation(key) {
    const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
    if (window.translations && window.translations[lang] && window.translations[lang][key]) {
        return window.translations[lang][key];
    }
    return key;
}
// في أعلى الملف، بعد parseJwt:
function parseLocalized(text) {
  console.log('🔤 parseLocalized input:', text, 'type:', typeof text);
  
  // إذا كان النص فارغاً أو null أو undefined
  if (!text || text === null || text === undefined) {
    console.log('🔤 parseLocalized: النص فارغ، إرجاع نص فارغ');
    return '';
  }
  
  try {
    const obj = typeof text==='string' && text.trim().startsWith('{')
      ? JSON.parse(text)
      : text;
    const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
    const result = (obj && obj[lang]) || (obj && obj.ar) || text || '';
    console.log('🔤 parseLocalized result:', result);
    return result;
  } catch (error) {
    console.log('🔤 parseLocalized error, returning original text:', text);
    return text;
  }
}

document.addEventListener('DOMContentLoaded', function() {
    const usernameSpan = document.getElementById('profile-username');
    const emailSpan = document.getElementById('profile-email');
    const departmentSpan = document.getElementById('profile-department');
    const employeeNumberSpan = document.getElementById('profile-employee-number');
    const jobTitleSpan = document.getElementById('profile-job-title');

    const logoutButton = document.getElementById('logout-button');

    // دالة لفك تشفير JWT والحصول على معلومات المستخدم
    function parseJwt(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Error parsing JWT:', e);
            return null;
        }
    }

    // دالة لجلب معلومات المستخدم من الخادم
    async function fetchUserProfile(userId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No token available');
            }

            const response = await fetch(`http://localhost:3006/api/users/${userId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized - Please login again');
                } else if (response.status === 404) {
                    throw new Error('User not found');
                } else {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            }

            const result = await response.json();
            console.log('📡 استجابة الخادم:', result);
            
            if (result.status === 'success' && result.data) {
                console.log('✅ بيانات المستخدم من الخادم:', result.data);
                console.log('🎯 المسمى الوظيفي من الخادم:', result.data.job_title);
                return result.data;
            } else {
                throw new Error('Invalid response format');
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
            return null;
        }
    }

    // جلب التوكن من localStorage
    const token = localStorage.getItem('token');

    if (token) {
        const user = parseJwt(token);
        if (user) {
            // عرض رسالة تحميل مؤقتة
            emailSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            usernameSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            employeeNumberSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            jobTitleSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            departmentSpan.textContent = getTranslation('loading') || 'جاري التحميل...';
            
            // جلب جميع بيانات البروفايل من الخادم
            fetchUserProfile(user.id).then(userData => {
                if (userData) {
                    console.log('🎨 عرض البيانات في الواجهة:', userData);
                    console.log('🎯 المسمى الوظيفي قبل العرض:', userData.job_title);
                    console.log('🎯 المسمى الوظيفي بعد parseLocalized:', parseLocalized(userData.job_title));
                    
                    // ✅ عرض جميع المعلومات من الخادم (البيانات الأحدث والأكثر دقة)
                    emailSpan.textContent = userData.email || getTranslation('not-available');
                    usernameSpan.textContent = userData.name || getTranslation('not-available');
                    employeeNumberSpan.textContent = userData.employee_number || getTranslation('not-available');
                    
                    // معالجة خاصة للمسمى الوظيفي
                    const jobTitle = userData.job_title;
                    if (jobTitle && jobTitle.trim() !== '') {
                        jobTitleSpan.textContent = parseLocalized(jobTitle);
                    } else {
                        jobTitleSpan.textContent = getTranslation('not-available');
                    }
                    
                    departmentSpan.textContent = parseLocalized(userData.departmentName) || getTranslation('not-available');
                } else {
                    // ⚠️ إذا فشل جلب البيانات من الخادم، استخدم البيانات من JWT كاحتياطي
                    emailSpan.textContent = user.email || getTranslation('not-available');
                    usernameSpan.textContent = user.username || getTranslation('not-available');
                    employeeNumberSpan.textContent = user.employee_number || getTranslation('not-available');
                    
                    // معالجة خاصة للمسمى الوظيفي (احتياطي)
                    const jobTitle = user.job_title;
                    if (jobTitle && jobTitle.trim() !== '') {
                        jobTitleSpan.textContent = parseLocalized(jobTitle);
                    } else {
                        jobTitleSpan.textContent = getTranslation('not-available');
                    }
                    
                    departmentSpan.textContent = parseLocalized(user.department_name) || getTranslation('not-available');
                }
            }).catch(error => {
                console.error('Error loading user profile:', error);
                // ⚠️ في حالة الخطأ، استخدم البيانات من JWT كاحتياطي
                emailSpan.textContent = user.email || getTranslation('not-available');
                usernameSpan.textContent = user.username || getTranslation('not-available');
                employeeNumberSpan.textContent = user.employee_number || getTranslation('not-available');
                
                // معالجة خاصة للمسمى الوظيفي (في حالة الخطأ)
                const jobTitle = user.job_title;
                if (jobTitle && jobTitle.trim() !== '') {
                    jobTitleSpan.textContent = parseLocalized(jobTitle);
                } else {
                    jobTitleSpan.textContent = getTranslation('not-available');
                }
                
                departmentSpan.textContent = parseLocalized(user.department_name) || getTranslation('not-available');
            });

        } else {
            // إذا كان التوكن غير صالح، توجيه المستخدم لصفحة تسجيل الدخول
            alert(getTranslation('invalid-session'));
            window.location.href = 'login.html';
        }
    } else {
        // إذا لم يكن هناك توكن، توجيه المستخدم لصفحة تسجيل الدخول
        alert(getTranslation('please-login'));
        window.location.href = 'login.html';
    }

    // التعامل مع زر تسجيل الخروج
    logoutButton.addEventListener('click', function() {
        localStorage.removeItem('token'); // حذف التوكن
        alert(getTranslation('logout-success'));
        window.location.href = 'login.html'; // التوجيه لصفحة تسجيل الدخول
    });
}); 
