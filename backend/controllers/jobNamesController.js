const mysql = require('mysql2/promise');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'Quality'
});

// دالة جلب جميع المسميات
const getAllJobNames = async (req, res) => {
    try {
        const connection = await db.getConnection();
        
        const [rows] = await connection.execute(
            'SELECT id, name FROM job_names ORDER BY name ASC'
        );
        
        connection.release();
        
        res.json({
            success: true,
            data: rows,
            message: 'تم جلب المسميات بنجاح'
        });
    } catch (error) {
        console.error('خطأ في جلب المسميات:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في جلب المسميات'
        });
    }
};

// دالة إضافة مسمى جديد
const addJobName = async (req, res) => {
    try {
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'المسمى مطلوب'
            });
        }
        
        const connection = await db.getConnection();
        
        // التحقق من عدم وجود مسمى بنفس الاسم
        const [existingRows] = await connection.execute(
            'SELECT id FROM job_names WHERE name = ?',
            [name.trim()]
        );
        
        if (existingRows.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'المسمى موجود بالفعل'
            });
        }
        
        // إضافة المسمى الجديد
        const [result] = await connection.execute(
            'INSERT INTO job_names (name) VALUES (?)',
            [name.trim()]
        );
        
        connection.release();
        
        res.status(201).json({
            success: true,
            message: 'تم إضافة المسمى بنجاح',
            data: {
                id: result.insertId,
                name: name.trim()
            }
        });
    } catch (error) {
        console.error('خطأ في إضافة المسمى:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في إضافة المسمى'
        });
    }
};

// دالة حذف مسمى
const deleteJobName = async (req, res) => {
    try {
        const { id } = req.params;
        
        const connection = await db.getConnection();
        
        // التحقق من وجود المسمى
        const [existingRows] = await connection.execute(
            'SELECT id FROM job_names WHERE id = ?',
            [id]
        );
        
        if (existingRows.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'المسمى غير موجود'
            });
        }
        
        // التحقق من عدم استخدام المسمى في جدول المستخدمين
        const [usersWithJobName] = await connection.execute(
            'SELECT id FROM users WHERE job_name_id = ?',
            [id]
        );
        
        if (usersWithJobName.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'لا يمكن حذف المسمى لأنه مستخدم من قبل مستخدمين'
            });
        }
        
        // حذف المسمى
        await connection.execute(
            'DELETE FROM job_names WHERE id = ?',
            [id]
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'تم حذف المسمى بنجاح'
        });
    } catch (error) {
        console.error('خطأ في حذف المسمى:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في حذف المسمى'
        });
    }
};

// دالة تحديث مسمى
const updateJobName = async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        
        if (!name || name.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'المسمى مطلوب'
            });
        }
        
        const connection = await db.getConnection();
        
        // التحقق من وجود المسمى
        const [existingRows] = await connection.execute(
            'SELECT id FROM job_names WHERE id = ?',
            [id]
        );
        
        if (existingRows.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                message: 'المسمى غير موجود'
            });
        }
        
        // التحقق من عدم وجود مسمى آخر بنفس الاسم
        const [duplicateRows] = await connection.execute(
            'SELECT id FROM job_names WHERE name = ? AND id != ?',
            [name.trim(), id]
        );
        
        if (duplicateRows.length > 0) {
            connection.release();
            return res.status(400).json({
                success: false,
                message: 'المسمى موجود بالفعل'
            });
        }
        
        // تحديث المسمى
        await connection.execute(
            'UPDATE job_names SET name = ? WHERE id = ?',
            [name.trim(), id]
        );
        
        connection.release();
        
        res.json({
            success: true,
            message: 'تم تحديث المسمى بنجاح',
            data: {
                id: parseInt(id),
                name: name.trim()
            }
        });
    } catch (error) {
        console.error('خطأ في تحديث المسمى:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تحديث المسمى'
        });
    }
};

// دالة تهيئة جدول job_names والبيانات الأولية
const initJobNamesTable = async (req, res) => {
    try {
        const connection = await db.getConnection();
        
        // إنشاء جدول job_names إذا لم يكن موجوداً
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS \`job_names\` (
                \`id\` int(11) NOT NULL AUTO_INCREMENT,
                \`name\` varchar(50) NOT NULL,
                \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                UNIQUE KEY \`name\` (\`name\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // إضافة عمود job_name_id إلى جدول users إذا لم يكن موجوداً
        try {
            await connection.execute(`
                ALTER TABLE \`users\` 
                ADD COLUMN \`job_name_id\` int(11) NULL AFTER \`job_title_id\`
            `);
            console.log('✅ تم إضافة عمود job_name_id إلى جدول users');
        } catch (alterError) {
            // العمود موجود بالفعل
            console.log('ℹ️ عمود job_name_id موجود بالفعل في جدول users');
        }
        
        // إضافة foreign key constraint إذا لم يكن موجوداً
        try {
            await connection.execute(`
                ALTER TABLE \`users\`
                ADD CONSTRAINT \`fk_users_job_name\`
                FOREIGN KEY (\`job_name_id\`) REFERENCES \`job_names\`(\`id\`)
                ON DELETE SET NULL ON UPDATE CASCADE
            `);
            console.log('✅ تم إضافة foreign key constraint');
        } catch (constraintError) {
            // Constraint موجود بالفعل
            console.log('ℹ️ foreign key constraint موجود بالفعل');
        }
        
        // إدخال البيانات الأولية إذا لم تكن موجودة
        const initialJobNames = [
            'Dr', 'Eng', 'Mr', 'Mrs', 'Ms', 'Prof', 'Assoc. Prof', 'Asst. Prof'
        ];
        
        for (const jobName of initialJobNames) {
            try {
                await connection.execute(
                    'INSERT INTO job_names (name) VALUES (?)',
                    [jobName]
                );
                console.log(`✅ تم إضافة المسمى: ${jobName}`);
            } catch (insertError) {
                // المسمى موجود بالفعل
                console.log(`ℹ️ المسمى ${jobName} موجود بالفعل`);
            }
        }
        
        connection.release();
        
        res.json({
            success: true,
            message: 'تم تهيئة جدول job_names بنجاح',
            data: {
                tableCreated: true,
                columnAdded: true,
                constraintAdded: true,
                initialDataInserted: true
            }
        });
        
    } catch (error) {
        console.error('خطأ في تهيئة جدول job_names:', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ في تهيئة جدول job_names',
            error: error.message
        });
    }
};

module.exports = {
    getAllJobNames,
    addJobName,
    deleteJobName,
    updateJobName,
    initJobNamesTable
};

