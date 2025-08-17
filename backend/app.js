require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path    = require('path');
const cors    = require('cors');
const { insertNotification, canDisableNotifications, canDisableEmails } = require('./models/notfications-utils');
const { logAction, canDisableLogs } = require('./models/logger');
const mysql2Promise = require('mysql2/promise');

const app = express();
const port = process.env.PORT || 3000;

// إعداد الاتصال بقاعدة البيانات
const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'StandardOfQuality',
});

// Serve static files from all directories

app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, '..')));
app.use(express.static(path.join(__dirname, '..', '..')));

// Routers
const authRouter             = require('./routers/auth');
const usersRouter            = require('./routers/users.routes');
const departmentsRouter      = require('./routers/departments');
const permissionsDefRouter   = require('./routers/permissionsDef.routes');
const permsRouter            = require('./routers/permissions.routes');
const folderRouter           = require('./routers/folder.Routes');
const folderContentRouter    = require('./routers/folderContentRoutes');
const contentRouter          = require('./routers/contentRoutes');
const approvalRouter         = require('./routers/approvalRoutes');
const contentController = require('./controllers/contentController');
const dashboardRouter = require('./routers/dashboardRoutes');
const jobTitlesRoutes = require('./routers/jobTitles');
const jobNamesRoutes = require('./routers/jobNames');
const superAdminRoutes = require('./routers/superAdmin.routes');
const deletedItemsRoutes = require('./routers/deletedItemsRoutes');

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', require('express').static('uploads'));

app.use('/api/auth',        authRouter);
app.use('/api/users', permsRouter);
app.use('/api/users',       usersRouter);
app.use('/api/permissions/definitions', permissionsDefRouter);
app.use('/api/dashboard', dashboardRouter);

app.use('/api/departments', departmentsRouter);
// folders nested under departments
app.use('/api/departments/:departmentId/folders', folderRouter);
// ✅ هذا الصحيح
app.use('/api/folders', folderRouter);


// contents nested under folders
app.use('/api/folders', folderContentRouter);


// global content endpoints (my-uploads)
app.use('/api/contents', contentRouter);

// approval
app.use('/api/approvals', approvalRouter);
app.put('/api/contents/:id/approval-sequence', contentController.updateContentApprovalSequence);
app.use('/api/job-titles', jobTitlesRoutes);
app.use('/api/job-names', jobNamesRoutes);
app.use('/api/deleted-items', deletedItemsRoutes);

// Super Admin routes
app.use('/api/super-admin', superAdminRoutes);

// اختبار الاتصال
db.connect((err) => {
  if (err) {
    console.error('خطأ في الاتصال بقاعدة البيانات:', err);
  } else {
    console.log('تم الاتصال بقاعدة البيانات بنجاح');
  }
});

app.use('/', express.static(path.join(__dirname, '../frontend')));

app.get('/health', (req, res) => res.send('OK'));
app.use((err, req, res, next) => {
  // console.error(err);
  res.status(500).json({ status: 'error', message: 'Internal Server Error' });
});
const PORT = process.env.PORT || 3006;
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
    try {
    await initializeJobNames();
    await initializeSoftDelete();
  } catch (error) {
    console.error('خطأ في تهيئة الجداول:', error);
  }
});

// تهيئة soft delete عند بدء التطبيق
const initializeSoftDelete = async () => {
  try {
    const { addSoftDeleteColumns } = require('./utils/softDelete');
    await addSoftDeleteColumns();
    console.log('✅ تم تهيئة حقول soft delete بنجاح');
  } catch (error) {
    console.error('❌ خطأ في تهيئة حقول soft delete:', error);
    console.log('سيستمر الخادم في العمل رغم خطأ تهيئة soft delete');
  }
};

// تهيئة جدول job_names عند بدء التطبيق
const initializeJobNames = async () => {
  try {
    const { initJobNamesTable } = require('./controllers/jobNamesController');
    
    // إنشاء request و response وهمية لاستدعاء الدالة
    const mockReq = {};
    const mockRes = {
      json: (data) => {
        if (data.success) {
          console.log('✅ تم تهيئة جدول job_names بنجاح:', data.message);
        } else {
          console.log('⚠️ لم يتم تهيئة جدول job_names:', data.message);
        }
      },
      status: (code) => ({
        json: (data) => {
          console.log('❌ خطأ في تهيئة جدول job_names:', data.message);
        }
      })
    };
    
    await initJobNamesTable(mockReq, mockRes);
  } catch (error) {
    console.error('خطأ في تهيئة جدول job_names:', error);
    // لا نريد إيقاف الخادم بسبب خطأ في إنشاء الجدول
    console.log('سيستمر الخادم في العمل رغم خطأ إنشاء الجدول');
  }
};

// دالة آمنة لتحويل أي تسلسل إلى مصفوفة أرقام
function safeParseSequence(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(x => Number(String(x).trim())).filter(x => !isNaN(x));
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(x => Number(String(x).trim())).filter(x => !isNaN(x));
    } catch (e) {
      try {
        const fixed = val.replace(/'/g, '"');
        const parsed = JSON.parse(fixed);
        if (Array.isArray(parsed)) return parsed.map(x => Number(String(x).trim())).filter(x => !isNaN(x));
      } catch (e2) {
        const arr = val.replace(/[\[\]'\"]/g, '').split(',').map(x => Number(String(x).trim())).filter(x => !isNaN(x));
        return arr;
      }
    }
  }
  return [];
}

setInterval(async () => {
  try {
    console.log('تشغيل الكرون...');
    const db = await mysql2Promise.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });

    const [contents] = await db.execute(`
      SELECT 
        c.id, c.title, c.custom_approval_sequence, f.department_id, d.approval_sequence
      FROM contents c
      JOIN folders f ON c.folder_id = f.id
      JOIN departments d ON f.department_id = d.id
      WHERE c.approval_status != 'approved'
    `);

    console.log('عدد الملفات غير المعتمدة:', contents.length);

    for (const content of contents) {
      let approvalSequence = safeParseSequence(content.custom_approval_sequence);
      if (approvalSequence.length === 0) {
        approvalSequence = safeParseSequence(content.approval_sequence);
      }
      console.log('التسلسل النهائي:', approvalSequence);
      if (approvalSequence.length === 0) continue;

      const [logs] = await db.execute(
        `SELECT approver_id, status, created_at FROM approval_logs WHERE content_id = ? ORDER BY id ASC`,
        [content.id]
      );
      console.log('logs:', logs);

      let pendingApprover = null;
      let pendingCreatedAt = null;
      for (const approverId of approvalSequence) {
        const log = logs.find(l => Number(l.approver_id) === approverId);
        if (!log || log.status === 'pending') {
          pendingApprover = approverId;
          pendingCreatedAt = log ? log.created_at : null;
          break;
        }
      }
      console.log('pendingApprover:', pendingApprover, 'pendingCreatedAt:', pendingCreatedAt);

      if (pendingApprover && pendingCreatedAt) {
        const createdAt = new Date(pendingCreatedAt);
        const now = new Date();
        const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
        console.log('diffDays:', diffDays);
        if (diffDays >= 3) {
          await insertNotification(
            pendingApprover,
            'تذكير اعتماد ملف',
            `لديك ملف بعنوان "${content.title}" بانتظار اعتمادك منذ أكثر من 3 أيام. يرجى اتخاذ الإجراء المناسب.`,
            'approval_reminder'
          );
          console.log(`✅ تم إرسال تذكير للمعتمد المتأخر (محتوى ${content.id})`);
        }
      }
    }
  } catch (err) {
    console.error('❌ خطأ أثناء إرسال التذكيرات:', err);
  }
}, 24 * 60 * 60 * 1000); // كل 24 ساعة


