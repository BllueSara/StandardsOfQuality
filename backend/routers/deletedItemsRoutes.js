const express = require('express');
const router = express.Router();
const { getDeletedItems } = require('../utils/softDelete');
const { authenticateToken } = require('../controllers/authController');

/**
 * جلب العناصر المحذوفة للمستخدم الحالي
 * GET /api/deleted-items/:table
 */
router.get('/:table', authenticateToken, async (req, res) => {
    try {
        const { table } = req.params;
        const userId = req.user.id;
        

        // الجداول المسموح بها
        const allowedTables = [
            'departments', 
            // 'protocols', 
            'folders',
            'contents',

        ];
        
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                status: 'error',
                message: 'جدول غير مسموح'
            });
        }
        
        // جلب العناصر المحذوفة مع فلترة حسب المستخدم الحالي
        let deletedItems = [];
        
        switch (table) {
            case 'departments':
                // جلب الأقسام المحذوفة - نعرض فقط الأقسام التي حذفها المستخدم
                deletedItems = await getDeletedItemsByUser(table, userId, 'deleted_by');
                break;
                
            case 'folders':
                // جلب المجلدات المحذوفة التي حذفها المستخدم
                deletedItems = await getDeletedItemsByUser(table, userId, 'deleted_by');
                break;
                
            case 'contents':
                // جلب المحتويات المحذوفة التي حذفها المستخدم
                deletedItems = await getDeletedItemsByUser(table, userId, 'deleted_by');
                break;
                
            default:
                deletedItems = [];
        }
        
        
        res.status(200).json({
            status: 'success',
            data: deletedItems
        });
        
    } catch (error) {
        console.error('خطأ في جلب العناصر المحذوفة:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في جلب العناصر المحذوفة'
        });
    }
});

/**
 * دالة مساعدة لجلب العناصر المحذوفة حسب المستخدم
 */
async function getDeletedItemsByUser(table, userId, userField) {
    const { db } = require('../utils/softDelete');
    
    try {
        let query, params;
        
        if (userField) {
            // إذا كان هناك حقل userField، استخدمه في الفلترة
            query = `
                SELECT t.*, 
                       u.username as deleted_by_username
                FROM ${table} t
                LEFT JOIN users u ON u.id = t.deleted_by
                WHERE t.deleted_at IS NOT NULL 
                AND t.${userField} = ?
                ORDER BY t.deleted_at DESC
            `;
            params = [userId];
        } else {
            // إذا لم يكن هناك userField، جلب جميع العناصر المحذوفة (للمستخدمين المسؤولين)
            query = `
                SELECT t.*, 
                       u.username as deleted_by_username
                FROM ${table} t
                LEFT JOIN users u ON u.id = t.deleted_by
                WHERE t.deleted_at IS NOT NULL 
                ORDER BY t.deleted_at DESC
            `;
            params = [];
        }
        

        
        const [rows] = await db.execute(query, params);

        
        return rows;
    } catch (error) {
        console.error(`خطأ في جلب العناصر المحذوفة من ${table}:`, error);
        return [];
    }
}

/**
 * دالة مساعدة لجلب العناصر المحذوفة في اللجان حسب المستخدم
 */
async function getCommitteeDeletedItemsByUser(table, userId) {
    const { db } = require('../utils/softDelete');
    
    try {
        // جلب اللجان التي ينتمي إليها المستخدم
        const [userCommittees] = await db.execute(`
            SELECT committee_id FROM committee_users 
            WHERE user_id = ? AND deleted_at IS NULL
        `, [userId]);
        
        if (userCommittees.length === 0) {
            return [];
        }
        
        const committeeIds = userCommittees.map(c => c.committee_id);
        const placeholders = committeeIds.map(() => '?').join(',');
        
        const [rows] = await db.execute(`
            SELECT t.*, 
                   u.username as deleted_by_username,
                   c.name as committee_name
            FROM ${table} t
            LEFT JOIN users u ON u.id = t.deleted_by
            LEFT JOIN committees c ON c.id = t.committee_id
            WHERE t.deleted_at IS NOT NULL 
            AND t.committee_id IN (${placeholders})
            ORDER BY t.deleted_at DESC
        `, committeeIds);
        
        return rows;
    } catch (error) {
        console.error(`خطأ في جلب العناصر المحذوفة من ${table}:`, error);
        return [];
    }
}

/**
 * دالة مساعدة لجلب العناصر المحذوفة في الأقسام حسب المستخدم
 */
async function getDepartmentDeletedItemsByUser(table, userId) {
    const { db } = require('../utils/softDelete');
    
    try {
        // جلب القسم الذي ينتمي إليه المستخدم
        const [userDepartment] = await db.execute(`
            SELECT department_id FROM users 
            WHERE id = ? AND deleted_at IS NULL
        `, [userId]);
        
        if (userDepartment.length === 0 || !userDepartment[0].department_id) {
            return [];
        }
        
        const departmentId = userDepartment[0].department_id;
        
        // بناء الاستعلام حسب نوع الجدول
        let query, params;
        
        if (table === 'contents') {
            // جدول contents يحتوي على folder_id وليس department_id
            query = `
                SELECT t.*, 
                       u.username as deleted_by_username,
                       d.name as department_name
                FROM ${table} t
                LEFT JOIN users u ON u.id = t.deleted_by
                LEFT JOIN folders f ON f.id = t.folder_id
                LEFT JOIN departments d ON d.id = f.department_id
                WHERE t.deleted_at IS NOT NULL 
                AND f.department_id = ?
                ORDER BY t.deleted_at DESC
            `;
        } else {
            // الجداول الأخرى تحتوي على department_id مباشرة
            query = `
                SELECT t.*, 
                   u.username as deleted_by_username,
                   d.name as department_name
                FROM ${table} t
                LEFT JOIN users u ON u.id = t.deleted_by
                LEFT JOIN departments d ON d.id = t.department_id
                WHERE t.deleted_at IS NOT NULL 
                AND t.department_id = ?
                ORDER BY t.deleted_at DESC
            `;
        }
        
        params = [departmentId];
        const [rows] = await db.execute(query, params);
        
        return rows;
    } catch (error) {
        console.error(`خطأ في جلب العناصر المحذوفة من ${table}:`, error);
        return [];
    }
}

/**
 * دالة مساعدة لجلب التذاكر المحذوفة حسب المستخدم
 */
async function getTicketsDeletedItemsByUser(table, userId) {
    const { db } = require('../utils/softDelete');
    
    try {
        // جلب التذاكر المحذوفة التي أنشأها المستخدم أو المخصصة له
        const [rows] = await db.execute(`
            SELECT t.*, 
                   u.username as deleted_by_username
            FROM ${table} t
            LEFT JOIN users u ON u.id = t.deleted_by
            WHERE t.deleted_at IS NOT NULL 
            AND (t.created_by = ? OR t.assigned_to = ?)
            ORDER BY t.deleted_at DESC
        `, [userId, userId]);
        
        return rows;
    } catch (error) {
        console.error(`خطأ في جلب التذاكر المحذوفة من ${table}:`, error);
        return [];
    }
}

module.exports = router;
