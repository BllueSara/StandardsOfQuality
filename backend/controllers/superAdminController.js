const jwt = require('jsonwebtoken');
const { 
    getDeletedItems, 
    restoreDeleted, 
    permanentDelete, 
    getDeletedStats,
    softDeleteFolderWithContents,
    softDeleteDepartmentWithAll,
    restoreFolderWithContents,
    restoreDepartmentWithAll,
    db 
} = require('../utils/softDelete');
const { logAction } = require('../models/logger');

/**
 * التحقق من صلاحيات السوبر أدمن
 */
const checkSuperAdminAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                status: 'error', 
                message: 'رمز التحقق مطلوب' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        if (decoded.role !== 'admin') {
            return res.status(403).json({ 
                status: 'error', 
                message: 'غير مسموح - يتطلب صلاحيات السوبر أدمن' 
            });
        }

        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            status: 'error', 
            message: 'رمز التحقق غير صحيح' 
        });
    }
};

/**
 * جلب إحصائيات العناصر المحذوفة
 */
const getDeletedStatistics = async (req, res) => {
    try {
        const stats = await getDeletedStats();
        
        res.status(200).json({
            status: 'success',
            data: stats
        });
    } catch (error) {
        console.error('خطأ في جلب إحصائيات العناصر المحذوفة:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في جلب الإحصائيات'
        });
    }
};

/**
 * جلب جميع العناصر المحذوفة من جميع الجداول
 */
const getAllDeletedItems = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        let allDeletedItems = [];
        let totalDeleted = 0;
        
        // جلب العناصر المحذوفة من جميع الجداول
        for (const table of allowedTables) {
            try {
                let selectQuery;
                
                // تحديد الاستعلام المناسب لكل جدول
                switch (table) {
                    case 'departments':
                        selectQuery = `
                            SELECT 
                                id,
                                COALESCE(name, CONCAT('قسم رقم ', id)) as display_name,
                                name,
                                NULL as username,
                                NULL as email,
                                created_at,
                                deleted_at,
                                deleted_by
                            FROM ${table} 
                            WHERE deleted_at IS NOT NULL
                            ORDER BY deleted_at DESC
                            LIMIT ${parseInt(limit)} OFFSET ${offset}
                        `;
                        break;
                        
                    case 'folders':
                        selectQuery = `
                            SELECT 
                                id,
                                COALESCE(name, CONCAT('مجلد رقم ', id)) as display_name,
                                name,
                                NULL as username,
                                NULL as email,
                                created_at,
                                deleted_at,
                                deleted_by
                            FROM ${table} 
                            WHERE deleted_at IS NOT NULL
                            ORDER BY deleted_at DESC
                            LIMIT ${parseInt(limit)} OFFSET ${offset}
                        `;
                        break;
                        
                    case 'contents':
                        selectQuery = `
                            SELECT 
                                id,
                                COALESCE(title, CONCAT('محتوى رقم ', id)) as display_name,
                                NULL as name,
                                title,
                                NULL as username,
                                NULL as email,
                                created_at,
                                deleted_at,
                                deleted_by
                            FROM ${table} 
                            WHERE deleted_at IS NOT NULL
                            ORDER BY deleted_at DESC
                            LIMIT ${parseInt(limit)} OFFSET ${offset}
                        `;
                        break;
                        
                    case 'folder_names':
                        selectQuery = `
                            SELECT 
                                id,
                                COALESCE(name, CONCAT('اسم مجلد رقم ', id)) as display_name,
                                name,
                                NULL as username,
                                NULL as email,
                                NULL as created_at,
                                deleted_at,
                                deleted_by
                            FROM ${table} 
                            WHERE deleted_at IS NOT NULL
                            ORDER BY deleted_at DESC
                            LIMIT ${parseInt(limit)} OFFSET ${offset}
                        `;
                        break;
                        
                    default:
                        selectQuery = `
                            SELECT 
                                id,
                                id as display_name,
                                NULL as name,
                                NULL as title,
                                NULL as username,
                                NULL as email,
                                NULL as created_at,
                                deleted_at,
                                '${table}' as table_name
                            FROM ${table} 
                            WHERE deleted_at IS NOT NULL
                            ORDER BY deleted_at DESC
                            LIMIT ${parseInt(limit)} OFFSET ${offset}
                        `;
                }
                
                const [items] = await db.execute(selectQuery);
                
                // إضافة معلومات المستخدم الذي حذف العنصر
                const itemsWithUserInfo = await Promise.all(items.map(async (item) => {
                    // التأكد من تعيين table_name بشكل صحيح
                    item.table_name = table;
                    
                    if (item.deleted_by) {
                        try {
                            const [userResult] = await db.execute(`
                                SELECT username FROM users WHERE id = ?
                            `, [item.deleted_by]);
                            item.deleted_by_username = userResult[0]?.username || 'غير محدد';
                        } catch (err) {
                            item.deleted_by_username = 'غير محدد';
                        }
                    } else {
                        item.deleted_by_username = 'غير محدد';
                    }
                    
                    // التأكد من وجود display_name
                    if (!item.display_name) {
                        item.display_name = item.name || item.title || `العنصر رقم ${item.id}`;
                    }
                    
                    return item;
                }));
                
                allDeletedItems.push(...itemsWithUserInfo);
                
                // حساب العدد الإجمالي
                const [countResult] = await db.execute(`
                    SELECT COUNT(*) as total FROM ${table} WHERE deleted_at IS NOT NULL
                `);
                totalDeleted += countResult[0].total;
                
            } catch (tableError) {
                console.error(`خطأ في جلب العناصر من جدول ${table}:`, tableError);
                // استمر مع الجداول الأخرى
            }
        }
        
        // ترتيب جميع العناصر حسب تاريخ الحذف
        allDeletedItems.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
        
        // تطبيق الصفحات
        const startIndex = offset;
        const endIndex = startIndex + parseInt(limit);
        const paginatedItems = allDeletedItems.slice(startIndex, endIndex);
        
        // التأكد من أن جميع العناصر تحتوي على table_name
        res.status(200).json({
            status: 'success',
            data: {
                items: paginatedItems,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(totalDeleted / limit),
                    total_items: totalDeleted,
                    per_page: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('خطأ في جلب جميع العناصر المحذوفة:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في جلب جميع العناصر المحذوفة'
        });
    }
};

/**
 * جلب العناصر المحذوفة من جدول معين
 */
const getDeletedItemsByTable = async (req, res) => {
    try {
        const { table } = req.params;
        const { page = 1, limit = 20 } = req.query;
        
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                status: 'error',
                message: 'جدول غير مسموح'
            });
        }
        
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let selectQuery;
        
        // تحديد الاستعلام المناسب لكل جدول
        switch (table) {
            case 'departments':
                selectQuery = `
                    SELECT 
                        id,
                        COALESCE(name, CONCAT('قسم رقم ', id)) as display_name,
                        name,
                        NULL as username,
                        NULL as email,
                        created_at,
                        deleted_at,
                        deleted_by
                    FROM ${table} 
                    WHERE deleted_at IS NOT NULL
                    ORDER BY deleted_at DESC
                    LIMIT ${parseInt(limit)} OFFSET ${offset}
                `;
                break;
                
            case 'folders':
                selectQuery = `
                    SELECT 
                        id,
                        COALESCE(name, CONCAT('مجلد رقم ', id)) as display_name,
                        name,
                        NULL as username,
                        NULL as email,
                        created_at,
                        deleted_at,
                        deleted_by
                    FROM ${table} 
                    WHERE deleted_at IS NOT NULL
                    ORDER BY deleted_at DESC
                    LIMIT ${parseInt(limit)} OFFSET ${offset}
                `;
                break;
                
            case 'contents':
                selectQuery = `
                    SELECT 
                        id,
                        COALESCE(title, CONCAT('محتوى رقم ', id)) as display_name,
                        NULL as name,
                        title,
                        NULL as username,
                        NULL as email,
                        created_at,
                        deleted_at,
                        deleted_by
                    FROM ${table} 
                    WHERE deleted_at IS NOT NULL
                    ORDER BY deleted_at DESC
                    LIMIT ${parseInt(limit)} OFFSET ${offset}
                `;
                break;
                
            case 'folder_names':
                selectQuery = `
                    SELECT 
                        id,
                        COALESCE(name, CONCAT('اسم مجلد رقم ', id)) as display_name,
                        name,
                        NULL as username,
                        NULL as email,
                        NULL as created_at,
                        deleted_at,
                        deleted_by
                    FROM ${table} 
                    WHERE deleted_at IS NOT NULL
                    ORDER BY deleted_at DESC
                    LIMIT ${parseInt(limit)} OFFSET ${offset}
                `;
                break;
                
            default:
                selectQuery = `
                    SELECT 
                        id,
                        id as display_name,
                        NULL as name,
                        NULL as title,
                        NULL as username,
                        NULL as email,
                        NULL as created_at,
                        deleted_at,
                        '${table}' as table_name
                    FROM ${table} 
                    WHERE deleted_at IS NOT NULL
                    ORDER BY deleted_at DESC
                    LIMIT ${parseInt(limit)} OFFSET ${offset}
                `;
        }
        
        const [deletedItems] = await db.execute(selectQuery);
        
        // إضافة معلومات المستخدم الذي حذف العنصر
        const itemsWithUserInfo = await Promise.all(deletedItems.map(async (item) => {
            // التأكد من تعيين table_name بشكل صحيح
            item.table_name = table;
            
            if (item.deleted_by) {
                try {
                    const [userResult] = await db.execute(`
                        SELECT username FROM users WHERE id = ?
                    `, [item.deleted_by]);
                    item.deleted_by_username = userResult[0]?.username || 'غير محدد';
                } catch (err) {
                    item.deleted_by_username = 'غير محدد';
                }
            } else {
                item.deleted_by_username = 'غير محدد';
            }
            
            // التأكد من وجود display_name
            if (!item.display_name) {
                item.display_name = item.name || item.title || `العنصر رقم ${item.id}`;
            }
            
            return item;
        }));
        
        // جلب العدد الإجمالي
        const [totalResult] = await db.execute(`
            SELECT COUNT(*) as total FROM ${table} WHERE deleted_at IS NOT NULL
        `);
        const total = totalResult[0].total;
        
        res.status(200).json({
            status: 'success',
            data: {
                items: itemsWithUserInfo,
                pagination: {
                    current_page: parseInt(page),
                    total_pages: Math.ceil(total / limit),
                    total_items: total,
                    per_page: parseInt(limit)
                }
            }
        });
    } catch (error) {
        console.error('خطأ في جلب العناصر المحذوفة:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في جلب العناصر المحذوفة'
        });
    }
};

/**
 * استرجاع عنصر محذوف
 */
const restoreDeletedItem = async (req, res) => {
    try {
        const { table, id } = req.params;
        
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                status: 'error',
                message: 'جدول غير مسموح'
            });
        }
        
        // جلب تفاصيل العنصر قبل الاسترجاع
        const [itemDetails] = await db.execute(`
            SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL
        `, [id]);
        
        if (itemDetails.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'العنصر غير موجود أو غير محذوف'
            });
        }
        
        let restored = false;
        
        // استرجاع متداخل حسب نوع الجدول
        if (table === 'departments') {
            restored = await restoreDepartmentWithAll(id);
        } else if (table === 'folders') {
            restored = await restoreFolderWithContents(id);
        } else {
            restored = await restoreDeleted(table, id);
        }
        
        if (!restored) {
            return res.status(400).json({
                status: 'error',
                message: 'فشل في استرجاع العنصر'
            });
        }
        
        // // تسجيل عملية الاسترجاع
        // try {
        //     const itemName = itemDetails[0].name || itemDetails[0].title || itemDetails[0].username || `ID: ${id}`;
        //     const logDescription = {
        //         ar: `تم استرجاع ${getTableNameAr(table)}: ${itemName}`,
        //         en: `Restored ${table}: ${itemName}`
        //     };
            
        //     await logAction(
        //         req.user.id,
        //         'update',
        //         JSON.stringify(logDescription),
        //         table,
        //         id
        //     );
        // } catch (logErr) {
        //     console.error('خطأ في تسجيل عملية الاسترجاع:', logErr);
        // }
        
        res.status(200).json({
            status: 'success',
            message: 'تم استرجاع العنصر بنجاح'
        });
    } catch (error) {
        console.error('خطأ في استرجاع العنصر:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في استرجاع العنصر'
        });
    }
};

/**
 * حذف عنصر نهائياً
 */
const permanentDeleteItem = async (req, res) => {
    try {
        const { table, id } = req.params;
        
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                status: 'error',
                message: 'جدول غير مسموح'
            });
        }
        
        // جلب تفاصيل العنصر قبل الحذف النهائي
        const [itemDetails] = await db.execute(`
            SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL
        `, [id]);
        
        if (itemDetails.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: 'العنصر غير موجود أو غير محذوف'
            });
        }
        
        // حذف نهائي مع التعامل مع الملفات المرفقة
        await handleFileCleanup(table, itemDetails[0]);
        
        const deleted = await permanentDelete(table, id);
        
        if (!deleted) {
            return res.status(400).json({
                status: 'error',
                message: 'فشل في الحذف النهائي'
            });
        }
        
        // // تسجيل عملية الحذف النهائي
        // try {
        //     const itemName = itemDetails[0].name || itemDetails[0].title || itemDetails[0].username || `ID: ${id}`;
        //     const logDescription = {
        //         ar: `تم حذف ${getTableNameAr(table)} نهائياً: ${itemName}`,
        //         en: `Permanently deleted ${table}: ${itemName}`
        //     };
            
        //     await logAction(
        //         req.user.id,
        //         'permanent_delete',
        //         JSON.stringify(logDescription),
        //         table,
        //         id
        //     );
        // } catch (logErr) {
        //     console.error('خطأ في تسجيل عملية الحذف النهائي:', logErr);
        // }
        
        res.status(200).json({
            status: 'success',
            message: 'تم حذف العنصر نهائياً'
        });
    } catch (error) {
        console.error('خطأ في الحذف النهائي:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في الحذف النهائي'
        });
    }
};

/**
 * حذف جميع العناصر المحذوفة لجدول معين نهائياً
 */
const permanentDeleteAllByTable = async (req, res) => {
    try {
        const { table } = req.params;
        
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                status: 'error',
                message: 'جدول غير مسموح'
            });
        }
        
        // حذف جميع العناصر المحذوفة نهائياً
        const [result] = await db.execute(`
            DELETE FROM ${table} WHERE deleted_at IS NOT NULL
        `);
        
        res.status(200).json({
            status: 'success',
            message: `تم حذف ${result.affectedRows} عنصر نهائياً من جدول ${table}`,
            deleted_count: result.affectedRows
        });
    } catch (error) {
        console.error('خطأ في حذف جميع العناصر:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في حذف جميع العناصر'
        });
    }
};

/**
 * استرجاع جميع العناصر المحذوفة من جدول معين
 */
const restoreAllItemsByTable = async (req, res) => {
    try {
        const { table } = req.params;
        
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                status: 'error',
                message: 'جدول غير مسموح'
            });
        }
        
        // استرجاع جميع العناصر المحذوفة
        const [result] = await db.execute(`
            UPDATE ${table} 
            SET deleted_at = NULL, deleted_by = NULL 
            WHERE deleted_at IS NOT NULL
        `);
        
        res.status(200).json({
            status: 'success',
            message: `تم استرجاع ${result.affectedRows} عنصر من جدول ${table}`,
            restored_count: result.affectedRows
        });
    } catch (error) {
        console.error('خطأ في استرجاع جميع العناصر:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في استرجاع جميع العناصر'
        });
    }
};

/**
 * استرجاع جميع العناصر المحذوفة من جميع الجداول
 */
const restoreAllItems = async (req, res) => {
    try {
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        let totalRestored = 0;
        
        // استرجاع العناصر من جميع الجداول
        for (const table of allowedTables) {
            try {
                const [result] = await db.execute(`
                    UPDATE ${table} 
                    SET deleted_at = NULL, deleted_by = NULL 
                    WHERE deleted_at IS NOT NULL
                `);
                totalRestored += result.affectedRows;
            } catch (tableError) {
                console.error(`خطأ في استرجاع العناصر من جدول ${table}:`, tableError);
                // استمر مع الجداول الأخرى
            }
        }
        
        res.status(200).json({
            status: 'success',
            message: `تم استرجاع ${totalRestored} عنصر من جميع الجداول`,
            restored_count: totalRestored
        });
    } catch (error) {
        console.error('خطأ في استرجاع جميع العناصر:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في استرجاع جميع العناصر'
        });
    }
};

/**
 * حذف جميع العناصر المحذوفة من جميع الجداول نهائياً
 */
const permanentDeleteAllItems = async (req, res) => {
    try {
        const allowedTables = [
            'departments', 'folders', 'contents', 'folder_names'
        ];
        
        let totalDeleted = 0;
        
        // حذف العناصر من جميع الجداول
        for (const table of allowedTables) {
            try {
                const [result] = await db.execute(`
                    DELETE FROM ${table} WHERE deleted_at IS NOT NULL
                `);
                totalDeleted += result.affectedRows;
            } catch (tableError) {
                console.error(`خطأ في حذف العناصر من جدول ${table}:`, tableError);
                // استمر مع الجداول الأخرى
            }
        }
        
        res.status(200).json({
            status: 'success',
            message: `تم حذف ${totalDeleted} عنصر نهائياً من جميع الجداول`,
            deleted_count: totalDeleted
        });
    } catch (error) {
        console.error('خطأ في حذف جميع العناصر:', error);
        res.status(500).json({
            status: 'error',
            message: 'حدث خطأ في حذف جميع العناصر'
        });
    }
};

/**
 * تنظيف الملفات المرتبطة بالعنصر المحذوف
 */
const handleFileCleanup = async (table, item) => {
    const fs = require('fs');
    const path = require('path');
    
    try {
        let filePath = null;
        
        // تحديد مسار الملف حسب نوع الجدول
        switch (table) {
            case 'contents':
                if (item.file_path) {
                    filePath = path.join('./uploads/content_files', item.file_path);
                }
                break;
            case 'departments':
            case 'folders':
                // لا توجد ملفات مرفقة للأقسام والمجلدات
                break;
            default:
                // للجداول الأخرى
                break;
        }
        
        // حذف الملف الرئيسي إذا كان موجوداً
        if (filePath && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (error) {
        console.error('خطأ في تنظيف الملفات:', error);
    }
};

/**
 * ترجمة أسماء الجداول للعربية
 */
const getTableNameAr = (table) => {
    const tableNames = {
        'departments': 'قسم',
        'folders': 'مجلد',
        'contents': 'محتوى',
        'folder_names': 'اسم مجلد'
    };
    
    return tableNames[table] || table;
};

module.exports = {
    checkSuperAdminAuth,
    getDeletedStatistics,
    getAllDeletedItems,
    getDeletedItemsByTable,
    restoreDeletedItem,
    restoreAllItemsByTable,
    restoreAllItems,
    permanentDeleteItem,
    permanentDeleteAllByTable,
    permanentDeleteAllItems
};
