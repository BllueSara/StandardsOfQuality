const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'Quality'
});

// دالة جلب جميع المسميات الوظيفية
const getAllJobTitles = async (req, res) => {
    try {
        const connection = await db.getConnection();
        
        const [rows] = await connection.execute(
            'SELECT id, title FROM job_titles ORDER BY title ASC'
        );
        
        connection.release();
        
        res.json({
            success: true,
            data: rows,
            message: 'تم جلب المسميات الوظيفية بنجاح'
        });
    } catch (error) {
        console.error('خطأ في جلب المسميات الوظيفية:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب المسميات الوظيفية'
        });
    }
};

// دالة إضافة مسمى وظيفي جديد
const addJobTitle = async (req, res) => {
    try {
        const { title } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'المسمى الوظيفي مطلوب'
            });
        }
        
        const connection = await db.getConnection();
        
        // التحقق من عدم وجود مسمى وظيفي بنفس الاسم
        const [existingRows] = await connection.execute(
            'SELECT id FROM job_titles WHERE title = ?',
            [title.trim()]
        );
        
        if (existingRows.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'المسمى الوظيفي موجود بالفعل'
            });
        }
        
        // إضافة المسمى الوظيفي الجديد
        const [result] = await connection.execute(
            'INSERT INTO job_titles (title) VALUES (?)',
            [title.trim()]
        );
        
        connection.release();
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المسمى الوظيفي بنجاح',
            data: {
                id: result.insertId,
                title: title.trim()
            }
        });
    } catch (error) {
        console.error('خطأ في إضافة المسمى الوظيفي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في إضافة المسمى الوظيفي'
        });
    }
};

// دالة حذف مسمى وظيفي
const deleteJobTitle = async (req, res) => {
    try {
        const { id } = req.params;
        
        const connection = await db.getConnection();
        
        // التحقق من وجود المسمى الوظيفي
        const [existingRows] = await connection.execute(
            'SELECT id FROM job_titles WHERE id = ?',
            [id]
        );
        
        if (existingRows.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'المسمى الوظيفي غير موجود'
            });
        }
        
        // التحقق من عدم استخدام المسمى الوظيفي في جدول المستخدمين
        const [usersWithJobTitle] = await connection.execute(
            'SELECT id FROM users WHERE job_title_id = ?',
            [id]
        );
        
        if (usersWithJobTitle.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'لا يمكن حذف المسمى الوظيفي لأنه مستخدم من قبل مستخدمين'
            });
        }
        
        // حذف المسمى الوظيفي
        await connection.execute(
            'DELETE FROM job_titles WHERE id = ?',
            [id]
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'تم حذف المسمى الوظيفي بنجاح'
        });
    } catch (error) {
        console.error('خطأ في حذف المسمى الوظيفي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في حذف المسمى الوظيفي'
        });
    }
};

// دالة تحديث مسمى وظيفي
const updateJobTitle = async (req, res) => {
    try {
        const { id } = req.params;
        const { title } = req.body;
        
        if (!title || title.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'المسمى الوظيفي مطلوب'
            });
        }
        
        const connection = await db.getConnection();
        
        // التحقق من وجود المسمى الوظيفي
        const [existingRows] = await connection.execute(
            'SELECT id FROM job_titles WHERE id = ?',
            [id]
        );
        
        if (existingRows.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'المسمى الوظيفي غير موجود'
            });
        }
        
        // التحقق من عدم وجود مسمى وظيفي آخر بنفس الاسم
        const [duplicateRows] = await connection.execute(
            'SELECT id FROM job_titles WHERE title = ? AND id != ?',
            [title.trim(), id]
        );
        
        if (duplicateRows.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'المسمى الوظيفي موجود بالفعل'
            });
        }
        
        // تحديث المسمى الوظيفي
        await connection.execute(
            'UPDATE job_titles SET title = ? WHERE id = ?',
            [title.trim(), id]
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'تم تحديث المسمى الوظيفي بنجاح',
            data: {
                id: parseInt(id),
                title: title.trim()
            }
        });
    } catch (error) {
        console.error('خطأ في تحديث المسمى الوظيفي:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تحديث المسمى الوظيفي'
        });
    }
};

module.exports = {
    getAllJobTitles,
    addJobTitle,
    deleteJobTitle,
    updateJobTitle
}; 