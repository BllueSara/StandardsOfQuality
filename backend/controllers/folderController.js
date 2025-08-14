// backend/controllers/folderController.js
const mysql = require('mysql2/promise');
const jwt   = require('jsonwebtoken');
const { softDeleteFolderWithContents } = require('../utils/softDelete');
require('dotenv').config();

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
const { logAction } = require('../models/logger');
const { getFullNameSQLWithAliasAndFallback } = require('../models/userUtils');

// دالة مساعدة لاستخراج اسم القسم باللغة المناسبة
function getDepartmentNameByLanguage(departmentNameData, userLanguage = 'ar') {
    try {
        console.log('DEBUG: getDepartmentNameByLanguage input:', departmentNameData);
        console.log('DEBUG: getDepartmentNameByLanguage userLanguage:', userLanguage);
        
        // إذا كان الاسم JSON يحتوي على اللغتين
        if (typeof departmentNameData === 'string' && departmentNameData.startsWith('{')) {
            const parsed = JSON.parse(departmentNameData);
            console.log('DEBUG: Parsed JSON:', parsed);
            const result = parsed[userLanguage] || parsed['ar'] || parsed['en'] || departmentNameData;
            console.log('DEBUG: JSON result:', result);
            return result;
        }
        // إذا كان object بالفعل
        if (typeof departmentNameData === 'object' && departmentNameData !== null) {
            console.log('DEBUG: Object input:', departmentNameData);
            const result = departmentNameData[userLanguage] || departmentNameData['ar'] || departmentNameData['en'] || JSON.stringify(departmentNameData);
            console.log('DEBUG: Object result:', result);
            return result;
        }
        // إذا كان نص عادي
        console.log('DEBUG: Plain text result:', departmentNameData);
        return departmentNameData || 'غير معروف';
    } catch (error) {
        console.error('DEBUG: Error in getDepartmentNameByLanguage:', error);
        // في حالة فشل التحليل، إرجاع النص كما هو
        return departmentNameData || 'غير معروف';
    }
}

// دالة مساعدة لاستخراج اسم المجلد باللغة المناسبة
function getFolderNameByLanguage(folderNameData, userLanguage = 'ar') {
  try {
    // 1) لو جاي كـ object بالفعل (ثنائي اللغة)
    if (typeof folderNameData === 'object' && folderNameData !== null) {
      return folderNameData[userLanguage]
        || folderNameData.ar
        || folderNameData.en
        || 'غير معروف';
    }

    // 2) لو جاي كنص JSON مسلسَل
    if (typeof folderNameData === 'string' && folderNameData.trim().startsWith('{')) {
      const parsed = JSON.parse(folderNameData);
      return parsed[userLanguage]
        || parsed.ar
        || parsed.en
        || 'غير معروف';
    }

    // 3) أي نص عادي
    return folderNameData || 'غير معروف';
  } catch (error) {
    // لو صار خطأ في التحليل
    return typeof folderNameData === 'string'
      ? folderNameData
      : 'غير معروف';
  }
}




// دالة مساعدة لاستخراج لغة المستخدم من التوكن
function getUserLanguageFromToken(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded.language || 'ar'; // افتراضي عربي
    } catch (error) {
        return 'ar'; // افتراضي عربي
    }
}

/**
 * GET /api/departments/:departmentId/folders
 */
const getFolders = async (req, res) => {
  try {
    // مصادقة
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) 
      return res.status(401).json({ message: 'غير مصرح.' });
    let decoded;
    try { decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: 'توكن غير صالح.' }); }

    // نقرأ departmentId من params
    const departmentId = req.params.departmentId;
    if (!departmentId) 
      return res.status(400).json({ message: 'معرف القسم مطلوب.' });

    const conn = await pool.getConnection();

    // تحقق من وجود القسم
    const [dept] = await conn.execute(
      'SELECT id, name FROM departments WHERE id = ? AND deleted_at IS NULL', 
      [departmentId]
    );
    if (!dept.length) {
      conn.release();
      return res.status(404).json({ message: 'القسم غير موجود.' });
    }

    // جلب المجلدات
    const [folders] = await conn.execute(
              `SELECT f.id, f.name, f.type, f.created_at, ${getFullNameSQLWithAliasAndFallback('u')} AS created_by
       FROM folders f
       LEFT JOIN users u ON u.id = f.created_by
       WHERE f.department_id = ? AND f.deleted_at IS NULL
       ORDER BY f.created_at DESC`,
      [departmentId]
    );

    conn.release();
    return res.json({
      message: 'تم جلب المجلدات بنجاح',
      department: { id: dept[0].id, name: dept[0].name },
      data: folders
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'خطأ في الخادم.' });
  }
};

/**
 * POST /api/departments/:departmentId/folders
 */
const createFolder = async (req, res) => {
  try {
    // مصادقة
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) 
      return res.status(401).json({ message: 'غير مصرح.' });
    let decoded;
    try { decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: 'توكن غير صالح.' }); }

    // اقرأ departmentId من params
    const departmentId = req.params.departmentId;
    const { name, type = 'public' } = req.body;
    
    console.log('DEBUG: folder name type:', typeof name);
    console.log('DEBUG: folder name value:', name);
    console.log('DEBUG: folder name JSON.stringify:', JSON.stringify(name));
    console.log('DEBUG: folder type:', type);
    
    if (!departmentId || !name) 
      return res.status(400).json({ message: 'معرف القسم واسم المجلد مطلوبان.' });

    // التحقق من صحة نوع المجلد
    if (!['public', 'private', 'shared'].includes(type)) {
      return res.status(400).json({ message: 'نوع المجلد غير صحيح. يجب أن يكون: public, private, أو shared.' });
    }

    const conn = await pool.getConnection();

    // تحقق من القسم
    const [dept] = await conn.execute(
      'SELECT id, name FROM departments WHERE id = ? AND deleted_at IS NULL', 
      [departmentId]
    );
    if (!dept.length) {
      conn.release();
      return res.status(404).json({ message: 'القسم غير موجود.' });
    }

    // جلب اسم القسم باللغة المناسبة
    const userLanguage = getUserLanguageFromToken(h.split(' ')[1]);
    console.log('DEBUG: userLanguage from token:', userLanguage);
    console.log('DEBUG: departmentNameData type:', typeof dept[0].name);
    console.log('DEBUG: departmentNameData value:', dept[0].name);
    const departmentName = getDepartmentNameByLanguage(dept[0].name, userLanguage);
    console.log('DEBUG: departmentName result:', departmentName);

    // تحقق عدم التكرار
    const [exists] = await conn.execute(
      'SELECT id FROM folders WHERE department_id = ? AND name = ? AND deleted_at IS NULL',
      [departmentId, name]
    );
    if (exists.length) {
      conn.release();
      return res.status(409).json({ message: 'المجلد موجود بالفعل.' });
    }

    // إضافة المجلد مع النوع
    const [result] = await conn.execute(
      `INSERT INTO folders 
         (name, department_id, created_by, type, created_at, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [name, departmentId, decoded.id, type]
    );

    conn.release();
    
    // ✅ تسجيل اللوق بعد نجاح إضافة المجلد
    try {
      const folderNameInLanguage = getFolderNameByLanguage(name, userLanguage);
      const departmentNameInLanguage = getDepartmentNameByLanguage(dept[0].name, userLanguage);
      
      console.log('DEBUG: dept[0].name type:', typeof dept[0].name);
      console.log('DEBUG: dept[0].name value:', dept[0].name);
      console.log('DEBUG: dept[0].name JSON.stringify:', JSON.stringify(dept[0].name));
      
      // إنشاء النص ثنائي اللغة
      const logDescription = {
        ar: `تم إنشاء مجلد باسم: ${getFolderNameByLanguage(name, 'ar')} في قسم: ${getDepartmentNameByLanguage(dept[0].name, 'ar')} (النوع: ${type === 'public' ? 'عام' : type === 'private' ? 'خاص' : 'مشترك'})`,
        en: `Created folder: ${getFolderNameByLanguage(name, 'en')} in department: ${getDepartmentNameByLanguage(dept[0].name, 'en')} (Type: ${type})`
      };
      
      console.log('DEBUG: Final log description:', logDescription);
      await logAction(decoded.id, 'create_folder', JSON.stringify(logDescription), 'folder', result.insertId);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }
    

    return res.status(201).json({
      message: 'تم إضافة المجلد بنجاح',
      folderId: result.insertId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'خطأ في الخادم.' });
  }
};

/**
 * PUT /api/folders/:folderId
 */
const updateFolder = async (req, res) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) 
      return res.status(401).json({ message: 'غير مصرح.' });
    let decoded;
    try {
      decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'توكن غير صالح.' });
    }

    const folderId = req.params.folderId;
    const { name, type } = req.body;

    if (!folderId || !name)
      return res.status(400).json({ message: 'معرف المجلد والاسم مطلوبان.' });

    // التحقق من صحة نوع المجلد إذا تم توفيره
    if (type && !['public', 'private', 'shared'].includes(type)) {
      return res.status(400).json({ message: 'نوع المجلد غير صحيح. يجب أن يكون: public, private, أو shared.' });
    }

    const conn = await pool.getConnection();

    // جلب المجلد القديم مع اسم القسم
    const [rows] = await conn.execute(
      'SELECT f.*, d.name as department_name FROM folders f JOIN departments d ON f.department_id = d.id WHERE f.id = ? AND f.deleted_at IS NULL AND d.deleted_at IS NULL', 
      [folderId]
    );
    if (!rows.length) {
      conn.release();
      return res.status(404).json({ message: 'المجلد غير موجود.' });
    }

    const oldName = rows[0].name;
    const oldType = rows[0].type || 'public';
    const departmentId = rows[0].department_id;

    // جلب اسم القسم باللغة المناسبة
    const userLanguage = getUserLanguageFromToken(h.split(' ')[1]);
    const departmentName = getDepartmentNameByLanguage(rows[0].department_name, userLanguage);

    // تحديث المجلد مع النوع إذا تم توفيره
    const updateType = type !== undefined;
    const finalType = type || oldType;
    
    await conn.execute(
      `UPDATE folders 
       SET name = ?, ${updateType ? 'type = ?,' : ''} updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      updateType ? [name, finalType, folderId] : [name, folderId]
    );

    conn.release();
    
    // ✅ تسجيل اللوق بعد نجاح تعديل المجلد
    try {
      const oldFolderNameInLanguage = getFolderNameByLanguage(oldName, userLanguage);
      const newFolderNameInLanguage = getFolderNameByLanguage(name, userLanguage);
      
      // إنشاء النص ثنائي اللغة
      const logDescription = {
        ar: `تم تعديل مجلد من: ${getFolderNameByLanguage(oldName, 'ar')} إلى: ${getFolderNameByLanguage(name, 'ar')} في قسم: ${getDepartmentNameByLanguage(rows[0].department_name, 'ar')}${updateType ? ` (النوع: ${finalType === 'public' ? 'عام' : finalType === 'private' ? 'خاص' : 'مشترك'})` : ''}`,
        en: `Updated folder from: ${getFolderNameByLanguage(oldName, 'en')} to: ${getFolderNameByLanguage(name, 'en')} in department: ${getDepartmentNameByLanguage(rows[0].department_name, 'en')}${updateType ? ` (Type: ${finalType})` : ''}`
      };
      
      await logAction(decoded.id, 'update_folder', JSON.stringify(logDescription), 'folder', folderId);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    res.json({ message: 'تم تحديث اسم المجلد بنجاح.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'خطأ أثناء تعديل المجلد.' });
  }
};

const getFolderById = async (req, res) => {
  try {
    const folderId = req.params.folderId;
    if (!folderId)
      return res.status(400).json({ message: 'معرف المجلد مطلوب.' });

    const conn = await pool.getConnection();

    const [rows] = await conn.execute(
      `SELECT 
         f.id, f.name AS title, f.department_id, f.type, f.created_at, f.updated_at,
                   ${getFullNameSQLWithAliasAndFallback('u')} AS created_by_username,
         d.name AS department_name
       FROM folders f
       LEFT JOIN users u ON f.created_by = u.id
       LEFT JOIN departments d ON f.department_id = d.id
       WHERE f.id = ? AND f.deleted_at IS NULL AND d.deleted_at IS NULL`,
      [folderId]
    );

    conn.release();

    if (!rows.length)
      return res.status(404).json({ message: 'المجلد غير موجود.' });

    res.json({ status: 'success', data: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'حدث خطأ في الخادم أثناء جلب المجلد.' });
  }
};


const deleteFolder = async (req, res) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) 
      return res.status(401).json({ message: 'غير مصرح.' });
    let decoded;
    try {
      decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'توكن غير صالح.' });
    }

    const folderId = req.params.folderId;
    if (!folderId) 
      return res.status(400).json({ message: 'معرف المجلد مطلوب.' });

    const conn = await pool.getConnection();

    // تحقق من وجود المجلد مع اسم القسم
    const [folder] = await conn.execute(
      'SELECT f.*, d.name as department_name FROM folders f JOIN departments d ON f.department_id = d.id WHERE f.id = ? AND f.deleted_at IS NULL AND d.deleted_at IS NULL', 
      [folderId]
    );
    if (!folder.length) {
      conn.release();
      return res.status(404).json({ message: 'المجلد غير موجود.' });
    }

    const folderName = folder[0].name;
    
    // جلب اسم القسم باللغة المناسبة
    const userLanguage = getUserLanguageFromToken(h.split(' ')[1]);
    const departmentName = getDepartmentNameByLanguage(folder[0].department_name, userLanguage);

    // حذف المجلد والمحتويات باستخدام soft delete
    const deleted = await softDeleteFolderWithContents(folderId, decoded.id);
    
    if (!deleted) {
      conn.release();
      return res.status(400).json({ message: 'فشل في حذف المجلد.' });
    }

    conn.release();
    
    // ✅ تسجيل اللوق بعد نجاح حذف المجلد
    try {
      const folderNameInLanguage = getFolderNameByLanguage(folderName, userLanguage);
      
      // إنشاء النص ثنائي اللغة
      const logDescription = {
        ar: `تم حذف مجلد: ${getFolderNameByLanguage(folderName, 'ar')} من قسم: ${getDepartmentNameByLanguage(folder[0].department_name, 'ar')}`,
        en: `Deleted folder: ${getFolderNameByLanguage(folderName, 'en')} from department: ${getDepartmentNameByLanguage(folder[0].department_name, 'en')}`
      };
      
      await logAction(decoded.id, 'delete_folder', JSON.stringify(logDescription), 'folder', folderId);
    } catch (logErr) {
      console.error('logAction error:', logErr);
    }

    return res.json({ message: 'تم حذف المجلد بنجاح.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'حدث خطأ في الخادم أثناء حذف المجلد.' });
  }
};
const getFolderNames = async (req, res) => {
  try {
    const conn = await pool.getConnection();
    const [rows] = await conn.execute('SELECT id, name FROM folder_names WHERE deleted_at IS NULL ORDER BY name ASC');
    conn.release();
    return res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'فشل جلب أسماء المجلدات.' });
  }
};
// دالة للتحقق من أن النص عربي
function isArabicText(text) {
    if (!text || typeof text !== 'string') return false;
    
    // نمط للكشف عن الحروف العربية
    const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    
    // التحقق من وجود حروف عربية
    const hasArabic = arabicPattern.test(text);
    
    // التحقق من أن النص يحتوي على حروف عربية أكثر من الحروف الإنجليزية
    const arabicCount = (text.match(arabicPattern) || []).length;
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    
    // إذا كان النص يحتوي على حروف عربية أكثر من الإنجليزية، فهو عربي
    return hasArabic && arabicCount > englishCount;
}

// دالة للتحقق من أن النص إنجليزي
function isEnglishText(text) {
    if (!text || typeof text !== 'string') return false;
    
    // نمط للكشف عن الحروف الإنجليزية
    const englishPattern = /[a-zA-Z]/;
    
    // التحقق من وجود حروف إنجليزية
    const hasEnglish = englishPattern.test(text);
    
    // التحقق من أن النص يحتوي على حروف إنجليزية أكثر من الحروف العربية
    const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
    const arabicCount = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/) || []).length;
    
    // إذا كان النص يحتوي على حروف إنجليزية أكثر من العربية، فهو إنجليزي
    return hasEnglish && englishCount > arabicCount;
}

// دالة للتحقق من صحة النص حسب اللغة المطلوبة
function validateTextLanguage(text, requiredLanguage) {
    if (!text || typeof text !== 'string') return false;
    
    if (requiredLanguage === 'ar') {
        return isArabicText(text);
    } else if (requiredLanguage === 'en') {
        return isEnglishText(text);
    }
    
    return true; // إذا لم تكن اللغة محددة، نسمح بأي نص
}const addFolderName = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ message: 'الاسم مطلوب.' });
  }

  // التحقق من صحة النص حسب اللغة
  let nameAr, nameEn;
  try {
    const parsedName = JSON.parse(name);
    nameAr = parsedName.ar;
    nameEn = parsedName.en;
    
    // التحقق من وجود النصوص
    if (!nameAr || !nameEn) {
      return res.status(400).json({
        status: 'error',
        message: 'يجب إدخال اسم المجلد باللغتين العربية والإنجليزية'
      });
    }

    // التحقق من أن النص العربي يحتوي على حروف عربية
    if (!validateTextLanguage(nameAr, 'ar')) {
      return res.status(400).json({
        status: 'error',
        message: `❌ خطأ في حقل "الاسم بالعربية": يجب إدخال النص باللغة العربية فقط.\nالنص المدخل: "${nameAr}"\n\nمثال صحيح: "مجلد التقارير" أو "مجلد السياسات"`
      });
    }

    // التحقق من أن النص الإنجليزي يحتوي على حروف إنجليزية
    if (!validateTextLanguage(nameEn, 'en')) {
      return res.status(400).json({
        status: 'error',
        message: `❌ خطأ في حقل "الاسم بالإنجليزية": يجب إدخال النص باللغة الإنجليزية فقط.\nالنص المدخل: "${nameEn}"\n\nمثال صحيح: "Reports Folder" أو "Policies Folder"`
      });
    }

  } catch (parseError) {
    return res.status(400).json({
      status: 'error',
      message: '❌ تنسيق اسم المجلد غير صحيح. يجب أن يكون باللغتين العربية والإنجليزية في تنسيق JSON صحيح'
    });
  }

  try {
    const conn = await pool.getConnection();
    
    // التحقق من عدم التكرار
    const [exists] = await conn.execute(
      'SELECT id FROM folder_names WHERE name = ? AND deleted_at IS NULL',
      [name]
    );
    if (exists.length > 0) {
      conn.release();
      return res.status(409).json({ 
        status: 'error',
        message: 'اسم المجلد موجود بالفعل' 
      });
    }
    
    const [result] = await conn.execute(
      'INSERT INTO folder_names (name) VALUES (?)',
      [name]
    );
    
    // ✅ تسجيل اللوق بعد نجاح إضافة اسم المجلد
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      
      try {
        const userLanguage = getUserLanguageFromToken(token);
        const folderNameInLanguage = getFolderNameByLanguage(name, userLanguage);
        
        // إنشاء النص ثنائي اللغة
        const logDescription = {
          ar: `تمت إضافة اسم مجلد جديد للأقسام: ${getFolderNameByLanguage(name, 'ar')}`,
          en: `Added new folder name for departments: ${getFolderNameByLanguage(name, 'en')}`
        };
        
        await logAction(
          userId,
          'add_folder_name',
          JSON.stringify(logDescription),
          'folder',
          result.insertId
        );
      } catch (logErr) {
        console.error('logAction error:', logErr);
      }
    }
    
    conn.release();

    return res.status(201).json({
      status: 'success',
      message: '✅ تم إضافة المجلد بنجاح',
      folderId: result.insertId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '❌ فشل في إضافة المجلد.' });
  }
};
const updateFolderName = async (req, res) => {
  const { id }   = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'الاسم الجديد مطلوب.' });

  // التحقق من صحة النص حسب اللغة
  let nameAr, nameEn;
  try {
    const parsedName = JSON.parse(name);
    nameAr = parsedName.ar;
    nameEn = parsedName.en;
    
    // التحقق من وجود النصوص
    if (!nameAr || !nameEn) {
      return res.status(400).json({
        status: 'error',
        message: 'يجب إدخال اسم المجلد باللغتين العربية والإنجليزية'
      });
    }

    // التحقق من أن النص العربي يحتوي على حروف عربية
    if (!validateTextLanguage(nameAr, 'ar')) {
      return res.status(400).json({
        status: 'error',
        message: `❌ خطأ في حقل "الاسم بالعربية": يجب إدخال النص باللغة العربية فقط.\nالنص المدخل: "${nameAr}"\n\nمثال صحيح: "مجلد التقارير" أو "مجلد السياسات"`
      });
    }

    // التحقق من أن النص الإنجليزي يحتوي على حروف إنجليزية
    if (!validateTextLanguage(nameEn, 'en')) {
      return res.status(400).json({
        status: 'error',
        message: `❌ خطأ في حقل "الاسم بالإنجليزية": يجب إدخال النص باللغة الإنجليزية فقط.\nالنص المدخل: "${nameEn}"\n\nمثال صحيح: "Reports Folder" أو "Policies Folder"`
      });
    }

  } catch (parseError) {
    return res.status(400).json({
      status: 'error',
      message: '❌ تنسيق اسم المجلد غير صحيح. يجب أن يكون باللغتين العربية والإنجليزية في تنسيق JSON صحيح'
    });
  }

  const conn = await pool.getConnection();
  try {
    // 1) جيب الاسم القديم
    const [rows] = await conn.execute(
      'SELECT name FROM folder_names WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    if (!rows.length) {
      conn.release();
      return res.status(404).json({ message: '❌ لم يتم العثور على اسم المجلد.' });
    }
    const oldName = rows[0].name;

    // التحقق من عدم التكرار مع الاسم الجديد
    const [exists] = await conn.execute(
      'SELECT id FROM folder_names WHERE name = ? AND id != ? AND deleted_at IS NULL',
      [name, id]
    );
    if (exists.length > 0) {
      conn.release();
      return res.status(409).json({ 
        status: 'error',
        message: 'اسم المجلد الجديد موجود بالفعل' 
      });
    }

    // 2) ابدأ معاملة علشان إذا فشل التحديث في أي مكان نرجع الحالة كما هي
    await conn.beginTransaction();

    // 3) تحديث الاسم في جدول folder_names
    await conn.execute(
      'UPDATE folder_names SET name = ? WHERE id = ?',
      [name, id]
    );

    // 4) — **الجديد** — تحديث كل المجلدات في جدول folders
    await conn.execute(
      'UPDATE folders SET name = ? WHERE name = ?',
      [name, oldName]
    );

    // 5) اكتمال المعاملة
    await conn.commit();

    // ✅ تسجيل اللوق بعد نجاح تعديل اسم المجلد
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const logDescription = {
        ar: `تم تعديل اسم مجلد للأقسام من: ${getFolderNameByLanguage(oldName, 'ar')} إلى: ${getFolderNameByLanguage(name, 'ar')}`,
        en: `Updated folder name for departments from: ${getFolderNameByLanguage(oldName, 'en')} to: ${getFolderNameByLanguage(name, 'en')}`
      };

      await logAction(
        userId,
        'update_folder_name',
        JSON.stringify(logDescription),
        'folder',
        id
      );
    }

    conn.release();
    return res.json({
      status: 'success',
      message: '✅ تم تعديل اسم المجلد وكل المجلدات المرتبطة بنجاح'
    });
  } catch (err) {
    // لو صار خطأ، نرجع كل شيء كما كان
    await conn.rollback();
    conn.release();
    console.error(err);
    return res.status(500).json({ message: '❌ فشل في تعديل المجلد.' });
  }
};


const deleteFolderName = async (req, res) => {
  const { id } = req.params;

  try {
    const conn = await pool.getConnection();
    
    // جلب الاسم قبل الحذف لتسجيله في اللوق
    const [nameRows] = await conn.execute('SELECT name FROM folder_names WHERE id = ? AND deleted_at IS NULL', [id]);
    if (nameRows.length === 0) {
      conn.release();
      return res.status(404).json({ message: '❌ اسم المجلد غير موجود أو تم حذفه مسبقاً.' });
    }
    const folderName = nameRows[0].name;
    
    const [result] = await conn.execute(
      'DELETE FROM folder_names WHERE id = ?',
      [id]
    );
    
    // ✅ تسجيل اللوق بعد نجاح حذف اسم المجلد
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      
      try {
        
        // إنشاء النص ثنائي اللغة
        const logDescription = {
          ar: `تم حذف اسم مجلد للأقسام: ${getFolderNameByLanguage(folderName, 'ar')}`,
          en: `Deleted folder name for departments: ${getFolderNameByLanguage(folderName, 'en')}`
        };
        
        await logAction(
          userId,
          'delete_folder_name',
          JSON.stringify(logDescription),
          'folder',
          id
        );
      } catch (logErr) {
        console.error('logAction error:', logErr);
      }

      // ✅ إرسال إشعار بحذف اسم المجلد
    }
    
    conn.release();

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '❌ المجلد غير موجود أو تم حذفه مسبقاً.' });
    }

    return res.json({
      status: 'success',
      message: '✅ تم حذف المجلد بنجاح'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '❌ فشل في حذف المجلد.' });
  }
};

/**
 * GET /api/folders/:folderId/shared-users
 * Get users who have access to a shared folder based on approval logs
 */
const getSharedUsersForFolder = async (req, res) => {
  try {
    // مصادقة
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) 
      return res.status(401).json({ message: 'غير مصرح.' });
    let decoded;
    try { decoded = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: 'توكن غير صالح.' }); }

    const folderId = req.params.folderId;
    if (!folderId) 
      return res.status(400).json({ message: 'معرف المجلد مطلوب.' });

    const conn = await pool.getConnection();

    // تحقق من وجود المجلد وأنه من نوع shared
    const [folder] = await conn.execute(
      'SELECT id, type FROM folders WHERE id = ? AND deleted_at IS NULL',
      [folderId]
    );
    
    if (!folder.length) {
      conn.release();
      return res.status(404).json({ message: 'المجلد غير موجود.' });
    }

    if (folder[0].type !== 'shared') {
      conn.release();
      return res.status(400).json({ message: 'هذا المجلد ليس من نوع مشترك.' });
    }

    // جلب المستخدمين الذين تم إرسال ملفات لهم للاعتماد في هذا المجلد
    const [sharedUsers] = await conn.execute(
      `SELECT DISTINCT u.id, u.username, u.email, u.first_name, u.second_name, u.third_name, u.last_name
       FROM users u
       JOIN approval_logs al ON u.id = al.approver_id
       JOIN contents c ON al.content_id = c.id
       WHERE c.folder_id = ? AND c.deleted_at IS NULL
       ORDER BY u.username`,
      [folderId]
    );

    conn.release();

    return res.json({
      message: 'تم جلب المستخدمين المشتركين بنجاح',
      data: sharedUsers
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'خطأ في الخادم.' });
  }
};


module.exports = {
  getFolders,
  createFolder,
  updateFolder,
  getFolderById,
  deleteFolder,
  getFolderNames,
  addFolderName,
  updateFolderName,
  deleteFolderName,
  getSharedUsersForFolder

};
