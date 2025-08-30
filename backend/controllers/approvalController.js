const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const fsPromises = require('fs').promises;

const { logAction } = require('../models/logger');
const { insertNotification } = require('../models/notfications-utils');
const { 
  getFullNameWithJobNameSQLWithAlias, 
  buildFullName, 
  buildFullNameWithJobName,
  getFullNameSQLWithAlias,
  getFullNameSQLWithAliasAndFallback
} = require('../models/userUtils');

require('dotenv').config();

// قاعدة البيانات
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
const processArabicText = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  // تنظيف المسافات المتعددة
  let cleaned = text.replace(/\s+/g, ' ').trim();
  
  // تحسين عرض النص العربي في PDF
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  if (arabicPattern.test(cleaned)) {
    try {
      // استخدام arabic-reshaper لمعالجة النص العربي
      // التحقق من وجود الدالة أولاً
      if (typeof arabicReshaper.reshape === 'function') {
        const reshapedText = arabicReshaper.reshape(cleaned);
        return reshapedText;
      } else {
        console.warn('⚠️ arabicReshaper.reshape is not a function, using manual processing');
        throw new Error('reshape function not available');
      }
    } catch (error) {
      console.warn('⚠️ Error reshaping Arabic text:', error.message);
      // إذا فشل arabic-reshaper، استخدم المعالجة اليدوية المحسنة
      // إزالة المسافات الصغيرة التي تم إضافتها سابقاً
      cleaned = cleaned.replace(/\u200B/g, '');
      cleaned = cleaned.replace(/\u200C/g, '');
      cleaned = cleaned.replace(/\u200D/g, '');
      
      // تحسين المسافات بين الكلمات العربية
      cleaned = cleaned.replace(/\s+/g, ' ');
      
      // لا نضيف مسافات صغيرة بين الحروف لأنها تمنع الاتصال
      // بدلاً من ذلك، نترك النص كما هو للسماح للخط بالتعامل مع الاتصال
      
      return cleaned;
    }
  }
  
  return cleaned;
};

// دالة تجهيز النص العربي مع تحسينات إضافية
const prepareArabic = (text) => {
  if (!text || typeof text !== 'string') return text;
  
  // استخدام الدالة الجديدة لمعالجة النص العربي
  let processed = processArabicText(text);
  
  // تحسينات إضافية للنص العربي
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  if (arabicPattern.test(processed)) {
    // إزالة المسافات الزائدة في بداية ونهاية النص
    processed = processed.trim();
    
    // تحسين المسافات بين الكلمات العربية
    processed = processed.replace(/\s+/g, ' ');
    
    // إزالة أي مسافات صغيرة متبقية
    processed = processed.replace(/\u200B/g, '');
    processed = processed.replace(/\u200C/g, '');
    processed = processed.replace(/\u200D/g, '');
    
    // تحسين عرض النص العربي بإضافة مسافات مناسبة
    processed = processed.replace(/([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF])\s+([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF])/g, '$1 $2');
    
    // تحسين إضافي للنص العربي - إضافة مسافات صغيرة بين الحروف المتصلة
    // ولكن بطريقة لا تمنع الاتصال
    processed = processed.replace(/([\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF])(?=[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF])/g, '$1\u200E');
    
  }
  
  return processed;
};

// جلب التواقيع المعلقة للمستخدم
const getUserPendingApprovals = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const userRole = decoded.role;

    // إذا كان المستخدم admin، اعرض جميع الملفات المعلقة
    if (userRole === 'admin' || userRole === 'super_admin') {
      const [rows] = await db.execute(`
        SELECT 
          CONCAT('dept-', c.id) AS id, 
          c.title, 
          c.file_path, 
          c.notes, 
          c.approval_status, 
          CAST(c.approvers_required AS CHAR) AS approvers_required,
          c.approvals_log, 
          c.created_at,
          f.name AS folderName,
          COALESCE(d.name, '-') AS source_name,
          GROUP_CONCAT(DISTINCT ${getFullNameWithJobNameSQLWithAlias('u2', 'jn2')}) AS assigned_approvers
        FROM contents c
        JOIN folders f ON c.folder_id = f.id
        LEFT JOIN departments d ON f.department_id = d.id
        LEFT JOIN content_approvers ca ON ca.content_id = c.id
        LEFT JOIN users u2 ON ca.user_id = u2.id
        LEFT JOIN job_names jn2 ON u2.job_name_id = jn2.id
        WHERE c.is_approved = 0
          AND c.deleted_at IS NULL
          AND f.deleted_at IS NULL
          AND d.deleted_at IS NULL
        GROUP BY c.id
      `);

      rows.forEach(row => {
        if (typeof row.approvers_required === 'string') {
          try {
            row.approvers_required = JSON.parse(row.approvers_required);
          } catch (e) {
            row.approvers_required = [];
          }
        } else if (row.approvers_required === null || !Array.isArray(row.approvers_required)) {
          row.approvers_required = [];
        }
      });

      return res.status(200).json({ status: 'success', data: rows });
    }

    // للمستخدمين العاديين، اعرض فقط الملفات التي هم في تسلسل الاعتماد
    const [rows] = await db.execute(`
      SELECT 
        CONCAT('dept-', c.id) AS id, 
        c.title, 
        c.file_path, 
        c.notes, 
        c.approval_status, 
        CAST(c.approvers_required AS CHAR) AS approvers_required,
        c.approvals_log, 
        c.created_at,
        f.name AS folderName,
        COALESCE(d.name, '-') AS source_name,
        GROUP_CONCAT(DISTINCT ${getFullNameWithJobNameSQLWithAlias('u2', 'jn2')}) AS assigned_approvers,
        c.custom_approval_sequence,
        d.approval_sequence AS department_approval_sequence
      FROM contents c
      JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      LEFT JOIN content_approvers ca ON ca.content_id = c.id
      LEFT JOIN users u2 ON ca.user_id = u2.id
      LEFT JOIN job_names jn2 ON u2.job_name_id = jn2.id
      WHERE c.is_approved = 0
        AND c.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND d.deleted_at IS NULL
      GROUP BY c.id
    `);

    // فلترة الملفات بناءً على تسلسل الاعتماد
    const filteredRows = rows.filter(row => {
      let approvalSequence = [];
      
      // جرب custom_approval_sequence أولاً
      if (row.custom_approval_sequence) {
        try {
          approvalSequence = JSON.parse(row.custom_approval_sequence);
        } catch (e) {
          approvalSequence = [];
        }
      }
      
      // إذا لم يوجد custom، استخدم approval_sequence من القسم
      if (!Array.isArray(approvalSequence) || approvalSequence.length === 0) {
        if (row.department_approval_sequence) {
          try {
            if (Array.isArray(row.department_approval_sequence)) {
              approvalSequence = row.department_approval_sequence;
            } else {
              approvalSequence = JSON.parse(row.department_approval_sequence);
            }
          } catch (e) {
            approvalSequence = [];
          }
        }
      }

      // تحقق إذا كان المستخدم في التسلسل
      return approvalSequence.includes(Number(userId));
    });

    filteredRows.forEach(row => {
      if (typeof row.approvers_required === 'string') {
        try {
          row.approvers_required = JSON.parse(row.approvers_required);
        } catch (e) {
          row.approvers_required = [];
        }
      } else if (row.approvers_required === null || !Array.isArray(row.approvers_required)) {
        row.approvers_required = [];
      }
    });

    res.status(200).json({ status: 'success', data: filteredRows });
  } catch (err) {
    console.error('getUserPendingApprovals error:', err);
    res.status(500).json({ status: 'error', message: 'خطأ في جلب الموافقات المعلقة للمستخدم' });
  }
};

// اعتماد/رفض ملف
const handleApproval = async (req, res) => {
  let { contentId: originalContentId } = req.params;
  const { approved, signature, notes, electronic_signature, on_behalf_of } = req.body;

  let contentId;
  let isCommitteeContent = false;

  if (typeof originalContentId === 'string') {
    if (originalContentId.startsWith('dept-')) {
      contentId = parseInt(originalContentId.split('-')[1], 10);
      isCommitteeContent = false;
    } else if (originalContentId.startsWith('comm-')) {
      // Redirect committee content to the appropriate handler
      return res.status(400).json({ 
        status: 'error', 
        message: 'محتوى اللجان يجب أن يتم اعتماده عبر API اللجان المنفصل' 
      });
    } else {
      contentId = parseInt(originalContentId, 10);
      isCommitteeContent = false;
    }
  } else {
    contentId = originalContentId;
    isCommitteeContent = false;
  }

  if (typeof approved !== 'boolean') {
    return res.status(400).json({ status: 'error', message: 'البيانات ناقصة' });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.id;
    const userRole = decoded.role;
    
    // تحقق من دور المدير فقط
    const canViewAll = userRole === 'admin' || userRole === 'super_admin';

    // تمييز نوع الاعتماد بناءً على on_behalf_of أو وجود تفويض في قاعدة البيانات
    let isProxy = false;
    let delegatedBy = null;
    
    if (on_behalf_of) {
      isProxy = true;
      delegatedBy = on_behalf_of;
    } else {
      // تحقق من وجود تفويض في approval_logs
      const [proxyLogs] = await db.execute(
        `SELECT delegated_by FROM approval_logs 
         WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 1`,
        [contentId, currentUserId]
      );
      
      if (proxyLogs.length > 0) {
        isProxy = true;
        delegatedBy = proxyLogs[0].delegated_by;
      }
    }

    // تحقق من وجود تفويض دائم
    let permanentDelegator = null;
    const [permDelegRows] = await db.execute(
      'SELECT user_id FROM active_delegations WHERE delegate_id = ?',
      [currentUserId]
    );

    if (permDelegRows.length) {
      permanentDelegator = permDelegRows[0].user_id;
      isProxy = true;
      delegatedBy = permanentDelegator;
    }

    // إذا كان هناك تفويض دائم أو نيابة، سجّل سجلين (شخصي + نيابة) وتوقف هنا
    if (approved && (permanentDelegator || isProxy)) {
  
      // جلب التسلسل للتحقق من الموقع الأصلي
      let approvalSequence = [];
      const [customRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
      if (customRows.length && customRows[0].custom_approval_sequence) {
        try {
          const parsed = JSON.parse(customRows[0].custom_approval_sequence);
          if (Array.isArray(parsed) && parsed.length > 0) {
            approvalSequence = parsed;
          }
        } catch (e) {}
      }
      if (approvalSequence.length === 0) {
        // جلب من القسم
        const [folderRows] = await db.execute('SELECT folder_id FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
        if (folderRows.length) {
          const folderId = folderRows[0].folder_id;
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
            if (seqRows.length) {
              let approvalSequenceRaw = seqRows[0].approval_sequence;
              if (Array.isArray(approvalSequenceRaw)) {
                approvalSequence = approvalSequenceRaw;
              } else if (typeof approvalSequenceRaw === 'string') {
                try {
                  approvalSequence = JSON.parse(approvalSequenceRaw);
                } catch (e) {
                  approvalSequence = [];
                }
              }
            }
          }
        }
      }
      approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
      
      // تحقق هل للمستخدم موقع أصلي
      const hasSelf = approvalSequence.some(id => Number(id) === Number(currentUserId));
      
      // سجل شخصي إذا كان له موقع أصلي
      if (hasSelf) {
        try {
          // تحديث السجل الموجود مسبقاً بدلاً من إنشاء سجل جديد
          const [existingSelfLog] = await db.execute(
            `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 0`,
            [contentId, currentUserId]
          );
          
          if (existingSelfLog.length > 0) {
            // تحديث السجل الموجود
            await db.execute(`
              UPDATE approval_logs 
              SET status = ?, signature = ?, electronic_signature = ?, comments = ?, created_at = NOW()
              WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 0
            `, [
              approved ? 'approved' : 'rejected',
              signature || null,
              electronic_signature || null,
              notes || '',
              contentId,
              currentUserId
            ]);
          } else {
            // إنشاء سجل جديد إذا لم يكن موجوداً
            await db.execute(`
              INSERT INTO approval_logs (
                content_id, approver_id, delegated_by, signed_as_proxy, status, signature, electronic_signature, comments, created_at
              ) VALUES (?, ?, NULL, 0, ?, ?, ?, ?, NOW())
            `, [
              contentId,
              currentUserId,
              approved ? 'approved' : 'rejected',
              signature || null,
              electronic_signature || null,
              notes || ''
            ]);
          }
  
        } catch (e) {
          console.error('Error updating self approval log:', e);
        }
      }
      
      // سجل بالنيابة (إما تفويض دائم أو نيابة عادية)
      const delegatorId = permanentDelegator || delegatedBy;
      try {
        // تحديث السجل الموجود مسبقاً بدلاً من إنشاء سجل جديد
        const [existingProxyLog] = await db.execute(
          `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
          [contentId, currentUserId, delegatorId]
        );
        
        if (existingProxyLog.length > 0) {
          // تحديث السجل الموجود
          await db.execute(`
            UPDATE approval_logs 
            SET status = ?, signature = ?, electronic_signature = ?, comments = ?, created_at = NOW()
            WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1
          `, [
            approved ? 'approved' : 'rejected',
            signature || null,
            electronic_signature || null,
            notes || '',
            contentId,
            currentUserId,
            delegatorId
          ]);
        } else {
          // إنشاء سجل جديد إذا لم يكن موجوداً
          await db.execute(`
            INSERT INTO approval_logs (
              content_id, approver_id, delegated_by, signed_as_proxy, status, signature, electronic_signature, comments, created_at
            ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NOW())
          `, [
            contentId,
            currentUserId,
            delegatorId,
            approved ? 'approved' : 'rejected',
            signature || null,
            electronic_signature || null,
            notes || ''
          ]);
        }

      } catch (e) {
        console.error('Error updating proxy approval log:', e);
      }
      
      // تحديث ملف PDF مباشرة بعد كل عملية اعتماد
      try {
        await generateFinalSignedPDF(contentId);

      } catch (e) {

      }
      
      // تحديث حقل approvals_log في جدول contents ليعكس آخر حالة من جدول approval_logs
      try {
        const [allLogs] = await db.execute(
          `SELECT approver_id AS user_id, status, signature, electronic_signature, comments, created_at FROM approval_logs WHERE content_id = ?`,
          [contentId]
        );
        await db.execute(
          `UPDATE contents SET approvals_log = ? WHERE id = ?`,
          [JSON.stringify(allLogs), contentId]
        );

      } catch (e) {

      }
      
      // إذا كان الرفض، إرسال إشعار لصاحب الملف
      if (!approved) {
        try {
          const [ownerRows] = await db.execute('SELECT created_by, title FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
          if (ownerRows.length) {
            const ownerId = ownerRows[0].created_by;
            const fileTitle = ownerRows[0].title || '';
            const delegatorName = permanentDelegator || delegatedBy;
            await insertNotification(
              ownerId,
              'تم رفض ملفك',
              `الملف "${fileTitle}" تم رفضه من قبل مفوض عن ${delegatorName}. السبب: ${notes || 'لم يتم تحديد سبب'}`,
              'rejected'
            );
          }
        } catch (e) {
          console.error('Error sending rejection notification to owner:', e);
        }
      }
      
      // تحقق من اكتمال الاعتماد من جميع أعضاء التسلسل (custom أو department)
      try {
        let approvalSequenceFinal = [];
        // جلب custom_approval_sequence من جدول contents
        const [customRowsFinal] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
        if (customRowsFinal.length && customRowsFinal[0].custom_approval_sequence) {
          try {
            const parsed = JSON.parse(customRowsFinal[0].custom_approval_sequence);
            if (Array.isArray(parsed) && parsed.length > 0) {
              approvalSequenceFinal = parsed;
            }
          } catch {}
        }
        // إذا لا يوجد custom أو كان فارغًا، استخدم approval_sequence من القسم
        if (approvalSequenceFinal.length === 0) {
          // جلب folder_id من جدول contents
          const [folderRows] = await db.execute(`SELECT folder_id FROM contents WHERE id = ? AND deleted_at IS NULL`, [contentId]);
          if (folderRows.length) {
            const folderId = folderRows[0].folder_id;
            // جلب department_id من جدول folders
            const [deptRows] = await db.execute(`SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL`, [folderId]);
            if (deptRows.length) {
              const departmentId = deptRows[0].department_id;
              // جلب approval_sequence من جدول departments
              const [seqRows] = await db.execute(`SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL`, [departmentId]);
              if (seqRows.length) {
                const rawSeq = seqRows[0].approval_sequence;
                if (Array.isArray(rawSeq)) {
                  approvalSequenceFinal = rawSeq;
                } else if (typeof rawSeq === 'string') {
                  try {
                    approvalSequenceFinal = JSON.parse(rawSeq);
                  } catch {
                    approvalSequenceFinal = [];
                  }
                } else {
                  approvalSequenceFinal = [];
                }
              }
            }
          }
        }
        approvalSequenceFinal = (approvalSequenceFinal || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
        
        // جلب كل السجلات من approval_logs لهذا الملف
        const [logsFinal] = await db.execute(`SELECT approver_id, status, signed_as_proxy, delegated_by FROM approval_logs WHERE content_id = ?`, [contentId]);
        
        // لكل موقع في التسلسل، يجب أن يكون هناك سجل معتمد (status = 'approved') سواء self أو proxy
        let allApprovedFinal = true;
        for (let i = 0; i < approvalSequenceFinal.length; i++) {
          const approverId = Number(approvalSequenceFinal[i]);
          
          // ابحث عن أي سجل معتمد (سواء self أو proxy) لهذا الموقع
          // في حالة التفويض الشامل، قد يكون هناك سجلان (شخصي + نيابة) لنفس الموقع
          const hasApprovedFinal = logsFinal.some(log => {
            // تحقق من أن السجل معتمد
            if (log.status !== 'approved') return false;
            
            // تحقق من أن السجل يخص هذا الموقع (سواء مباشر أو نيابة)
            if (Number(log.approver_id) === approverId) return true;
            
            // تحقق من أن السجل نيابة عن هذا الموقع (في حالة التفويض الشامل)
            if (log.signed_as_proxy === 1 && Number(log.delegated_by) === approverId) return true;
            
            return false;
          });
          
          if (!hasApprovedFinal) {
            allApprovedFinal = false;
            break;
          }
        }
        
        if (allApprovedFinal && approvalSequenceFinal.length > 0) {
          await db.execute(`
            UPDATE contents
            SET is_approved = 1,
                approval_status = 'approved',
                approved_by = ?, 
                updated_at = NOW()
            WHERE id = ?
          `, [currentUserId, contentId]);
          
          // إرسال إشعار لصاحب الملف بأن الملف تم اعتماده من الجميع
          const [ownerRowsFinal] = await db.execute(`SELECT created_by, title FROM contents WHERE id = ? AND deleted_at IS NULL`, [contentId]);
          if (ownerRowsFinal.length) {
            const ownerIdFinal = ownerRowsFinal[0].created_by;
            const fileTitleFinal = ownerRowsFinal[0].title || '';
            await insertNotification(
              ownerIdFinal,
              'تم اعتماد ملفك',
              `الملف "${fileTitleFinal}" تم اعتماده من قبل جميع المعتمدين.`,
              'approval'
            );
          }
        }
      } catch (e) {
        console.error('Error checking completion in delegation case:', e);
      }
      
      // الاستجابة النهائية
      return res.status(200).json({ status: 'success', message: 'تم تسجيل اعتمادك بنجاح (شخصي ونيابة)' });
    }

    // إذا وصلنا هنا، يعني لا يوجد تفويض، لذا نضيف توقيع واحد فقط


    // للمدير: السماح بالاعتماد بغض النظر عن التسلسل
    if (canViewAll) {
      if (approved === true && !signature && !electronic_signature) {
        return res.status(400).json({ status: 'error', message: 'التوقيع مفقود' });
      }
      
      // تسجيل اعتماد المدير
      await db.execute(`
        INSERT INTO approval_logs (
          content_id, approver_id, delegated_by, signed_as_proxy, status, signature, electronic_signature, comments, created_at
        ) VALUES (?, ?, NULL, 0, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          signature = VALUES(signature),
          electronic_signature = VALUES(electronic_signature),
          comments = VALUES(comments),
          created_at = NOW()
      `, [
        contentId,
        currentUserId,
        approved ? 'approved' : 'rejected',
        signature || null,
        electronic_signature || null,
        notes || ''
      ]);

      // تحديث ملف PDF
      await generateFinalSignedPDF(contentId);

      // تحديث approvals_log
      const [allLogs] = await db.execute(
        `SELECT approver_id AS user_id, status, signature, electronic_signature, comments, created_at FROM approval_logs WHERE content_id = ?`,
        [contentId]
      );
      await db.execute(
        `UPDATE contents SET approvals_log = ? WHERE id = ?`,
        [JSON.stringify(allLogs), contentId]
      );

      // إذا كان الرفض، تحديث حالة الملف
      if (!approved) {
        await db.execute(`
          UPDATE contents
          SET approval_status = 'rejected',
              is_approved = 0,
              updated_at = NOW()
          WHERE id = ?
        `, [contentId]);
        
        // إرسال إشعار لصاحب الملف بالرفض
        try {
          const [ownerRows] = await db.execute('SELECT created_by, title FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
          if (ownerRows.length) {
            const ownerId = ownerRows[0].created_by;
            const fileTitle = ownerRows[0].title || '';
            await insertNotification(
              ownerId,
              'تم رفض ملفك',
              `الملف "${fileTitle}" تم رفضه من قبل الإدارة. السبب: ${notes || 'لم يتم تحديد سبب'}`,
              'rejected'
            );
          }
        } catch (e) {
          console.error('Error sending rejection notification to owner:', e);
        }
      }

      // للمدير: إذا كان الاعتماد، تحقق من اكتمال الاعتماد
      if (approved) {
        // جلب التسلسل للتحقق
        let approvalSequence = [];
        const [customRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
        if (customRows.length && customRows[0].custom_approval_sequence) {
          try {
            const parsed = JSON.parse(customRows[0].custom_approval_sequence);
            if (Array.isArray(parsed) && parsed.length > 0) {
              approvalSequence = parsed;
            }
          } catch {}
        }
        if (approvalSequence.length === 0) {
          const [folderRows] = await db.execute('SELECT folder_id FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
          if (folderRows.length) {
            const folderId = folderRows[0].folder_id;
            const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
            if (deptRows.length) {
              const departmentId = deptRows[0].department_id;
              const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
              if (seqRows.length) {
                const rawSeq = seqRows[0].approval_sequence;
                if (Array.isArray(rawSeq)) {
                  approvalSequence = rawSeq;
                } else if (typeof rawSeq === 'string') {
                  try {
                    approvalSequence = JSON.parse(rawSeq);
                  } catch {
                    approvalSequence = [];
                  }
                }
              }
            }
          }
        }
        approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));

        // إذا لم يكن هناك تسلسل أو كان فارغاً، اعتمد الملف مباشرة
        if (approvalSequence.length === 0) {
          await db.execute(`
            UPDATE contents
            SET is_approved = 1,
                approval_status = 'approved',
                approved_by = ?, 
                updated_at = NOW()
            WHERE id = ?
          `, [currentUserId, contentId]);
          
          // إرسال إشعار لصاحب الملف
          const [ownerRows] = await db.execute('SELECT created_by, title FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
          if (ownerRows.length) {
            const ownerId = ownerRows[0].created_by;
            const fileTitle = ownerRows[0].title || '';
            await insertNotification(
              ownerId,
              'تم اعتماد ملفك',
              `الملف "${fileTitle}" تم اعتماده من قبل المدير.`,
              'approval'
            );
          }
        } else {
          // إذا كان هناك تسلسل، تحقق من اكتمال الاعتماد
          const [logs] = await db.execute('SELECT approver_id, status FROM approval_logs WHERE content_id = ?', [contentId]);
          let allApproved = true;
          for (let i = 0; i < approvalSequence.length; i++) {
            const approverId = Number(approvalSequence[i]);
            const hasApproved = logs.some(log => Number(log.approver_id) === approverId && log.status === 'approved');
            if (!hasApproved) {
              allApproved = false;
              break;
            }
          }
          if (allApproved) {
            await db.execute(`
              UPDATE contents
              SET is_approved = 1,
                  approval_status = 'approved',
                  approved_by = ?, 
                  updated_at = NOW()
              WHERE id = ?
            `, [currentUserId, contentId]);
            
                      // إرسال إشعار لصاحب الملف
          const [ownerRows] = await db.execute('SELECT created_by, title FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
            if (ownerRows.length) {
              const ownerId = ownerRows[0].created_by;
              const fileTitle = ownerRows[0].title || '';
              await insertNotification(
                ownerId,
                'تم اعتماد ملفك',
                `الملف "${fileTitle}" تم اعتماده من قبل الإدارة.`,
                'approval'
              );
            }
          }
        }
      }

      // جلب تفاصيل الملف للتسجيل
      const [itemDetails] = await db.execute(`SELECT title FROM contents WHERE id = ? AND deleted_at IS NULL`, [contentId]);
      const itemTitle = itemDetails.length > 0 ? itemDetails[0].title : `رقم ${contentId}`;

      // تسجيل الحركة
      const logDescription = {
        ar: `تم ${approved ? 'اعتماد' : 'رفض'} الملف: "${getContentNameByLanguage(itemTitle, 'ar')}" بواسطة الادمن`,
        en: `${approved ? 'Approved' : 'Rejected'} file: "${getContentNameByLanguage(itemTitle, 'en')}" by admin`
      };

      await logAction(
        currentUserId,
        approved ? 'approve_content' : 'reject_content',
        JSON.stringify(logDescription),
        'content',
        contentId
      );

      return res.status(200).json({ 
        status: 'success', 
        message: approved ? 'تم تسجيل اعتمادك بنجاح (بواسطة الادمن)' : 'تم تسجيل رفضك بنجاح (بواسطة الادمن)' 
      });
    }

    // للمستخدمين العاديين: التحقق من التوقيع
    if (approved === true && !signature && !electronic_signature) {
      return res.status(400).json({ status: 'error', message: 'التوقيع مفقود' });
    }

    const approvalLogsTable = 'approval_logs';
    const contentApproversTable = 'content_approvers';
    const contentsTable = 'contents';
    const generatePdfFunction = generateFinalSignedPDF;


    // إضافة أو تحديث سجل الاعتماد باستخدام INSERT ... ON DUPLICATE KEY UPDATE
    await db.execute(`
      INSERT INTO ${approvalLogsTable} (
        content_id,
        approver_id,
        delegated_by,
        signed_as_proxy,
        status,
        signature,
        electronic_signature,
        comments,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        signature = VALUES(signature),
        electronic_signature = VALUES(electronic_signature),
        comments = VALUES(comments),
        created_at = NOW()
    `, [
      contentId,
      currentUserId,
      delegatedBy,
      isProxy ? 1 : 0,
      approved ? 'approved' : 'rejected',
      signature || null,
      electronic_signature || null,
      notes || ''
    ]);

    // تحديث ملف PDF مباشرة بعد كل عملية اعتماد (لكن بدون توقيعات مكررة)
    await generatePdfFunction(contentId);

    // تحديث حقل approvals_log في جدول contents ليعكس آخر حالة من جدول approval_logs
    const [allLogs] = await db.execute(
      `SELECT approver_id AS user_id, status, signature, electronic_signature, comments, created_at FROM approval_logs WHERE content_id = ?`,
      [contentId]
    );
    await db.execute(
      `UPDATE contents SET approvals_log = ? WHERE id = ?`,
      [JSON.stringify(allLogs), contentId]
    );

    // إضافة الشخص التالي في التسلسل (custom أو department) إلى content_approvers (إن وجد)
    if (approved) {
      try {
        // جلب التسلسل الفعلي (custom أو department)
        let approvalSequence2 = [];
        // جلب custom_approval_sequence من جدول contents
        const [customRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
        if (customRows.length && customRows[0].custom_approval_sequence) {
          try {
            const parsed = JSON.parse(customRows[0].custom_approval_sequence);
            if (Array.isArray(parsed) && parsed.length > 0) {
              approvalSequence2 = parsed;
            }
          } catch {}
        }
        // إذا لا يوجد custom أو كان فارغًا، استخدم approval_sequence من القسم
        if (approvalSequence2.length === 0) {
          // جلب folder_id من جدول contents
          const [folderRows2] = await db.execute(`SELECT folder_id FROM ${contentsTable} WHERE id = ? AND deleted_at IS NULL`, [contentId]);
          if (folderRows2.length) {
            const folderId2 = folderRows2[0].folder_id;
            // جلب department_id من جدول folders
            const [deptRows2] = await db.execute(`SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL`, [folderId2]);
            if (deptRows2.length) {
              const departmentId2 = deptRows2[0].department_id;
              // جلب approval_sequence من جدول departments
              const [seqRows2] = await db.execute(`SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL`, [departmentId2]);
              if (seqRows2.length) {
                const rawSeq = seqRows2[0].approval_sequence;
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
              }
            }
          }
        }
        approvalSequence2 = (approvalSequence2 || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
        // ابحث عن كل المواقع التي يظهر فيها approverId في التسلسل
        const allIndexes = [];
        approvalSequence2.forEach((id, i) => {
          if (Number(id) === Number(currentUserId)) allIndexes.push(i);
        });
        // تحقق أن عدد سجلات الاعتماد (approved) لهذا المستخدم يساوي عدد مرات ظهوره في التسلسل
        const approvedLogsCount = allLogs.filter(log =>
          Number(log.user_id) === Number(currentUserId) &&
          log.status === 'approved'
        ).length;

        if (approvedLogsCount >= allIndexes.length && allIndexes.length > 0) {
          // انتقل للشخص التالي في التسلسل
          const maxIdx = Math.max(...allIndexes);
          if (maxIdx < approvalSequence2.length - 1) {
            const nextApproverId = approvalSequence2[maxIdx + 1];
            // تحقق إذا كان التالي لم يعتمد بعد
            const [logNext] = await db.execute(`SELECT status FROM approval_logs WHERE content_id = ? AND approver_id = ?`, [contentId, nextApproverId]);
            if (!logNext.length || logNext[0].status !== 'approved') {
              await db.execute(`INSERT IGNORE INTO ${contentApproversTable} (content_id, user_id) VALUES (?, ?)`, [contentId, nextApproverId]);
              // إرسال إشعار للشخص التالي
              const [contentRows] = await db.execute(`SELECT title FROM ${contentsTable} WHERE id = ? AND deleted_at IS NULL`, [contentId]);
              const fileTitle = contentRows.length ? contentRows[0].title : '';
              await insertNotification(
                nextApproverId,
                'ملف جديد بانتظار اعتمادك',
                `لديك ملف بعنوان "${fileTitle}" بحاجة لاعتمادك.`,
                'approval'
              );
            }
          }
        }
      } catch (e) {
        console.error('Error while adding next approver:', e);
      }
    }
// إذا كان الرفض، تحديث حالة الملف إلى مرفوض
    if (!approved) {
      await db.execute(`
        UPDATE ${contentsTable}
        SET approval_status = 'rejected',
            is_approved = 0,
            updated_at = NOW()
        WHERE id = ?
      `, [contentId]);
      
      // إرسال إشعار لصاحب الملف بالرفض
      try {
        const [ownerRows] = await db.execute(`SELECT created_by, title FROM ${contentsTable} WHERE id = ? AND deleted_at IS NULL`, [contentId]);
        if (ownerRows.length) {
          const ownerId = ownerRows[0].created_by;
          const fileTitle = ownerRows[0].title || '';
          const approverName = isProxy ? `مفوض عن ${delegatedBy}` : 'أحد المعتمدين';
          await insertNotification(
            ownerId,
            'تم رفض ملفك',
            `الملف "${fileTitle}" تم رفضه من قبل ${approverName}. السبب: ${notes || 'لم يتم تحديد سبب'}`,
            'rejected'
          );
        }
      } catch (e) {
        console.error('Error sending rejection notification to owner:', e);
      }
    }
    // Fetch details for logging
    const [itemDetails] = await db.execute(`SELECT title FROM ${contentsTable} WHERE id = ?`, [contentId]);
    const itemTitle = itemDetails.length > 0 ? itemDetails[0].title : `رقم ${contentId}`;

    // ✅ log action
    const logDescription = {
        ar: `تم ${approved ? 'اعتماد' : 'رفض'} الملف: "${getContentNameByLanguage(itemTitle, 'ar')}"${isProxy ? ' كمفوض عن مستخدم آخر' : ''}`,
        en: `${approved ? 'Approved' : 'Rejected'} file: "${getContentNameByLanguage(itemTitle, 'en')}"${isProxy ? ' as a proxy' : ''}`
    };

    await logAction(
      currentUserId,
      approved ? 'approve_content' : 'reject_content',
      JSON.stringify(logDescription),
      'content',
      contentId
    );

    if (isProxy && currentUserId) {
      // لم يعد هناك إشعار هنا
    }


    if (approved === true && isProxy) {
      await db.execute(`
        INSERT IGNORE INTO ${contentApproversTable} (content_id, user_id)
        VALUES (?, ?)
      `, [contentId, currentUserId]);
    }

    // تحقق من اكتمال الاعتماد من جميع أعضاء التسلسل (custom أو department)
    let approvalSequence = [];
    // جلب custom_approval_sequence من جدول contents
            const [customRowsFinal] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ? AND deleted_at IS NULL', [contentId]);
    if (customRowsFinal.length && customRowsFinal[0].custom_approval_sequence) {
      try {
        const parsed = JSON.parse(customRowsFinal[0].custom_approval_sequence);
        if (Array.isArray(parsed) && parsed.length > 0) {
          approvalSequence = parsed;
        }
      } catch {}
    }
    // إذا لا يوجد custom أو كان فارغًا، استخدم approval_sequence من القسم
    if (approvalSequence.length === 0) {
      // جلب folder_id من جدول contents
      const [folderRows] = await db.execute(`SELECT folder_id FROM ${contentsTable} WHERE id = ?`, [contentId]);
      if (folderRows.length) {
        const folderId = folderRows[0].folder_id;
        // جلب department_id من جدول folders
                    const [deptRows] = await db.execute(`SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL`, [folderId]);
        if (deptRows.length) {
          const departmentId = deptRows[0].department_id;
          // جلب approval_sequence من جدول departments
                      const [seqRows] = await db.execute(`SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL`, [departmentId]);
          if (seqRows.length) {
            const rawSeq = seqRows[0].approval_sequence;
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
          }
        }
      }
    }
    approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
    // جلب كل السجلات من approval_logs لهذا الملف
    const [logs] = await db.execute(`SELECT approver_id, status, signed_as_proxy, delegated_by FROM approval_logs WHERE content_id = ?`, [contentId]);
    // لكل موقع في التسلسل، يجب أن يكون هناك سجل معتمد (status = 'approved') سواء self أو proxy
    let allApproved = true;
    for (let i = 0; i < approvalSequence.length; i++) {
      const approverId = Number(approvalSequence[i]);
      
      // ابحث عن أي سجل معتمد (سواء self أو proxy) لهذا الموقع
      // في حالة التفويض الشامل، قد يكون هناك سجلان (شخصي + نيابة) لنفس الموقع
      const hasApproved = logs.some(log => {
        // تحقق من أن السجل معتمد
        if (log.status !== 'approved') return false;
        
        // تحقق من أن السجل يخص هذا الموقع (سواء مباشر أو نيابة)
        if (Number(log.approver_id) === approverId) return true;
        
        // تحقق من أن السجل نيابة عن هذا الموقع (في حالة التفويض الشامل)
        if (log.signed_as_proxy === 1 && Number(log.delegated_by) === approverId) return true;
        
        return false;
      });
      
      if (!hasApproved) {
        allApproved = false;
        break;
      }
    }
    if (allApproved && approvalSequence.length > 0) {
      await db.execute(`
        UPDATE ${contentsTable}
        SET is_approved = 1,
            approval_status = 'approved',
            approved_by = ?, 
            updated_at = NOW()
        WHERE id = ?
      `, [currentUserId, contentId]);
      // إرسال إشعار لصاحب الملف بأن الملف تم اعتماده من الجميع
      let [ownerRowsFinal] = await db.execute(`SELECT created_by, title FROM ${contentsTable} WHERE id = ?`, [contentId]);
      if (ownerRowsFinal.length) {
        const ownerIdFinal = ownerRowsFinal[0].created_by;
        const fileTitleFinal = ownerRowsFinal[0].title || '';
        await insertNotification(
          ownerIdFinal,
          approved ? 'تم اعتماد ملفك' : 'تم رفض ملفك',
          `الملف "${fileTitleFinal}" ${approved ? 'تم اعتماده' : 'تم رفضه'} من قبل الإدارة.`,
          approved ? 'approval' : 'rejected'
        );
      }
    }

    // الاستجابة النهائية
    if (approved) {
      return res.status(200).json({ status: 'success', message: 'تم تسجيل اعتمادك بنجاح' });
    } else {
      return res.status(200).json({ status: 'success', message: 'تم تسجيل رفضك بنجاح' });
    }
  } catch (err) {
    console.error('Error in handleApproval:', err);
    return res.status(500).json({ status: 'error', message: 'خطأ أثناء معالجة الاعتماد', error: err.message, stack: err.stack });
  }
};


// توليد نسخة نهائية موقعة من PDF مع دعم "توقيع بالنيابة" باستخدام pdfmake
async function generateFinalSignedPDF(contentId) {
  // 1) جلب مسار الملف
  const [fileRows] = await db.execute(
    `SELECT file_path FROM contents WHERE id = ? AND deleted_at IS NULL`,
    [contentId]
  );
  if (!fileRows.length) {
    return console.error('📁 Content not found for ID', contentId);
  }
  const relativePath = fileRows[0].file_path;
  const fullPath = path.join(__dirname, '../../uploads', relativePath);
  if (!fs.existsSync(fullPath)) {
    return console.error('❌ File not found on disk:', fullPath);
  }

  // 2) تحميل وثيقة الـ PDF الأصلية
  let originalPdfBytes;
  let electronicSealDataUrl;
  try {
    originalPdfBytes = fs.readFileSync(fullPath);
    // قراءة ختم الاعتماد الإلكتروني كـ base64 مرة واحدة
    const electronicSealBase64 = fs.readFileSync(path.join(__dirname, '../e3teamdelc.png')).toString('base64');
    electronicSealDataUrl = 'data:image/png;base64,' + electronicSealBase64;
  } catch (err) {
    return console.error('❌ Failed to load original PDF or electronic seal:', err);
  }

  // 3) جلب الأدوار من custom_approval_roles أو approval_roles
  let approvalRoles = [];
  try {
    console.log('🔍 [PDF] جلب الأدوار للملف:', contentId);
    
    // جرب custom_approval_roles أولاً
    const [customRolesRows] = await db.execute(
      'SELECT custom_approval_roles, folder_id FROM contents WHERE id = ? AND deleted_at IS NULL',
      [contentId]
    );
    
    console.log('🔍 [PDF] custom_approval_roles raw:', customRolesRows[0]?.custom_approval_roles);
    
    if (customRolesRows.length && customRolesRows[0].custom_approval_roles) {
      try {
        const rawCustomRoles = customRolesRows[0].custom_approval_roles;
        console.log('🔍 [PDF] custom_approval_roles raw:', rawCustomRoles, 'type:', typeof rawCustomRoles);
        
        if (Array.isArray(rawCustomRoles)) {
          approvalRoles = rawCustomRoles;
          console.log('✅ [PDF] custom_approval_roles is already array:', approvalRoles);
        } else if (typeof rawCustomRoles === 'string') {
          // محاولة تحليل JSON
          try {
            approvalRoles = JSON.parse(rawCustomRoles);
            console.log('✅ [PDF] تم تحليل custom_approval_roles JSON:', approvalRoles);
          } catch (jsonError) {
            // إذا فشل JSON، جرب تقسيم النص بالفاصلة
            console.log('⚠️ [PDF] فشل تحليل JSON، جرب تقسيم النص:', rawCustomRoles);
            if (rawCustomRoles.includes(',')) {
              approvalRoles = rawCustomRoles.split(',').map(role => role.trim());
              console.log('✅ [PDF] تم تقسيم النص بالفاصلة:', approvalRoles);
            } else {
              // إذا كان نص واحد فقط
              approvalRoles = [rawCustomRoles.trim()];
              console.log('✅ [PDF] نص واحد فقط:', approvalRoles);
            }
          }
        } else {
          console.log('⚠️ [PDF] custom_approval_roles نوع غير متوقع:', typeof rawCustomRoles);
        }
      } catch (e) {
        console.warn('⚠️ Failed to parse custom_approval_roles:', e);
      }
    }
    
    // إذا لم يوجد custom_approval_roles، جرب approval_roles من القسم
    if (!approvalRoles.length && customRolesRows.length) {
      const folderId = customRolesRows[0].folder_id;
      console.log('🔍 [PDF] جرب approval_roles من القسم، folder_id:', folderId);
      
      if (folderId) {
        const [deptRows] = await db.execute(
          'SELECT d.approval_roles FROM folders f JOIN departments d ON f.department_id = d.id WHERE f.id = ? AND f.deleted_at IS NULL',
          [folderId]
        );
        
        console.log('🔍 [PDF] department approval_roles raw:', deptRows[0]?.approval_roles);
        
        if (deptRows.length && deptRows[0].approval_roles) {
          try {
            const rawRoles = deptRows[0].approval_roles;
            console.log('🔍 [PDF] department approval_roles raw:', rawRoles, 'type:', typeof rawRoles);
            
            if (Array.isArray(rawRoles)) {
              approvalRoles = rawRoles;
              console.log('✅ [PDF] department approval_roles is already array:', approvalRoles);
            } else if (typeof rawRoles === 'string') {
              // محاولة تحليل JSON
              try {
                approvalRoles = JSON.parse(rawRoles);
                console.log('✅ [PDF] تم تحليل department approval_roles JSON:', approvalRoles);
              } catch (jsonError) {
                // إذا فشل JSON، جرب تقسيم النص بالفاصلة
                console.log('⚠️ [PDF] فشل تحليل JSON، جرب تقسيم النص:', rawRoles);
                if (rawRoles.includes(',')) {
                  approvalRoles = rawRoles.split(',').map(role => role.trim());
                  console.log('✅ [PDF] تم تقسيم النص بالفاصلة:', approvalRoles);
                } else {
                  // إذا كان نص واحد فقط
                  approvalRoles = [rawRoles.trim()];
                  console.log('✅ [PDF] نص واحد فقط:', approvalRoles);
                }
              }
            } else {
              console.log('⚠️ [PDF] department approval_roles نوع غير متوقع:', typeof rawRoles);
            }
          } catch (e) {
            console.warn('⚠️ Failed to parse department approval_roles:', e);
          }
        }
      }
    }
    
    console.log('🎯 [PDF] الأدوار النهائية:', approvalRoles);
  } catch (e) {
    console.warn('⚠️ Failed to fetch approval roles:', e);
  }

  const [logs] = await db.execute(`
    SELECT
      al.signed_as_proxy,
      ${getFullNameWithJobNameSQLWithAlias('u_actual', 'jn_actual')} AS actual_signer,
      ${getFullNameWithJobNameSQLWithAlias('u_original', 'jn_original')} AS original_user,
      u_actual.first_name AS actual_first_name,
      u_actual.last_name AS actual_last_name,
      u_original.first_name AS original_first_name,
      u_original.last_name AS original_last_name,
      al.signature,
      al.electronic_signature,
      al.comments,
      al.created_at,
      jt_actual.title AS signer_job_title,
      jt_original.title AS original_job_title,
      jn_actual.name AS actual_job_name,
      jn_original.name AS original_job_name
    FROM approval_logs al
    JOIN users u_actual
      ON al.approver_id = u_actual.id
    LEFT JOIN job_titles jt_actual
      ON u_actual.job_title_id = jt_actual.id
    LEFT JOIN job_names jn_actual
      ON u_actual.job_name_id = jn_actual.id
    LEFT JOIN users u_original
      ON al.delegated_by = u_original.id
    LEFT JOIN job_titles jt_original
      ON u_original.job_title_id = jt_original.id
    LEFT JOIN job_names jn_original
      ON u_original.job_name_id = jn_original.id
    WHERE al.content_id = ? AND al.status = 'approved'
    ORDER BY al.created_at
  `, [contentId]);

  

  if (!logs.length) {
    console.warn('⚠️ No approved signatures found for content', contentId);
    return;
  }

  // 4) إعداد pdfmake
  const PdfPrinter = require('pdfmake/src/printer');
  
  // دالة مساعدة لحل مشكلة ترتيب الكلمات العربية
  const fixArabicOrder = (text) => {
    if (typeof text === 'string' && /[\u0600-\u06FF]/.test(text)) {
      // عكس ترتيب الكلمات للنص العربي لحل مشكلة الترتيب
      return text.split(' ').reverse().join(' ');
    }
    return text;
  };
  
  // دالة مساعدة لبناء الاسم مع المسمى والاسم الأول والأخير فقط
  const buildNameForPDF = (firstName, lastName, jobName) => {
    const nameParts = [firstName, lastName].filter(part => part && part.trim());
    const fullName = nameParts.join(' ');
    return (jobName && typeof jobName === 'string' && jobName.trim()) ? `${jobName} ${fullName}` : fullName;
  };
  
  // استخدام الدالة المستوردة من userUtils.js

  // تعريف خط Amiri العربي
  const fonts = {
    Amiri: {
      normal: path.join(__dirname, '../../fonts/Amiri-Regular.ttf'),
      bold: path.join(__dirname, '../../fonts/Amiri-Regular.ttf'),
      italics: path.join(__dirname, '../../fonts/Amiri-Regular.ttf'),
      bolditalics: path.join(__dirname, '../../fonts/Amiri-Regular.ttf')
    }
  };

  let printer;
  try {
    printer = new PdfPrinter(fonts);
  } catch (fontError) {

    printer = new PdfPrinter();
  }


  // 5) جلب اسم الملف لعرضه كعنوان
  const [contentRows] = await db.execute(
    `SELECT title FROM contents WHERE id = ? AND deleted_at IS NULL`,
    [contentId]
  );
  const rawTitle = contentRows.length > 0 ? contentRows[0].title : '';
  
  // دالة مساعدة لتحليل العنوان حسب اللغة
  const parseTitleByLang = (titleJson, lang = 'ar') => {
    try {
      const obj = JSON.parse(titleJson);
      return obj[lang] || obj.ar || obj.en || '';
    } catch {
      return titleJson || '';
    }
  };
  
  let fileName = parseTitleByLang(rawTitle, 'ar') || `File ${contentId}`;
  
  // إزالة امتداد .pdf من اسم الملف إذا كان موجوداً
  if (fileName.toLowerCase().endsWith('.pdf')) {
    fileName = fileName.slice(0, -4);
  }

  // 6) إنشاء محتوى صفحة الاعتمادات باستخدام pdfmake
  const approvalTableBody = [];
  
  // إضافة رأس الجدول
  approvalTableBody.push([
    { text: 'Approvals', style: 'tableHeader' },
    { text: 'Name', style: 'tableHeader' },
    { text: 'Position', style: 'tableHeader' },
    { text: 'Approval Method', style: 'tableHeader' },
    { text: 'Signature', style: 'tableHeader' },
    { text: 'Date', style: 'tableHeader' }
  ]);

  // إضافة بيانات الاعتمادات
  let rowIndex = 1;
  console.log('🔍 [PDF] بدء معالجة الاعتمادات، rowIndex:', rowIndex);
  const getSignatureCell = (log) => {
    if (log.signature && log.signature.startsWith('data:image')) {
      // صورة توقيع يدوي
      return { image: log.signature, width: 120, height: 60, alignment: 'center' };
    } else if (log.electronic_signature) {
      // اعتماد إلكتروني: دائماً صورة الختم
      return { image: electronicSealDataUrl, width: 120, height: 60, alignment: 'center' };
    } else {
      // لا يوجد توقيع
      return { text: '✓', style: 'tableCell' };
    }
  };
  for (const log of logs) {
    // نوع الاعتماد - استخدام الأدوار المحفوظة إذا كانت متوفرة
    let approvalType = 'Reviewed'; // افتراضي
    
    console.log(`🔍 [PDF] معالجة السجل ${rowIndex}, approvalRoles:`, approvalRoles, 'length:', approvalRoles.length);
    
    if (approvalRoles.length > 0 && rowIndex <= approvalRoles.length) {
      // استخدام الدور المحفوظ
      const role = approvalRoles[rowIndex - 1];
      console.log(`🔍 [PDF] الدور المحفوظ للسجل ${rowIndex}:`, role);
      
      if (role) {
        // تحويل الدور إلى نص مفهوم
        switch (role) {
          case 'prepared':
            approvalType = 'Prepared';
            break;
          case 'updated':
            approvalType = 'Updated';
            break;
          case 'reviewed':
            approvalType = 'Reviewed';
            break;
          case 'approved':
            approvalType = 'Approved';
            break;
          default:
            approvalType = role.charAt(0).toUpperCase() + role.slice(1);
        }
        console.log(`✅ [PDF] تم تحديد الدور للسجل ${rowIndex}:`, approvalType);
      }
    } else {
      // استخدام المنطق القديم إذا لم تكن الأدوار متوفرة
      approvalType = rowIndex === 1 ? 'Reviewed' : 
                    rowIndex === logs.length ? 'Approver' : 'Reviewed';
      console.log(`⚠️ [PDF] استخدام المنطق القديم للسجل ${rowIndex}:`, approvalType);
    }
    
    // طريقة الاعتماد
    const approvalMethod = log.signature ? 'Hand Signature' : 
                          log.electronic_signature ? 'Electronic Signature' : 'Not Specified';
    
    // التاريخ
    const approvalDate = new Date(log.created_at).toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    // بناء الاسم الكامل للموقع الفعلي مع job name (الاسم الأول والأخير فقط)
    const actualSignerFullNameWithJob = buildNameForPDF(
      log.actual_first_name,
      log.actual_last_name,
      log.actual_job_name
    ) || log.actual_signer || 'N/A';

    // إضافة صف الاعتماد مع معالجة النصوص العربية
    approvalTableBody.push([
      { text: approvalType, style: 'tableCell' },
      { text: fixArabicOrder(actualSignerFullNameWithJob), style: 'tableCell' },
      { text: fixArabicOrder(log.signer_job_title || 'Not Specified'), style: 'tableCell' },
      { text: approvalMethod, style: 'tableCell' },
      getSignatureCell(log),
      { text: approvalDate, style: 'tableCell' }
    ]);

    // إذا كان تفويض، أضف صف إضافي للمفوض الأصلي
    if (log.signed_as_proxy && log.original_user) {
      // بناء الاسم الكامل للمفوض الأصلي مع job name (الاسم الأول والأخير فقط)
      const originalUserFullNameWithJob = buildNameForPDF(
        log.original_first_name,
        log.original_last_name,
        log.original_job_name
      ) || log.original_user || 'N/A';

      approvalTableBody.push([
        { text: '(Proxy for)', style: 'proxyCell' },
        { text: fixArabicOrder(originalUserFullNameWithJob), style: 'proxyCell' },
        { text: fixArabicOrder(log.original_job_title || 'Not Specified'), style: 'proxyCell' },
        { text: 'Delegated', style: 'proxyCell' },
        { text: '-', style: 'proxyCell' },
        { text: '-', style: 'proxyCell' }
      ]);
    }

    rowIndex++;
  }
  // 7) إنشاء تعريف المستند باستخدام pdfmake
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [20, 30, 20, 30],
    defaultStyle: {
      font: 'Amiri',
      fontSize: 12
    },
    styles: {
      title: {
        fontSize: 22,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 25]
      },
      tableHeader: {
        bold: true,
        fontSize: 12,
        color: 'white',
        alignment: 'center',
        fillColor: '#428499',
        margin: [3, 6, 3, 6]
      },
      tableCell: {
        fontSize: 11,
        alignment: 'center',
        margin: [3, 6, 3, 6]
      },
      proxyCell: {
        fontSize: 10,
        alignment: 'center',
        color: '#666666',
        fillColor: '#f9f9f9',
        margin: [3, 5, 3, 5]
      }
    },
    content: [
      // عنوان الملف مع معالجة النص العربي
      {
        text: fixArabicOrder(fileName),
        style: 'title'
      },
      // جدول الاعتمادات
      {
        table: {
          headerRows: 1,
          widths: ['12%', '16%', '16%', '16%', '22%', '18%'],
          body: approvalTableBody
        },
        layout: {
          hLineWidth: function(i, node) {
            return 1;
          },
          vLineWidth: function(i, node) {
            return 1;
          },
          hLineColor: function(i, node) {
            return '#000000';
          },
          vLineColor: function(i, node) {
            return '#000000';
          }
        }
      }
    ]
  };

  // 8) إنشاء PDF جديد باستخدام pdfmake
  try {
    const approvalPdfDoc = printer.createPdfKitDocument(docDefinition);
    const approvalPdfChunks = [];
    
    approvalPdfDoc.on('data', (chunk) => {
      approvalPdfChunks.push(chunk);
    });
    
    approvalPdfDoc.on('end', async () => {
      try {
        const approvalPdfBuffer = Buffer.concat(approvalPdfChunks);
        
        // 9) دمج صفحة الاعتمادات مع PDF الأصلي (مع حذف صفحات الاعتمادات القديمة)
        const { PDFDocument } = require('pdf-lib');
        const mergedPdf = await PDFDocument.create();
        
        // تحميل PDF الأصلي
        const originalPdfDoc = await PDFDocument.load(originalPdfBytes);
        
        // إضافة صفحات PDF الأصلي فقط (بدون صفحات الاعتمادات القديمة)
        // نفترض أن صفحة الاعتمادات هي الصفحة الأخيرة دائماً
        const originalPageCount = originalPdfDoc.getPageCount();
        const pagesToCopy = originalPageCount > 1 ? originalPageCount - 1 : originalPageCount;
        
        if (pagesToCopy > 0) {
          const originalPages = await mergedPdf.copyPages(originalPdfDoc, Array.from({length: pagesToCopy}, (_, i) => i));
          originalPages.forEach((page) => mergedPdf.addPage(page));
        }
        
        // إضافة صفحة الاعتمادات الجديدة في النهاية
        const approvalPdfDoc = await PDFDocument.load(approvalPdfBuffer);
        const approvalPages = await mergedPdf.copyPages(approvalPdfDoc, approvalPdfDoc.getPageIndices());
        approvalPages.forEach((page) => mergedPdf.addPage(page));
        
        // حفظ PDF المدمج
        const finalPdfBytes = await mergedPdf.save();
        fs.writeFileSync(fullPath, finalPdfBytes);
    
      } catch (mergeError) {
        console.error('❌ Error merging PDFs:', mergeError);
        // في حالة فشل الدمج، احفظ صفحة الاعتمادات فقط
        try {
          fs.writeFileSync(fullPath, approvalPdfBuffer);
      
        } catch (saveError) {
          console.error('❌ Error saving approval page:', saveError);
        }
      }
    });
    
    approvalPdfDoc.on('error', (error) => {
      console.error('❌ Error in PDF generation:', error);
    });
    
    approvalPdfDoc.end();
  } catch (err) {
    console.error('❌ Error creating approval PDF:', err);
  }
}



async function getUserPermissions(userId) {
  const [permRows] = await db.execute(`
    SELECT p.permission_key
    FROM permissions p
    JOIN user_permissions up ON up.permission_id = p.id
    WHERE up.user_id = ?
  `, [userId]);
  return new Set(permRows.map(r => r.permission_key));
}

const getAssignedApprovals = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const userRole = decoded.role;

    const permsSet = await getUserPermissions(userId);
    const canViewAll = userRole === 'admin'|| userRole === 'super_admin';

    // جلب كل الملفات (حسب الصلاحية)
    const departmentContentQuery = `
      SELECT
        c.id,
        c.title,
        c.file_path,
        c.approval_status,
        d.id AS department_id,
        d.name AS source_name,
        d.approval_sequence AS department_approval_sequence,
        c.custom_approval_sequence,
        f.name AS folder_name,
        ${getFullNameWithJobNameSQLWithAlias('u', 'jn')} AS created_by_username,
        'department' AS type,
        CAST(c.approvers_required AS CHAR) AS approvers_required,
        c.created_at,
        MAX(al_reject.approver_id) AS rejected_by_id,
        MAX(u_reject.id) AS rejected_by_user_id,
        c.approvals_log
      FROM contents c
      JOIN folders f        ON c.folder_id = f.id
      JOIN departments d    ON f.department_id = d.id
      JOIN users u          ON c.created_by = u.id
      LEFT JOIN job_names jn ON u.job_name_id = jn.id
      LEFT JOIN approval_logs al_reject ON c.id = al_reject.content_id AND al_reject.status = 'rejected'
      LEFT JOIN users u_reject ON al_reject.approver_id = u_reject.id
      LEFT JOIN job_names jn_reject ON u_reject.job_name_id = jn_reject.id
      WHERE c.approval_status IN ('pending', 'approved', 'rejected')
        AND c.deleted_at IS NULL
        AND f.deleted_at IS NULL
        AND d.deleted_at IS NULL
      GROUP BY c.id
    `;

    const params = [];
    const finalQuery = `
      ${departmentContentQuery}
      ORDER BY created_at DESC
    `;

    const [rows] = await db.execute(finalQuery, params);

    // تحويل الحقول من نص JSON إلى مصفوفة
    for (const row of rows) {
      try {
        row.approvers_required = JSON.parse(row.approvers_required);
      } catch {
        row.approvers_required = [];
      }
      if (Array.isArray(row.department_approval_sequence)) {
        row.approval_sequence = row.department_approval_sequence;
      } else if (typeof row.department_approval_sequence === 'string') {
        try {
          row.approval_sequence = JSON.parse(row.department_approval_sequence);
        } catch {
          row.approval_sequence = [];
        }
      } else {
        row.approval_sequence = [];
      }
      if (row.custom_approval_sequence) {
        if (Array.isArray(row.custom_approval_sequence)) {
          // لا شيء
        } else if (typeof row.custom_approval_sequence === 'string') {
          try {
            row.custom_approval_sequence = JSON.parse(row.custom_approval_sequence);
          } catch {
            row.custom_approval_sequence = [];
          }
        } else {
          row.custom_approval_sequence = [];
        }
      } else {
        row.custom_approval_sequence = [];
      }
      if (Array.isArray(row.approvals_log)) {
        // لا شيء
      } else if (typeof row.approvals_log === 'string') {
        try {
          row.approvals_log = JSON.parse(row.approvals_log);
        } catch {
          row.approvals_log = [];
        }
      } else if (row.approvals_log == null) {
        row.approvals_log = [];
      }
      
      // بناء اسم المستخدم المرفوض بعد جلب البيانات لتجنب مشاكل collation
      if (row.rejected_by_user_id) {
        try {
          const [rejectedUserRows] = await db.execute(
            `SELECT u.first_name, u.second_name, u.third_name, u.last_name, jn.name as job_name 
             FROM users u 
             LEFT JOIN job_names jn ON u.job_name_id = jn.id 
             WHERE u.id = ?`,
            [row.rejected_by_user_id]
          );
          if (rejectedUserRows.length > 0) {
            row.rejected_by_username = buildFullNameWithJobName(
              rejectedUserRows[0].job_name,
              rejectedUserRows[0].first_name,
              rejectedUserRows[0].second_name,
              rejectedUserRows[0].third_name,
              rejectedUserRows[0].last_name
            );
          } else {
            row.rejected_by_username = 'غير معروف';
          }
        } catch (error) {
          console.error('Error building rejected user name:', error);
          row.rejected_by_username = 'غير معروف';
        }
      } else {
        row.rejected_by_username = null;
      }
    }

    // تجهيز الملفات للمستخدم الحالي بحيث يظهر الملف لكل من هو في التسلسل أو مفوض له
    const assignedApprovals = [];
    
    for (const row of rows) {
      // تحديد التسلسل الصحيح: custom أولاً، ثم department
      let sequence = [];
      if (row.custom_approval_sequence && Array.isArray(row.custom_approval_sequence) && row.custom_approval_sequence.length > 0) {
        sequence = row.custom_approval_sequence;
      } else if (row.department_approval_sequence && Array.isArray(row.department_approval_sequence) && row.department_approval_sequence.length > 0) {
        sequence = row.department_approval_sequence;
      }
      
      const logs = Array.isArray(row.approvals_log) ? row.approvals_log : [];
      const userInSequence = sequence.some(id => Number(id) === Number(userId));
      // دعم التفويض: هل المستخدم مفوض له من أحد أعضاء التسلسل؟
      let isProxy = false;
      let delegatedBy = null;
      const [delegationRows] = await db.execute(
        'SELECT user_id FROM active_delegations WHERE delegate_id = ?',
        [userId]
      );
      if (delegationRows.length) {
        for (const delegation of delegationRows) {
          const originalUserId = delegation.user_id;
          if (sequence.some(id => Number(id) === Number(originalUserId))) {
            isProxy = true;
            delegatedBy = originalUserId;
            break;
          }
        }
      }
      
      // للمدير: اعرض كل الملفات بغض النظر عن التسلسل
      if (canViewAll) {
        // حدد إذا كان هو الدور الحالي (أول شخص لم يعتمد بعد)
        let firstPendingUser = null;
        for (let i = 0; i < sequence.length; i++) {
          const approverId = Number(sequence[i]);
          const hasApproved = logs.some(log => Number(log.user_id) === approverId && log.status === 'approved');
          if (!hasApproved) {
            firstPendingUser = approverId;
            break;
          }
        }
        assignedApprovals.push({
          ...row,
          isProxy: false,
          delegatedBy: null,
          isCurrentTurn: false, // المدير لا يعتبر دوره الحالي
          isAdmin: true
        });
      }
      // للمستخدمين العاديين: إذا كان المستخدم في التسلسل أو مفوض له من أحد أعضاء التسلسل
      else if (userInSequence || isProxy) {
        // حدد إذا كان هو الدور الحالي (أول شخص لم يعتمد بعد)
        let firstPendingUser = null;
        for (let i = 0; i < sequence.length; i++) {
          const approverId = Number(sequence[i]);
          const hasApproved = logs.some(log => Number(log.user_id) === approverId && log.status === 'approved');
          if (!hasApproved) {
            firstPendingUser = approverId;
            break;
          }
        }
        
        const isCurrentTurn = Number(firstPendingUser) === Number(userId) || (isProxy && Number(firstPendingUser) === Number(delegatedBy));
        
        // اعرض الملف فقط إذا كان دوره الحالي
        if (isCurrentTurn) {
          assignedApprovals.push({
            ...row,
            isProxy,
            delegatedBy,
            isCurrentTurn,
            isAdmin: false
          });
        }
      }
    }
    return res.json({ status: 'success', data: assignedApprovals });
  } catch (err) {
    console.error('Error in getAssignedApprovals:', err);
    return res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};


// Helper لتحويل نص JSON إلى اسم حسب اللغة
function parseTitleByLang(titleJson, lang = 'ar') {
  try {
    const obj = JSON.parse(titleJson);
    return obj[lang] || obj.ar || obj.en || '';
  } catch {
    return titleJson || '';
  }
}

const delegateApproval = async (req, res) => {
  const rawId = req.params.id;            // e.g. "dept-10" أو "comm-5" أو رقم فقط
  let contentId;
  if (typeof rawId === 'string' && (rawId.startsWith('dept-') || rawId.startsWith('comm-'))) {
    contentId = parseInt(rawId.split('-')[1], 10);
  } else {
    contentId = parseInt(rawId, 10);
  }
  const { delegateTo, notes, signature } = req.body; // إضافة signature

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.id;

    if (isNaN(contentId) || !delegateTo || !currentUserId) {
      return res.status(400).json({ status: 'error', message: 'بيانات مفقودة أو غير صحيحة للتفويض' });
    }

    // 1) سجّل التفويض
    await db.execute(`
      INSERT INTO approval_logs (
        content_id,
        approver_id,
        delegated_by,
        signed_as_proxy,
        status,
        comments,
        created_at
      ) VALUES (?, ?, ?, 1, 'pending', ?, NOW())
      ON DUPLICATE KEY UPDATE
        delegated_by = VALUES(delegated_by),
        signed_as_proxy = 1,
        status = 'pending',
        comments = VALUES(comments),
        created_at = NOW()
    `, [contentId, delegateTo, currentUserId, notes || null]);

    // 2) تخزين توقيع الإقرار (إذا وجد)
    if (signature) {
      await db.execute(`
        INSERT INTO approval_logs (
          content_id, approver_id, delegated_by, signed_as_proxy, status, comments, signature, created_at
        ) VALUES (?, ?, ?, 0, 'sender_signature', ?, ?, NOW())
      `, [contentId, currentUserId, currentUserId, 'توقيع المرسل على اقرار التفويض الفردي', signature]);
    }

    // 3) احضُر اسم المستخدم والمحتوى بشكل صحيح
    const [delegateRows] = await db.execute(
              'SELECT first_name, second_name, third_name, last_name, job_name_id FROM users WHERE id = ?', 
      [delegateTo]
    );
    const isCommittee = rawId.startsWith('comm-');
    const tableName = isCommittee ? 'committee_contents' : 'contents';
    const [contentRows] = await db.execute(
      `SELECT title FROM ${tableName} WHERE id = ?`, 
      [contentId]
    );

    const delegateeUsername = delegateRows.length 
      ? buildFullNameWithJobName(delegateRows[0].job_name_id, delegateRows[0].first_name, delegateRows[0].second_name, delegateRows[0].third_name, delegateRows[0].last_name)
      : String(delegateTo);
    const rawTitle = contentRows.length 
      ? contentRows[0].title 
      : '';
    const parsedTitleAr = parseTitleByLang(rawTitle, 'ar') || 'غير معروف';
    const parsedTitleEn = parseTitleByLang(rawTitle, 'en') || 'Unknown';

    // 4) سجّل الحركة بنوع مرجعي صحيح (enum يحتوي على 'approval')
    await logAction(
      currentUserId,
      'delegate_signature',
      JSON.stringify({
        ar: `تم تفويض التوقيع للمستخدم: ${delegateeUsername} على الملف: "${parsedTitleAr}"`,
        en: `Delegated signature to user: ${delegateeUsername} for file: "${parsedTitleEn}"`
      }),
      'approval',      // يجب أن يكون ضمن enum('content','folder','user','approval','notification')
      contentId
    );

    // إرسال إشعار فوري للمفوض له
    let delegatorName = '';
    const [delegatorRows] = await db.execute('SELECT first_name, second_name, third_name, last_name, job_name_id FROM users WHERE id = ?', [currentUserId]);
    delegatorName = delegatorRows.length ? buildFullNameWithJobName(delegatorRows[0].job_name_id, delegatorRows[0].first_name, delegatorRows[0].second_name, delegatorRows[0].third_name, delegatorRows[0].last_name) : '';
    await insertNotification(
      delegateTo,
      'تم تفويضك للتوقيع',
      `تم تفويضك للتوقيع بالنيابة عن${delegatorName ? ' ' + delegatorName : ''} على الملف رقم ${contentId}`,
      'proxy'
    );

    return res.status(200).json({
      status: 'success',
      message: '✅ تم التفويض بالنيابة بنجاح'
    });

  } catch (err) {
    console.error('خطأ أثناء التفويض بالنيابة:', err);
    return res.status(500).json({ status: 'error', message: 'فشل التفويض بالنيابة' });
  }
};



const getProxyApprovals = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const [rows] = await db.execute(`
      SELECT 
        c.id,
        c.title,
        c.approval_status,
        d.name AS department_name,
        al.delegated_by,
        CONCAT(
          COALESCE(u.first_name, ''),
          ' ',
          COALESCE(u.second_name, ''),
          ' ',
          COALESCE(u.third_name, ''),
          ' ',
          COALESCE(u.last_name, '')
        ) AS delegated_by_name,
        u.national_id AS delegated_by_national_id,
        CONCAT(
          COALESCE(approver.first_name, ''),
          ' ',
          COALESCE(approver.second_name, ''),
          ' ',
          COALESCE(approver.third_name, ''),
          ' ',
          COALESCE(approver.last_name, '')
        ) AS delegate_name,
        approver.national_id AS delegate_national_id
      FROM approval_logs al
      JOIN contents c ON al.content_id = c.id
      LEFT JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      JOIN users u ON al.delegated_by = u.id
      JOIN users approver ON al.approver_id = approver.id
      WHERE al.approver_id = ? AND al.signed_as_proxy = 1 AND al.status = 'pending'
    `, [userId]);

    // تنظيف الأسماء من المسافات الزائدة
    const cleanedRows = rows.map(row => ({
      ...row,
      delegated_by_name: row.delegated_by_name?.replace(/\s+/g, ' ').trim() || 'غير معروف',
      delegate_name: row.delegate_name?.replace(/\s+/g, ' ').trim() || 'غير معروف',
      delegated_by_national_id: row.delegated_by_national_id || 'N/A',
      delegate_national_id: row.delegate_national_id || 'N/A'
    }));

    res.json({ status: 'success', data: cleanedRows });
  } catch (err) {
    console.error('getProxyApprovals error:', err);
    res.status(500).json({ status: 'error', message: 'فشل جلب الموافقات بالوكالة' });
  }
};

// Helper function to get content title by language
function getContentNameByLanguage(contentNameData, userLanguage = 'ar') {
    try {
        if (typeof contentNameData === 'string' && contentNameData.startsWith('{')) {
            const parsed = JSON.parse(contentNameData);
            return parsed[userLanguage] || parsed['ar'] || contentNameData;
        }
        return contentNameData || 'غير معروف';
    } catch (error) {
        return contentNameData || 'غير معروف';
    }
}

const acceptProxyDelegation = async (req, res) => {
  const contentId = parseInt(req.params.id, 10);
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.id;

  try {

    // أضف المستخدم لجدول المعيّنين
    await db.execute(
      'INSERT IGNORE INTO content_approvers (content_id, user_id) VALUES (?, ?)',
      [contentId, userId]
    );

    // جلب تسلسل الاعتماد (custom أو department)
    const [contentRows] = await db.execute(
              'SELECT custom_approval_sequence, folder_id FROM contents WHERE id = ? AND deleted_at IS NULL',
      [contentId]
    );
    let sequence = [];
    let useCustom = false;
    if (contentRows.length && contentRows[0].custom_approval_sequence) {
      try {
        sequence = JSON.parse(contentRows[0].custom_approval_sequence);
        useCustom = true;
  
      } catch { sequence = []; }
    }
    if (!useCustom && contentRows.length && contentRows[0].folder_id) {
      const folderId = contentRows[0].folder_id;
      const [folderRows] = await db.execute(
        'SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL',
        [folderRows[0].folder_id]
      );
      if (folderRows.length) {
        const departmentId = folderRows[0].department_id;
        const [deptRows] = await db.execute(
          'SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL',
          [departmentId]
        );
        if (deptRows.length && deptRows[0].approval_sequence) {
          if (Array.isArray(deptRows[0].approval_sequence)) {
            sequence = deptRows[0].approval_sequence;
          } else {
            try {
              sequence = JSON.parse(deptRows[0].approval_sequence);
            } catch {
              sequence = [];
            }
          }
  
        }
      }
    }

    // جلب المفوض الأصلي من جدول التفويضات الدائمة
    let delegatedBy = null;
    const [delegationRows] = await db.execute(
      'SELECT user_id FROM active_delegations WHERE delegate_id = ?',
      [userId]
    );
    if (delegationRows.length) {
      delegatedBy = delegationRows[0].user_id;
      
    } else {
      // fallback: جلب delegated_by من approval_logs إذا كان تفويض يدوي
      const [proxyRows] = await db.execute(
        'SELECT delegated_by FROM approval_logs WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 1',
        [contentId, userId]
      );
      if (proxyRows.length) {
        delegatedBy = Number(proxyRows[0].delegated_by);

      }
    }

    if (delegatedBy && Array.isArray(sequence) && sequence.length > 0) {
      // تسجيل التفويض في approval_logs
      const [existingProxyLog] = await db.execute(
        `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
        [contentId, userId, delegatedBy]
      );
      
      if (existingProxyLog.length > 0) {
        // تحديث السجل الموجود
        await db.execute(
          `UPDATE approval_logs 
           SET status = 'accepted' 
           WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
          [contentId, userId, delegatedBy]
        );
      } else {
        // إنشاء سجل جديد للتفويض
        await db.execute(
          `INSERT INTO approval_logs (
            content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
          ) VALUES (?, ?, ?, 1, 'accepted', NOW())`,
          [contentId, userId, delegatedBy]
        );
      }

      // أضف سجل بالنيابة وسجل عادي إذا كان للمستخدم موقع أصلي
      for (let i = 0; i < sequence.length; i++) {
        if (Number(sequence[i]) === Number(delegatedBy)) {
          // سجل بالنيابة
          const [existingProxy] = await db.execute(
            `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
            [contentId, userId, delegatedBy]
          );
          if (!existingProxy.length) {
            await db.execute(
              `INSERT INTO approval_logs (
                content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
              ) VALUES (?, ?, ?, 1, 'accepted', NOW())`,
              [contentId, userId, delegatedBy]
            );
    
          }
        }
        if (Number(sequence[i]) === Number(userId)) {
          // سجل عادي
          const [existingSelf] = await db.execute(
            `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 0`,
            [contentId, userId]
          );
          if (!existingSelf.length) {
            await db.execute(
              `INSERT INTO approval_logs (
                content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
              ) VALUES (?, ?, NULL, 0, 'pending', NOW())`,
              [contentId, userId]
            );
    
          }
        }
      }
      // تحديث التسلسل إذا لزم
      let changed = false;
      for (let i = 0; i < sequence.length; i++) {
        if (Number(sequence[i]) === Number(delegatedBy)) {
          sequence[i] = Number(userId);
          changed = true;
        }
      }
      if (changed) {
        if (useCustom) {
          await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(sequence), contentId]);
  
        }
        
        // لا نحدث approval_sequence في جدول departments للتوقيع بالنيابة الفردي
        // لأن هذا يؤثر فقط على الملف الحالي وليس الملفات المستقبلية

      }
      // جلب اسم المفوض الأصلي
      let delegatedByName = '';
      if (delegatedBy) {
              const [delegatedByRows] = await db.execute('SELECT first_name, second_name, third_name, last_name, job_name_id FROM users WHERE id = ?', [delegatedBy]);
      delegatedByName = delegatedByRows.length ? buildFullNameWithJobName(delegatedByRows[0].job_name_id, delegatedByRows[0].first_name, delegatedByRows[0].second_name, delegatedByRows[0].third_name, delegatedByRows[0].last_name) : '';
      }

      return res.json({
        status: 'success',
        message: 'تم قبول التفويض وستظهر لك في التقارير المكلف بها',
        proxy: true,
        delegated_by: delegatedBy,
        delegated_by_name: delegatedByName
      });
    }
    // fallback القديم إذا لم يوجد delegatedBy
    let delegatedByName = '';
    if (delegatedBy) {
      const [delegatedByRows] = await db.execute('SELECT first_name, second_name, third_name, last_name, job_name_id FROM users WHERE id = ?', [delegatedBy]);
      delegatedByName = delegatedByRows.length ? buildFullNameWithJobName(delegatedByRows[0].job_name_id, delegatedByRows[0].first_name, delegatedByRows[0].second_name, delegatedByRows[0].third_name, delegatedByRows[0].last_name) : '';
    }

    return res.json({
      status: 'success',
      message: 'تم قبول التفويض وستظهر لك في التقارير المكلف بها',
      proxy: true,
      delegated_by: delegatedBy,
      delegated_by_name: delegatedByName
    });
  } catch (err) {
    console.error('[ACCEPT PROXY] Error:', err)
    res.status(500).json({ status: 'error', message: 'فشل قبول التفويض' });
  }
};

// دالة تصحيح نص التسلسل ليكون JSON صالح
function fixSequenceString(str) {
  if (typeof str !== 'string') return str; // إذا لم يكن نص، أرجعه كما هو
  if (str.includes("'")) {
    str = str.replace(/'/g, '"');
  }
  return str.trim();
}



// تفويض جميع الملفات بالنيابة (bulk delegation)
// ملاحظة: عند قبول التفويض الجماعي، إذا كان لدى المستخدم permanent_delegate_id، يتم تسجيل التفويض في approval_logs باسم permanent_delegate_id (كـ approver_id)، وuserId كـ delegated_by، وsigned_as_proxy = 1. هذا يضمن أن سجل التفويض بالنيابة يظهر دائماً باسم المفوض الدائم.
const delegateAllApprovals = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUserId = decoded.id;
    

    
    // جلب permanent_delegate_id للمستخدم الحالي إذا كان موجودًا
    let permanentDelegateId = null;
    try {
      const [userRows] = await db.execute('SELECT permanent_delegate_id FROM users WHERE id = ?', [currentUserId]);
      permanentDelegateId = userRows.length ? userRows[0].permanent_delegate_id : null;
    } catch {}
    
    const { delegateTo, notes, signature } = req.body; // إضافة signature
    
    
    if (!delegateTo || !currentUserId) {
      return res.status(400).json({ status: 'error', message: 'بيانات مفقودة أو غير صحيحة للتفويض الجماعي' });
    }
    
    // جلب اسم المفوض
    let delegatorName = '';
            const [delegatorRows] = await db.execute('SELECT first_name, second_name, third_name, last_name, job_name_id FROM users WHERE id = ?', [currentUserId]);
        delegatorName = delegatorRows.length ? buildFullNameWithJobName(delegatorRows[0].job_name_id, delegatorRows[0].first_name, delegatorRows[0].second_name, delegatorRows[0].third_name, delegatorRows[0].last_name) : '';
    
    // جلب كل الملفات التي المستخدم الحالي في sequence الخاص بها (custom أو تبع القسم)
    const [contents] = await db.execute(`
      SELECT c.id, c.title, c.custom_approval_sequence, f.department_id, d.approval_sequence
      FROM contents c
      LEFT JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      WHERE c.approval_status = 'pending'
    `);
    
    let delegatedFileIds = [];
    for (const content of contents) {

      
      let sequence = [];
      let useCustomSequence = false;
      
      // Try custom_approval_sequence first
      if (content.custom_approval_sequence) {
        try {
          let raw = fixSequenceString(content.custom_approval_sequence);
          let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sequence = parsed;
            useCustomSequence = true;
          } else if (typeof parsed === 'number') {
            sequence = [parsed];
            useCustomSequence = true;
          } else {
          }
        } catch (e) {

        }
      }
      
      // If custom sequence is empty or invalid, try department approval_sequence
      if (!useCustomSequence && content.approval_sequence) {
        try {
          let raw = fixSequenceString(content.approval_sequence);
          let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
          if (Array.isArray(parsed)) {
            sequence = parsed;
          } else if (typeof parsed === 'number') {
            sequence = [parsed];
          } else {
            sequence = [];
          }
        } catch (e) {

          sequence = [];
        }
      }
      

      
      // التحقق من وجود المستخدم في أي من التسلسلين
      let userInSequence = sequence.some(id => Number(id) === Number(currentUserId));
      
      // إذا لم يكن المستخدم في التسلسل المحدد، تحقق من التسلسل الآخر
      if (!userInSequence) {
        let otherSequence = [];
        
        // إذا كنا نستخدم custom_approval_sequence، تحقق من approval_sequence
        if (useCustomSequence && content.approval_sequence) {
          try {
            let raw = fixSequenceString(content.approval_sequence);
            let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
            if (Array.isArray(parsed)) {
              otherSequence = parsed;
            } else if (typeof parsed === 'number') {
              otherSequence = [parsed];
            }
          } catch (e) {
          }
        }
        // إذا كنا نستخدم approval_sequence، تحقق من custom_approval_sequence
        else if (!useCustomSequence && content.custom_approval_sequence) {
          try {
            let raw = fixSequenceString(content.custom_approval_sequence);
            let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              otherSequence = parsed;
            } else if (typeof parsed === 'number') {
              otherSequence = [parsed];
            }
          } catch (e) {
          }
        }
        
        userInSequence = otherSequence.some(id => Number(id) === Number(currentUserId));
      }
      
      if (userInSequence) {
        delegatedFileIds.push(content.id);
      }
    }
    

    
    // إنشاء سجلات التفويض المعلقة في approval_logs لكل ملف
    if (delegatedFileIds.length > 0) {
      for (const contentId of delegatedFileIds) {
        // إنشاء سجل تفويض معلق في approval_logs
        const insertResult = await db.execute(`
          INSERT INTO approval_logs 
          (content_id, approver_id, delegated_by, status, signed_as_proxy, comments, created_at) 
          VALUES (?, ?, ?, 'pending', 1, ?, NOW())
        `, [contentId, delegateTo, currentUserId, notes || `تفويض جماعي من ${delegatorName}`]);
        

      }
      
      // تخزين توقيع الإقرار (إذا وجد)
      if (signature && delegatedFileIds.length > 0) {
        // استخدام أول ملف مفوض لتوقيع الإقرار
        const firstFileId = delegatedFileIds[0];
        await db.execute(`
          INSERT INTO approval_logs (
            content_id, approver_id, delegated_by, signed_as_proxy, status, comments, signature, created_at
          ) VALUES (?, ?, ?, 0, 'sender_signature', ?, ?, NOW())
        `, [firstFileId, currentUserId, currentUserId, 'توقيع المرسل على اقرار التفويض الشامل', signature]);
      }
      
      // إرسال إشعار جماعي واحد فقط إذا كان هناك ملفات (للتوافق مع النظام القديم)
      await insertNotification(
        delegateTo,
        'تم تفويضك للتوقيع بالنيابة عن مستخدم آخر',
        `تم تفويضك للتوقيع بالنيابة عن ${delegatorName} على جميع الملفات (${delegatedFileIds.length} ملف): [${delegatedFileIds.join(', ')}]`,
        'proxy_bulk',
        JSON.stringify({ from: currentUserId, from_name: delegatorName, fileIds: delegatedFileIds })
      );
      
    }
    
    return res.status(200).json({ status: 'success', message: `✅ تم إرسال طلب التفويض الجماعي (${delegatedFileIds.length} ملف) بنجاح. لن يتم نقل الملفات إلا بعد قبول التفويض من المستخدم الجديد.` });
  } catch (err) {
    console.error('❌ خطأ أثناء التفويض الجماعي:', err);
    return res.status(500).json({ status: 'error', message: 'فشل التفويض الجماعي' });
  }
};


// إلغاء جميع التفويضات التي أعطاها المستخدم (revoke all delegations by user)
const revokeAllDelegations = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10); // المفوض الأصلي
    const delegateeId = req.query.to ? parseInt(req.query.to, 10) : null; // المفوض إليه
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId مطلوب' });



    // جلب كل الملفات التي سيتم حذف التفويض منها
    let selectSql = 'SELECT content_id, approver_id, delegated_by FROM approval_logs WHERE delegated_by = ? AND signed_as_proxy = 1';
    let selectParams = [userId];
    if (delegateeId) {
      selectSql += ' AND approver_id = ?';
      selectParams.push(delegateeId);
    }
    const [rows] = await db.execute(selectSql, selectParams);



    // حذف سجلات التفويض بالنيابة
    let deleteSql = 'DELETE FROM approval_logs WHERE delegated_by = ? AND signed_as_proxy = 1';
    let deleteParams = [userId];
    if (delegateeId) {
      deleteSql += ' AND approver_id = ?';
      deleteParams.push(delegateeId);
    }
    const [result] = await db.execute(deleteSql, deleteParams);

    // حذف التفويض الدائم من active_delegations
    let deleteActiveDelegationSql = 'DELETE FROM active_delegations WHERE user_id = ?';
    let deleteActiveDelegationParams = [userId];
    if (delegateeId) {
      deleteActiveDelegationSql += ' AND delegate_id = ?';
      deleteActiveDelegationParams.push(delegateeId);
    }
    await db.execute(deleteActiveDelegationSql, deleteActiveDelegationParams);

    // إعادة المفوض الأصلي إلى جميع التسلسلات المتأثرة


    // تحديث custom_approval_sequence في جميع المحتويات
    const [allContentRows] = await db.execute(`
      SELECT id, custom_approval_sequence 
      FROM contents
      WHERE deleted_at IS NULL
    `);
    

    
    for (const contentRow of allContentRows) {
      const contentId = contentRow.id;
      let currentSequence = [];
      
      if (contentRow.custom_approval_sequence) {
        try {
          currentSequence = Array.isArray(contentRow.custom_approval_sequence) 
            ? contentRow.custom_approval_sequence 
            : JSON.parse(contentRow.custom_approval_sequence);
        } catch { currentSequence = []; }
      }
      
      // فحص إذا كان المحتوى يحتوي على المفوض إليه
      const hasDelegatee = delegateeId ? currentSequence.some(id => Number(id) === Number(delegateeId)) : false;
      
      if (hasDelegatee) {

        
        // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
        let newContentSequence = [];
        
        for (let i = 0; i < currentSequence.length; i++) {
          if (Number(currentSequence[i]) === Number(delegateeId)) {
            // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
            newContentSequence.push(Number(userId));
  
          } else {
            // إضافة باقي الأعضاء
            newContentSequence.push(currentSequence[i]);
          }
        }
        
        // إزالة التكرار مع الحفاظ على الترتيب
        newContentSequence = newContentSequence.filter((item, pos) => newContentSequence.indexOf(item) === pos);
        
        await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(newContentSequence), contentId]);

      }
    }
    
    // تحديث approval_sequence في جميع الأقسام
    const [allDeptRows] = await db.execute(`
      SELECT id, approval_sequence 
      FROM departments
      WHERE deleted_at IS NULL
    `);
    

    
    for (const deptRow of allDeptRows) {
      const departmentId = deptRow.id;
      let currentSequence = [];
      
      if (deptRow.approval_sequence) {
        try {
          currentSequence = Array.isArray(deptRow.approval_sequence) 
            ? deptRow.approval_sequence 
            : JSON.parse(deptRow.approval_sequence);
        } catch { currentSequence = []; }
      }
      
      // فحص إذا كان القسم يحتوي على المفوض إليه
      const hasDelegatee = delegateeId ? currentSequence.some(id => Number(id) === Number(delegateeId)) : false;
      
      if (hasDelegatee) {

        
        // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
        let newDeptSequence = [];
        
        for (let i = 0; i < currentSequence.length; i++) {
        if (Number(currentSequence[i]) === Number(delegateeId)) {
            // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
            newDeptSequence.push(Number(userId));
  
          } else {
            // إضافة باقي الأعضاء
            newDeptSequence.push(currentSequence[i]);
          }
        }
        
        // إزالة التكرار مع الحفاظ على الترتيب
        newDeptSequence = newDeptSequence.filter((item, pos) => newDeptSequence.indexOf(item) === pos);
        
        await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(newDeptSequence), departmentId]);

      }
    }

    // إعادة المفوض الأصلي إلى التسلسل وإزالة تكرار التفويض فقط (للتفويضات الفردية)
    for (const row of rows) {
      if (row.delegated_by) {
        // إعادة المفوض الأصلي إلى content_approvers
        await db.execute(
          'INSERT IGNORE INTO content_approvers (content_id, user_id) VALUES (?, ?)',
          [row.content_id, row.delegated_by]
        );
        
        // جلب القسم المرتبط بالملف
        const [folderRows] = await db.execute('SELECT folder_id FROM contents WHERE id = ? AND deleted_at IS NULL', [row.content_id]);
        if (folderRows.length) {
          const folderId = folderRows[0].folder_id;
          // جلب التسلسل من جدول الملفات (custom_approval_sequence) أو من القسم (approval_sequence)
          const [contentRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ? AND deleted_at IS NULL', [row.content_id]);
          let customSeqRaw = contentRows.length ? contentRows[0].custom_approval_sequence : null;
          let usedCustom = false;
          let seqArr = [];
          if (customSeqRaw) {
            // إذا كان هناك تسلسل مخصص
            try {
              seqArr = Array.isArray(customSeqRaw) ? customSeqRaw : JSON.parse(typeof customSeqRaw === 'string' ? customSeqRaw.replace(/'/g, '"') : customSeqRaw);
              usedCustom = true;
            } catch { seqArr = []; }
          } else {
            // جلب من القسم
            const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
            if (deptRows.length) {
              const departmentId = deptRows[0].department_id;
              const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
              if (seqRows.length && seqRows[0].approval_sequence) {
                let seqRaw = seqRows[0].approval_sequence;
                try {
                  seqArr = Array.isArray(seqRaw) ? seqRaw : JSON.parse(typeof seqRaw === 'string' ? seqRaw.replace(/'/g, '"') : seqRaw);
                } catch { seqArr = []; }
              }
            }
          }
          // استبدل فقط أول موقع للمفوض إليه (delegatee) الذي أتى من التفويض بموقع المفوض الأصلي (delegator)
          let changed = false;
          if (delegateeId) {
            let replaced = false;
            for (let i = 0; i < seqArr.length; i++) {
              if (Number(seqArr[i]) === Number(delegateeId) && !replaced) {
                seqArr[i] = Number(row.delegated_by);
                replaced = true;
                changed = true;
              }
            }
          } else {
            // إذا لم يحدد delegateeId، استبدل كل المواقع التي كانت بالنيابة
            for (let i = 0; i < seqArr.length; i++) {
              if (Number(seqArr[i]) === Number(row.approver_id)) {
                seqArr[i] = Number(row.delegated_by);
                changed = true;
              }
            }
          }
          // إزالة التكرار مع الحفاظ على الترتيب
          seqArr = seqArr.filter((item, pos) => seqArr.indexOf(item) === pos);
          if (changed) {
            if (usedCustom) {
              await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(seqArr), row.content_id]);
            } else {
              // جلب القسم مرة أخرى
              const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
              if (deptRows.length) {
                const departmentId = deptRows[0].department_id;
                await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(seqArr), departmentId]);
              }
            }
          }
        }
      }
    }



    return res.status(200).json({ status: 'success', message: `تم حذف ${result.affectedRows} تفويض بالنيابة بنجاح وتمت إعادة المفوض الأصلي للملفات والتسلسل.` });
  } catch (err) {
    console.error('خطأ أثناء حذف جميع التفويضات:', err);
    return res.status(500).json({ status: 'error', message: 'فشل حذف جميع التفويضات' });
  }
};


// جلب قائمة الأشخاص الذين تم تفويضهم من المستخدم الحالي (distinct delegateeId)
const getDelegationSummaryByUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    jwt.verify(token, process.env.JWT_SECRET);
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ status: 'error', message: 'يرجى تحديد المستخدم' });
    
    // جلب التفويضات من approval_logs
    const [rows] = await db.execute(
      `SELECT al.approver_id, ${getFullNameWithJobNameSQLWithAlias('u', 'jn')} AS approver_name, u.email, COUNT(al.content_id) AS files_count
       FROM approval_logs al
       JOIN users u ON al.approver_id = u.id
       LEFT JOIN job_names jn ON u.job_name_id = jn.id
       WHERE al.delegated_by = ? AND al.signed_as_proxy = 1 AND al.status IN ('pending')
       GROUP BY al.approver_id, ${getFullNameWithJobNameSQLWithAlias('u', 'jn')}, u.email`,
      [userId]
    );
    
    // جلب التفويضات الدائمة من active_delegations
    const [activeDelegations] = await db.execute(
      `SELECT ad.delegate_id as approver_id, ${getFullNameWithJobNameSQLWithAlias('u', 'jn')} AS approver_name, u.email, 0 AS files_count
       FROM active_delegations ad
       JOIN users u ON ad.delegate_id = u.id
       LEFT JOIN job_names jn ON u.job_name_id = jn.id
       WHERE ad.user_id = ?`,
      [userId]
    );
    
    // دمج النتائج مع إزالة التكرار
    const allDelegations = [...rows, ...activeDelegations];
    const uniqueDelegations = [];
    const seenIds = new Set();
    
    for (const delegation of allDelegations) {
      if (!seenIds.has(delegation.approver_id)) {
        seenIds.add(delegation.approver_id);
        uniqueDelegations.push(delegation);
      } else {
        // إذا كان موجود بالفعل، أضف عدد الملفات
        const existing = uniqueDelegations.find(d => d.approver_id === delegation.approver_id);
        if (existing) {
          existing.files_count += delegation.files_count;
        }
      }
    }
    
    res.status(200).json({ status: 'success', data: uniqueDelegations });
  } catch (err) {
    console.error('getDelegationSummaryByUser error:', err);
    res.status(500).json({ status: 'error', message: 'فشل جلب ملخص التفويضات' });
  }
};

// إلغاء التفويض الدائم من active_delegations
const revokeActiveDelegation = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { delegatorId, delegateeId } = req.body;
    
    if (!delegatorId || !delegateeId) {
      return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });
    }
    

    
    // حذف التفويض الدائم
    await db.execute(
      'DELETE FROM active_delegations WHERE user_id = ? AND delegate_id = ?',
      [delegatorId, delegateeId]
    );
    
    // حذف جميع سجلات التفويض من approval_logs
    await db.execute(
      'DELETE FROM approval_logs WHERE delegated_by = ? AND approver_id = ? AND signed_as_proxy = 1',
      [delegatorId, delegateeId]
    );
    
    // إعادة المفوض الأصلي إلى جميع التسلسلات المتأثرة

    
    // تحديث custom_approval_sequence في جميع المحتويات
    const [allContentRows] = await db.execute(`
      SELECT id, custom_approval_sequence 
      FROM contents
    `);
    

    
    for (const contentRow of allContentRows) {
      const contentId = contentRow.id;
      let currentSequence = [];
      
      if (contentRow.custom_approval_sequence) {
        try {
          currentSequence = Array.isArray(contentRow.custom_approval_sequence) 
            ? contentRow.custom_approval_sequence 
            : JSON.parse(contentRow.custom_approval_sequence);
        } catch { currentSequence = []; }
      }
      
      // فحص إذا كان المحتوى يحتوي على المفوض إليه
      const hasDelegatee = currentSequence.some(id => Number(id) === Number(delegateeId));
      
      if (hasDelegatee) {

        
        // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
        let newContentSequence = [];
        let delegatorRestored = false;
        
        for (let i = 0; i < currentSequence.length; i++) {
          if (Number(currentSequence[i]) === Number(delegateeId)) {
            // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
            newContentSequence.push(Number(delegatorId));
            delegatorRestored = true;
  
          } else {
            // إضافة باقي الأعضاء
            newContentSequence.push(currentSequence[i]);
          }
        }
        
        // إزالة التكرار مع الحفاظ على الترتيب
        newContentSequence = newContentSequence.filter((item, pos) => newContentSequence.indexOf(item) === pos);
        
        await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(newContentSequence), contentId]);

      }
    }
    
    // تحديث approval_sequence في جميع الأقسام
    const [allDeptRows] = await db.execute(`
      SELECT id, approval_sequence 
      FROM departments
    `);
    

    
    for (const deptRow of allDeptRows) {
      const departmentId = deptRow.id;
      let currentSequence = [];
      
      if (deptRow.approval_sequence) {
        try {
          currentSequence = Array.isArray(deptRow.approval_sequence) 
            ? deptRow.approval_sequence 
            : JSON.parse(deptRow.approval_sequence);
        } catch { currentSequence = []; }
      }
      
      // فحص إذا كان القسم يحتوي على المفوض إليه
      const hasDelegatee = currentSequence.some(id => Number(id) === Number(delegateeId));
      
      if (hasDelegatee) {

        
        // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
        let newDeptSequence = [];
        let delegatorRestored = false;
        
        for (let i = 0; i < currentSequence.length; i++) {
          if (Number(currentSequence[i]) === Number(delegateeId)) {
            // استبدال المفوض إليه بالمفوض الأصلي في نفس المكان
            newDeptSequence.push(Number(delegatorId));
            delegatorRestored = true;
  
          } else {
            // إضافة باقي الأعضاء
            newDeptSequence.push(currentSequence[i]);
          }
        }
        
        // إزالة التكرار مع الحفاظ على الترتيب
        newDeptSequence = newDeptSequence.filter((item, pos) => newDeptSequence.indexOf(item) === pos);
        
        await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(newDeptSequence), departmentId]);

      }
    }
    

    
    return res.status(200).json({
      status: 'success',
      message: 'تم إلغاء التفويض الدائم بنجاح وتمت إعادة المفوض الأصلي إلى جميع التسلسلات'
    });
    
  } catch (err) {
    console.error('خطأ في إلغاء التفويض الدائم:', err);
    return res.status(500).json({ status: 'error', message: 'فشل إلغاء التفويض الدائم' });
  }
};

// معالجة قبول أو رفض bulk delegation (تفويض جماعي)
const processBulkDelegation = async (req, res) => {
  
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const { notificationId, action } = req.body;
    if (!notificationId || !action) return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });
    // جلب الإشعار
    const [notifRows] = await db.execute('SELECT * FROM notifications WHERE id = ? AND user_id = ?', [notificationId, userId]);
    if (!notifRows.length) return res.status(404).json({ status: 'error', message: 'الإشعار غير موجود' });
    const notif = notifRows[0];
    let data = {};
    try {
      data = notif.message_data ? JSON.parse(notif.message_data) : {};
    } catch { data = {}; }
    if (!Array.isArray(data.fileIds) || !data.fileIds.length) {
      return res.status(400).json({ status: 'error', message: 'لا توجد ملفات في الإشعار' });
    }
    if (action === 'accept') {

      let lastApproverId = null;
      for (const fileId of data.fileIds) {

        // جلب permanent_delegate_id للمستخدم الذي قبل التفويض
        let permanentDelegateId = null;
        try {
          const [userRows] = await db.execute('SELECT permanent_delegate_id FROM users WHERE id = ?', [userId]);
          permanentDelegateId = userRows.length ? userRows[0].permanent_delegate_id : null;
        } catch {}
        let approverId = userId;
        let delegatedBy = data.from;
        if (permanentDelegateId) {
          approverId = permanentDelegateId;
          delegatedBy = userId;
        }
        lastApproverId = approverId; // احفظ آخر واحد بعد تعريفه
        // جلب تسلسل الاعتماد (custom أو approval)
        let sequence = [];
        let useCustom = false;
        const [contentRows] = await db.execute('SELECT custom_approval_sequence, folder_id FROM contents WHERE id = ? AND deleted_at IS NULL', [fileId]);
        if (contentRows.length && contentRows[0].custom_approval_sequence) {
          try {
            let raw = fixSequenceString(contentRows[0].custom_approval_sequence);
            let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
            if (Array.isArray(parsed)) {
              sequence = parsed;
            } else if (typeof parsed === 'number') {
              sequence = [parsed];
            }
            useCustom = true;
          } catch { sequence = []; }
        } else if (contentRows.length && contentRows[0].folder_id) {
          const folderId = contentRows[0].folder_id;
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
            if (seqRows.length && seqRows[0].approval_sequence) {
              try {
                let raw = fixSequenceString(seqRows[0].approval_sequence);
                let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  sequence = parsed;
                } else if (typeof parsed === 'number') {
                  sequence = [parsed];
                }
              } catch { sequence = []; }
            }
          }
        }

        
        // أضف سجل بالنيابة وسجل عادي إذا كان للمستخدم موقع أصلي
        for (let i = 0; i < sequence.length; i++) {
          if (Number(sequence[i]) === Number(data.from)) {
  
            // سجل بالنيابة
            const [existingProxy] = await db.execute(
              `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
              [fileId, approverId, data.from]
            );
            if (!existingProxy.length) {
              await db.execute(
                `INSERT INTO approval_logs (
                  content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
                ) VALUES (?, ?, ?, 1, 'pending', NOW())`,
                [fileId, approverId, data.from]
              );
            }
            sequence[i] = Number(approverId);
  
          }
          if (Number(sequence[i]) === Number(approverId)) {
            // سجل عادي
            const [existingSelf] = await db.execute(
              `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 0`,
              [fileId, approverId]
            );
            if (!existingSelf.length) {
              await db.execute(
                `INSERT INTO approval_logs (
                  content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
                ) VALUES (?, ?, NULL, 0, 'pending', NOW())`,
                [fileId, approverId]
              );
            }
          }
        }
        
        // تحديث التسلسل في الملف أو القسم
        if (useCustom) {
          await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(sequence), fileId]);
  
        }
        
        // تحديث approval_sequence في جدول departments أيضاً إذا كان هناك folder_id
        if (contentRows.length && contentRows[0].folder_id) {
          const folderId = contentRows[0].folder_id;
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            
            // جلب approval_sequence الحالي من جدول departments
            const [currentDeptSeq] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
            let currentSequence = [];
            if (currentDeptSeq.length && currentDeptSeq[0].approval_sequence) {
              try {
                currentSequence = Array.isArray(currentDeptSeq[0].approval_sequence) 
                  ? currentDeptSeq[0].approval_sequence 
                  : JSON.parse(currentDeptSeq[0].approval_sequence);
              } catch { currentSequence = []; }
            }
    
            
            // إزالة المفوض الأصلي من approval_sequence في جدول departments
            let newDeptSequence = [];
    
            for (let i = 0; i < currentSequence.length; i++) {
              if (Number(currentSequence[i]) !== Number(data.from)) {
                newDeptSequence.push(currentSequence[i]);
              } else {
        
              }
            }
            
            // إضافة المفوض الجديد إذا لم يكن موجوداً بالفعل
            if (!newDeptSequence.includes(Number(approverId))) {
              newDeptSequence.push(Number(approverId));
      
            }
            
            await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(newDeptSequence), departmentId]);
    
            
            // التحقق من أن التحديث تم بنجاح
            const [verifyUpdate] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
            if (verifyUpdate.length) {
      
            }
          }
        }

      }
      // إضافة تفويض دائم للملفات الجديدة
// بعد اللوب:
if (lastApproverId) {
  await db.execute(
    'INSERT IGNORE INTO active_delegations (user_id, delegate_id) VALUES (?, ?)',
    [data.from, lastApproverId]
  );
}
      // احذف الإشعار نهائياً بعد المعالجة
      await db.execute('DELETE FROM notifications WHERE id = ?', [notificationId]);
      return res.status(200).json({ status: 'success', message: 'تم قبول التفويض الجماعي وأصبحت مفوضاً بالنيابة عن جميع الملفات.' });
    } else if (action === 'reject') {
      // عند الرفض: احذف سجل التفويض بالنيابة وأعد المفوض الأصلي
      for (const fileId of data.fileIds) {
        // حذف سجل التفويض بالنيابة
        await db.execute(
          `DELETE FROM approval_logs WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 1 AND status = 'pending'`,
          [fileId, userId]
        );
        // إعادة المفوض الأصلي إلى content_approvers إذا لم يكن موجودًا
        if (data.from) {
          await db.execute(
            'INSERT IGNORE INTO content_approvers (content_id, user_id) VALUES (?, ?)',
            [fileId, data.from]
          );
        }
      }
      // حدث الإشعار كمقروء
      await db.execute('UPDATE notifications SET is_read_by_user = 1 WHERE id = ?', [notificationId]);
      // احذف الإشعار نهائياً بعد المعالجة
      await db.execute('DELETE FROM notifications WHERE id = ?', [notificationId]);
      return res.status(200).json({ status: 'success', message: 'تم رفض التفويض الجماعي وتمت إعادة الملفات للمفوض الأصلي.' });
    } else {
      return res.status(400).json({ status: 'error', message: 'إجراء غير معروف' });
    }
  } catch (err) {
    console.error('processBulkDelegation error:', err);
    res.status(500).json({ status: 'error', message: 'فشل معالجة التفويض الجماعي' });
  }
};

// دالة فحص حالة التفويض المباشر للمستخدم
const getDelegationStatus = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    

    
    // فحص تفويض جميع الملفات من جدول active_delegations
    const [delegationRows] = await db.execute(
      'SELECT user_id as delegated_by FROM active_delegations WHERE delegate_id = ?',
      [userId]
    );
    

    
    if (delegationRows.length > 0) {
      const delegatorId = delegationRows[0].delegated_by;
      
      // جلب اسم المفوض والهوية الوطنية
      const [userRows] = await db.execute(`
        SELECT 
          CONCAT(
            COALESCE(first_name, ''),
            ' ',
            COALESCE(second_name, ''),
            ' ',
            COALESCE(third_name, ''),
            ' ',
            COALESCE(last_name, '')
          ) AS full_name,
          national_id
        FROM users WHERE id = ?
      `, [delegatorId]);
      
      const delegatorName = userRows.length 
        ? userRows[0].full_name?.replace(/\s+/g, ' ').trim() || 'المفوض'
        : 'المفوض';
      
      const delegatorNationalId = userRows.length 
        ? userRows[0].national_id || 'N/A'
        : 'N/A';
      
      
      
      return res.status(200).json({
        status: 'success',
        data: {
          delegated_by: delegatorId,
          delegated_by_name: delegatorName,
          delegated_by_national_id: delegatorNationalId,
          type: 'bulk'
        }
      });
    }
    

    
    return res.status(200).json({
      status: 'success',
      data: null
    });
    
  } catch (err) {
    console.error('❌ خطأ في فحص حالة التفويض:', err);
    return res.status(500).json({ status: 'error', message: 'فشل فحص حالة التفويض' });
  }
};

// دالة فحص التفويضات الجماعية المعلقة
const getPendingDelegationsUnified = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    

    
    // فحص التفويضات الجماعية المعلقة من approval_logs
    // هذه التفويضات التي تم إنشاؤها بواسطة delegateAllApprovals
    const [delegationRows] = await db.execute(`
      SELECT 
        al.delegated_by,
        CONCAT(
          COALESCE(u.first_name, ''),
          ' ',
          COALESCE(u.second_name, ''),
          ' ',
          COALESCE(u.third_name, ''),
          ' ',
          COALESCE(u.last_name, '')
        ) AS delegated_by_name,
        u.national_id AS delegated_by_national_id,
        COUNT(al.content_id) as file_count,
        MIN(al.created_at) as first_delegation,
        MAX(al.created_at) as last_delegation
      FROM approval_logs al
      JOIN users u ON al.delegated_by = u.id
      WHERE al.approver_id = ? 
        AND al.signed_as_proxy = 1 
        AND al.status = 'pending'
        AND al.comments LIKE '%تفويض جماعي%'
      GROUP BY al.delegated_by, u.first_name, u.second_name, u.third_name, u.last_name, u.national_id
      ORDER BY last_delegation DESC
    `, [userId]);
    

    
    if (delegationRows.length > 0) {
      // تحويل البيانات إلى الشكل المطلوب
      const delegations = delegationRows.map(row => ({
        id: `bulk-${row.delegated_by}`,
        delegated_by: row.delegated_by,
        delegated_by_name: row.delegated_by_name?.replace(/\s+/g, ' ').trim() || 'غير معروف',
        delegated_by_national_id: row.delegated_by_national_id || 'N/A',
        file_count: row.file_count,
        type: 'bulk',
        created_at: row.last_delegation
      }));
      
      
      
      return res.status(200).json({
        status: 'success',
        data: delegations
      });
    }
    

    
    return res.status(200).json({
      status: 'success',
      data: []
    });
    
  } catch (err) {
    console.error('❌ خطأ في فحص التفويضات المعلقة:', err);
    return res.status(500).json({ status: 'error', message: 'فشل فحص التفويضات المعلقة' });
  }
};

// دالة فحص سجلات الموافقة للتفويض
const getDelegationLogs = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const { delegatorId } = req.params;
    
    // جلب سجلات الموافقة للتفويض
    const [logRows] = await db.execute(`
      SELECT 
        al.status,
        al.created_at,
        al.comments
      FROM approval_logs al
      WHERE al.approver_id = ? 
        AND al.delegated_by = ? 
        AND al.signed_as_proxy = 1
      ORDER BY al.created_at DESC
    `, [userId, delegatorId]);
    
    return res.status(200).json({
      status: 'success',
      data: logRows
    });
    
  } catch (err) {
    console.error('خطأ في جلب سجلات التفويض:', err);
    return res.status(500).json({ status: 'error', message: 'فشل جلب سجلات التفويض' });
  }
};

// دالة معالجة التفويض المباشر الموحد
const processDirectDelegationUnified = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const { delegatorId, action } = req.body;
    
    if (!delegatorId || !action) {
      return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });
    }
    
    if (action === 'accept') {
      // قبول التفويض المباشر
      // تحديث سجلات التفويض إلى معتمدة
      await db.execute(`
        UPDATE approval_logs 
        SET status = 'approved', comments = 'تم قبول التفويض المباشر'
        WHERE approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1 AND status = 'pending'
      `, [userId, delegatorId]);
      
      // إضافة تفويض دائم
      await db.execute(`
        INSERT IGNORE INTO active_delegations (user_id, delegate_id) 
        VALUES (?, ?)
      `, [delegatorId, userId]);
      
      return res.status(200).json({
        status: 'success',
        message: 'تم قبول التفويض المباشر بنجاح'
      });
      
    } else if (action === 'reject') {
      // رفض التفويض المباشر
      // حذف سجلات التفويض
      await db.execute(`
        DELETE FROM approval_logs 
        WHERE approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1 AND status = 'pending'
      `, [userId, delegatorId]);
      
      // حذف التفويض الدائم
      await db.execute(`
        DELETE FROM active_delegations 
        WHERE user_id = ? AND delegate_id = ?
      `, [delegatorId, userId]);
      
      return res.status(200).json({
        status: 'success',
        message: 'تم رفض التفويض المباشر'
      });
      
    } else {
      return res.status(400).json({ status: 'error', message: 'إجراء غير معروف' });
    }
    
  } catch (err) {
    console.error('خطأ في معالجة التفويض المباشر:', err);
    return res.status(500).json({ status: 'error', message: 'فشل معالجة التفويض المباشر' });
  }
};

// دالة معالجة التفويض الجماعي الموحد
const processBulkDelegationUnified = async (req, res) => {
  
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const { delegationId, action } = req.body;
    
    if (!delegationId || !action) {
      return res.status(400).json({ status: 'error', message: 'بيانات ناقصة' });
    }
    
    // استخراج معرف المفوض من delegationId
    const delegatorId = delegationId.replace('bulk-', '');

    
    if (action === 'accept') {
      // جلب ملفات التفويض المعلقة (التفويضات الجماعية فقط)
      const [pendingLogs] = await db.execute(`
        SELECT content_id FROM approval_logs 
        WHERE approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1 AND status = 'pending'
        AND (comments LIKE '%تفويض جماعي%' OR comments LIKE '%bulk%')
      `, [userId, delegatorId]);
      

      
      // معالجة كل ملف
      for (const log of pendingLogs) {
        const fileId = log.content_id;

        
        // جلب تسلسل الاعتماد (custom أو approval)
        let sequence = [];
        let useCustom = false;
        const [contentRows] = await db.execute('SELECT custom_approval_sequence, folder_id FROM contents WHERE id = ? AND deleted_at IS NULL', [fileId]);
        if (contentRows.length && contentRows[0].custom_approval_sequence) {
          try {
            let raw = fixSequenceString(contentRows[0].custom_approval_sequence);
            let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
            if (Array.isArray(parsed)) {
              sequence = parsed;
            } else if (typeof parsed === 'number') {
              sequence = [parsed];
            }
            useCustom = true;
          } catch { sequence = []; }
        } else if (contentRows.length && contentRows[0].folder_id) {
          const folderId = contentRows[0].folder_id;
                      const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ? AND deleted_at IS NULL', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ? AND deleted_at IS NULL', [departmentId]);
            if (seqRows.length && seqRows[0].approval_sequence) {
              try {
                let raw = fixSequenceString(seqRows[0].approval_sequence);
                let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
                if (Array.isArray(parsed)) {
                  sequence = parsed;
                } else if (typeof parsed === 'number') {
                  sequence = [parsed];
                }
              } catch { sequence = []; }
            }
          }
        }
        

        
        // تحديث التسلسل: استبدال المفوض الأصلي بالمفوض الجديد في نفس المكان
        let newSequence = [];
        let delegateeAdded = false;
        
        for (let i = 0; i < sequence.length; i++) {
          if (Number(sequence[i]) === Number(delegatorId)) {

            
            // إضافة المفوض الجديد في نفس المكان
            newSequence.push(Number(userId));
            delegateeAdded = true;
            
            // تحديث حالة التفويض في approval_logs إلى accepted
            await db.execute(
              `UPDATE approval_logs 
               SET status = 'accepted' 
               WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
              [fileId, userId, delegatorId]
            );
            
            // سجل بالنيابة
            const [existingProxy] = await db.execute(
              `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
              [fileId, userId, delegatorId]
            );
            if (!existingProxy.length) {
              await db.execute(
                `INSERT INTO approval_logs (
                  content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
                ) VALUES (?, ?, ?, 1, 'accepted', NOW())`,
                [fileId, userId, delegatorId]
              );
            }
            

          } else if (Number(sequence[i]) === Number(userId)) {
            // المفوض الجديد موجود بالفعل
            newSequence.push(Number(sequence[i]));
            
            // سجل عادي
            const [existingSelf] = await db.execute(
              `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 0`,
              [fileId, userId]
            );
            if (!existingSelf.length) {
              await db.execute(
                `INSERT INTO approval_logs (
                  content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
                ) VALUES (?, ?, NULL, 0, 'pending', NOW())`,
                [fileId, userId]
              );
            }
          } else {
            // باقي الأعضاء
            newSequence.push(Number(sequence[i]));
          }
        }
        
        // إذا لم نجد المفوض الأصلي في التسلسل، نضيف المفوض الجديد في النهاية
        if (!delegateeAdded && !newSequence.includes(Number(userId))) {
          newSequence.push(Number(userId));

        }
        
        // تحديث التسلسل
        sequence = newSequence;
        
        // تحديث التسلسل في الملف أو القسم
        if (useCustom) {
          await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(sequence), fileId]);

        }
        
        console.log('[PROCESS BULK UNIFIED] Finished processing fileId:', fileId);
      }
      
      // تحديث جميع الملفات في جدول contents التي تحتوي على المفوض الأصلي في custom_approval_sequence
      console.log('[PROCESS BULK UNIFIED] Updating all contents for delegator:', delegatorId);
      
      const [allContentRows] = await db.execute(`
        SELECT id, custom_approval_sequence 
        FROM contents 
        WHERE custom_approval_sequence IS NOT NULL AND custom_approval_sequence != ''
          AND deleted_at IS NULL
      `);
      
      console.log('[PROCESS BULK UNIFIED] Processing all contents with custom sequence:', allContentRows.length);
      
      for (const contentRow of allContentRows) {
        const contentId = contentRow.id;
        let currentSequence = [];
        
        if (contentRow.custom_approval_sequence) {
          try {
            currentSequence = Array.isArray(contentRow.custom_approval_sequence) 
              ? contentRow.custom_approval_sequence 
              : JSON.parse(contentRow.custom_approval_sequence);
          } catch { currentSequence = []; }
        }
        
        
        // فحص إذا كان الملف يحتوي على المفوض الأصلي
        const hasDelegator = currentSequence.some(id => Number(id) === Number(delegatorId));
        
        if (hasDelegator) {
          
          // استبدال المفوض الأصلي بالمفوض الجديد في نفس المكان
          let newContentSequence = [];
          let delegateeAdded = false;
          
          for (let i = 0; i < currentSequence.length; i++) {
            if (Number(currentSequence[i]) === Number(delegatorId)) {
              // استبدال المفوض الأصلي بالمفوض الجديد في نفس المكان
              newContentSequence.push(Number(userId));
              delegateeAdded = true;
            } else {
              // إضافة باقي الأعضاء
              newContentSequence.push(currentSequence[i]);
            }
          }
          
          // إذا لم نجد المفوض الأصلي في التسلسل، نضيف المفوض الجديد في النهاية
          if (!delegateeAdded && !newContentSequence.includes(Number(userId))) {
            newContentSequence.push(Number(userId));
          }
          
          await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(newContentSequence), contentId]);
        } else {
          console.log('[PROCESS BULK UNIFIED] Content does not contain delegator, skipping');
        }
      }
      
      // تحديث approval_sequence في جميع الأقسام التي ينتمي إليها المفوض الأصلي
      // هذا يضمن أن جميع الملفات المستقبلية ستذهب للمفوض الجديد
      
      // جلب جميع الأقسام
      const [allDeptRows] = await db.execute(`
        SELECT id, approval_sequence 
        FROM departments
        WHERE deleted_at IS NULL
      `);
      
      
      for (const deptRow of allDeptRows) {
        const departmentId = deptRow.id;
        let currentSequence = [];
        
        if (deptRow.approval_sequence) {
          try {
            currentSequence = Array.isArray(deptRow.approval_sequence) 
              ? deptRow.approval_sequence 
              : JSON.parse(deptRow.approval_sequence);
          } catch { currentSequence = []; }
        }
        
        
        // فحص إذا كان القسم يحتوي على المفوض الأصلي
        const hasDelegator = currentSequence.some(id => Number(id) === Number(delegatorId));
        
        if (hasDelegator) {
          
          // استبدال المفوض الأصلي بالمفوض الجديد في نفس المكان
          let newDeptSequence = [];
          let delegateeAdded = false;
          
          for (let i = 0; i < currentSequence.length; i++) {
            if (Number(currentSequence[i]) === Number(delegatorId)) {
              // استبدال المفوض الأصلي بالمفوض الجديد في نفس المكان
              newDeptSequence.push(Number(userId));
              delegateeAdded = true;
            } else {
              // إضافة باقي الأعضاء
              newDeptSequence.push(currentSequence[i]);
            }
          }
          
          // إذا لم نجد المفوض الأصلي في التسلسل، نضيف المفوض الجديد في النهاية
          if (!delegateeAdded && !newDeptSequence.includes(Number(userId))) {
            newDeptSequence.push(Number(userId));
            console.log('[PROCESS BULK UNIFIED] Added delegatee to end of department sequence:', userId);
          }
          
          await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(newDeptSequence), departmentId]);
          console.log('[PROCESS BULK UNIFIED] Updated department approval_sequence:', newDeptSequence, 'for department:', departmentId);
        } else {
          console.log('[PROCESS BULK UNIFIED] Department does not contain delegator, skipping');
        }
      }
      
      // تحديث جدول content_approvers لجميع الملفات التي تحتوي على المفوض الأصلي
      console.log('[PROCESS BULK UNIFIED] Updating content_approvers table for delegator:', delegatorId);
      
      // حذف المفوض الأصلي من content_approvers
      await db.execute(`
        DELETE FROM content_approvers 
        WHERE user_id = ?
      `, [delegatorId]);
      
      // إضافة المفوض الجديد إلى content_approvers لجميع الملفات التي كان المفوض الأصلي معتمد عليها
      const [contentApproverRows] = await db.execute(`
        SELECT DISTINCT content_id 
        FROM content_approvers 
        WHERE user_id = ?
      `, [delegatorId]);
      
      for (const row of contentApproverRows) {
        // إضافة المفوض الجديد
        await db.execute(`
          INSERT IGNORE INTO content_approvers (content_id, user_id) 
          VALUES (?, ?)
        `, [row.content_id, userId]);
        
        console.log('[PROCESS BULK UNIFIED] Added delegatee to content_approvers for content:', row.content_id);
      }
      
      // قبول التفويض الجماعي
      // تحديث سجلات التفويض إلى معتمدة
      await db.execute(`
        UPDATE approval_logs 
        SET status = 'approved', comments = 'تم قبول التفويض الجماعي'
        WHERE approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1 AND status = 'pending'
        AND (comments LIKE '%تفويض جماعي%' OR comments LIKE '%bulk%')
      `, [userId, delegatorId]);
      
      // إضافة تفويض دائم
      await db.execute(`
        INSERT IGNORE INTO active_delegations (user_id, delegate_id) 
        VALUES (?, ?)
      `, [delegatorId, userId]);
      
      return res.status(200).json({
        status: 'success',
        message: 'تم قبول التفويض الجماعي بنجاح'
      });
      
    } else if (action === 'reject') {
      // رفض التفويض الجماعي
      // حذف سجلات التفويض الجماعية فقط
      await db.execute(`
        DELETE FROM approval_logs 
        WHERE approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1 AND status = 'pending'
        AND (comments LIKE '%تفويض جماعي%' OR comments LIKE '%bulk%')
      `, [userId, delegatorId]);
      
      // حذف التفويض الدائم
      await db.execute(`
        DELETE FROM active_delegations 
        WHERE user_id = ? AND delegate_id = ?
      `, [delegatorId, userId]);
      
      return res.status(200).json({
        status: 'success',
        message: 'تم رفض التفويض الجماعي'
      });
      
    } else {
      return res.status(400).json({ status: 'error', message: 'إجراء غير معروف' });
    }
    
  } catch (err) {
    console.error('خطأ في معالجة التفويض الجماعي:', err);
    return res.status(500).json({ status: 'error', message: 'فشل معالجة التفويض الجماعي' });
  }
};

// دالة جلب اقرارات التفويض (للمديرين)
const getDelegationConfirmations = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    
    // جلب جميع اقرارات التفويض من approval_logs
    const [delegationRows] = await db.execute(`
      SELECT 
        al.id,
        al.content_id,
        al.approver_id,
        al.delegated_by,
        al.signed_as_proxy,
        al.status,
        al.comments,
        al.signature,
        al.created_at,
        CASE 
          WHEN al.signed_as_proxy = 1 THEN 'receiver'
          WHEN al.status = 'sender_signature' THEN 'sender'
          ELSE 'unknown'
        END as delegation_type
      FROM approval_logs al
      WHERE (al.signed_as_proxy = 1 AND al.status IN ('pending', 'accepted', 'approved'))
         OR (al.status = 'sender_signature')
      ORDER BY al.created_at DESC
    `);

    // جلب التفويض الشامل من جدول active_delegations
    const [bulkDelegationRows] = await db.execute(`
      SELECT 
        user_id as delegated_by,
        delegate_id as approver_id
      FROM active_delegations
      ORDER BY user_id DESC, delegate_id DESC
    `);

    // جلب توقيعات المرسلين للتفويض الشامل من approval_logs
    const [bulkSignatureRows] = await db.execute(`
      SELECT 
        delegated_by,
        signature,
        electronic_signature,
        created_at,
        comments
      FROM approval_logs 
      WHERE (status = 'sender_signature' OR status = 'approved' OR status = 'pending')
        AND signed_as_proxy = 0 
        AND (signature IS NOT NULL OR electronic_signature IS NOT NULL)
      ORDER BY created_at DESC
    `);
    


    // فحص جميع السجلات في approval_logs للتأكد من وجود التوقيعات
    const [allSignatureRows] = await db.execute(`
      SELECT 
        delegated_by,
        signature,
        electronic_signature,
        created_at,
        comments,
        status,
        signed_as_proxy
      FROM approval_logs 
      WHERE (comments LIKE '%تفويض شامل%' OR comments LIKE '%تفويض جماعي%' OR comments LIKE '%bulk%' OR comments LIKE '%جميع ملفات%')
        AND (signature IS NOT NULL OR electronic_signature IS NOT NULL)
      ORDER BY created_at DESC
    `);


    // فحص جميع السجلات في approval_logs للتأكد من وجود أي توقيعات
    const [anySignatureRows] = await db.execute(`
      SELECT 
        id,
        delegated_by,
        signature,
        electronic_signature,
        created_at,
        comments,
        status,
        signed_as_proxy
      FROM approval_logs 
      WHERE (signature IS NOT NULL OR electronic_signature IS NOT NULL)
      ORDER BY created_at DESC
      LIMIT 10
    `);


    // فحص جميع السجلات في approval_logs مع تعليقات التفويض
    const [allBulkCommentRows] = await db.execute(`
      SELECT 
        id,
        delegated_by,
        signature,
        electronic_signature,
        created_at,
        comments,
        status,
        signed_as_proxy
      FROM approval_logs 
      WHERE (comments LIKE '%تفويض شامل%' OR comments LIKE '%تفويض جماعي%' OR comments LIKE '%bulk%' OR comments LIKE '%جميع ملفات%')
      ORDER BY created_at DESC
    `);
    console.log(`[ALL BULK COMMENTS] Found ${allBulkCommentRows.length} all rows with bulk comments`);
    console.log(`[ALL BULK COMMENTS] All bulk comment rows:`, allBulkCommentRows);
    
    // تجميع البيانات
    const confirmations = [];
    const processedIds = new Set();
    
    // معالجة التفويض الفردي
    for (const row of delegationRows) {
      if (processedIds.has(row.id)) continue;
      processedIds.add(row.id);
      
      // جلب معلومات المرسل (delegated_by)
      let delegatorInfo = null;
      if (row.delegated_by) {
        try {
          const [delegatorRows] = await db.execute(`
            SELECT 
              id,
              first_name,
              second_name,
              third_name,
              last_name,
              job_name_id,
              national_id,
              employee_number
            FROM users WHERE id = ?
          `, [row.delegated_by]);
          
          if (delegatorRows.length > 0) {
            delegatorInfo = {
              id: delegatorRows[0].id,
              fullName: buildFullNameWithJobName(delegatorRows[0].job_name_id, delegatorRows[0].first_name, delegatorRows[0].second_name, delegatorRows[0].third_name, delegatorRows[0].last_name) || 'غير معروف',
              username: buildFullNameWithJobName(delegatorRows[0].job_name_id, delegatorRows[0].first_name, delegatorRows[0].second_name, delegatorRows[0].third_name, delegatorRows[0].last_name) || 'غير معروف',
              idNumber: delegatorRows[0].national_id || delegatorRows[0].employee_number || delegatorRows[0].id || 'غير محدد'
            };
          }
        } catch (userError) {
          console.error('خطأ في جلب معلومات المرسل:', userError);
          delegatorInfo = {
            id: row.delegated_by,
            fullName: 'مستخدم غير معروف',
            username: 'غير معروف',
            idNumber: 'غير محدد'
          };
        }
      }
      
      // جلب معلومات المستقبل (approver_id)
      let delegateInfo = null;
      if (row.approver_id) {
        try {
          const [delegateRows] = await db.execute(`
            SELECT 
              id,
              first_name,
              second_name,
              third_name,
              last_name,
              job_name_id,
              national_id,
              employee_number
            FROM users WHERE id = ?
          `, [row.approver_id]);
          
          if (delegateRows.length > 0) {
            delegateInfo = {
              id: delegateRows[0].id,
              fullName: buildFullNameWithJobName(delegateRows[0].job_name_id, delegateRows[0].first_name, delegateRows[0].second_name, delegateRows[0].third_name, delegateRows[0].last_name) || 'غير معروف',
              username: buildFullNameWithJobName(delegateRows[0].job_name_id, delegateRows[0].first_name, delegateRows[0].second_name, delegateRows[0].third_name, delegateRows[0].last_name) || 'غير معروف',
              idNumber: delegateRows[0].national_id || delegateRows[0].employee_number || delegateRows[0].id || 'غير محدد'
            };
          }
        } catch (userError) {
          console.error('خطأ في جلب معلومات المستقبل:', userError);
          delegateInfo = {
            id: row.approver_id,
            fullName: 'مستخدم غير معروف',
            username: 'غير معروف',
            idNumber: 'غير محدد'
          };
        }
      }
      
      // جلب معلومات الملف (من جدول contents فقط)
      let fileInfo = null;
      if (row.content_id) {
        try {
          const [contentRows] = await db.execute('SELECT title FROM contents WHERE id = ? AND deleted_at IS NULL', [row.content_id]);
          if (contentRows.length > 0) {
            fileInfo = {
              id: row.content_id,
              title: contentRows[0].title || 'عنوان غير معروف',
              type: 'department'
            };
          }
        } catch (fileError) {
          console.error('خطأ في جلب معلومات الملف:', fileError);
          fileInfo = {
            id: row.content_id,
            title: 'ملف غير معروف',
            type: 'department'
          };
        }
      }
      
      // تحديد نوع التفويض
      const isBulk = row.comments && (
        row.comments.includes('تفويض شامل') || 
        row.comments.includes('bulk') ||
        row.comments.includes('جميع ملفات')
      );
      
      // إنشاء كائن التأكيد مع فحوصات إضافية
      const confirmation = {
        id: row.id,
        delegation_type: row.delegation_type || 'unknown',
        is_bulk: isBulk,
        content_type: 'department', // دائماً قسم
        status: row.status || 'unknown',
        comments: row.comments || '',
        signature: row.signature || null,
        created_at: row.created_at || new Date(),
        files: fileInfo ? [fileInfo] : [],
        delegator: delegatorInfo, // معلومات المرسل
        delegate: delegateInfo     // معلومات المستقبل
      };
      
      confirmations.push(confirmation);
    }

    // معالجة التفويض الشامل - إنشاء إقرارين منفصلين
    for (const row of bulkDelegationRows) {
      // جلب معلومات المرسل (delegated_by)
      let delegatorInfo = null;
      try {
        const [delegatorRows] = await db.execute(`
          SELECT 
            id,
            first_name,
            second_name,
            third_name,
            last_name,
            job_name_id,
            national_id,
            employee_number
          FROM users WHERE id = ?
        `, [row.delegated_by]);
        
        if (delegatorRows.length > 0) {
          delegatorInfo = {
            id: delegatorRows[0].id,
            fullName: buildFullNameWithJobName(delegatorRows[0].job_name_id, delegatorRows[0].first_name, delegatorRows[0].second_name, delegatorRows[0].third_name, delegatorRows[0].last_name) || 'غير معروف',
            username: buildFullNameWithJobName(delegatorRows[0].job_name_id, delegatorRows[0].first_name, delegatorRows[0].second_name, delegatorRows[0].third_name, delegatorRows[0].last_name) || 'غير معروف',
            idNumber: delegatorRows[0].national_id || delegatorRows[0].employee_number || delegatorRows[0].id || 'غير محدد'
          };
        }
      } catch (userError) {
        console.error('خطأ في جلب معلومات المرسل للتفويض الشامل:', userError);
        delegatorInfo = {
          id: row.delegated_by,
          fullName: 'مستخدم غير معروف',
          username: 'غير معروف',
          idNumber: 'غير محدد'
        };
      }
      
      // جلب معلومات المستقبل (approver_id)
      let delegateInfo = null;
      try {
        const [delegateRows] = await db.execute(`
          SELECT 
            id,
            first_name,
            second_name,
            third_name,
            last_name,
            job_name_id,
            national_id,
            employee_number
          FROM users WHERE id = ?
        `, [row.approver_id]);
        
        if (delegateRows.length > 0) {
          delegateInfo = {
            id: delegateRows[0].id,
            fullName: buildFullNameWithJobName(delegateRows[0].job_name_id, delegateRows[0].first_name, delegateRows[0].second_name, delegateRows[0].third_name, delegateRows[0].last_name) || 'غير معروف',
            username: buildFullNameWithJobName(delegateRows[0].job_name_id, delegateRows[0].first_name, delegateRows[0].second_name, delegateRows[0].third_name, delegateRows[0].last_name) || 'غير معروف',
            idNumber: delegateRows[0].national_id || delegateRows[0].employee_number || delegateRows[0].id || 'غير محدد'
          };
        }
      } catch (userError) {
        console.error('خطأ في جلب معلومات المستقبل للتفويض الشامل:', userError);
        delegateInfo = {
          id: row.approver_id,
          fullName: 'مستخدم غير معروف',
          username: 'غير معروف',
          idNumber: 'غير محدد'
        };
      }

      // البحث عن توقيع المرسل للتفويض الشامل
      const signatureRow = bulkSignatureRows.find(sig => sig.delegated_by == row.delegated_by);
      const signature = signatureRow ? (signatureRow.signature || signatureRow.electronic_signature) : null;
      const signatureDate = signatureRow ? signatureRow.created_at : new Date();
      const signatureComments = signatureRow ? signatureRow.comments : 'تفويض شامل لجميع ملفات القسم';
      


      // إنشاء إقرار المرسل للتفويض الشامل
      const senderConfirmation = {
        id: `bulk_sender_${row.delegated_by}_${row.approver_id}`,
        delegation_type: 'sender',
        is_bulk: true,
        content_type: 'bulk',
        status: 'approved',
        comments: signatureComments,
        signature: signature,
        created_at: signatureDate,
        files: [],
        delegator: delegatorInfo,
        delegate: delegateInfo
      };

      // إنشاء إقرار المستقبل للتفويض الشامل
      const receiverConfirmation = {
        id: `bulk_receiver_${row.delegated_by}_${row.approver_id}`,
        delegation_type: 'receiver',
        is_bulk: true,
        content_type: 'bulk',
        status: 'approved',
        comments: 'تفويض شامل لجميع ملفات القسم',
        signature: null,
        created_at: new Date(),
        files: [],
        delegator: delegatorInfo,
        delegate: delegateInfo
      };

      confirmations.push(senderConfirmation);
      confirmations.push(receiverConfirmation);
    }
    
    // تسجيل للتأكد من إرسال البيانات
    console.log(`[DELEGATION CONFIRMATIONS] Total confirmations:`, confirmations.length);
    console.log(`[DELEGATION CONFIRMATIONS] Bulk delegations with signatures:`, confirmations.filter(c => c.is_bulk && c.delegation_type === 'sender' && c.signature).length);
    
    return res.status(200).json({
      status: 'success',
      data: confirmations
    });
    
  } catch (err) {
    console.error('خطأ في جلب اقرارات التفويض:', err);
    return res.status(500).json({ status: 'error', message: 'فشل جلب اقرارات التفويض' });
  }
};

module.exports = {
  getUserPendingApprovals,
  handleApproval,
  delegateApproval,
  getAssignedApprovals,
  getProxyApprovals,
  acceptProxyDelegation,
  delegateAllApprovals,
  revokeAllDelegations,
  getDelegationSummaryByUser,
  revokeActiveDelegation,
  processBulkDelegation,
  getDelegationStatus,
  getPendingDelegationsUnified,
  getDelegationLogs,
  processDirectDelegationUnified,
  processBulkDelegationUnified,
  getDelegationConfirmations,
};





