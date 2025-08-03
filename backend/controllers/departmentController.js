const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'Quality'
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
            if (userRole === 'admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments WHERE parent_id IS NULL ORDER BY type, name';
                params = [];
                console.log('🔍 Fetching main departments only (parent_id IS NULL)');
            } else {
                // إذا كان المستخدم ليس مسؤولاً ولديه صلاحية عرض قسمه الخاص، جلب قسمه الرئيسي فقط
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ? AND parent_id IS NULL';
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
            if (userRole === 'admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments';
                params = [];
                console.log('🔍 Fetching all departments (old system)');
            } else {
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ?';
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
            if (userRole === 'admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments ORDER BY parent_id ASC, type, name';
                params = [];
                console.log('🔍 Fetching all departments (main and sub) for admin/all users');
            } else {
                // إذا كان المستخدم ليس مسؤولاً ولديه صلاحية عرض قسمه الخاص، جلب قسمه فقط
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ?';
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
            if (userRole === 'admin' || !canViewOwnDepartment) {
                query = 'SELECT * FROM departments';
                params = [];
                console.log('🔍 Fetching all departments (old system)');
            } else {
                if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                    query = 'SELECT * FROM departments WHERE id = ?';
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
                'SELECT * FROM departments WHERE id = ?',
                [processedDepartmentId]
            );

            if (department.length === 0) {
                return res.status(404).json({ message: 'القسم/الإدارة غير موجود' });
            }

            // جلب التابعين
            const [subDepartments] = await db.execute(
                'SELECT * FROM departments WHERE parent_id = ? ORDER BY type, name',
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
        const { name, type, parentId, hasSubDepartments } = req.body;
        const imagePath = req.file ? req.file.path.replace(/\\/g, '/') : '';

        console.log('🔍 Received data:', { name, type, parentId, hasSubDepartments, hasImage: !!imagePath });

        if (!name || !type) {
            return res.status(400).json({
                status: 'error',
                message: 'اسم القسم/الإدارة والنوع مطلوبان'
            });
        }

        // التحقق من صحة النوع
        if (!['department', 'administration'].includes(type)) {
            return res.status(400).json({
                status: 'error',
                message: 'النوع يجب أن يكون قسم أو إدارة'
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
                'SELECT id FROM departments WHERE name = ? AND parent_id = ?',
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
                    const typeText = type === 'department' ? 'قسم' : 'إدارة';
                    
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
                'SELECT id FROM departments WHERE name = ?',
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
        const { name, type, parentId, hasSubDepartments } = req.body;
        const imagePath = req.file ? req.file.path.replace(/\\/g, '/') : '';

        if (!name || !type) {
            return res.status(400).json({
                status: 'error',
                message: 'اسم القسم/الإدارة والنوع مطلوبان للتعديل'
            });
        }

        // التحقق من صحة النوع
        if (!['department', 'administration'].includes(type)) {
            return res.status(400).json({
                status: 'error',
                message: 'النوع يجب أن يكون قسم أو إدارة'
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
                'SELECT name, type FROM departments WHERE id = ?',
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
                    const typeText = type === 'department' ? 'قسم' : 'إدارة';
                    const oldTypeText = oldType === 'department' ? 'قسم' : 'إدارة';
                    
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
                'SELECT name FROM departments WHERE id = ?',
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
                'SELECT name, type FROM departments WHERE id = ?',
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
                'SELECT COUNT(*) as count FROM departments WHERE parent_id = ?',
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
                'SELECT COUNT(*) as count FROM folders f JOIN contents c ON f.id = c.folder_id WHERE f.department_id = ?',
                [processedId]
            );

            if (relatedContents[0].count > 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'لا يمكن حذف القسم/الإدارة لوجود محتويات مرتبطة به'
                });
            }

            const [result] = await db.execute(
                'DELETE FROM departments WHERE id = ?',
                [processedId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم/الإدارة غير موجود'
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
                'SELECT name FROM departments WHERE id = ?',
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
                'SELECT COUNT(*) as count FROM folders f JOIN contents c ON f.id = c.folder_id WHERE f.department_id = ?',
                [processedId]
            );

            if (relatedContents[0].count > 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'لا يمكن حذف القسم لوجود محتويات مرتبطة به'
                });
            }

            const [result] = await db.execute(
                'DELETE FROM departments WHERE id = ?',
                [processedId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    status: 'error',
                    message: 'القسم غير موجود'
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
    const [rows] = await db.query('SELECT approval_sequence FROM departments WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Department not found' });

    let approvalSequence2 = [];
    const rawSeq = rows[0].approval_sequence;
    if (Array.isArray(rawSeq)) {
      approvalSequence2 = rawSeq;
    } else if (typeof rawSeq === 'string') {
      try {
        approvalSequence2 = JSON.parse(rawSeq);
      } catch {
        approvalSequence2 = [];
      }
    } else {
      approvalSequence2 = [];
    }

    res.json({ approval_sequence: approvalSequence2 });
  } catch (err) {
    console.error('getApprovalSequence error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// تحديث سلسلة الاعتماد لقسم
const updateApprovalSequence = async (req, res) => {
  try {
    const { id } = req.params;
    const { approval_sequence } = req.body;
    if (!Array.isArray(approval_sequence)) return res.status(400).json({ message: 'approval_sequence must be array' });
    const [rows] = await db.query('SELECT id FROM departments WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Department not found' });
    await db.query('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(approval_sequence), id]);
    res.json({ message: 'Approval sequence updated' });
  } catch (err) {
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