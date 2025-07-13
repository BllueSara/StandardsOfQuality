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

const getDepartments = async (req, res) => {
    try {
        // استخراج معلومات المستخدم من التوكن
        const token = req.headers.authorization?.split(' ')[1];
        let userId = null;
        let userRole = null;
        let userDepartmentId = null;
        let canViewOwnDepartment = false;

        console.log('🔍 Getting departments for token:', !!token);

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

        let query = 'SELECT * FROM departments';
        let params = [];

        // إذا كان المستخدم admin أو ليس لديه صلاحية view_own_department، اجلب كل الأقسام
        if (userRole === 'admin' || !canViewOwnDepartment) {
            query = 'SELECT * FROM departments';
            console.log('🔍 Fetching all departments (admin or no permission)');
        } else {
            // إذا كان لديه صلاحية view_own_department، تحقق من وجود departmentId
            if (userDepartmentId && userDepartmentId !== null && userDepartmentId !== undefined && userDepartmentId !== '') {
                query = 'SELECT * FROM departments WHERE id = ?';
                params = [userDepartmentId];
                console.log('🔍 Fetching user department:', userDepartmentId);
            } else {
                // إذا لم يكن لديه departmentId، لا تعرض أي أقسام
                query = 'SELECT * FROM departments WHERE 1 = 0'; // This will return empty result
                console.log('🔍 No departmentId assigned - returning empty result');
            }
        }

        console.log('🔍 Final query:', query);
        console.log('🔍 Final params:', params);

        const [rows] = await db.execute(query, params);
        console.log('✅ Fetched departments:', rows.length);
        res.status(200).json(rows);
    } catch (error) {
        console.error('❌ Error in getDepartments:', error);
        res.status(500).json({ message: 'خطأ في جلب الأقسام' });
    }
};

const addDepartment = async (req, res) => {
    try {
        const { name } = req.body;
        const imagePath = req.file ? req.file.path.replace(/\\/g, '/') : null;

        if (!name || !imagePath) {
            return res.status(400).json({
                status: 'error',
                message: 'اسم القسم والصورة مطلوبان'
            });
        }

        // التحقق مما إذا كان القسم موجودًا بالفعل
        const [existingDepartments] = await db.execute(
            'SELECT id FROM departments WHERE name = ?',
            [name]
        );

        if (existingDepartments.length > 0) {
            return res.status(409).json({
                status: 'error',
                message: 'هذا القسم موجود بالفعل'
            });
        }

        const [result] = await db.execute(
            'INSERT INTO departments (name, image, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
            [name, imagePath]
        );

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

    } catch (error) {
        res.status(500).json({ message: 'خطأ في إضافة القسم' });
    }
};

const updateDepartment = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        const imagePath = req.file ? req.file.path.replace(/\\/g, '/') : null;

        if (!name) {
            return res.status(400).json({
                status: 'error',
                message: 'اسم القسم مطلوب للتعديل'
            });
        }

        // جلب الاسم القديم قبل التحديث
        const [oldDepartment] = await db.execute(
            'SELECT name FROM departments WHERE id = ?',
            [id]
        );

        if (oldDepartment.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'القسم غير موجود'
            });
        }

        const oldName = oldDepartment[0].name;

        let query = 'UPDATE departments SET name = ?, updated_at = CURRENT_TIMESTAMP';
        let params = [name];

        if (imagePath) {
            query += ', image = ?';
            params.push(imagePath);
        }

        query += ' WHERE id = ?';
        params.push(id);

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
                    id
                );
            } catch (logErr) {
                console.error('logAction error:', logErr);
            }
        }

        res.status(200).json({
            status: 'success',
            message: 'تم تعديل القسم بنجاح'
        });

    } catch (error) {
        res.status(500).json({ message: 'خطأ في تعديل القسم' });
    }
};

const deleteDepartment = async (req, res) => {
    try {
        const { id } = req.params;

        // جلب اسم القسم قبل الحذف
        const [department] = await db.execute(
            'SELECT name FROM departments WHERE id = ?',
            [id]
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
            [id]
        );

        if (relatedContents[0].count > 0) {
            return res.status(400).json({
                status: 'error',
                message: 'لا يمكن حذف القسم لوجود محتويات مرتبطة به'
            });
        }

        const [result] = await db.execute(
            'DELETE FROM departments WHERE id = ?',
            [id]
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
                    id
                );
            } catch (logErr) {
                console.error('logAction error:', logErr);
            }
        }

        res.status(200).json({
            status: 'success',
            message: 'تم حذف القسم بنجاح'
        });

    } catch (error) {
        res.status(500).json({ message: 'خطأ في حذف القسم' });
    }
};

module.exports = {
    getDepartments,
    addDepartment,
    updateDepartment,
    deleteDepartment
}; 