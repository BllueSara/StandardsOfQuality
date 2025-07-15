function getTranslation(key) {
    const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
    if (window.translations && window.translations[lang] && window.translations[lang][key]) {
        return window.translations[lang][key];
    }
    return key;
}
// في أعلى الملف، بعد parseJwt:
function parseLocalized(text) {
  try {
    const obj = typeof text==='string' && text.trim().startsWith('{')
      ? JSON.parse(text)
      : text;
    const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
    return (obj && obj[lang]) || (obj && obj.ar) || '';
  } catch {
    return text;
  }
}

document.addEventListener('DOMContentLoaded', function() {
    const usernameSpan = document.getElementById('profile-username');
    const emailSpan = document.getElementById('profile-email');
    const departmentSpan = document.getElementById('profile-department');
const employeeNumberSpan = document.getElementById('profile-employee-number');

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

    // جلب التوكن من localStorage
    const token = localStorage.getItem('token');

    if (token) {
        const user = parseJwt(token);
        if (user) {
            // عرض معلومات المستخدم (اسم المستخدم أو البريد الإلكتروني)
            // سنفترض أن التوكن يحتوي على 'email'، ويمكن إضافة 'username' إذا كان متاحاً في التوكن
            emailSpan.textContent = user.email || getTranslation('not-available');
            // إذا كان التوكن يحتوي على اسم المستخدم، يمكن عرضه هنا
            // usernameSpan.textContent = user.username || getTranslation('not-available');
            // بما أن الفورم لا يرسل username، سنعرض الإيميل كاسم مستخدم مؤقتاً أو نتركه فارغاً إذا لم يكن مطلوباً
            usernameSpan.textContent = user.username || getTranslation('not-available');
            // جلب اسم القسم من بيانات المستخدم عبر /api/users/:id
            fetch(`http://localhost:3006/api/users/${user.id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(res => res.json())
            .then(data => {
                let deptName = data.data.departmentName;
                if (typeof deptName === 'string' && deptName.trim().startsWith('{')) {
                    try {
                        const obj = JSON.parse(deptName);
                        const lang = localStorage.getItem('language') || 'ar';
                        deptName = obj[lang] || obj.ar || obj.en || deptName;
                    } catch {
                        // إذا فشل التحويل، استخدم النص كما هو
                    }
                }
                departmentSpan.textContent = deptName || getTranslation('not-available');
            })
            .catch(() => {
                departmentSpan.textContent = getTranslation('not-available');
            });
employeeNumberSpan.textContent = user.employee_number || getTranslation('not-available');

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
