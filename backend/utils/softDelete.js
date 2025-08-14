const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'StandardOfQuality'
});

/**
 * إضافة حقل deleted_at للجداول التي لا تحتويه
 */
const addSoftDeleteColumns = async () => {
    const tables = [
        'users',
        'departments', 
        'folders',
        'contents',
        'folder_names',
    ];

    for (const table of tables) {
        try {
            // تحقق من وجود العمود أولاً
            const [columns] = await db.execute(`SHOW COLUMNS FROM ${table} LIKE 'deleted_at'`);
            
            if (columns.length === 0) {
                // إضافة العمود إذا لم يكن موجوداً
                await db.execute(`
                    ALTER TABLE ${table} 
                    ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL,
                    ADD COLUMN deleted_by INT NULL DEFAULT NULL,
                    ADD INDEX idx_deleted_at (deleted_at)
                `);
                console.log(`✅ تم إضافة حقول soft delete إلى جدول ${table}`);
            } else {
                console.log(`⚠️ حقول soft delete موجودة بالفعل في جدول ${table}`);
            }
        } catch (error) {
            console.error(`❌ خطأ في إضافة حقول soft delete لجدول ${table}:`, error.message);
        }
    }
};

/**
 * دالة soft delete للجداول
 */
const softDelete = async (table, id, deletedBy = null) => {
    try {
        const [result] = await db.execute(`
            UPDATE ${table} 
            SET deleted_at = NOW(), deleted_by = ? 
            WHERE id = ? AND deleted_at IS NULL
        `, [deletedBy, id]);
        
        return result.affectedRows > 0;
    } catch (error) {
        console.error(`خطأ في soft delete من جدول ${table}:`, error);
        throw error;
    }
};

/**
 * دالة استرجاع العناصر المحذوفة
 */
const restoreDeleted = async (table, id) => {
    try {
        const [result] = await db.execute(`
            UPDATE ${table} 
            SET deleted_at = NULL, deleted_by = NULL 
            WHERE id = ? AND deleted_at IS NOT NULL
        `, [id]);
        
        return result.affectedRows > 0;
    } catch (error) {
        console.error(`خطأ في استرجاع من جدول ${table}:`, error);
        throw error;
    }
};

/**
 * دالة الحذف النهائي (للسوبر أدمن فقط)
 */
const permanentDelete = async (table, id) => {
    try {
        const [result] = await db.execute(`
            DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL
        `, [id]);
        
        return result.affectedRows > 0;
    } catch (error) {
        console.error(`خطأ في الحذف النهائي من جدول ${table}:`, error);
        throw error;
    }
};

/**
 * جلب العناصر المحذوفة لجدول معين
 */
const getDeletedItems = async (table, limit = 100, offset = 0) => {
    try {
        // تأكد من أن المعاملات أرقام ومنع SQL injection
        const numLimit = Math.max(1, Math.min(1000, parseInt(limit) || 100));
        const numOffset = Math.max(0, parseInt(offset) || 0);
        
        const [rows] = await db.execute(`
            SELECT t.*, 
                   u.username as deleted_by_username
            FROM ${table} t
            LEFT JOIN users u ON u.id = t.deleted_by
            WHERE t.deleted_at IS NOT NULL 
            ORDER BY t.deleted_at DESC 
            LIMIT ${numOffset}, ${numLimit}
        `);
        
        return rows;
    } catch (error) {
        console.error(`خطأ في جلب العناصر المحذوفة من جدول ${table}:`, error);
        throw error;
    }
};

/**
 * تعديل جميع الاستعلامات لتجاهل العناصر المحذوفة
 */
const addDeletedFilter = (sql, alias = '') => {
    const tablePrefix = alias ? `${alias}.` : '';
    
    // إذا كان الاستعلام يحتوي على WHERE clause
    if (sql.toLowerCase().includes('where')) {
        return sql.replace(
            /where/i,
            `WHERE ${tablePrefix}deleted_at IS NULL AND`
        );
    } else {
        // إذا لم يكن هناك WHERE clause
        return sql + ` WHERE ${tablePrefix}deleted_at IS NULL`;
    }
};

/**
 * إحصائيات العناصر المحذوفة
 */
const getDeletedStats = async () => {
    const tables = [
        'users', 'departments', 'folders', 'contents', 
        'job_names', 'job_titles', 'permissions', 'permissions_definitions'
    ];
    
    const stats = {};
    
    for (const table of tables) {
        try {
            const [result] = await db.execute(`
                SELECT COUNT(*) as count FROM ${table} WHERE deleted_at IS NOT NULL
            `);
            stats[table] = result[0].count;
        } catch (error) {
            stats[table] = 0;
        }
    }
    
    return stats;
};

/**
 * حذف متداخل للمجلدات والمحتويات
 */
const softDeleteFolderWithContents = async (folderId, deletedBy = null) => {
    try {
        // حذف المحتويات أولاً
        await db.execute(`
            UPDATE contents 
            SET deleted_at = NOW(), deleted_by = ? 
            WHERE folder_id = ? AND deleted_at IS NULL
        `, [deletedBy, folderId]);
        
        // ثم حذف المجلد
        const [result] = await db.execute(`
            UPDATE folders 
            SET deleted_at = NOW(), deleted_by = ? 
            WHERE id = ? AND deleted_at IS NULL
        `, [deletedBy, folderId]);
        
        return result.affectedRows > 0;
    } catch (error) {
        console.error('خطأ في حذف المجلد مع المحتويات:', error);
        throw error;
    }
};

/**
 * حذف متداخل للأقسام مع المجلدات والمحتويات
 */
const softDeleteDepartmentWithAll = async (departmentId, deletedBy = null) => {
    try {
        // حذف المحتويات أولاً
        await db.execute(`
            UPDATE contents c
            JOIN folders f ON c.folder_id = f.id
            SET c.deleted_at = NOW(), c.deleted_by = ? 
            WHERE f.department_id = ? AND c.deleted_at IS NULL
        `, [deletedBy, departmentId]);
        
        // حذف المجلدات
        await db.execute(`
            UPDATE folders 
            SET deleted_at = NOW(), deleted_by = ? 
            WHERE department_id = ? AND deleted_at IS NULL
        `, [deletedBy, departmentId]);
        
        // حذف القسم
        const [result] = await db.execute(`
            UPDATE departments 
            SET deleted_at = NOW(), deleted_by = ? 
            WHERE id = ? AND deleted_at IS NULL
        `, [deletedBy, departmentId]);
        
        return result.affectedRows > 0;
    } catch (error) {
        console.error('خطأ في حذف القسم مع كل شيء:', error);
        throw error;
    }
};

/**
 * استرجاع متداخل للمجلدات والمحتويات
 */
const restoreFolderWithContents = async (folderId) => {
    try {
        // استرجاع المحتويات أولاً
        await db.execute(`
            UPDATE contents 
            SET deleted_at = NULL, deleted_by = NULL 
            WHERE folder_id = ? AND deleted_at IS NOT NULL
        `, [folderId]);
        
        // ثم استرجاع المجلد
        const [result] = await db.execute(`
            UPDATE folders 
            SET deleted_at = NULL, deleted_by = NULL 
            WHERE id = ? AND deleted_at IS NOT NULL
        `, [folderId]);
        
        return result.affectedRows > 0;
    } catch (error) {
        console.error('خطأ في استرجاع المجلد مع المحتويات:', error);
        throw error;
    }
};

/**
 * استرجاع متداخل للأقسام مع المجلدات والمحتويات
 */
const restoreDepartmentWithAll = async (departmentId) => {
    try {
        // استرجاع المحتويات أولاً
        await db.execute(`
            UPDATE contents c
            JOIN folders f ON c.folder_id = f.id
            SET c.deleted_at = NULL, c.deleted_by = NULL 
            WHERE f.department_id = ? AND c.deleted_at IS NOT NULL
        `, [departmentId]);
        
        // استرجاع المجلدات
        await db.execute(`
            UPDATE folders 
            SET deleted_at = NULL, deleted_by = NULL 
            WHERE department_id = ? AND deleted_at IS NOT NULL
        `, [departmentId]);
        
        // استرجاع القسم
        const [result] = await db.execute(`
            UPDATE departments 
            SET deleted_at = NULL, deleted_by = NULL 
            WHERE id = ? AND deleted_at IS NOT NULL
        `, [departmentId]);
        
        return result.affectedRows > 0;
    } catch (error) {
        console.error('خطأ في استرجاع القسم مع كل شيء:', error);
        throw error;
    }
};

module.exports = {
    addSoftDeleteColumns,
    softDelete,
    restoreDeleted,
    permanentDelete,
    getDeletedItems,
    addDeletedFilter,
    getDeletedStats,
    softDeleteFolderWithContents,
    softDeleteDepartmentWithAll,
    restoreFolderWithContents,
    restoreDepartmentWithAll,
    db
};
