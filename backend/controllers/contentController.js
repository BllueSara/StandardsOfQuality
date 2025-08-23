const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { softDelete } = require('../utils/softDelete');
require('dotenv').config();
const { logAction } = require('../models/logger');
const { insertNotification } = require('../models/notfications-utils');

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'StandardOfQuality',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(__dirname, '../../uploads/content_files'); // تأكد أنه مسار مطلق من backend
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname) || '.pdf';
      cb(null, `${uniqueSuffix}${ext}`);
    }
  });
  
  
  

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max file size
    }
});

const THROTTLE_INTERVAL = 0;  // بدل 24h بثانية للتجربة
let lastRunTs = 0;

async function maybeNotifyExpiredContents() {
  const now = Date.now();
  if (now - lastRunTs < THROTTLE_INTERVAL) return;
  await notifyExpiredContents();
  lastRunTs = now;
}

// دالة تفحص صلاحية المحتوى وترسل إشعار إذا انتهت

async function notifyExpiredContents() {
  const today = new Date().toISOString().split('T')[0]; // yyyy-mm-dd
  const now = new Date();
  const connection = await db.getConnection();

  try {
    // جلب كل المحتويات التي لها end_date
    const [contents] = await connection.execute(`
      SELECT c.id, c.title, c.created_by, c.end_date, c.folder_id
      FROM contents c
      WHERE c.end_date IS NOT NULL
        AND c.deleted_at IS NULL
    `);

    for (const row of contents) {
      if (!row.end_date) continue;
      const endDate = new Date(row.end_date);
      if (isNaN(endDate.getTime())) continue;
      const diffMs = endDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      // جلب أسماء القسم والمجلد
      const [folderRows] = await connection.execute(
        `SELECT f.name AS folder_name, d.name AS department_name
         FROM folders f
         JOIN departments d ON f.department_id = d.id
         WHERE f.id = ?
           AND f.deleted_at IS NULL
           AND d.deleted_at IS NULL`,
        [row.folder_id]
      );
      const folderName = folderRows[0]?.folder_name || '';
      const departmentName = folderRows[0]?.department_name || '';
  const formattedDate = new Date(row.end_date).toISOString().split('T')[0];

      // إشعار قبل شهر (30 يوم)
      if (diffDays === 30) {
        // تحقق إذا أُرسل إشعار الشهر مسبقًا
        const [notMonth] = await connection.execute(
          `SELECT id FROM notifications WHERE type = ? AND user_id = ?`,
          [
            `content_expiry_soon_month_${row.id}`,
            row.created_by
          ]
        );
        if (!notMonth.length) {
          const notificationMsg =
            `اقترب انتهاء صلاحية المحتوى "${row.title}" في  "${departmentName}"، مجلد "${folderName}" بتاريخ ${formattedDate}. يرجى تحديثه أو رفع نسخة جديدة.`;
          await insertNotification(
            row.created_by,
            'اقترب انتهاء صلاحية المحتوى',
            notificationMsg,
            `content_expiry_soon_month_${row.id}`
          );
          // سجل في اللوقز
          const logDescription = {
            ar: `إشعار اقتراب انتهاء صلاحية المحتوى (شهر): ${row.title} في  ${departmentName}، مجلد ${folderName}`,
            en: `Sent 1-month expiry soon notification for content: ${row.title} in  ${departmentName}, folder ${folderName}`
          };
          try {
            await logAction(
              row.created_by,
              'notify_content_expiry_soon_month',
              JSON.stringify(logDescription),
              'content',
              row.id
            );
          } catch (err) {
            console.error('❌ logAction failed for month notification content ID', row.id, err);
          }
        }
      }

      // إشعار ليلة الانتهاء (قبل يوم)
      if (diffDays === 1) {
        // تحقق إذا أُرسل إشعار اليوم مسبقًا
        const [notDay] = await connection.execute(
          `SELECT id FROM notifications WHERE type = ? AND user_id = ?`,
          [
            `content_expiry_soon_day_${row.id}`,
            row.created_by
          ]
        );
        if (!notDay.length) {
          const notificationMsg =
            `غدًا تنتهي صلاحية المحتوى "${row.title}" في  "${departmentName}"، مجلد "${folderName}" بتاريخ ${formattedDate}. يرجى تحديثه أو رفع نسخة جديدة.`;
          await insertNotification(
            row.created_by,
            'غدًا تنتهي صلاحية المحتوى',
            notificationMsg,
            `content_expiry_soon_day_${row.id}`
          );
          // سجل في اللوقز
          const logDescription = {
            ar: `إشعار اقتراب انتهاء صلاحية المحتوى (ليلة الانتهاء): ${row.title} في  ${departmentName}، مجلد ${folderName}`,
            en: `Sent 1-day expiry soon notification for content: ${row.title} in  ${departmentName}, folder ${folderName}`
          };
          try {
            await logAction(
              row.created_by,
              'notify_content_expiry_soon_day',
              JSON.stringify(logDescription),
              'content',
              row.id
            );
          } catch (err) {
            console.error('❌ logAction failed for day notification content ID', row.id, err);
          }
        }
      }

      // إشعار الانتهاء الفعلي (الأحمر) كما هو سابقًا
      if (diffDays < 0) {
        // تحقق إذا أُرسل إشعار الانتهاء مسبقًا
        const [notExpired] = await connection.execute(
          `SELECT id FROM notifications WHERE type = ? AND user_id = ?`,
          [
            `content_expired_${row.id}`,
            row.created_by
          ]
        );
        if (!notExpired.length) {
          const notificationMsg =
            `انتهت صلاحية المحتوى "${row.title}" في  "${departmentName}"، مجلد "${folderName}" بتاريخ ${formattedDate}. يرجى تحديثه أو رفع نسخة جديدة.`;
          await insertNotification(
            row.created_by,
            'انتهت صلاحية المحتوى',
            notificationMsg,
            `content_expired_${row.id}`
          );
          // سجل في اللوقز
          const logDescription = {
            ar: `إشعار لانتهاء صلاحية المحتوى: ${row.title} في  ${departmentName}، مجلد ${folderName}`,
            en: `Sent expiration notification for content: ${row.title} in  ${departmentName}, folder ${folderName}`
          };
          try {
            await logAction(
              row.created_by,
              'notify_content_expired',
              JSON.stringify(logDescription),
              'content',
              row.id
            );
          } catch (err) {
            console.error('❌ logAction failed for content ID', row.id, err);
          }
        }
      }
    }
  } finally {
    connection.release();
  }
}

// جلب جميع المحتويات لمجلد معين
const getContentsByFolderId = async (req, res) => {
    try {
              await maybeNotifyExpiredContents();

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: لا يوجد توكن أو التوكن غير صالح' 
            });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: توكن غير صالح' 
            });
        }

        const folderId = req.params.folderId;
        const connection = await db.getConnection();

        // جلب معلومات المجلد
        const [folder] = await connection.execute(
            `SELECT 
                f.id,
                f.name,
                f.department_id,
                f.type,
                d.name as department_name,
                d.approval_sequence as department_approval_sequence,
                f.created_by,
                u.username as created_by_username
            FROM folders f 
            JOIN departments d ON f.department_id = d.id
            LEFT JOIN users u ON f.created_by = u.id
            WHERE f.id = ?
              AND f.deleted_at IS NULL
              AND d.deleted_at IS NULL`,
            [folderId]
        );

        if (folder.length === 0) {
            connection.release();
            return res.status(404).json({ 
                status: 'error',
                message: 'المجلد غير موجود' 
            });
        }

        // جلب approval_sequence للقسم
        let approvalSequence = [];
        const rawSeq = folder[0].department_approval_sequence;
        if (Array.isArray(rawSeq)) {
            approvalSequence = rawSeq;
        } else if (typeof rawSeq === 'string') {
            try {
                approvalSequence = JSON.parse(rawSeq);
            } catch {
                approvalSequence = [];
            }
        }
        approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));

        // بناء استعلام المحتوى
        let query = `
            SELECT 
                c.id, 
                c.title, 
                c.notes,
                c.file_path AS fileUrl, 
                c.approval_status,
                c.is_approved,
                c.approved_by,
                c.approvals_log,
                c.approvers_required,
                c.custom_approval_sequence,
                c.created_at,
                c.updated_at,
                c.start_date,
                c.end_date,

                c.parent_content_id,
                c.related_content_id,
                u.username as created_by_username,
                a.username as approved_by_username
            FROM contents c
            LEFT JOIN users u ON c.created_by = u.id
            LEFT JOIN users a ON c.approved_by = a.id
            WHERE c.folder_id = ?
              AND c.deleted_at IS NULL
        `;
        let params = [folderId];
        query += ' ORDER BY c.created_at DESC';

        const [contents] = await connection.execute(query, params);
        connection.release();
        // منطق الفلترة حسب نوع المجلد وصلاحيات المستخدم
        const now = new Date();
        const nowMs = now.getTime();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const isAdmin = decodedToken.role === 'admin' || decodedToken.role === 'super_admin';
        const userId = Number(decodedToken.id);
        const userDepartmentId = folder[0].department_id;
        const folderType = folder[0].type || 'public';

        const filtered = contents.filter(item => {
                      const isAdmin = decodedToken.role === 'admin' || decodedToken.role === 'super_admin';
            const userId = Number(decodedToken.id);
            if (isAdmin) return true; // الأدمن يرى كل شيء
            // 1) فلترة حسب انتهاء الصلاحية
            if (item.end_date) {
                const endDate = new Date(item.end_date);
                if (!isNaN(endDate.getTime())) {
                    const diffDays = Math.ceil((endDate.getTime() - nowMs) / (1000 * 60 * 60 * 24));
                    
                    if (!isAdmin) {
                        // المستخدم العادي لا يرى المحتوى المنتهي
                        if (diffDays < 0) return false;
                    }
                }
            }

            // 2) فلترة حسب نوع المجلد
            let hasFolderAccess = false;
            switch (folderType) {
                case 'public':
                    // المجلدات العامة: يراها الجميع
                    hasFolderAccess = true;
                    break;
                    
                case 'private':
                    // المجلدات الخاصة: فقط لأعضاء القسم
                    hasFolderAccess = isAdmin || decodedToken.department_id === userDepartmentId;
                    break;
                    
                case 'shared':
                    // المجلدات المشتركة: للمعتمدين فقط
                    hasFolderAccess = isAdmin || (() => {
                        try {
                            // تحقق من approvers_required
                            const approversRequired = JSON.parse(item.approvers_required || '[]');
                            if (approversRequired.includes(decodedToken.id)) return true;
                            
                            // تحقق من custom_approval_sequence
                            let customSeq = [];
                            if (item.custom_approval_sequence) {
                                if (Array.isArray(item.custom_approval_sequence)) {
                                    customSeq = item.custom_approval_sequence;
                                } else if (typeof item.custom_approval_sequence === 'string') {
                                    try {
                                        customSeq = JSON.parse(item.custom_approval_sequence);
                                    } catch {
                                        customSeq = [];
                                    }
                                }
                                customSeq = (customSeq || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
                            }
                            if (customSeq.includes(decodedToken.id)) return true;
                            
                            // تحقق من department approval_sequence
                            return approvalSequence.includes(decodedToken.id);
                        } catch (e) {
                            return false;
                        }
                    })();
                    break;

                default:
                    hasFolderAccess = true;
                    break;
            }

            // إذا لم يكن لديه صلاحية الوصول للمجلد، لا يظهر له المحتوى
            if (!hasFolderAccess) return false;

            // 3) فلترة إضافية للملفات غير المعتمدة
            // الملفات المعتمدة تظهر للجميع
            if (item.is_approved) return true;

            // الملفات غير المعتمدة تظهر فقط إذا كان المستخدم من ضمن approval_sequence أو custom_approval_sequence
            let customSeq = [];
            if (item.custom_approval_sequence) {
                if (Array.isArray(item.custom_approval_sequence)) {
                    customSeq = item.custom_approval_sequence;
                } else if (typeof item.custom_approval_sequence === 'string') {
                    try {
                        customSeq = JSON.parse(item.custom_approval_sequence);
                    } catch {
                        customSeq = [];
                    }
                }
                customSeq = (customSeq || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
            }
            if (customSeq.includes(userId)) return true;
            return approvalSequence.includes(userId);
        }).map(item => {
            let extra = {};
            if (item.end_date) {
                const endDate = new Date(item.end_date);
                if (!isNaN(endDate.getTime()) && nowMs > endDate.getTime() + oneDayMs) {
                    extra.expired = true;
                }
            }
            return { ...item, extra };
        });

        // إضافة رسالة توضيحية حسب نوع المجلد
        let accessMessage = '';
        let accessMessageKey = '';
        console.log('🔍 Debug folder access:', {
            folderType,
            isAdmin,
            userDepartmentId: decodedToken.department_id,
            folderDepartmentId: userDepartmentId
        });
        
        // تحقق من إمكانية الوصول للمحتوى
        let hasAccess = false;
        if (folderType === 'public') {
            hasAccess = true;
        } else if (folderType === 'private') {
            hasAccess = isAdmin || decodedToken.department_id === userDepartmentId;
        } else if (folderType === 'shared') {
            hasAccess = isAdmin || filtered.some(item => {
                try {
                    // تحقق من approvers_required
                    const approversRequired = JSON.parse(item.approvers_required || '[]');
                    if (approversRequired.includes(decodedToken.id)) return true;
                    
                    // تحقق من custom_approval_sequence
                    let customSeq = [];
                    if (item.custom_approval_sequence) {
                        if (Array.isArray(item.custom_approval_sequence)) {
                            customSeq = item.custom_approval_sequence;
                        } else if (typeof item.custom_approval_sequence === 'string') {
                            try {
                                customSeq = JSON.parse(item.custom_approval_sequence);
                            } catch {
                                customSeq = [];
                            }
                        }
                        customSeq = (customSeq || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
                    }
                    if (customSeq.includes(decodedToken.id)) return true;
                    
                    // تحقق من department approval_sequence
                    return approvalSequence.includes(decodedToken.id);
                } catch (e) {
                    return false;
                }
            });
        }

        // عرض الرسالة فقط إذا لم يكن لدى المستخدم صلاحية الوصول
        if (!hasAccess) {
            if (folderType === 'private') {
                accessMessageKey = 'folder-access-private-message';
                console.log('🔒 Setting private folder message - no access');
            } else if (folderType === 'shared') {
                accessMessageKey = 'folder-access-shared-message';
                console.log('🔒 Setting shared folder message - no access');
            }
        }
        
        console.log('🔍 Final accessMessageKey:', accessMessageKey);

        res.json({
            status: 'success',
            message: 'contents-fetched-success',
            folderName: folder[0].name,
            folder: {
                id: folder[0].id,
                name: folder[0].name,
                department_id: folder[0].department_id,
                department_name: folder[0].department_name,
                created_by: folder[0].created_by,
                created_by_username: folder[0].created_by_username,
                type: folderType
            },
            data: filtered,
            accessMessage: accessMessage,
            accessMessageKey: accessMessageKey
        });
    } catch (error) {
        console.error('getContentsByFolderId error:', error);
        res.status(500).json({ message: 'خطأ في جلب المحتويات' });
    }
};


// إضافة محتوى جديد لمجلد معين
const addContent = async (req, res) => {
    console.log('--- Start addContent ---');
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('No or invalid token');
        return res.status(401).json({ 
          status: 'error',
          message: 'غير مصرح: لا يوجد توكن أو التوكن غير صالح' 
        });
      }
  
      const token = authHeader.split(' ')[1];
      let decodedToken;
      try {
        decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        console.log('Invalid JWT');
        return res.status(401).json({ 
          status: 'error',
          message: 'غير مصرح: توكن غير صالح' 
        });
      }
  
      const folderId = req.params.folderId;
      const { title, notes, approvers_required, parent_content_id, related_content_id, is_main_file, start_date, end_date } = req.body;
      const filePath = req.file ? path.posix.join('content_files', req.file.filename) : null;
      const approvalStatus = 'pending';
      const isApproved = 0;
      const approvedBy = null;
  
      const connection = await db.getConnection();
      console.log('DB connection acquired');
  
      if (!folderId || !title || !filePath) {
        console.log('--- addContent: شرط مفقود ---', {folderId, title, filePath});
        connection.release();
        return res.status(400).json({ 
          status: 'error',
          message: 'معرف المجلد والعنوان والملف مطلوبون.' 
        });
      }
  
      // التحقق من وجود المجلد وجلب اسم القسم
      const [folder] = await connection.execute(
        'SELECT id, department_id FROM folders WHERE id = ? AND deleted_at IS NULL',
        [folderId]
      );
      console.log('Checked folder existence');
  
      if (folder.length === 0) {
        console.log('Folder not found');
        connection.release();
        return res.status(404).json({ 
          status: 'error',
          message: 'المجلد غير موجود' 
        });
      }

      // جلب اسم القسم باللغة المناسبة
      let departmentName = '';
      if (folder[0].department_id) {
        const [deptRows] = await connection.execute('SELECT name FROM departments WHERE id = ? AND deleted_at IS NULL', [folder[0].department_id]);
        if (deptRows.length > 0) {
          departmentName = deptRows[0].name;
        }
      }
      console.log('Got department name');

      // منطق ربط الملفات الرئيسية والفرعية
      let parentIdToInsert = null;
      let relatedIdToInsert = null;
      let insertedContentId = null;

      if (is_main_file) {
        console.log('--- addContent: قبل إدراج main file ---');
        const [result] = await connection.execute(
          `INSERT INTO contents (
            title, 
            file_path, 
            notes,
            folder_id, 
            approval_status,
            is_approved,
            created_by,
            approvers_required,
            approvals_log,
            parent_content_id,
            related_content_id,
            start_date,
            end_date,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            title, 
            filePath, 
            notes || null,
            folderId, 
            approvalStatus,
            isApproved,
            decodedToken.id,
            approvers_required ? JSON.stringify(approvers_required) : null,
            JSON.stringify([]),
            null, // parent_content_id مؤقتاً
            null,  // related_content_id
            start_date || null,
            end_date || null
          ]
        );
        insertedContentId = result.insertId;
        // بعد الإدراج، حدّث السجل ليأخذ parent_content_id = id نفسه
        await connection.execute(
          'UPDATE contents SET parent_content_id = ? WHERE id = ?',
          [insertedContentId, insertedContentId]
        );
        parentIdToInsert = insertedContentId;
        relatedIdToInsert = null;
        console.log('--- addContent: بعد إدراج main file ---', insertedContentId);
      } else if (related_content_id) {
        console.log('--- addContent: قبل إدراج related file ---');
        parentIdToInsert = null;
        relatedIdToInsert = related_content_id;
        const [result] = await connection.execute(
          `INSERT INTO contents (
            title, 
            file_path, 
            notes,
            folder_id, 
            approval_status,
            is_approved,
            created_by,
            approvers_required,
            approvals_log,
            parent_content_id,
            related_content_id,
            start_date,
            end_date,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            title, 
            filePath, 
            notes || null,
            folderId, 
            approvalStatus,
            isApproved,
            decodedToken.id,
            approvers_required ? JSON.stringify(approvers_required) : null,
            JSON.stringify([]),
            null, // parent_content_id
            related_content_id,
            start_date || null,
            end_date || null
          ]
        );
        insertedContentId = result.insertId;
        console.log('--- addContent: بعد إدراج related file ---', insertedContentId);
      } else {
        console.log('--- addContent: قبل إدراج normal file ---');
        parentIdToInsert = null;
        relatedIdToInsert = null;
        const [result] = await connection.execute(
          `INSERT INTO contents (
            title, 
            file_path, 
            notes,
            folder_id, 
            approval_status,
            is_approved,
            created_by,
            approvers_required,
            approvals_log,
            parent_content_id,
            related_content_id,
            start_date,
            end_date,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            title, 
            filePath, 
            notes || null,
            folderId, 
            approvalStatus,
            isApproved,
            decodedToken.id,
            approvers_required ? JSON.stringify(approvers_required) : null,
            JSON.stringify([]),
            null, // parent_content_id
            null,  // related_content_id
            start_date || null,
            end_date || null
          ]
        );
        insertedContentId = result.insertId;
        console.log('--- addContent: بعد إدراج normal file ---', insertedContentId);
      }
      console.log('--- addContent: قبل إضافة approval_logs ---');
      // 2) إضافة الـ approvers وربطهم (من التسلسل الفعلي)
      let approvalSequence = [];
      // جلب التسلسل الفعلي من السطر الجديد
      const [contentRow] = await connection.execute(
        'SELECT custom_approval_sequence, folder_id FROM contents WHERE id = ? AND deleted_at IS NULL',
        [insertedContentId]
      );
      if (contentRow.length && contentRow[0].custom_approval_sequence) {
        try {
          approvalSequence = JSON.parse(contentRow[0].custom_approval_sequence);
        } catch { approvalSequence = []; }
      }
      if (!Array.isArray(approvalSequence) || approvalSequence.length === 0) {
        // جلب من القسم
        const folderId = contentRow[0].folder_id;
        const [folderRows] = await connection.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
        if (folderRows.length) {
          const departmentId = folderRows[0].department_id;
          const [deptRows] = await connection.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
          if (deptRows.length) {
            let rawSeq = deptRows[0].approval_sequence;
            console.log('القيمة الخام approval_sequence:', rawSeq);
            if (typeof rawSeq !== 'string') rawSeq = JSON.stringify(rawSeq);
            try {
              approvalSequence = JSON.parse(rawSeq);
            } catch (e) {
              console.log('خطأ في JSON.parse approval_sequence:', rawSeq, e);
              approvalSequence = [];
            }
          }
        }
      }
      approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));

      // === منطق التفويض الدائم: استبدل أي عضو مفوض له وأضف سجلات بالنيابة ===
      // خزّن التسلسل النهائي في الملف الجديد
      await connection.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(approvalSequence), insertedContentId]);

      for (const userId of approvalSequence) {
        await connection.execute(
          `INSERT INTO approval_logs (content_id, approver_id, status, created_at)
           VALUES (?, ?, 'pending', NOW())`,
          [insertedContentId, userId]
        );
      }
      console.log('انتهى من إضافة approval_logs');
  
      // ✅ تسجيل اللوق بعد نجاح إضافة المحتوى
      try {
        console.log('Logging action');
        const userLanguage = getUserLanguageFromToken(token);
        const logDescription = {
            ar: `تم إضافة محتوى: ${getContentNameByLanguage(title, 'ar')} في : ${getDepartmentNameByLanguage(departmentName, 'ar')}`,
            en: `Added content: ${getContentNameByLanguage(title, 'en')} in : ${getDepartmentNameByLanguage(departmentName, 'en')}`
        };
        await logAction(
            decodedToken.id,
            'add_content',
            JSON.stringify(logDescription),
            'content',
            insertedContentId
        );
      } catch (logErr) {
        console.error('logAction error:', logErr);
      }
      console.log('Logged action');

      // إرسال إشعار لأول شخص في تسلسل الاعتماد
      try {
        console.log('Preparing to send notification');
        // جلب custom_approval_sequence من السجل الجديد
        let approvalSequence = [];
        const [contentRow] = await connection.execute('SELECT custom_approval_sequence, folder_id, title, start_date, end_date FROM contents WHERE id = ? AND deleted_at IS NULL', [insertedContentId]);
        console.log('DEBUG custom_approval_sequence (raw):', contentRow[0]?.custom_approval_sequence);
        if (contentRow.length && contentRow[0].custom_approval_sequence) {
          try {
            const parsed = JSON.parse(contentRow[0].custom_approval_sequence);
            if (Array.isArray(parsed) && parsed.length > 0) {
              approvalSequence = parsed;
            }
          } catch (e) {
            console.error('DEBUG custom_approval_sequence JSON.parse error:', e);
          }
        }
        // إذا لا يوجد custom أو كان فارغًا، استخدم approval_sequence من القسم
        if (approvalSequence.length === 0 && contentRow.length) {
          const folderId = contentRow[0].folder_id;
          const [folderRows] = await connection.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
          if (folderRows.length) {
            const departmentId = folderRows[0].department_id;
            const [deptRows] = await connection.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
            if (deptRows.length) {
              const rawSeq = deptRows[0]?.approval_sequence;
              console.log('DEBUG approval_sequence (raw from department):', rawSeq);
              if (Array.isArray(rawSeq)) {
                approvalSequence = rawSeq;
              } else if (typeof rawSeq === 'string') {
                try {
                  approvalSequence = JSON.parse(rawSeq);
                } catch (e) {
                  console.error('DEBUG approval_sequence JSON.parse error:', e);
                  approvalSequence = [];
                }
              } else {
                approvalSequence = [];
              }
            }
          }
        }
        console.log('DEBUG approvalSequence after parse:', approvalSequence);
        approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
        const firstApproverId = approvalSequence.length > 0 ? approvalSequence[0] : null;
        console.log('DEBUG notify first approver:', firstApproverId, approvalSequence);

        if (firstApproverId) {
          const fileTitle = contentRow[0].title || '';
          console.log('Sending notification to first approver:', firstApproverId);
          await insertNotification(
            firstApproverId,
            'ملف جديد بانتظار اعتمادك',
            `لديك ملف بعنوان "${fileTitle}" بحاجة لاعتمادك.`,
            'approval'
          );
        }
      } catch (notifyErr) {
        console.error('notify first approver error:', notifyErr);
      }
      console.log('Notification logic done');
  
      connection.release();
      console.log('DB connection released');
  
      res.status(201).json({
        status: 'success',
        message: 'تم رفع المحتوى بنجاح وهو في انتظار الاعتمادات اللازمة',
        contentId: insertedContentId,
        isApproved: !!isApproved,
        status: approvalStatus,
        parent_content_id: parentIdToInsert,
        related_content_id: relatedIdToInsert
      });
      console.log('--- End addContent (success) ---');
    } catch (error) {
      console.error('Error adding content:', error);
      res.status(500).json({ message: 'خطأ في إضافة المحتوى' });
    }
  };
  

// تحديث محتوى موجود
const updateContent = async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'غير مصرح: لا يوجد توكن' });
      }
  
      const token = authHeader.split(' ')[1];
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decodedToken.id;
  
      const originalId = req.params.contentId;
      const { title, notes } = req.body;
      const filePath = req.file ? path.posix.join('content_files', req.file.filename) : null;
  
      const connection = await db.getConnection();
  
      // جلب المحتوى القديم (بما في ذلك approvers_required وfolder_id)
      const [oldContent] = await connection.execute(
        'SELECT folder_id, approvers_required, title, start_date, end_date FROM contents WHERE id = ? AND deleted_at IS NULL',
        [originalId]
      );
      if (!oldContent.length) {
        return res.status(404).json({ status: 'error', message: 'المحتوى الأصلي غير موجود' });
      }
  
      const folderId = oldContent[0].folder_id;
      const originalApproversRequired = oldContent[0].approvers_required;
      const oldTitle = oldContent[0].title;

      // جلب اسم القسم باللغة المناسبة
      let departmentName = '';
      if (folderId) {
        const [folderRows] = await connection.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
        if (folderRows.length > 0 && folderRows[0].department_id) {
          const [deptRows] = await connection.execute('SELECT name FROM departments WHERE id = ? AND deleted_at IS NULL', [folderRows[0].department_id]);
          if (deptRows.length > 0) {
            departmentName = deptRows[0].name; // استخدام النص الأصلي من قاعدة البيانات
          }
        }
      }
  

  
      // إنشاء النسخة الجديدة
      const [insertResult] = await connection.execute(
        `INSERT INTO contents (
          title, file_path, notes, folder_id,
          approval_status, is_approved,
          created_by, approvers_required, approvals_log,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?, ?, NOW(), NOW())`,
        [
          title,
          filePath,
          notes || null,
          folderId,
          userId,
          originalApproversRequired, // استخدم الموافقين المطلوبين من المحتوى الأصلي
          JSON.stringify([]),
        ]
      );
  
      const newContentId = insertResult.insertId;
  
      // ✅ تسجيل اللوق بعد نجاح تحديث المحتوى
      try {
         
        // إنشاء النص ثنائي اللغة
        const logDescription = {
          ar: `تم تحديث محتوى من: ${getContentNameByLanguage(oldTitle, 'ar')} إلى: ${getContentNameByLanguage(title, 'ar')} في : ${getDepartmentNameByLanguage(departmentName, 'ar')}`,
          en: `Updated content from: ${getContentNameByLanguage(oldTitle, 'en')} to: ${getContentNameByLanguage(title, 'en')} in : ${getDepartmentNameByLanguage(departmentName, 'en')}`
        };
        
        await logAction(
          userId,
          'update_content',
          JSON.stringify(logDescription),
          'content',
          newContentId
        );
      } catch (logErr) {
        console.error('logAction error:', logErr);
      }
  
      connection.release();
  
      return res.status(201).json({
        status: 'success',
        message: '✅ تم إنشاء نسخة جديدة من المحتوى وهي بانتظار الاعتماد',
        contentId: newContentId
      });
  
    } catch (err) {
      res.status(500).json({ message: 'خطأ في إنشاء نسخة محدثة' });
    }
  };
  
  
  


// حذف محتوى
const deleteContent = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: لا يوجد توكن أو التوكن غير صالح' 
            });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: توكن غير صالح' 
            });
        }

        const contentId = req.params.contentId;
        const connection = await db.getConnection();

        // التحقق من صلاحيات المستخدم
        const [content] = await connection.execute(
            'SELECT file_path, created_by, is_approved, title, folder_id, start_date, end_date FROM contents WHERE id = ? AND deleted_at IS NULL',
            [contentId]
        );

        if (content.length === 0) {
            connection.release();
            return res.status(404).json({ 
                status: 'error',
                message: 'المحتوى غير موجود.' 
            });
        }

        // فقط منشئ المحتوى أو المشرف يمكنه حذف المحتوى
        if (content[0].created_by !== decodedToken.id && decodedToken.role !== 'admin' && decodedToken.role !== 'super_admin') {
            connection.release();
            return res.status(403).json({ 
                status: 'error',
                message: 'ليس لديك صلاحية لحذف هذا المحتوى.' 
            });
        }

        // لا يمكن حذف محتوى معتمد
        if (content[0].is_approved && decodedToken.role !== 'admin' && decodedToken.role !== 'super_admin') {
            connection.release();
            return res.status(403).json({ 
                status: 'error',
                message: 'لا يمكن حذف محتوى معتمد.' 
            });
        }

        // جلب اسم القسم باللغة المناسبة
        let departmentName = '';
        if (content[0].folder_id) {
            const [folderRows] = await connection.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [content[0].folder_id]);
            if (folderRows.length > 0 && folderRows[0].department_id) {
                const [deptRows] = await connection.execute('SELECT name FROM departments WHERE id = ? AND deleted_at IS NULL', [folderRows[0].department_id]);
                if (deptRows.length > 0) {
                    departmentName = deptRows[0].name; // استخدام النص الأصلي من قاعدة البيانات
                }
            }
        }

        // حذف الملف
        const filePath = path.join('./uploads', content[0].file_path);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // حذف المحتوى باستخدام soft delete
        const deleted = await softDelete('contents', contentId, decodedToken.id);
        
        if (!deleted) {
            connection.release();
            return res.status(400).json({ message: 'فشل في حذف المحتوى' });
        }

        // ✅ تسجيل اللوق بعد نجاح حذف المحتوى
        try {
            const userLanguage = getUserLanguageFromToken(token);
            
            // إنشاء النص ثنائي اللغة
            const logDescription = {
                ar: `تم حذف محتوى: ${getContentNameByLanguage(content[0].title, 'ar')} من : ${getDepartmentNameByLanguage(departmentName, 'ar')}`,
                en: `Deleted content: ${getContentNameByLanguage(content[0].title, 'en')} from : ${getDepartmentNameByLanguage(departmentName, 'en')}`
            };
            
            await logAction(
                decodedToken.id,
                'delete_content',
                JSON.stringify(logDescription),
                'content',
                contentId
            );
        } catch (logErr) {
            console.error('logAction error:', logErr);
        }

        connection.release();
        res.json({
            status: 'success',
            message: 'تم حذف المحتوى بنجاح'
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في حذف المحتوى' });
    }
};

// تحميل محتوى
const downloadContent = async (req, res) => {
    try {
        const contentId = req.params.contentId;
        const connection = await db.getConnection();

        const [content] = await connection.execute(
            'SELECT file_path, title, start_date, end_date FROM contents WHERE id = ? AND deleted_at IS NULL',
            [contentId]
        );

        if (content.length === 0) {
            connection.release();
            return res.status(404).json({ 
                status: 'error',
                message: 'المحتوى غير موجود.' 
            });
        }

        const filePathFull = path.join(__dirname, '../../uploads', content[0].file_path);

        if (!fs.existsSync(filePathFull)) {
            connection.release();
            return res.status(404).json({ 
                status: 'error',
                message: 'الملف غير موجود.' 
            });
        }

        connection.release();
        res.download(filePathFull, content[0].title);
    } catch (error) {
        res.status(500).json({ message: 'خطأ في تحميل المحتوى' });
    }
};

// جلب محتوى محدد
const getContentById = async (req, res) => {
    try {
        const contentId = req.params.contentId;
        const connection = await db.getConnection();

        const [content] = await connection.execute(
          `SELECT 
              c.*,
              u.username as created_by_username,
              a.username as approved_by_username
          FROM contents c
          LEFT JOIN users u ON c.created_by = u.id
          LEFT JOIN users a ON c.approved_by = u.id
          WHERE c.id = ?
            AND c.deleted_at IS NULL`,
          [contentId]
      );

        if (content.length === 0) {
            connection.release();
            return res.status(404).json({ 
                status: 'error',
                message: 'المحتوى غير موجود.' 
            });
        }

        connection.release();
        res.json({
            status: 'success',
            data: content[0]
        });
    } catch (error) {
        res.status(500).json({ message: 'خطأ في جلب المحتوى' });
    }
};

// الموافقة على محتوى
const approveContent = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: لا يوجد توكن أو التوكن غير صالح' 
            });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: توكن غير صالح' 
            });
        }

        const contentId = req.params.contentId;
        const { approved, notes } = req.body;
        const connection = await db.getConnection();

        // التحقق من وجود المحتوى
              // التحقق من وجود المحتوى
              const [content] = await connection.execute(
                'SELECT c.*, f.department_id FROM contents c JOIN folders f ON c.folder_id = f.id WHERE c.id = ? AND c.deleted_at IS NULL AND f.deleted_at IS NULL',
                [contentId]
            );

        if (content.length === 0) {
            connection.release();
            return res.status(404).json({ 
                status: 'error',
                message: 'المحتوى غير موجود.' 
            });
        }

        // جلب اسم القسم باللغة المناسبة
        let departmentName = '';
        if (content[0].department_id) {
          const [deptRows] = await connection.execute('SELECT name FROM departments WHERE id = ? AND deleted_at IS NULL', [content[0].department_id]);
          if (deptRows.length > 0) {
              departmentName = deptRows[0].name; // استخدام النص الأصلي من قاعدة البيانات
          }
      }
        // التحقق من أن المستخدم لم يعتمد مسبقاً
        const approvalsLog = JSON.parse(content[0].approvals_log || '[]');
        const hasApproved = approvalsLog.some(log => log.user_id === decodedToken.id);
        if (hasApproved) {
            connection.release();
            return res.status(400).json({ 
                status: 'error',
                message: 'لقد قمت بالاعتماد على هذا المحتوى مسبقاً.' 
            });
        }

        // إضافة اعتماد جديد إلى سجل التواقيع
        const newApproval = {
            user_id: decodedToken.id,
            username: decodedToken.username,
            approved: approved,
            notes: notes || null,
            timestamp: new Date().toISOString()
        };
        approvalsLog.push(newApproval);

        // عدد الموافقين المطلوبين
        const approversRequired = JSON.parse(content[0].approvers_required || '[]');
        const approvedCount = approvalsLog.filter(log => log.approved).length;
        const isApproved = approvedCount >= approversRequired.length;

        // في حالة الاعتماد النهائي، استخدم pending_file_path كـ file_path إن وجد
        let filePathToSet = content[0].file_path;
        if (isApproved && content[0].pending_file_path) {
            // حذف الملف القديم
            const oldFilePath = path.join('./uploads', content[0].file_path);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }

            // تعيين الملف الجديد
            filePathToSet = content[0].pending_file_path;
        }

        await connection.execute(
            `UPDATE contents 
             SET approvals_log = ?,
                 is_approved = ?,
                 approval_status = ?,
                 approved_by = ?,
                 file_path = ?,
                 pending_file_path = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [
                JSON.stringify(approvalsLog),
                isApproved ? 1 : 0,
                isApproved ? 'approved' : 'pending',
                isApproved ? decodedToken.id : null,
                filePathToSet,
                contentId
            ]
        );

        // ✅ تسجيل اللوق بعد نجاح اعتماد المحتوى
        try {
            const userLanguage = getUserLanguageFromToken(token);
            const contentNameInLanguage = getContentNameByLanguage(content[0].title, userLanguage);
            const departmentNameInLanguage = getDepartmentNameByLanguage(departmentName, userLanguage);
            
            // إنشاء النص ثنائي اللغة
            const logDescription = {
                ar: `تم ${isApproved ? 'اعتماد' : 'تسجيل موافقة على'} محتوى: ${getContentNameByLanguage(content[0].title, 'ar')} في : ${getDepartmentNameByLanguage(departmentName, 'ar')}`,
                en: `${isApproved ? 'Approved' : 'Partially approved'} content: ${getContentNameByLanguage(content[0].title, 'en')} in : ${getDepartmentNameByLanguage(departmentName, 'en')}`
            };
            
            await logAction(
                decodedToken.id,
                isApproved ? 'approve_content' : 'partial_approve_content',
                JSON.stringify(logDescription),
                'content',
                contentId
            );
        } catch (logErr) {
            console.error('logAction error:', logErr);
        }

        connection.release();

        res.json({
            status: 'success',
            message: isApproved 
                ? 'تم اعتماد المحتوى بنجاح وتم تفعيل التحديث الجديد.'
                : 'تم تسجيل اعتمادك بنجاح. في انتظار باقي المعتمدين.',
            isApproved,
            approvalStatus: isApproved ? 'approved' : 'pending'
        });

    } catch (error) {
        res.status(500).json({ message: 'خطأ في اعتماد المحتوى' });
    }
};




/**
 * GET /api/contents/my-uploads
 * يرجّع الملفات التي رفعها المستخدم الحالي
 */
const getMyUploadedContent = async (req, res) => {
    try {
      // 1) التحقق من التوكن
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ status: 'error', message: 'غير مصرح: لا يوجد توكن.' });
      }
      const token = authHeader.split(' ')[1];
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        return res.status(401).json({ status: 'error', message: 'غير مصرح: توكن غير صالح.' });
      }
      const userId = decoded.id;
  
      // 2) جلب الملفات المرتبطة بالمستخدم
      const [rows] = await db.execute(
        `SELECT 
           CONCAT('dept-', c.id) AS id,
           c.title,
           c.file_path AS filePath,
           c.created_at AS createdAt,
           c.is_approved,
           c.approval_status,
           c.start_date,
           c.end_date,
           f.name AS folderName,
           COALESCE(d.name, '-') AS source_name
         FROM contents c
         JOIN folders f ON c.folder_id = f.id
         LEFT JOIN departments d ON f.department_id = d.id
         WHERE c.created_by = ?
           AND c.deleted_at IS NULL
           AND f.deleted_at IS NULL
           AND d.deleted_at IS NULL
         ORDER BY c.created_at DESC`,
        [userId]
      );
      
      const data = rows.map(r => ({
        id:             r.id,
        title:          r.title,
        fileUrl:        r.filePath,
        createdAt:      r.createdAt,
        is_approved:    r.is_approved,
        approval_status: r.approval_status,
        start_date:     r.start_date,
        end_date:       r.end_date,
        folderName:     r.folderName,
        source_name:    r.source_name,
        type:           'department'
      }));
  
      return res.json({ status: 'success', data });

    } catch (err) {
      res.status(500).json({ status: 'error', message: 'خطأ في جلب المحتويات التي رفعتها' });
    }
  };

/**
 * GET /api/content-names
 * جلب كل أسماء المحتويات
 */
const getContentNames = async (req, res) => {
  try {
    const conn = await db.getConnection();
    const [rows] = await conn.execute(
      'SELECT id, name FROM content_names ORDER BY name ASC'
    );
    conn.release();
    return res.json({ status: 'success', data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'فشل جلب أسماء المحتويات.' });
  }
};

/**
 * POST /api/content-names
 * إضافة اسم محتوى جديد
 */
const addContentName = async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'الاسم مطلوب.' });
  }
  try {
    const conn = await db.getConnection();
    const [result] = await conn.execute(
      'INSERT INTO content_names (name) VALUES (?)',
      [name]
    );
    
    // ✅ تسجيل اللوق بعد نجاح إضافة اسم المحتوى
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      const userLanguage = getUserLanguageFromToken(token);
      
      try {
        // إنشاء النص ثنائي اللغة
        const logDescription = {
          ar: `تمت إضافة اسم محتوى جديد: ${getContentNameByLanguage(name, 'ar')}`,
          en: `Added new content name: ${getContentNameByLanguage(name, 'en')}`
        };
        
        await logAction(
          userId,
          'add_content_name',
          JSON.stringify(logDescription),
          'content',
          result.insertId
        );
      } catch (logErr) {
        console.error('logAction error:', logErr);
      }
    }
    
    conn.release();
    return res.status(201).json({
      status: 'success',
      message: '✅ تم إضافة اسم المحتوى بنجاح',
      contentNameId: result.insertId
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '❌ فشل في إضافة اسم المحتوى.' });
  }
};

/**
 * PUT /api/content-names/:id
 * تعديل اسم محتوى وتحديث كل المحتويات التي تستخدم الاسم القديم
 */
const updateContentName = async (req, res) => {
  const { id }   = req.params;
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ message: 'الاسم الجديد مطلوب.' });
  }

  const conn = await db.getConnection();
  try {
    const [rows] = await conn.execute(
      'SELECT name FROM content_names WHERE id = ?',
      [id]
    );
    if (!rows.length) {
      conn.release();
      return res.status(404).json({ message: '❌ لم يتم العثور على اسم المحتوى.' });
    }
    const oldName = rows[0].name;

    const [result] = await conn.execute(
      'UPDATE content_names SET name = ? WHERE id = ?',
      [name, id]
    );
    if (result.affectedRows === 0) {
      conn.release();
      return res.status(404).json({ message: '❌ لم يتم تحديث اسم المحتوى.' });
    }

    await conn.execute(
      'UPDATE contents SET title = ? WHERE title = ?',
      [name, oldName]
    );

    // ✅ تسجيل اللوق بعد نجاح تعديل اسم المحتوى
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      const userLanguage = getUserLanguageFromToken(token);
      
      try {
        // إنشاء النص ثنائي اللغة
        const logDescription = {
          ar: `تم تعديل اسم محتوى للأقسام من: ${getContentNameByLanguage(oldName, 'ar')} إلى: ${getContentNameByLanguage(name, 'ar')}`,
          en: `Updated content name for departments from: ${getContentNameByLanguage(oldName, 'en')} to: ${getContentNameByLanguage(name, 'en')}`
        };
        
        await logAction(
          userId,
          'update_content_name',
          JSON.stringify(logDescription),
          'content',
          id
        );
      } catch (logErr) {
        console.error('logAction error:', logErr);
      }
    }

    conn.release();
    return res.json({
      status: 'success',
      message: '✅ تم تعديل اسم المحتوى وكل المحتويات المرتبطة بنجاح'
    });
  } catch (err) {
    conn.release();
    console.error(err);
    return res.status(500).json({ message: '❌ فشل في تعديل اسم المحتوى.' });
  }
};

/**
 * DELETE /api/content-names/:id
 * حذف اسم المحتوى
 */
const deleteContentName = async (req, res) => {
  const { id } = req.params;
  try {
    const conn = await db.getConnection();
    
    // جلب الاسم قبل الحذف لتسجيله في اللوق
    const [nameRows] = await conn.execute('SELECT name FROM content_names WHERE id = ?', [id]);
    const contentName = nameRows.length > 0 ? nameRows[0].name : 'غير معروف';
    
    const [result] = await conn.execute(
      'DELETE FROM content_names WHERE id = ?',
      [id]
    );
    
    // ✅ تسجيل اللوق بعد نجاح حذف اسم المحتوى
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;
      const userLanguage = getUserLanguageFromToken(token);
      
      try {
        // إنشاء النص ثنائي اللغة
        const logDescription = {
          ar: `تم حذف اسم محتوى للأقسام: ${getContentNameByLanguage(contentName, 'ar')}`,
          en: `Deleted content name for departments: ${getContentNameByLanguage(contentName, 'en')}`
        };
        
        await logAction(
          userId,
          'delete_content_name',
          JSON.stringify(logDescription),
          'content',
          id
        );
      } catch (logErr) {
        console.error('logAction error:', logErr);
      }
    }
    
    conn.release();
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: '❌ اسم المحتوى غير موجود أو تم حذفه مسبقاً.' });
    }
    return res.json({ status: 'success', message: '✅ تم حذف اسم المحتوى بنجاح' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: '❌ فشل في حذف اسم المحتوى.' });
  }
};

// تحديث custom_approval_sequence لملف
const updateContentApprovalSequence = async (req, res) => {
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
    
    // خزنها كنص JSON
    await db.execute(
      'UPDATE contents SET custom_approval_sequence = ?, custom_approval_roles = ? WHERE id = ?', 
      [JSON.stringify(approval_sequence), JSON.stringify(approval_roles), id]
    );
    
    res.json({ 
      message: 'Custom approval sequence and roles updated successfully',
      approval_sequence: approval_sequence,
      approval_roles: approval_roles
    });
  } catch (err) {
    console.error('updateContentApprovalSequence error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// جلب custom_approval_sequence مع الأدوار لملف
const getContentApprovalSequence = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(
      'SELECT custom_approval_sequence, custom_approval_roles FROM contents WHERE id = ? AND deleted_at IS NULL', 
      [id]
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Content not found' });
    }

    let approvalSequence = [];
    let approvalRoles = [];
    
    // معالجة تسلسل الموافقة
    const rawSeq = rows[0].custom_approval_sequence;
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
    const rawRoles = rows[0].custom_approval_roles;
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
    console.error('getContentApprovalSequence error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
};

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

// دالة مساعدة لاستخراج اسم المحتوى باللغة المناسبة
function getContentNameByLanguage(contentNameData, userLanguage = 'ar') {
    try {
        // إذا كان الاسم JSON يحتوي على اللغتين
        if (typeof contentNameData === 'string' && contentNameData.startsWith('{')) {
            const parsed = JSON.parse(contentNameData);
            return parsed[userLanguage] || parsed['ar'] || contentNameData;
        }
        // إذا كان نص عادي
        return contentNameData || 'غير معروف';
    } catch (error) {
        // في حالة فشل التحليل، إرجاع النص كما هو
        return contentNameData || 'غير معروف';
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

// دالة تسجيل عرض المحتوى
const logContentView = async (req, res) => {
  try {
    const { contentId, contentTitle, folderName, departmentName, committeeName } = req.body;
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const userLanguage = decoded.language || 'ar';

    // تحديد نوع المحتوى والوصف المناسب
    let actionType, description;
    let sourceName = departmentName || committeeName || 'غير محدد';
    
    // دالة مساعدة لتحويل الاسم إذا كان JSON
    function getLocalized(val) {
      if (!val) return '';
      if (typeof val === 'string' && val.startsWith('{')) {
        try {
          const parsed = JSON.parse(val);
          return parsed[userLanguage] || parsed['ar'] || parsed['en'] || val;
        } catch { return val; }
      }
      return val;
    }
    
    const folder = getLocalized(folderName) || 'غير محدد';
    const content = getLocalized(contentTitle) || contentTitle || 'غير محدد';
    const source = getLocalized(sourceName) || sourceName || 'غير محدد';
    
    // تحديد نوع المحتوى بناءً على وجود committeeName
    if (committeeName) {
      actionType = 'view_committee_content';
      description = JSON.stringify({
        ar: `عرض المحتوى "${content}" في ${source} داخل مجلد "${folder}"`,
        en: `Viewed content "${content}" in ${source} in folder "${folder}"`
      });
    } else {
      actionType = 'view_department_content';
      description = JSON.stringify({
        ar: `عرض المحتوى "${content}" في ${source} داخل مجلد "${folder}"`,
        en: `Viewed content "${content}" in ${source} in folder "${folder}"`
      });
    }

    // استخراج الرقم من contentId إذا كان يحتوي على نص
    let numericContentId = 0;
    if (typeof contentId === 'string') {
      if (contentId.includes('-')) {
        const match = contentId.match(/\d+$/);
        numericContentId = match ? parseInt(match[0]) : 0;
      } else {
        numericContentId = parseInt(contentId) || 0;
      }
    } else {
      numericContentId = parseInt(contentId) || 0;
    }
    
    // التحقق من صحة الرقم
    if (numericContentId <= 0) {
      console.warn('Invalid content ID:', contentId);
      // لا نوقف العملية، فقط لا نسجل اللوق
      return res.json({ status: 'success', message: 'View logged successfully' });
    }
    
    const contentType = committeeName ? 'committee' : 'department';
    await logAction(userId, actionType, description, contentType, numericContentId);
    res.json({ status: 'success', message: 'View logged successfully' });
  } catch (error) {
    console.error('Error logging content view:', error);
    res.status(500).json({ message: 'Failed to log view' });
  }
};

// دالة جلب الملفات المرفوضة
const getRejectedContents = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: لا يوجد توكن أو التوكن غير صالح' 
            });
        }

        const token = authHeader.split(' ')[1];
        let decodedToken;
        try {
            decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({ 
                status: 'error',
                message: 'غير مصرح: توكن غير صالح' 
            });
        }

        const connection = await db.getConnection();

        // بناء الاستعلام حسب دور المستخدم
        let query = `
            SELECT 
                c.id, 
                c.title, 
                c.notes,
                c.file_path, 
                c.approval_status,
                c.created_at,
                c.updated_at,
                f.name as folder_name,
                d.name as source_name,
                u.username as created_by_username,
                al.comments as reject_reason,
                al.created_at as rejected_at,
                al.approver_id as rejected_by_user_id
            FROM contents c
            LEFT JOIN folders f ON c.folder_id = f.id AND f.deleted_at IS NULL
            LEFT JOIN departments d ON f.department_id = d.id AND d.deleted_at IS NULL
            LEFT JOIN users u ON c.created_by = u.id
            LEFT JOIN approval_logs al ON c.id = al.content_id AND al.status = 'rejected'
            WHERE c.approval_status = 'rejected'
            AND c.deleted_at IS NULL
        `;

        let params = [];

        // إذا لم يكن المستخدم admin، أضف شرط الملكية أو الرفض
        if (decodedToken.role !== 'admin' || decodedToken.role !== 'super_admin') {
            query += ' AND (c.created_by = ? OR al.approver_id = ?)';
            params.push(decodedToken.id, decodedToken.id);
        }

        query += ' ORDER BY al.created_at DESC';

        const [rejectedContents] = await connection.execute(query, params);

        connection.release();

        res.json({
            status: 'success',
            message: 'تم جلب الملفات المرفوضة بنجاح',
            data: rejectedContents
        });
    } catch (error) {
        console.error('getRejectedContents error:', error);
        res.status(500).json({ 
            status: 'error',
            message: 'خطأ في جلب الملفات المرفوضة' 
        });
    }
};

// مثال: دالة إنشاء ملف جديد مع دعم التفويض الدائم
async function createContentWithDelegation(req, res) {
  try {
    // 1. استخرج بيانات الملف الجديد من الطلب
    const { departmentId, title, ...rest } = req.body;
    // 2. أنشئ الملف في قاعدة البيانات (بدون تسلسل الاعتماد بعد)
    const [result] = await db.execute(
      'INSERT INTO contents (title, department_id, ...) VALUES (?, ?, ...)',
      [title, departmentId /*, ...rest*/]
    );
    const contentId = result.insertId;
    // 3. جلب تسلسل الاعتماد من القسم
    const [deptRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
    let approvalSequence = [];
    if (deptRows.length && deptRows[0].approval_sequence) {
      approvalSequence = JSON.parse(deptRows[0].approval_sequence);
    }
    // 4. طبق التفويضات الدائمة وأضف سجلات بالنيابة إذا لزم
    approvalSequence = await applyPermanentDelegationsAndCreateProxyLogs(contentId, approvalSequence);
    // 5. خزّن التسلسل النهائي في الملف الجديد
    await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(approvalSequence), contentId]);
    // 6. أرجع استجابة النجاح
    res.status(201).json({ status: 'success', contentId });
  } catch (err) {
    console.error('Error in createContentWithDelegation:', err);
    res.status(500).json({ status: 'error', message: 'فشل إنشاء الملف مع التفويضات الدائمة' });
  }
}

module.exports = {
  getMyUploadedContent,
  getContentsByFolderId,
  addContent,
  updateContent,
  deleteContent,
  downloadContent,
  getContentById,
  approveContent,
  getContentNames,
  addContentName,
  updateContentName,
  deleteContentName,
  upload,
  logContentView,
  getRejectedContents,
  updateContentApprovalSequence,
  createContentWithDelegation,
  getContentApprovalSequence
};
  