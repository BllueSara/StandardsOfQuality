const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'StandardOfQuality'
});

// دالة تهيئة عمود الأدوار
const initializeApprovalRoles = async () => {
    try {
        console.log('🔄 بدء تهيئة عمود الأدوار...');
        
        // التحقق من وجود عمود approval_roles في جدول departments
        const [deptColumns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'departments' AND COLUMN_NAME = 'approval_roles'
        `, [process.env.DB_NAME || 'StandardOfQuality']);
        
        if (deptColumns.length === 0) {
            console.log('➕ إضافة عمود approval_roles إلى جدول departments...');
            await db.execute('ALTER TABLE departments ADD COLUMN approval_roles JSON NULL AFTER approval_sequence');
            console.log('✅ تم إضافة عمود approval_roles إلى جدول departments');
        } else {
            console.log('✅ عمود approval_roles موجود بالفعل في جدول departments');
        }
        
        // التحقق من وجود عمود custom_approval_roles في جدول contents
        const [contentColumns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'contents' AND COLUMN_NAME = 'custom_approval_roles'
        `, [process.env.DB_NAME || 'StandardOfQuality']);
        
        if (contentColumns.length === 0) {
            console.log('➕ إضافة عمود custom_approval_roles إلى جدول contents...');
            await db.execute('ALTER TABLE contents ADD COLUMN custom_approval_roles JSON NULL AFTER custom_approval_sequence');
            console.log('✅ تم إضافة عمود custom_approval_roles إلى جدول contents');
        } else {
            console.log('✅ عمود custom_approval_roles موجود بالفعل في جدول contents');
        }
        
        // تحديث البيانات الموجودة (إضافة مصفوفة فارغة للأدوار)
        console.log('🔄 تحديث البيانات الموجودة...');
        await db.execute('UPDATE departments SET approval_roles = ? WHERE approval_roles IS NULL', ['[]']);
        await db.execute('UPDATE contents SET custom_approval_roles = ? WHERE custom_approval_roles IS NULL', ['[]']);
        console.log('✅ تم تحديث البيانات الموجودة');
        
        console.log('🎉 تم تهيئة عمود الأدوار بنجاح!');
        
    } catch (error) {
        console.error('❌ خطأ في تهيئة عمود الأدوار:', error);
        console.log('سيستمر الخادم في العمل رغم خطأ تهيئة عمود الأدوار');
    }
};

module.exports = { initializeApprovalRoles };
