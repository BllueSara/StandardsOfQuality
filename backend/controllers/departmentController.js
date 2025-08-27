const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const { softDeleteDepartmentWithAll } = require('../utils/softDelete');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'StandardOfQuality'
});
const { logAction } = require('../models/logger');
const { insertNotification } = require('../models/notfications-utils');

// دالة مساعدة لاستخراج اسم القسم باللغة المناسبة
function getDepartmentNameByLanguage(departmentNameData, userLanguage = 'ar') {
    try {
        // إذا كان الاسم JSON يحتوي على اللغتين
        if (typeof departmentNameData === 'string' && departmentNameData.startsWith('{')) {
            const parsed = JSON.parse(departmentNameData);
            return parsed[userLanguage] || parsed['ar'] || departmentNameData;
        }
        // إذا كان نص عادي
        return departmentNameData || 'غير معروف';
    } catch (error) {
        // في حالة فشل التحليل، إرجاع النص كما هو
        return departmentNameData || 'غير معروف';
    }
}
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

// دالة مساعدة لحساب مستوى القسم/الإدارة
async function calculateLevel(parentId) {
    if (!parentId) return 0;
    
    // معالجة parentId
    let processedParentId = null;
    if (parentId && parentId !== 'null' && parentId !== '') {
        processedParentId = parseInt(parentId);
        if (isNaN(processedParentId)) {
            return 0;
        }
    } else {
        return 0;
    }
    
    // التحقق من وجود عمود level في الجدول
    const [columns] = await db.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'departments' 
        AND COLUMN_NAME = 'level'
    `);

    const hasLevelColumn = columns.length > 0;

    if (hasLevelColumn) {
        const [parent] = await db.execute(
            'SELECT level FROM departments WHERE id = ?',
            [processedParentId]
        );
        
        return parent.length > 0 ? parent[0].level + 1 : 0;
    } else {
        // النظام القديم - بدون level
        return 0;
    }
}

const getDepartments = async (req, res) => {
    try {
        // استخراج معلومات المستخدم من التوكن
        const token = req.headers.authorization?.split(' ')[1];
        let userId = null;
        let userRole = null;
        let userDepartmentId = null;
        let canViewOwnDepartment = false;
        
        console.log('🔍 Getting main departments for token:', !!token);

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
                userRole = decoded.role;
                userDepartmentId = decoded.department_id;

                console.log('🔍 User info:', { userId, userRole, userDepartmentId });

                // جلب صلاحيات المستخدم
                const [permRows] = await db.execute(`
                    SELECT p.permission_key
                    FROM permissions p
                    JOIN user_permissions up ON up.permission_id = p.id
                    WHERE up.user_id = ?
                `, [userId]);
                
                const userPermissions = new Set(permRows.map(r => r.permission_key));
                canViewOwnDepartment = userPermissions.has('view_own_department');

                console.log('🔍 User permissions:', Array.from(userPermissions));
                console.log('🔍 Can view own department:', canViewOwnDepartment);
            } catch (error) {
                console.error('Error decoding token:', error);
            }
        }

        let query, params;

        // التحقق من وجود عمود parent_id في الجدول
        const [columns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'departments' 
            AND COLUMN_NAME = 'parent_id'
        `);

        const hasParentIdColumn = columns.length > 0;

        if (hasParentIdColumn) {
            // النظام الجديد - مع parent_id: دائماً جلب الأقسام الرئيسية فقط (parent_id IS NULL)
            if (userRole === 'admin' || userRole === 'super_admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY type, name';
                params = [];
                console.log('🔍 Fetching main departments only (parent_id IS NULL)');
            } else {
                // إذا كان المستخدم ليس مسؤولاً ولديه صلاحية عرض قسمه الخاص، جلب قسمه الرئيسي فقط
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ? AND parent_id IS NULL AND deleted_at IS NULL';
                    params = [userDepartmentId];
                    console.log('🔍 Fetching user\'s main department only:', userDepartmentId);
                } else {
                    query = 'SELECT * FROM departments WHERE 1 = 0'; // لا يوجد قسم مخصص، إرجاع نتيجة فارغة
                    params = [];
                    console.log('🔍 No departmentId assigned - returning empty result');
                }
            }
        } else {
            // النظام القديم - بدون parent_id
            if (userRole === 'admin' || userRole === 'super_admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments WHERE deleted_at IS NULL';
                params = [];
                console.log('🔍 Fetching all departments (old system)');
            } else {
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL';
                    params = [userDepartmentId];
                    console.log('🔍 Fetching user department:', userDepartmentId);
                } else {
                    query = 'SELECT * FROM departments WHERE 1 = 0';
                    params = [];
                    console.log('🔍 No departmentId assigned - returning empty result');
                }
            }
        }

        console.log('🔍 Final query for main departments:', query);
        console.log('🔍 Final params for main departments:', params);

        const [rows] = await db.execute(query, params);
        console.log('✅ Fetched main departments:', rows.length);
        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('❌ Error in getDepartments:', error);
        res.status(500).json({ message: 'خطأ في جلب الأقسام الرئيسية' });
    }
};

// دالة جديدة لجلب جميع الأقسام (الرئيسية والفرعية)
const getAllDepartments = async (req, res) => {
    try {
        // استخراج معلومات المستخدم من التوكن
        const token = req.headers.authorization?.split(' ')[1];
        let userId = null;
        let userRole = null;
        let userDepartmentId = null;
        let canViewOwnDepartment = false;

        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
                userRole = decoded.role;
                userDepartmentId = decoded.department_id;

                console.log('🔍 User info for getAllDepartments:', { userId, userRole, userDepartmentId });

                // جلب صلاحيات المستخدم
                const [permRows] = await db.execute(`
                    SELECT p.permission_key
                    FROM permissions p
                    JOIN user_permissions up ON up.permission_id = p.id
                    WHERE up.user_id = ?
                `, [userId]);
                
                const userPermissions = new Set(permRows.map(r => r.permission_key));
                canViewOwnDepartment = userPermissions.has('view_own_department');

                console.log('🔍 User permissions for getAllDepartments:', Array.from(userPermissions));
                console.log('🔍 Can view own department:', canViewOwnDepartment);
            } catch (error) {
                console.error('Error decoding token:', error);
            }
        }

        let query, params;

        // التحقق من وجود عمود parent_id في الجدول
        const [columns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'departments' 
            AND COLUMN_NAME = 'parent_id'
        `);

        const hasParentIdColumn = columns.length > 0;

        if (hasParentIdColumn) {
            // النظام الجديد - مع parent_id: جلب جميع الأقسام (الرئيسية والفرعية)
            if (userRole === 'admin' || userRole === 'super_admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments WHERE deleted_at IS NULL ORDER BY parent_id ASC, type, name';
                params = [];
                console.log('🔍 Fetching all departments (main and sub) for admin/all users');
            } else {
                // إذا كان المستخدم ليس مسؤولاً ولديه صلاحية عرض قسمه الخاص، جلب قسمه فقط
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL';
                    params = [userDepartmentId];
                    console.log('🔍 Fetching user\'s department only:', userDepartmentId);
                } else {
                    query = 'SELECT * FROM departments WHERE 1 = 0'; // لا يوجد قسم مخصص، إرجاع نتيجة فارغة
                    params = [];
                    console.log('🔍 No departmentId assigned - returning empty result');
                }
            }
        } else {
            // النظام القديم - بدون parent_id: جلب جميع الأقسام (للتوافق مع الأنظمة القديمة)
            if (userRole === 'admin' || userRole === 'super_admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments WHERE deleted_at IS NULL';
                params = [];
                console.log('🔍 Fetching all departments (old system)');
            } else {
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL';
                    params = [userDepartmentId];
                    console.log('🔍 Fetching user department (old system):', userDepartmentId);
                } else {
                    query = 'SELECT * FROM departments WHERE 1 = 0';
                    params = [];
                    console.log('🔍 No departmentId assigned - returning empty result');
                }
            }
        }

        console.log('🔍 Final query for getAllDepartments:', query);
        console.log('🔍 Final params for getAllDepartments:', params);

        const [rows] = await db.execute(query, params);
        console.log('✅ Fetched all departments:', rows.length);
        res.status(200).json({
            success: true,
            data: rows
        });
    } catch (error) {
        console.error('❌ Error in getAllDepartments:', error);
        res.status(500).json({ message: 'خطأ في جلب جميع الأقسام' });
    }
};

// دالة جديدة لجلب التابعين
const getSubDepartments = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'غير مصرح' });
        }

        // معالجة departmentId
        let processedDepartmentId = null;
        if (departmentId && departmentId !== 'null' && departmentId !== '') {
            processedDepartmentId = parseInt(departmentId);
            if (isNaN(processedDepartmentId)) {
                return res.status(400).json({ 
                    message: 'معرف القسم/الإدارة غير صحيح' 
                });
            }
        } else {
            return res.status(400).json({ 
                message: 'معرف القسم/الإدارة مطلوب' 
            });
        }

        // التحقق من وجود عمود parent_id في الجدول
        const [columns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'departments' 
            AND COLUMN_NAME = 'parent_id'
        `);

        const hasParentIdColumn = columns.length > 0;

        if (hasParentIdColumn) {
            // النظام الجديد - مع parent_id
            // التحقق من وجود القسم/الإدارة
            const [department] = await db.execute(
                'SELECT * FROM departments WHERE id = ? AND deleted_at IS NULL',
                [processedDepartmentId]
            );

            if (department.length === 0) {
                return res.status(404).json({ message: 'القسم/الإدارة غير موجود' });
            }

            // جلب التابعين
            const [subDepartments] = await db.execute(
                'SELECT * FROM departments WHERE parent_id = ? AND deleted_at IS NULL ORDER BY type, name',
                [processedDepartmentId]
            );

            res.status(200).json({
                success: true,
                data: subDepartments,
                parent: department[0]
            });
        } else {
            // النظام القديم - بدون parent_id
            return res.status(400).json({ 
                message: 'النظام الحالي لا يدعم التابعين. يرجى تحديث قاعدة البيانات أولاً.' 
            });
        }
    } catch (error) {
        console.error('❌ Error in getSubDepartments:', error);
        res.status(500).json({ message: 'خطأ في جلب التابعين' });
    }
};


const addDepartment = async (req, res) => {
    try {
        const { name, type, parentId, hasSubDepartments, existingImage } = req.body;
        let imagePath = '';
        
        // معالجة الصور
        if (req.file) {
            // صورة جديدة تم رفعها
            imagePath = req.file.path.replace(/\\/g, '/');
            console.log('🔍 New image uploaded:', imagePath);
        } else if (existingImage) {
            // صورة موجودة تم اختيارها
            imagePath = existingImage;
            console.log('🔍 Existing image selected:', imagePath);
        }

        console.log('🔍 Received data:', { name, type, parentId, hasSubDepartments, hasImage: !!imagePath, imagePath });

        if (!name || !type) {
            return res.status(400).json({
                status: 'error',
                message: 'اسم القسم/الإدارة والنوع مطلوبان'
            });
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
                    message: 'يجب إدخال اسم القسم/الإدارة باللغتين العربية والإنجليزية'
                });
            }

            // التحقق من أن النص العربي يحتوي على حروف عربية
            if (!validateTextLanguage(nameAr, 'ar')) {
                return res.status(400).json({
                    status: 'error',
                    message: `❌ خطأ في حقل "الاسم بالعربية": يجب إدخال النص باللغة العربية فقط.\nالنص المدخل: "${nameAr}"\n\nمثال صحيح: "قسم الجودة" أو "إدارة الموارد البشرية"`
                });
            }

            // التحقق من أن النص الإنجليزي يحتوي على حروف إنجليزية
            if (!validateTextLanguage(nameEn, 'en')) {
                return res.status(400).json({
                    status: 'error',
                    message: `❌ خطأ في حقل "الاسم بالإنجليزية": يجب إدخال النص باللغة الإنجليزية فقط.\nالنص المدخل: "${nameEn}"\n\nمثال صحيح: "Quality Department" أو "Human Resources Administration"`
                });
            }

        } catch (parseError) {
            return res.status(400).json({
                status: 'error',
                message: '❌ تنسيق اسم القسم/الإدارة غير صحيح. يجب أن يكون باللغتين العربية والإنجليزية في تنسيق JSON صحيح'
            });
        }

        // التحقق من صحة النوع
        if (!['department', 'administration', 'executive_administration'].includes(type)) {
            return res.status(400).json({
                status: 'error',
                message: 'النوع يجب أن يكون قسم أو إدارة أو إدارة تنفيذية'
            });
        }

        // معالجة parentId
        let processedParentId = null;
        if (parentId && parentId !== 'null' && parentId !== '') {
            processedParentId = parseInt(parentId);
            if (isNaN(processedParentId)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'معرف القسم/الإدارة الأب غير صحيح'
                });
            }
        }

        // التحقق من وجود عمود parent_id في الجدول
        const [columns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'departments' 
            AND COLUMN_NAME = 'parent_id'
        `);

        const hasParentIdColumn = columns.length > 0;

        if (hasParentIdColumn) {
            // النظام الجديد - مع parent_id
            // التحقق من وجود القسم/الإدارة
            const [existingDepartments] = await db.execute(
                'SELECT id FROM departments WHERE name = ? AND parent_id = ? AND deleted_at IS NULL',
                [name, processedParentId]
            );

            if (existingDepartments.length > 0) {
                return res.status(409).json({
                    status: 'error',
                    message: 'هذا القسم/الإدارة موجود بالفعل'
                });
            }

            // حساب المستوى
            const level = await calculateLevel(processedParentId);

            // معالجة hasSubDepartments
            const processedHasSubDepartments = hasSubDepartments === 'true' || hasSubDepartments === true ? 1 : 0;

            // دائماً نرسل عمود image مع NULL إذا لم تكن هناك صورة
            const query = 'INSERT INTO departments (name, image, type, parent_id, level, has_sub_departments, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)';
            const params = [name, imagePath, type, processedParentId, level, processedHasSubDepartments];
            console.log('🔍 Using query:', query);
            console.log('🔍 Params:', params);

            const [result] = await db.execute(query, params);

            // ✅ تسجيل اللوق بعد نجاح إضافة القسم
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.id;
                
                try {
                    const userLanguage = getUserLanguageFromToken(token);
                    let typeText;
                    if (type === 'department') {
                        typeText = 'قسم';
                    } else if (type === 'administration') {
                        typeText = 'إدارة';
                    } else if (type === 'executive_administration') {
                        typeText = 'إدارة تنفيذية';
                    } else {
                        typeText = 'قسم/إدارة';
                    }
                    
                    // إنشاء النص ثنائي اللغة
                    const logDescription = {
                        ar: `تم إضافة ${typeText} جديد: ${getDepartmentNameByLanguage(name, 'ar')}`,
                        en: `Added new ${type}: ${getDepartmentNameByLanguage(name, 'en')}`
                    };
                    
                    await logAction(
                        userId,
                        'add_department',
                        JSON.stringify(logDescription),
                        'department',
                        result.insertId
                    );
                } catch (logErr) {
                    console.error('logAction error:', logErr);
                }
            }

            res.status(201).json({
                status: 'success',
                message: `تم إضافة ${type === 'department' ? 'القسم' : 'الإدارة'} بنجاح`,
                departmentId: result.insertId
            });

        } else {
            // النظام القديم - بدون parent_id
            // التحقق من وجود القسم/الإدارة
            const [existingDepartments] = await db.execute(
                'SELECT id FROM departments WHERE name = ? AND deleted_at IS NULL',
                [name]
            );

            if (existingDepartments.length > 0) {
                return res.status(409).json({
                    status: 'error',
                    message: 'هذا القسم/الإدارة موجود بالفعل'
                });
            }

            // دائماً نرسل عمود image مع NULL إذا لم تكن هناك صورة
            const query = 'INSERT INTO departments (name, image, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)';
            const params = [name, imagePath];
            console.log('🔍 Using old system query:', query);
            console.log('🔍 Old system params:', params);

            const [result] = await db.execute(query, params);

            // ✅ تسجيل اللوق بعد نجاح إضافة القسم
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.id;
                
                try {
                    const userLanguage = getUserLanguageFromToken(token);
                    
                    // إنشاء النص ثنائي اللغة
                    const logDescription = {
                        ar: `تم إضافة قسم جديد: ${getDepartmentNameByLanguage(name, 'ar')}`,
                        en: `Added new department: ${getDepartmentNameByLanguage(name, 'en')}`
                    };
                    
                    await logAction(
                        userId,
                        'add_department',
                        JSON.stringify(logDescription),
                        'department',
                        result.insertId
                    );
                } catch (logErr) {
                    console.error('logAction error:', logErr);
                }
            }

            res.status(201).json({
                status: 'success',
                message: 'تم إضافة القسم بنجاح',
                departmentId: result.insertId
            });
        }

    } catch (error) {
        console.error('Error in addDepartment:', error);
        res.status(500).json({ message: 'خطأ في إضافة القسم/الإدارة' });
    }
};

const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, parentId, hasSubDepartments, existingImage, currentImage } = req.body;
        let imagePath = '';
        
        // معالجة الصور
        if (req.file) {
            // صورة جديدة تم رفعها
            imagePath = req.file.path.replace(/\\/g, '/');
            console.log('🔍 New image uploaded:', imagePath);
        } else if (existingImage) {
            // صورة موجودة تم اختيارها
            imagePath = existingImage;
            console.log('🔍 Existing image selected:', imagePath);
        } else if (currentImage) {
            // الاحتفاظ بالصورة الحالية
            imagePath = currentImage;
            console.log('🔍 Keeping current image:', imagePath);
        }

        console.log('🔍 Update data:', { id, name, type, parentId, hasSubDepartments, hasImage: !!imagePath, imagePath });

        if (!name || !type) {
            return res.status(400).json({
                status: 'error',
                message: 'اسم القسم/الإدارة والنوع مطلوبان للتعديل'
            });
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
                    message: 'يجب إدخال اسم القسم/الإدارة باللغتين العربية والإنجليزية'
                });
            }

            // التحقق من أن النص العربي يحتوي على حروف عربية
            if (!validateTextLanguage(nameAr, 'ar')) {
                return res.status(400).json({
                    status: 'error',
                    message: `❌ خطأ في حقل "الاسم بالعربية": يجب إدخال النص باللغة العربية فقط.\nالنص المدخل: "${nameAr}"\n\nمثال صحيح: "قسم الجودة" أو "إدارة الموارد البشرية"`
                });
            }

            // التحقق من أن النص الإنجليزي يحتوي على حروف إنجليزية
            if (!validateTextLanguage(nameEn, 'en')) {
                return res.status(400).json({
                    status: 'error',
                    message: `❌ خطأ في حقل "الاسم بالإنجليزية": يجب إدخال النص باللغة الإنجليزية فقط.\nالنص المدخل: "${nameEn}"\n\nمثال صحيح: "Quality Department" أو "Human Resources Administration"`
                });
            }

        } catch (parseError) {
            return res.status(400).json({
                status: 'error',
                message: '❌ تنسيق اسم القسم/الإدارة غير صحيح. يجب أن يكون باللغتين العربية والإنجليزية في تنسيق JSON صحيح'
            });
        }

        // التحقق من صحة النوع
        if (!['department', 'administration', 'executive_administration'].includes(type)) {
            return res.status(400).json({
                status: 'error',
                message: 'النوع يجب أن يكون قسم أو إدارة أو إدارة تنفيذية'
            });
        }

        // معالجة id
        let processedId = null;
        if (id && id !== 'null' && id !== '') {
            processedId = parseInt(id);
            if (isNaN(processedId)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'معرف القسم/الإدارة غير صحيح'
                });
            }
        } else {
            return res.status(400).json({
                status: 'error',
                message: 'معرف القسم/الإدارة مطلوب'
            });
        }

        // معالجة parentId
        let processedParentId = null;
        if (parentId && parentId !== 'null' && parentId !== '') {
            processedParentId = parseInt(parentId);
            if (isNaN(processedParentId)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'معرف القسم/الإدارة الأب غير صحيح'
                });
            }
        }

        // التحقق من وجود عمود parent_id في الجدول
        const [columns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'departments' 
            AND COLUMN_NAME = 'parent_id'
        `);

        const hasParentIdColumn = columns.length > 0;

        if (hasParentIdColumn) {
            // النظام الجديد - مع parent_id
            // جلب الاسم القديم قبل التحديث
            const [oldDepartment] = await db.execute(
                'SELECT name, type FROM departments WHERE id = ? AND deleted_at IS NULL',
                [processedId]
            );

            if (oldDepartment.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم/الإدارة غير موجود'
                });
            }

            const oldName = oldDepartment[0].name;
            const oldType = oldDepartment[0].type;

            // حساب المستوى الجديد
            const level = await calculateLevel(processedParentId);

            // معالجة hasSubDepartments
            const processedHasSubDepartments = hasSubDepartments === 'true' || hasSubDepartments === true ? 1 : 0;

            let query = 'UPDATE departments SET name = ?, type = ?, parent_id = ?, level = ?, has_sub_departments = ?, image = ?, updated_at = CURRENT_TIMESTAMP';
            let params = [name, type, processedParentId, level, processedHasSubDepartments, imagePath];

            query += ' WHERE id = ?';
            params.push(processedId);

            const [result] = await db.execute(query, params);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم/الإدارة غير موجود'
                });
            }

            // ✅ تسجيل اللوق بعد نجاح تعديل القسم
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.id;
                
                try {
                    const userLanguage = getUserLanguageFromToken(token);
                    let typeText, oldTypeText;
                    
                    if (type === 'department') {
                        typeText = 'قسم';
                    } else if (type === 'administration') {
                        typeText = 'إدارة';
                    } else if (type === 'executive_administration') {
                        typeText = 'إدارة تنفيذية';
                    } else {
                        typeText = 'قسم/إدارة';
                    }
                    
                    if (oldType === 'department') {
                        oldTypeText = 'قسم';
                    } else if (oldType === 'administration') {
                        oldTypeText = 'إدارة';
                    } else if (oldType === 'executive_administration') {
                        oldTypeText = 'إدارة تنفيذية';
                    } else {
                        oldTypeText = 'قسم/إدارة';
                    }
                    
                    // إنشاء النص ثنائي اللغة
                    const logDescription = {
                        ar: `تم تعديل ${oldTypeText} من: ${getDepartmentNameByLanguage(oldName, 'ar')} إلى ${typeText}: ${getDepartmentNameByLanguage(name, 'ar')}`,
                        en: `Updated ${oldType} from: ${getDepartmentNameByLanguage(oldName, 'en')} to ${type}: ${getDepartmentNameByLanguage(name, 'en')}`
                    };
                    
                    await logAction(
                        userId,
                        'update_department',
                        JSON.stringify(logDescription),
                        'department',
                        processedId
                    );
                } catch (logErr) {
                    console.error('logAction error:', logErr);
                }
            }

            res.status(200).json({
                status: 'success',
                message: `تم تعديل ${type === 'department' ? 'القسم' : 'الإدارة'} بنجاح`
            });

        } else {
            // النظام القديم - بدون parent_id
            // جلب الاسم القديم قبل التحديث
            const [oldDepartment] = await db.execute(
                'SELECT name FROM departments WHERE id = ? AND deleted_at IS NULL',
                [processedId]
            );

            if (oldDepartment.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم غير موجود'
                });
            }

            const oldName = oldDepartment[0].name;

            let query = 'UPDATE departments SET name = ?, image = ?, updated_at = CURRENT_TIMESTAMP';
            let params = [name, imagePath];

            query += ' WHERE id = ?';
            params.push(processedId);

            const [result] = await db.execute(query, params);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم غير موجود'
                });
            }

            // ✅ تسجيل اللوق بعد نجاح تعديل القسم
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.id;
                
                try {
                    const userLanguage = getUserLanguageFromToken(token);
                    
                    // إنشاء النص ثنائي اللغة
                    const logDescription = {
                        ar: `تم تعديل قسم من: ${getDepartmentNameByLanguage(oldName, 'ar')} إلى: ${getDepartmentNameByLanguage(name, 'ar')}`,
                        en: `Updated department from: ${getDepartmentNameByLanguage(oldName, 'en')} to: ${getDepartmentNameByLanguage(name, 'en')}`
                    };
                    
                    await logAction(
                        userId,
                        'update_department',
                        JSON.stringify(logDescription),
                        'department',
                        processedId
                    );
                } catch (logErr) {
                    console.error('logAction error:', logErr);
                }
            }

            res.status(200).json({
                status: 'success',
                message: 'تم تعديل القسم بنجاح'
            });
        }

    } catch (error) {
        console.error('Error in updateDepartment:', error);
        res.status(500).json({ message: 'خطأ في تعديل القسم/الإدارة' });
    }
};

const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;

        // معالجة id
        let processedId = null;
        if (id && id !== 'null' && id !== '') {
            processedId = parseInt(id);
            if (isNaN(processedId)) {
                return res.status(400).json({
                    status: 'error',
                    message: 'معرف القسم/الإدارة غير صحيح'
                });
            }
        } else {
            return res.status(400).json({
                status: 'error',
                message: 'معرف القسم/الإدارة مطلوب'
            });
        }

        // التحقق من وجود عمود parent_id في الجدول
        const [columns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'departments' 
            AND COLUMN_NAME = 'parent_id'
        `);

        const hasParentIdColumn = columns.length > 0;

        if (hasParentIdColumn) {
            // النظام الجديد - مع parent_id
            // جلب اسم القسم قبل الحذف
            const [department] = await db.execute(
                'SELECT name, type FROM departments WHERE id = ? AND deleted_at IS NULL',
                [processedId]
            );

            if (department.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم/الإدارة غير موجود'
                });
            }

            const departmentName = department[0].name;
            const departmentType = department[0].type;

            // التحقق من وجود تابعين
            const [subDepartments] = await db.execute(
                'SELECT COUNT(*) as count FROM departments WHERE parent_id = ? AND deleted_at IS NULL',
                [processedId]
            );

            if (subDepartments[0].count > 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'لا يمكن حذف القسم/الإدارة لوجود تابعين مرتبطين به'
                });
            }

            // التحقق من وجود محتويات مرتبطة بالقسم
            const [relatedContents] = await db.execute(
                'SELECT COUNT(*) as count FROM folders f JOIN contents c ON f.id = c.folder_id WHERE f.department_id = ? AND f.deleted_at IS NULL AND c.deleted_at IS NULL',
                [processedId]
            );

            if (relatedContents[0].count > 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'لا يمكن حذف القسم/الإدارة لوجود محتويات مرتبطة به'
                });
            }

            // حذف القسم باستخدام soft delete
            const deleted = await softDeleteDepartmentWithAll(processedId, userId);
            
            if (!deleted) {
                return res.status(400).json({
                    status: 'error',
                    message: 'فشل في حذف القسم/الإدارة'
                });
            }

            // ✅ تسجيل اللوق بعد نجاح حذف القسم
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.id;
                
                try {
                    const userLanguage = getUserLanguageFromToken(token);
                    const typeText = departmentType === 'department' ? 'قسم' : 'إدارة';
                    
                    // إنشاء النص ثنائي اللغة
                    const logDescription = {
                        ar: `تم حذف ${typeText}: ${getDepartmentNameByLanguage(departmentName, 'ar')}`,
                        en: `Deleted ${departmentType}: ${getDepartmentNameByLanguage(departmentName, 'en')}`
                    };
                    
                    await logAction(
                        userId,
                        'delete_department',
                        JSON.stringify(logDescription),
                        'department',
                        processedId
                    );
                } catch (logErr) {
                    console.error('logAction error:', logErr);
                }
            }

            res.status(200).json({
                status: 'success',
                message: `تم حذف ${departmentType === 'department' ? 'القسم' : 'الإدارة'} بنجاح`
            });

        } else {
            // النظام القديم - بدون parent_id
            // جلب اسم القسم قبل الحذف
            const [department] = await db.execute(
                'SELECT name FROM departments WHERE id = ? AND deleted_at IS NULL',
                [processedId]
            );

            if (department.length === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم غير موجود'
                });
            }

            const departmentName = department[0].name;

            // التحقق من وجود محتويات مرتبطة بالقسم
            const [relatedContents] = await db.execute(
                'SELECT COUNT(*) as count FROM folders f JOIN contents c ON f.id = c.folder_id WHERE f.department_id = ? AND f.deleted_at IS NULL AND c.deleted_at IS NULL',
                [processedId]
            );

            if (relatedContents[0].count > 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'لا يمكن حذف القسم لوجود محتويات مرتبطة به'
                });
            }

            // حذف القسم باستخدام soft delete
            const deleted = await softDeleteDepartmentWithAll(processedId, userId);
            
            if (!deleted) {
                return res.status(400).json({
                    status: 'error',
                    message: 'فشل في حذف القسم'
                });
            }

            // ✅ تسجيل اللوق بعد نجاح حذف القسم
            const token = req.headers.authorization?.split(' ')[1];
            if (token) {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const userId = decoded.id;
                
                try {
                    const userLanguage = getUserLanguageFromToken(token);
                    
                    // إنشاء النص ثنائي اللغة
                    const logDescription = {
                        ar: `تم حذف قسم: ${getDepartmentNameByLanguage(departmentName, 'ar')}`,
                        en: `Deleted department: ${getDepartmentNameByLanguage(departmentName, 'en')}`
                    };
                    
                    await logAction(
                        userId,
                        'delete_department',
                        JSON.stringify(logDescription),
                        'department',
                        processedId
                    );
                } catch (logErr) {
                    console.error('logAction error:', logErr);
                }
            }

            res.status(200).json({
                status: 'success',
                message: 'تم حذف القسم بنجاح'
            });
        }

    } catch (error) {
        console.error('Error in deleteDepartment:', error);
        res.status(500).json({ message: 'خطأ في حذف القسم/الإدارة' });
    }
};

// جلب سلسلة الاعتماد لقسم
const getApprovalSequence = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query('SELECT approval_sequence, approval_roles FROM departments WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Department not found' });

    let approvalSequence = [];
    let approvalRoles = [];
    
    // معالجة تسلسل الموافقة
    const rawSeq = rows[0].approval_sequence;
    if (Array.isArray(rawSeq)) {
      approvalSequence = rawSeq;
    } else if (typeof rawSeq === 'string') {
      try {
        approvalSequence = JSON.parse(rawSeq);
      } catch {
        approvalSequence = [];
      }
    } else {
      approvalSequence = [];
    }
    
    // معالجة الأدوار
    const rawRoles = rows[0].approval_roles;
    if (Array.isArray(rawRoles)) {
      approvalRoles = rawRoles;
    } else if (typeof rawRoles === 'string') {
      try {
        approvalRoles = JSON.parse(rawRoles);
      } catch {
        approvalRoles = [];
      }
    } else {
      approvalRoles = [];
    }

    res.json({ 
      approval_sequence: approvalSequence,
      approval_roles: approvalRoles
    });
  } catch (err) {
    console.error('getApprovalSequence error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// تحديث سلسلة الاعتماد لقسم
const updateApprovalSequence = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_sequence, approval_roles } = req.body;
    
    if (!Array.isArray(approval_sequence)) {
      return res.status(400).json({ message: 'approval_sequence must be array' });
    }
    
    if (!Array.isArray(approval_roles)) {
      return res.status(400).json({ message: 'approval_roles must be array' });
    }
    
    // التحقق من أن عدد الأدوار يساوي عدد الأشخاص في التسلسل
    if (approval_sequence.length !== approval_roles.length) {
      return res.status(400).json({ 
        message: 'Number of roles must match number of people in sequence' 
      });
    }
    
    const [rows] = await db.query('SELECT id FROM departments WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Department not found' });
    
    // تحديث كل من التسلسل والأدوار
    await db.query(
      'UPDATE departments SET approval_sequence = ?, approval_roles = ? WHERE id = ?', 
      [JSON.stringify(approval_sequence), JSON.stringify(approval_roles), id]
    );
    
    res.json({ 
      message: 'Approval sequence and roles updated successfully',
      approval_sequence: approval_sequence,
      approval_roles: approval_roles
    });
  } catch (err) {
    console.error('updateApprovalSequence error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
    getDepartments,
    getAllDepartments,
    getSubDepartments,
    addDepartment,
    updateDepartment,
    deleteDepartment,
    getApprovalSequence,
    updateApprovalSequence
}; 