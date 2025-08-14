// دوال مساعدة آمنة لفك تشفير JWT tokens
// Safe JWT token decoding helper functions

/**
 * فك تشفير JWT token بشكل آمن
 * Safely decode JWT token
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded payload or null if invalid
 */
function safeDecodeJWT(token) {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }
    
    // التحقق من أن الـ token يحتوي على 3 أجزاء مفصولة بنقاط
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // فك تشفير الجزء الثاني (payload)
    const payload = parts[1];
    
    // إضافة padding إذا لزم الأمر
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    
    // فك تشفير base64
    const decoded = atob(paddedPayload);
    
    // تحويل JSON إلى object
    return JSON.parse(decoded);
  } catch (error) {
    console.warn('فشل في فك تشفير JWT token:', error.message);
    return null;
  }
}

/**
 * الحصول على معلومات المستخدم من الـ token
 * Get user info from token
 * @param {string} token - JWT token
 * @returns {object|null} - User info or null if invalid
 */
function getUserFromToken(token) {
  const payload = safeDecodeJWT(token);
  if (!payload) return null;
  
  return {
    id: payload.id,
    role: payload.role,
    username: payload.username,
    email: payload.email,
    departmentId: payload.departmentId,
    // أي معلومات أخرى موجودة في الـ payload
  };
}

/**
 * التحقق من صلاحية الـ token
 * Check if token is valid
 * @param {string} token - JWT token
 * @returns {boolean} - True if valid, false otherwise
 */
function isTokenValid(token) {
  try {
    const payload = safeDecodeJWT(token);
    if (!payload) return false;
    
    // التحقق من انتهاء صلاحية الـ token
    if (payload.exp) {
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime > payload.exp) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

/**
 * الحصول على role المستخدم من الـ token
 * Get user role from token
 * @param {string} token - JWT token
 * @returns {string|null} - User role or null if invalid
 */
function getUserRole(token) {
  const payload = safeDecodeJWT(token);
  return payload?.role || null;
}

/**
 * الحصول على ID المستخدم من الـ token
 * Get user ID from token
 * @param {string} token - JWT token
 * @returns {string|number|null} - User ID or null if invalid
 */
function getUserId(token) {
  const payload = safeDecodeJWT(token);
  return payload?.id || null;
}

/**
 * الحصول على token من localStorage
 * Get token from localStorage
 * @returns {string|null} - Token or null if not found
 */
function getToken() {
  return localStorage.getItem('token');
}

/**
 * فك تشفير payload من token (للحالات التي تحتاج فقط للـ payload)
 * Decode payload from token (for cases that need only the payload)
 * @param {string} token - JWT token
 * @returns {object|null} - Decoded payload or null if invalid
 */
function decodeTokenPayload(token) {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const payload = parts[1];
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = atob(paddedPayload);
    
    return JSON.parse(decoded);
  } catch (error) {
    console.warn('فشل في فك تشفير payload:', error.message);
    return null;
  }
}

/**
 * جلب معلومات المستخدم من الباك اند (بديل آمن لـ atob)
 * Get user info from backend (safe alternative to atob)
 * @param {string} token - JWT token (optional, will get from localStorage if not provided)
 * @returns {Promise<object|null>} - User info from backend or null if error
 */

async function getUserInfoFromBackend(token = null) {
  try {
    const authToken = token || localStorage.getItem('token');
    if (!authToken) {
      return null;
    }

    const response = await fetch('http://localhost:3006/api/auth/user-info', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn('فشل في جلب معلومات المستخدم من الباك اند:', response.status);
      return null;
    }

    const result = await response.json();
    if (result.status === 'success' && result.data) {
      return result.data;
    }

    return null;
  } catch (error) {
    console.error('خطأ في جلب معلومات المستخدم من الباك اند:', error);
    return null;
  }
}

/**
 * بديل آمن لـ atob - يستخدم الباك اند لجلب معلومات المستخدم
 * Safe alternative to atob - uses backend to get user info
 * @param {string} token - JWT token (optional)
 * @returns {Promise<object|null>} - User info or null
 */
async function safeGetUserInfo(token = null) {
  // محاولة جلب المعلومات من الباك اند أولاً (الطريقة الآمنة)
  const backendInfo = await getUserInfoFromBackend(token);
  if (backendInfo) {
    return backendInfo;
  }

  // في حالة فشل الباك اند، نستخدم فك التشفير المحلي كبديل
  console.warn('استخدام فك التشفير المحلي كبديل...');
  const authToken = token || localStorage.getItem('token');
  if (!authToken) {
    return null;
  }

  const payload = safeDecodeJWT(authToken);
  return payload;
}

