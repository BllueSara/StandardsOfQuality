const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

const { logAction } = require('../models/logger');
const { insertNotification } = require('../models/notfications-utils');

require('dotenv').config();

// قاعدة البيانات
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// جلب التواقيع المعلقة للمستخدم
const getUserPendingApprovals = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

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
        GROUP_CONCAT(DISTINCT u2.username) AS assigned_approvers
      FROM contents c
      JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      LEFT JOIN content_approvers ca ON ca.content_id = c.id
      LEFT JOIN users u2 ON ca.user_id = u2.id
      WHERE c.is_approved = 0
        AND JSON_CONTAINS(c.approvers_required, JSON_ARRAY(?))
      GROUP BY c.id
    `, [userId]);

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

    res.status(200).json({ status: 'success', data: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'خطأ في جلب الموافقات المعلقة للمستخدم' });
  }
};

// اعتماد/رفض ملف
const handleApproval = async (req, res) => {
  let { contentId: originalContentId } = req.params;
  const { approved, signature, notes, electronic_signature, on_behalf_of } = req.body;

  let contentId;

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
    const canViewAll = userRole === 'admin';

    // تمييز نوع الاعتماد بناءً على on_behalf_of
    let isProxy = false;
    let delegatedBy = null;
    if (on_behalf_of) {
      isProxy = true;
      delegatedBy = on_behalf_of;
    } else {
      isProxy = false;
      delegatedBy = null;
    }

    // تحقق من وجود تفويض دائم
    let permanentDelegator = null;
    const [permDelegRows] = await db.execute(
      'SELECT user_id FROM active_delegations WHERE delegate_id = ?',
      [currentUserId]
    );
    console.log('[PERM-DELEG] Checking permanent delegation for user', currentUserId, 'rows:', permDelegRows);
    if (permDelegRows.length) {
      permanentDelegator = permDelegRows[0].user_id;
      console.log('[PERM-DELEG] Found permanent delegator:', permanentDelegator, 'for user:', currentUserId);
    }

    // إذا كان هناك تفويض دائم، سجّل سجل بالنيابة دائماً، وإذا كان للمستخدم موقع أصلي سجّل سجل شخصي أيضًا
    if (approved && permanentDelegator) {
      // جلب التسلسل
      let approvalSequence = [];
      const [customRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ?', [contentId]);
      console.log('[PERM-DELEG] custom_approval_sequence for content', contentId, ':', customRows);
      if (customRows.length && customRows[0].custom_approval_sequence) {
        try {
          const parsed = JSON.parse(customRows[0].custom_approval_sequence);
          if (Array.isArray(parsed) && parsed.length > 0) {
            approvalSequence = parsed;
          }
        } catch (e) { console.log('[PERM-DELEG] Error parsing custom_approval_sequence:', e); }
      }
      if (approvalSequence.length === 0) {
        // جلب من القسم
        const [folderRows] = await db.execute('SELECT folder_id FROM contents WHERE id = ?', [contentId]);
        console.log('[PERM-DELEG] folderRows:', folderRows);
        if (folderRows.length) {
          const folderId = folderRows[0].folder_id;
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
          console.log('[PERM-DELEG] deptRows:', deptRows);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
            console.log('[PERM-DELEG] seqRows:', seqRows);
            if (seqRows.length) {
              let approvalSequenceRaw = seqRows[0].approval_sequence;
              if (Array.isArray(approvalSequenceRaw)) {
                approvalSequence = approvalSequenceRaw;
                console.log('[PERM-DELEG] approval_sequence is Array:', approvalSequenceRaw);
              } else if (typeof approvalSequenceRaw === 'string') {
                try {
                  approvalSequence = JSON.parse(approvalSequenceRaw);
                  console.log('[PERM-DELEG] approval_sequence parsed from string:', approvalSequence);
                } catch (e) {
                  console.log('[PERM-DELEG] Error parsing dept approval_sequence:', e);
                  approvalSequence = [];
                }
              } else {
                approvalSequence = [];
                console.log('[PERM-DELEG] approval_sequence unknown type:', typeof approvalSequenceRaw);
              }
            }
          }
        }
      }
      approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
      console.log('[PERM-DELEG] Final approvalSequence:', approvalSequence);
      // تحقق هل للمستخدم موقع أصلي
      const hasSelf = approvalSequence.some(id => Number(id) === Number(currentUserId));
      console.log('[PERM-DELEG] hasSelf:', hasSelf, 'permanentDelegator:', permanentDelegator);
      // سجل شخصي إذا كان له موقع أصلي
      if (hasSelf) {
        try {
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
          console.log('[PERM-DELEG] Inserted self approval log for user', currentUserId, 'content', contentId);
        } catch (e) {
          console.log('[PERM-DELEG] Error inserting self approval log:', e);
        }
      }
      // سجل بالنيابة دائماً إذا كان هناك تفويض دائم
      try {
        await db.execute(`
          INSERT INTO approval_logs (
            content_id, approver_id, delegated_by, signed_as_proxy, status, signature, electronic_signature, comments, created_at
          ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            signature = VALUES(signature),
            electronic_signature = VALUES(electronic_signature),
            comments = VALUES(comments),
            created_at = NOW()
        `, [
          contentId,
          currentUserId,
          permanentDelegator,
          approved ? 'approved' : 'rejected',
          signature || null,
          electronic_signature || null,
          notes || ''
        ]);
        console.log('[PERM-DELEG] Inserted proxy approval log for user', currentUserId, 'on behalf of', permanentDelegator, 'content', contentId);
      } catch (e) {
        console.log('[PERM-DELEG] Error inserting proxy approval log:', e);
      }
      // أكمل الدالة ولا تنفذ الإدخال الافتراضي بالأسفل
      // تحديث ملف PDF مباشرة بعد كل عملية اعتماد
      try {
        await generateFinalSignedPDF(contentId);
        console.log('[PERM-DELEG] PDF generated for content', contentId);
      } catch (e) {
        console.log('[PERM-DELEG] Error generating PDF:', e);
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
        console.log('[PERM-DELEG] Updated approvals_log for content', contentId);
      } catch (e) {
        console.log('[PERM-DELEG] Error updating approvals_log:', e);
      }
      // الاستجابة النهائية
      return res.status(200).json({ status: 'success', message: 'تم تسجيل اعتمادك بنجاح (شخصي و/أو نيابة)' });
    }

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
      }

      // للمدير: إذا كان الاعتماد، تحقق من اكتمال الاعتماد
      if (approved) {
        // جلب التسلسل للتحقق
        let approvalSequence = [];
        const [customRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ?', [contentId]);
        if (customRows.length && customRows[0].custom_approval_sequence) {
          try {
            const parsed = JSON.parse(customRows[0].custom_approval_sequence);
            if (Array.isArray(parsed) && parsed.length > 0) {
              approvalSequence = parsed;
            }
          } catch {}
        }
        if (approvalSequence.length === 0) {
          const [folderRows] = await db.execute('SELECT folder_id FROM contents WHERE id = ?', [contentId]);
          if (folderRows.length) {
            const folderId = folderRows[0].folder_id;
            const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
            if (deptRows.length) {
              const departmentId = deptRows[0].department_id;
              const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
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
          const [ownerRows] = await db.execute('SELECT created_by, title FROM contents WHERE id = ?', [contentId]);
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
            const [ownerRows] = await db.execute('SELECT created_by, title FROM contents WHERE id = ?', [contentId]);
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
      const [itemDetails] = await db.execute(`SELECT title FROM contents WHERE id = ?`, [contentId]);
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

    // أولاً: نفذ جملة الإدخال كما كانت سابقاً (بدون WHERE)
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

    // ثانياً: نفذ جملة UPDATE منفصلة لتحديث السجل الصحيح فقط
    await db.execute(
      `UPDATE ${approvalLogsTable}
       SET status = ?, signature = ?, electronic_signature = ?, comments = ?, created_at = NOW()
       WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = ? AND (delegated_by = ? OR (? IS NULL AND delegated_by IS NULL))`,
      [
        approved ? 'approved' : 'rejected',
        signature || null,
        electronic_signature || null,
        notes || '',
        contentId,
        currentUserId,
        isProxy ? 1 : 0,
        delegatedBy,
        delegatedBy
      ]
    );

    // تحديث ملف PDF مباشرة بعد كل عملية اعتماد
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
        const [customRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ?', [contentId]);
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
          const [folderRows2] = await db.execute(`SELECT folder_id FROM ${contentsTable} WHERE id = ?`, [contentId]);
          if (folderRows2.length) {
            const folderId2 = folderRows2[0].folder_id;
            // جلب department_id من جدول folders
            const [deptRows2] = await db.execute(`SELECT department_id FROM folders WHERE id = ?`, [folderId2]);
            if (deptRows2.length) {
              const departmentId2 = deptRows2[0].department_id;
              // جلب approval_sequence من جدول departments
              const [seqRows2] = await db.execute(`SELECT approval_sequence FROM departments WHERE id = ?`, [departmentId2]);
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
              const [contentRows] = await db.execute(`SELECT title FROM ${contentsTable} WHERE id = ?`, [contentId]);
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
    const [customRowsFinal] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ?', [contentId]);
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
        const [deptRows] = await db.execute(`SELECT department_id FROM folders WHERE id = ?`, [folderId]);
        if (deptRows.length) {
          const departmentId = deptRows[0].department_id;
          // جلب approval_sequence من جدول departments
          const [seqRows] = await db.execute(`SELECT approval_sequence FROM departments WHERE id = ?`, [departmentId]);
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
      const hasApproved = logs.some(log => Number(log.approver_id) === approverId && log.status === 'approved');
      if (!hasApproved) {
        allApproved = false;
        break;
      }
    }
    if (allApproved && approvalSequence.length > 0) {
      await generatePdfFunction(contentId);
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
// توليد نسخة نهائية موقعة من PDF مع دعم "توقيع بالنيابة"
async function generateFinalSignedPDF(contentId) {
  // 1) جلب مسار الملف
  const [fileRows] = await db.execute(
    `SELECT file_path FROM contents WHERE id = ?`,
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

  // 2) تحميل وثيقة الـ PDF
  let pdfDoc;
  try {
    const pdfBytes = fs.readFileSync(fullPath);
    pdfDoc = await PDFDocument.load(pdfBytes);
  } catch (err) {
    return console.error('❌ Failed to load PDF:', err);
  }

  // 3) جلب سجلات الاعتماد بما فيها التفويض
  const [logs] = await db.execute(`
    SELECT
      al.signed_as_proxy,
      u_actual.username   AS actual_signer,
      u_original.username AS original_user,
      al.signature,
      al.electronic_signature,
      al.comments
    FROM approval_logs al
    JOIN users u_actual
      ON al.approver_id = u_actual.id
    LEFT JOIN users u_original
      ON al.delegated_by = u_original.id
    WHERE al.content_id = ? AND al.status = 'approved'
    ORDER BY al.created_at
  `, [contentId]);

  if (!logs.length) {
    console.warn('⚠️ No approved signatures found for content', contentId);
    return;
  }

  // 4) حذف أي صفحة تواقيع قديمة في نهاية الملف (عنوانها Signatures Summary)
  const signatureTitles = ['Signatures Summary', 'Signatures Summary (continued)'];
  let pageCount = pdfDoc.getPageCount();
  // ابحث من النهاية للأمام
  while (pageCount > 0) {
    const lastPage = pdfDoc.getPage(pageCount - 1);
    // لا توجد طريقة مباشرة لقراءة النص من الصفحة في pdf-lib،
    // لكن يمكننا حفظ عدد الصفحات الأصلية في أول توقيع (metadata) أو نفترض أن صفحة التواقيع دائماً في النهاية ونحذفها دائماً
    // سنحذف آخر صفحة إذا كان عدد صفحات الملف أكبر من 1 (حتى لا نحذف كل الصفحات)
    // أو إذا كان هناك أكثر من صفحة واحدة وتمت إضافة صفحة تواقيع سابقاً
    // الحل العملي: احذف آخر صفحة دائماً إذا كان عدد الصفحات > 1
    if (pageCount > 1) {
      pdfDoc.removePage(pageCount - 1);
      pageCount--;
    } else {
      break;
    }
    // إذا أردت منطق أدق، يمكن حفظ مؤشر في metadata
  }

  // 5) أضف صفحة التواقيع في نهاية الملف
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  let page = pdfDoc.addPage();
  let y = 750;
  const signatureTitle = 'Signatures Summary';
  page.drawText(signatureTitle, {
    x: 200,
    y,
    size: 20,
    font,
    color: rgb(0, 0, 0)
  });
  y -= 40;

  // 6) رسم كل توقيع
  const uniqueSelf = new Set();
  for (const log of logs) {
    if (log.signed_as_proxy) {
      // اعرض كل proxy
      if (y < 200) {
        page = pdfDoc.addPage();
        y = 750;
        page.drawText(signatureTitle + ' (continued)', {
          x: 200,
          y,
          size: 20,
          font,
          color: rgb(0, 0, 0)
        });
        y -= 40;
      }
      const label = `Signed by ${log.actual_signer} on behalf of ${log.original_user}`;
      page.drawText(label, {
        x: 50, y, size: 14, font, color: rgb(0, 0, 0)
      });
      y -= 25;
      if (log.signature?.startsWith('data:image')) {
        try {
          const base64Data = log.signature.split(',')[1];
          const imgBytes = Buffer.from(base64Data, 'base64');
          const img = await pdfDoc.embedPng(imgBytes);
          const dims = img.scale(0.4);
          page.drawImage(img, {
            x: 150,
            y: y - dims.height + 10,
            width: dims.width,
            height: dims.height
          });
          y -= dims.height + 20;
        } catch (err) {
          y -= 20;
        }
      }
      if (log.electronic_signature) {
        try {
          const stampPath = path.join(__dirname, '../e3teamdelc.png');
          const stampBytes = fs.readFileSync(stampPath);
          const stampImg = await pdfDoc.embedPng(stampBytes);
          const dims = stampImg.scale(0.5);
          page.drawImage(stampImg, {
            x: 150,
            y: y - dims.height + 10,
            width: dims.width,
            height: dims.height
          });
          y -= dims.height + 20;
        } catch (err) {
          y -= 20;
        }
      }
      if (log.comments) {
        page.drawText(`Comments: ${log.comments}`, {
          x: 50, y, size: 12, font, color: rgb(0.3, 0.3, 0.3)
        });
        y -= 20;
      }
      page.drawLine({
        start: { x: 50, y },
        end:   { x: 550, y },
        thickness: 1,
        color: rgb(0.8, 0.8, 0.8)
      });
      y -= 30;
    } else {
      // self: اعرض فقط أول توقيع لكل شخص
      if (!uniqueSelf.has(log.actual_signer)) {
        uniqueSelf.add(log.actual_signer);
        if (y < 200) {
          page = pdfDoc.addPage();
          y = 750;
          page.drawText(signatureTitle + ' (continued)', {
            x: 200,
            y,
            size: 20,
            font,
            color: rgb(0, 0, 0)
          });
          y -= 40;
        }
        const label = `Signed by ${log.actual_signer}`;
        page.drawText(label, {
          x: 50, y, size: 14, font, color: rgb(0, 0, 0)
        });
        y -= 25;
        if (log.signature?.startsWith('data:image')) {
          try {
            const base64Data = log.signature.split(',')[1];
            const imgBytes = Buffer.from(base64Data, 'base64');
            const img = await pdfDoc.embedPng(imgBytes);
            const dims = img.scale(0.4);
            page.drawImage(img, {
              x: 150,
              y: y - dims.height + 10,
              width: dims.width,
              height: dims.height
            });
            y -= dims.height + 20;
          } catch (err) {
            y -= 20;
          }
        }
        if (log.electronic_signature) {
          try {
            const stampPath = path.join(__dirname, '../e3teamdelc.png');
            const stampBytes = fs.readFileSync(stampPath);
            const stampImg = await pdfDoc.embedPng(stampBytes);
            const dims = stampImg.scale(0.5);
            page.drawImage(stampImg, {
              x: 150,
              y: y - dims.height + 10,
              width: dims.width,
              height: dims.height
            });
            y -= dims.height + 20;
          } catch (err) {
            y -= 20;
          }
        }
        if (log.comments) {
          page.drawText(`Comments: ${log.comments}`, {
            x: 50, y, size: 12, font, color: rgb(0.3, 0.3, 0.3)
          });
          y -= 20;
        }
        page.drawLine({
          start: { x: 50, y },
          end:   { x: 550, y },
          thickness: 1,
          color: rgb(0.8, 0.8, 0.8)
        });
        y -= 30;
      }
    }
  }

  // 7) حفظ التعديلات
  try {
    const finalBytes = await pdfDoc.save();
    fs.writeFileSync(fullPath, finalBytes);
    console.log(`✅ PDF updated: ${fullPath}`);
  } catch (err) {
    console.error('❌ Error saving PDF:', err);
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
    const canViewAll = userRole === 'admin';

    // جلب كل الملفات (حسب الصلاحية)
    const departmentContentQuery = canViewAll
      ? `
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
          u.username AS created_by_username,
          'department' AS type,
          CAST(c.approvers_required AS CHAR) AS approvers_required,
          c.created_at,
          MAX(al_reject.approver_id) AS rejected_by_id,
          MAX(u_reject.username) AS rejected_by_username,
          c.approvals_log
        FROM contents c
        JOIN folders f        ON c.folder_id = f.id
        JOIN departments d    ON f.department_id = d.id
        JOIN users u          ON c.created_by = u.id
        LEFT JOIN approval_logs al_reject ON c.id = al_reject.content_id AND al_reject.status = 'rejected'
        LEFT JOIN users u_reject ON al_reject.approver_id = u_reject.id
        WHERE c.approval_status IN ('pending', 'approved', 'rejected')
        GROUP BY c.id
      `
      : `
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
          u.username AS created_by_username,
          'department' AS type,
          CAST(c.approvers_required AS CHAR) AS approvers_required,
          c.created_at,
          MAX(al_reject.approver_id) AS rejected_by_id,
          MAX(u_reject.username) AS rejected_by_username,
          c.approvals_log
        FROM contents c
        JOIN folders f        ON c.folder_id = f.id
        JOIN departments d    ON f.department_id = d.id
        JOIN users u          ON c.created_by = u.id
        LEFT JOIN approval_logs al_reject ON c.id = al_reject.content_id AND al_reject.status = 'rejected'
        LEFT JOIN users u_reject ON al_reject.approver_id = u_reject.id
        WHERE c.approval_status IN ('pending', 'approved', 'rejected')
        GROUP BY c.id
      `;

    const params = [];
    const finalQuery = `
      ${departmentContentQuery}
      ORDER BY created_at DESC
    `;

    const [rows] = await db.execute(finalQuery, params);

    // تحويل الحقول من نص JSON إلى مصفوفة
    rows.forEach(row => {
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
    });

    // تجهيز الملفات للمستخدم الحالي بحيث يظهر الملف لكل من هو في التسلسل أو مفوض له
    const assignedApprovals = [];
    for (const row of rows) {
      const sequence = Array.isArray(row.approval_sequence) ? row.approval_sequence : [];
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
        assignedApprovals.push({
          ...row,
          isProxy,
          delegatedBy,
          isCurrentTurn: Number(firstPendingUser) === Number(userId) || (isProxy && Number(firstPendingUser) === Number(delegatedBy)),
          isAdmin: false
        });
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
  const { delegateTo, notes } = req.body;

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

    // 2) احضُر اسم المستخدم والمحتوى بشكل صحيح
    const [delegateRows] = await db.execute(
      'SELECT username FROM users WHERE id = ?', 
      [delegateTo]
    );
    const isCommittee = rawId.startsWith('comm-');
    const tableName = isCommittee ? 'committee_contents' : 'contents';
    const [contentRows] = await db.execute(
      `SELECT title FROM ${tableName} WHERE id = ?`, 
      [contentId]
    );

    const delegateeUsername = delegateRows.length 
      ? delegateRows[0].username 
      : String(delegateTo);
    const rawTitle = contentRows.length 
      ? contentRows[0].title 
      : '';
    const parsedTitleAr = parseTitleByLang(rawTitle, 'ar') || 'غير معروف';
    const parsedTitleEn = parseTitleByLang(rawTitle, 'en') || 'Unknown';

    // 3) سجّل الحركة بنوع مرجعي صحيح (enum يحتوي على 'approval')
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
    const [delegatorRows] = await db.execute('SELECT username FROM users WHERE id = ?', [currentUserId]);
    delegatorName = delegatorRows.length ? delegatorRows[0].username : '';
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
        u.username AS delegated_by_name
      FROM approval_logs al
      JOIN contents c ON al.content_id = c.id
      LEFT JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      JOIN users u ON al.delegated_by = u.id
      WHERE al.approver_id = ? AND al.signed_as_proxy = 1 AND al.status = 'pending'
    `, [userId]);

    res.json({ status: 'success', data: rows });
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
    console.log('[ACCEPT PROXY] Start for contentId:', contentId, 'userId:', userId);
    // أضف المستخدم لجدول المعيّنين
    await db.execute(
      'INSERT IGNORE INTO content_approvers (content_id, user_id) VALUES (?, ?)',
      [contentId, userId]
    );

    // جلب تسلسل الاعتماد (custom أو department)
    const [contentRows] = await db.execute(
      'SELECT custom_approval_sequence, folder_id FROM contents WHERE id = ?',
      [contentId]
    );
    let sequence = [];
    let useCustom = false;
    if (contentRows.length && contentRows[0].custom_approval_sequence) {
      try {
        sequence = JSON.parse(contentRows[0].custom_approval_sequence);
        useCustom = true;
        console.log('[ACCEPT PROXY] Got custom_approval_sequence:', sequence);
      } catch { sequence = []; }
    }
    if (!useCustom && contentRows.length && contentRows[0].folder_id) {
      const [folderRows] = await db.execute(
        'SELECT department_id FROM folders WHERE id = ?',
        [contentRows[0].folder_id]
      );
      if (folderRows.length) {
        const departmentId = folderRows[0].department_id;
        const [deptRows] = await db.execute(
          'SELECT approval_sequence FROM departments WHERE id = ?',
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
          console.log('[ACCEPT PROXY] Got department approval_sequence:', sequence);
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
      console.log('[ACCEPT PROXY] Found permanent delegation from:', delegatedBy, 'to:', userId);
    } else {
      // fallback: جلب delegated_by من approval_logs إذا كان تفويض يدوي
      const [proxyRows] = await db.execute(
        'SELECT delegated_by FROM approval_logs WHERE content_id = ? AND approver_id = ? AND signed_as_proxy = 1',
        [contentId, userId]
      );
      if (proxyRows.length) {
        delegatedBy = Number(proxyRows[0].delegated_by);
        console.log('[ACCEPT PROXY] Found manual delegation from:', delegatedBy, 'to:', userId);
      }
    }

    if (delegatedBy && Array.isArray(sequence) && sequence.length > 0) {
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
              ) VALUES (?, ?, ?, 1, 'pending', NOW())`,
              [contentId, userId, delegatedBy]
            );
            console.log('[ACCEPT PROXY] Added proxy log for user:', userId, 'on behalf of:', delegatedBy);
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
            console.log('[ACCEPT PROXY] Added self log for user:', userId);
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
          console.log('[ACCEPT PROXY] Updated custom_approval_sequence:', sequence);
        }
        
        // تحديث approval_sequence في جدول departments أيضاً إذا كان هناك folder_id
        if (contentRows.length && contentRows[0].folder_id) {
          const folderId = contentRows[0].folder_id;
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            
            // جلب approval_sequence الحالي من جدول departments
            const [currentDeptSeq] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
            let currentSequence = [];
            if (currentDeptSeq.length && currentDeptSeq[0].approval_sequence) {
              try {
                currentSequence = Array.isArray(currentDeptSeq[0].approval_sequence) 
                  ? currentDeptSeq[0].approval_sequence 
                  : JSON.parse(currentDeptSeq[0].approval_sequence);
              } catch { currentSequence = []; }
            }
            console.log('[ACCEPT PROXY] Current department approval_sequence:', currentSequence);
            
            // إزالة المفوض الأصلي من approval_sequence في جدول departments
            let newDeptSequence = [];
            for (let i = 0; i < currentSequence.length; i++) {
              if (Number(currentSequence[i]) !== Number(delegatedBy)) {
                newDeptSequence.push(currentSequence[i]);
              } else {
                console.log('[ACCEPT PROXY] Removed delegator from department sequence:', delegatedBy);
              }
            }
            
            // إضافة المفوض الجديد إذا لم يكن موجوداً بالفعل
            if (!newDeptSequence.includes(Number(userId))) {
              newDeptSequence.push(Number(userId));
              console.log('[ACCEPT PROXY] Added delegatee to department sequence:', userId);
            }
            
            await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(newDeptSequence), departmentId]);
            console.log('[ACCEPT PROXY] Updated department approval_sequence:', newDeptSequence, 'for department:', departmentId);
          }
        }
      }
      // جلب اسم المفوض الأصلي
      let delegatedByName = '';
      if (delegatedBy) {
        const [delegatedByRows] = await db.execute('SELECT username FROM users WHERE id = ?', [delegatedBy]);
        delegatedByName = delegatedByRows.length ? delegatedByRows[0].username : '';
      }
      console.log('[ACCEPT PROXY] Done for contentId:', contentId, 'userId:', userId);
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
      const [delegatedByRows] = await db.execute('SELECT username FROM users WHERE id = ?', [delegatedBy]);
      delegatedByName = delegatedByRows.length ? delegatedByRows[0].username : '';
    }
    console.log('[ACCEPT PROXY] Fallback/no delegation for contentId:', contentId, 'userId:', userId);
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
    
    console.log('🔍 [delegateAllApprovals] Starting delegation for user:', currentUserId);
    
    // جلب permanent_delegate_id للمستخدم الحالي إذا كان موجودًا
    let permanentDelegateId = null;
    try {
      const [userRows] = await db.execute('SELECT permanent_delegate_id FROM users WHERE id = ?', [currentUserId]);
      permanentDelegateId = userRows.length ? userRows[0].permanent_delegate_id : null;
    } catch {}
    
    const { delegateTo, notes } = req.body;
    console.log('🔍 [delegateAllApprovals] Delegating to user:', delegateTo, 'with notes:', notes);
    
    if (!delegateTo || !currentUserId) {
      return res.status(400).json({ status: 'error', message: 'بيانات مفقودة أو غير صحيحة للتفويض الجماعي' });
    }
    
    // جلب اسم المفوض
    let delegatorName = '';
    const [delegatorRows] = await db.execute('SELECT username FROM users WHERE id = ?', [currentUserId]);
    delegatorName = delegatorRows.length ? delegatorRows[0].username : '';
    
    // جلب كل الملفات التي المستخدم الحالي في sequence الخاص بها (custom أو تبع القسم)
    const [contents] = await db.execute(`
      SELECT c.id, c.title, c.custom_approval_sequence, f.department_id, d.approval_sequence
      FROM contents c
      LEFT JOIN folders f ON c.folder_id = f.id
      LEFT JOIN departments d ON f.department_id = d.id
      WHERE c.approval_status = 'pending'
    `);
    
    console.log('🔍 [delegateAllApprovals] Found', contents.length, 'pending contents');
    console.log('🔍 [delegateAllApprovals] Pending contents details:', contents.map(c => ({
      id: c.id,
      title: c.title,
      custom_approval_sequence: c.custom_approval_sequence,
      department_id: c.department_id,
      approval_sequence: c.approval_sequence
    })));
    
    let delegatedFileIds = [];
    for (const content of contents) {
      console.log('🔍 [delegateAllApprovals] Processing content ID:', content.id);
      console.log('🔍 [delegateAllApprovals] Content custom_approval_sequence:', content.custom_approval_sequence);
      console.log('🔍 [delegateAllApprovals] Content approval_sequence:', content.approval_sequence);
      
      let sequence = [];
      let useCustomSequence = false;
      
      // Try custom_approval_sequence first
      if (content.custom_approval_sequence) {
        try {
          let raw = fixSequenceString(content.custom_approval_sequence);
          console.log('🔍 [delegateAllApprovals] Fixed custom sequence string:', raw);
          let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
          console.log('🔍 [delegateAllApprovals] Parsed custom sequence:', parsed);
          if (Array.isArray(parsed) && parsed.length > 0) {
            sequence = parsed;
            useCustomSequence = true;
            console.log('🔍 [delegateAllApprovals] Using custom sequence (non-empty):', sequence);
          } else if (typeof parsed === 'number') {
            sequence = [parsed];
            useCustomSequence = true;
            console.log('🔍 [delegateAllApprovals] Using custom sequence (number):', sequence);
          } else {
            console.log('🔍 [delegateAllApprovals] Custom sequence is empty, will try department sequence');
          }
        } catch (e) {
          console.log('🔍 [delegateAllApprovals] Error parsing custom sequence:', e.message);
        }
      }
      
      // If custom sequence is empty or invalid, try department approval_sequence
      if (!useCustomSequence && content.approval_sequence) {
        try {
          let raw = fixSequenceString(content.approval_sequence);
          console.log('🔍 [delegateAllApprovals] Fixed department sequence string:', raw);
          let parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
          console.log('🔍 [delegateAllApprovals] Parsed department sequence:', parsed);
          if (Array.isArray(parsed)) {
            sequence = parsed;
            console.log('🔍 [delegateAllApprovals] Using department sequence:', sequence);
          } else if (typeof parsed === 'number') {
            sequence = [parsed];
            console.log('🔍 [delegateAllApprovals] Using department sequence (number):', sequence);
          } else {
            sequence = [];
            console.log('🔍 [delegateAllApprovals] Department sequence is invalid, using empty array');
          }
        } catch (e) {
          console.log('🔍 [delegateAllApprovals] Error parsing department sequence:', e.message);
          sequence = [];
        }
      }
      
      console.log('🔍 [delegateAllApprovals] Final sequence for content', content.id, ':', sequence);
      console.log('🔍 [delegateAllApprovals] Current user ID:', currentUserId, 'Type:', typeof currentUserId);
      
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
            console.log('🔍 [delegateAllApprovals] Error parsing other sequence:', e.message);
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
            console.log('🔍 [delegateAllApprovals] Error parsing other sequence:', e.message);
          }
        }
        
        userInSequence = otherSequence.some(id => Number(id) === Number(currentUserId));
        if (userInSequence) {
          console.log('🔍 [delegateAllApprovals] Found user in other sequence:', otherSequence);
        }
      }
      
      if (userInSequence) {
        delegatedFileIds.push(content.id);
        console.log('🔍 [delegateAllApprovals] Content', content.id, 'has current user in sequence');
      } else {
        console.log('🔍 [delegateAllApprovals] Content', content.id, 'does NOT have current user in any sequence');
      }
    }
    
    console.log('🔍 [delegateAllApprovals] Files to delegate:', delegatedFileIds);
    
    // إنشاء سجلات التفويض المعلقة في approval_logs لكل ملف
    if (delegatedFileIds.length > 0) {
      for (const contentId of delegatedFileIds) {
        // إنشاء سجل تفويض معلق في approval_logs
        const insertResult = await db.execute(`
          INSERT INTO approval_logs 
          (content_id, approver_id, delegated_by, status, signed_as_proxy, comments, created_at) 
          VALUES (?, ?, ?, 'pending', 1, ?, NOW())
        `, [contentId, delegateTo, currentUserId, notes || `تفويض جماعي من ${delegatorName}`]);
        
        console.log('🔍 [delegateAllApprovals] Created delegation record for content', contentId, 'result:', insertResult);
      }
      
      // إرسال إشعار جماعي واحد فقط إذا كان هناك ملفات (للتوافق مع النظام القديم)
      await insertNotification(
        delegateTo,
        'تم تفويضك للتوقيع بالنيابة عن مستخدم آخر',
        `تم تفويضك للتوقيع بالنيابة عن ${delegatorName} على جميع الملفات (${delegatedFileIds.length} ملف): [${delegatedFileIds.join(', ')}]`,
        'proxy_bulk',
        JSON.stringify({ from: currentUserId, from_name: delegatorName, fileIds: delegatedFileIds })
      );
      
      console.log('🔍 [delegateAllApprovals] Sent notification to user:', delegateTo);
    }
    
    console.log('🔍 [delegateAllApprovals] Delegation completed successfully');
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

    // إعادة المفوض الأصلي إلى التسلسل وإزالة تكرار التفويض فقط
    for (const row of rows) {
      if (row.delegated_by) {
        // إعادة المفوض الأصلي إلى content_approvers
        await db.execute(
          'INSERT IGNORE INTO content_approvers (content_id, user_id) VALUES (?, ?)',
          [row.content_id, row.delegated_by]
        );
        // جلب القسم المرتبط بالملف
        const [folderRows] = await db.execute('SELECT folder_id FROM contents WHERE id = ?', [row.content_id]);
        if (folderRows.length) {
          const folderId = folderRows[0].folder_id;
          // جلب التسلسل من جدول الملفات (custom_approval_sequence) أو من القسم (approval_sequence)
          const [contentRows] = await db.execute('SELECT custom_approval_sequence FROM contents WHERE id = ?', [row.content_id]);
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
            const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
            if (deptRows.length) {
              const departmentId = deptRows[0].department_id;
              const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
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
              const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
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
    const [rows] = await db.execute(
      `SELECT al.approver_id, u.username AS approver_name, u.email, COUNT(al.content_id) AS files_count
       FROM approval_logs al
       JOIN users u ON al.approver_id = u.id
       WHERE al.delegated_by = ? AND al.signed_as_proxy = 1 AND al.status = 'pending'
       GROUP BY al.approver_id, u.username, u.email`,
      [userId]
    );
    res.status(200).json({ status: 'success', data: rows });
  } catch (err) {
    console.error('getDelegationSummaryByUser error:', err);
    res.status(500).json({ status: 'error', message: 'فشل جلب ملخص التفويضات' });
  }
};

// معالجة قبول أو رفض bulk delegation (تفويض جماعي)
const processBulkDelegation = async (req, res) => {
  console.log('[PROCESS BULK] Function called with body:', req.body);
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
      console.log('[PROCESS BULK] Accepting delegation. notificationId:', notificationId, 'userId:', userId, 'data:', data);
      let lastApproverId = null;
      for (const fileId of data.fileIds) {
        console.log('[PROCESS BULK] Starting to process fileId:', fileId);
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
        const [contentRows] = await db.execute('SELECT custom_approval_sequence, folder_id FROM contents WHERE id = ?', [fileId]);
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
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
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
        console.log('[PROCESS BULK] Processing fileId:', fileId, 'data.from:', data.from, 'approverId:', approverId, 'sequence:', sequence);
        
        // أضف سجل بالنيابة وسجل عادي إذا كان للمستخدم موقع أصلي
        for (let i = 0; i < sequence.length; i++) {
          if (Number(sequence[i]) === Number(data.from)) {
            console.log('[PROCESS BULK] Found delegator in sequence at position', i, ':', sequence[i]);
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
            console.log('[PROCESS BULK] Replaced delegator with delegatee in sequence:', sequence);
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
          console.log('[PROCESS BULK] Updated custom_approval_sequence:', sequence);
        }
        
        // تحديث approval_sequence في جدول departments أيضاً إذا كان هناك folder_id
        if (contentRows.length && contentRows[0].folder_id) {
          const folderId = contentRows[0].folder_id;
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            
            // جلب approval_sequence الحالي من جدول departments
            const [currentDeptSeq] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
            let currentSequence = [];
            if (currentDeptSeq.length && currentDeptSeq[0].approval_sequence) {
              try {
                currentSequence = Array.isArray(currentDeptSeq[0].approval_sequence) 
                  ? currentDeptSeq[0].approval_sequence 
                  : JSON.parse(currentDeptSeq[0].approval_sequence);
              } catch { currentSequence = []; }
            }
            console.log('[PROCESS BULK] Current department approval_sequence:', currentSequence);
            
            // إزالة المفوض الأصلي من approval_sequence في جدول departments
            let newDeptSequence = [];
            console.log('[PROCESS BULK] Processing department sequence. Current:', currentSequence, 'Looking for delegator:', data.from);
            for (let i = 0; i < currentSequence.length; i++) {
              if (Number(currentSequence[i]) !== Number(data.from)) {
                newDeptSequence.push(currentSequence[i]);
              } else {
                console.log('[PROCESS BULK] Removed delegator from department sequence:', data.from, 'at position:', i);
              }
            }
            
            // إضافة المفوض الجديد إذا لم يكن موجوداً بالفعل
            if (!newDeptSequence.includes(Number(approverId))) {
              newDeptSequence.push(Number(approverId));
              console.log('[PROCESS BULK] Added delegatee to department sequence:', approverId);
            }
            
            await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(newDeptSequence), departmentId]);
            console.log('[PROCESS BULK] Updated department approval_sequence:', newDeptSequence, 'for department:', departmentId);
            
            // التحقق من أن التحديث تم بنجاح
            const [verifyUpdate] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
            if (verifyUpdate.length) {
              console.log('[PROCESS BULK] Verification - department approval_sequence after update:', verifyUpdate[0].approval_sequence);
            }
          }
        }
        console.log('[PROCESS BULK] Finished processing fileId:', fileId);
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
    
    console.log('🔍 [getDelegationStatus] Checking for user:', userId);
    
    // فحص التفويض المباشر من جدول active_delegations
    const [delegationRows] = await db.execute(
      'SELECT user_id as delegated_by FROM active_delegations WHERE delegate_id = ?',
      [userId]
    );
    
    console.log('🔍 [getDelegationStatus] Found delegation rows:', delegationRows);
    
    if (delegationRows.length > 0) {
      const delegatorId = delegationRows[0].delegated_by;
      
      // جلب اسم المفوض
      const [userRows] = await db.execute(
        'SELECT username FROM users WHERE id = ?',
        [delegatorId]
      );
      
      const delegatorName = userRows.length 
        ? userRows[0].username 
        : 'المفوض';
      
      console.log('🔍 [getDelegationStatus] Found direct delegation from:', delegatorId, delegatorName);
      
      return res.status(200).json({
        status: 'success',
        data: {
          delegated_by: delegatorId,
          delegated_by_name: delegatorName,
          type: 'direct'
        }
      });
    }
    
    console.log('🔍 [getDelegationStatus] No direct delegation found');
    
    return res.status(200).json({
      status: 'success',
      data: null
    });
    
  } catch (err) {
    console.error('❌ خطأ في فحص حالة التفويض:', err);
    return res.status(500).json({ status: 'error', message: 'فشل فحص حالة التفويض' });
  }
};

// دالة فحص التفويضات المعلقة الموحدة (للأقسام فقط)
const getPendingDelegationsUnified = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    
    console.log('🔍 [getPendingDelegationsUnified] Checking for user:', userId);
    
    // جلب التفويضات المعلقة من approval_logs للأقسام فقط
    const [delegationRows] = await db.execute(`
      SELECT DISTINCT 
        al.delegated_by,
        u.username as delegated_by_name,
        COUNT(al.content_id) as file_count
      FROM approval_logs al
      JOIN users u ON al.delegated_by = u.id
      WHERE al.approver_id = ? 
        AND al.signed_as_proxy = 1 
        AND al.status = 'pending'
      GROUP BY al.delegated_by, u.username
      ORDER BY al.created_at DESC
    `, [userId]);
    
    console.log('🔍 [getPendingDelegationsUnified] Found delegation rows:', delegationRows);
    
    // Let's also check what's in the approval_logs table for this user
    const [allLogs] = await db.execute(`
      SELECT content_id, approver_id, delegated_by, status, signed_as_proxy, created_at
      FROM approval_logs 
      WHERE approver_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, [userId]);
    
    console.log('🔍 [getPendingDelegationsUnified] All approval logs for user:', allLogs);
    
    if (delegationRows.length > 0) {
      // تحويل البيانات إلى الشكل المطلوب
      const delegations = delegationRows.map(row => ({
        id: `delegation-${row.delegated_by}`,
        delegated_by: row.delegated_by,
        delegated_by_name: row.delegated_by_name,
        file_count: row.file_count,
        type: 'bulk'
      }));
      
      console.log('🔍 [getPendingDelegationsUnified] Returning delegations:', delegations);
      
      return res.status(200).json({
        status: 'success',
        data: delegations
      });
    }
    
    console.log('🔍 [getPendingDelegationsUnified] No delegations found, returning empty array');
    
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
      // تحديث سجلات التفويض إلى مقبولة
      await db.execute(`
        UPDATE approval_logs 
        SET status = 'accepted', comments = 'تم قبول التفويض المباشر'
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
  console.log('[PROCESS BULK UNIFIED] Function called with body:', req.body);
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
    const delegatorId = delegationId.replace('delegation-', '');
    console.log('[PROCESS BULK UNIFIED] Processing delegationId:', delegationId, 'delegatorId:', delegatorId, 'action:', action);
    
    if (action === 'accept') {
      // جلب ملفات التفويض المعلقة
      const [pendingLogs] = await db.execute(`
        SELECT content_id FROM approval_logs 
        WHERE approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1 AND status = 'pending'
      `, [userId, delegatorId]);
      
      console.log('[PROCESS BULK UNIFIED] Found pending logs:', pendingLogs);
      
      // معالجة كل ملف
      for (const log of pendingLogs) {
        const fileId = log.content_id;
        console.log('[PROCESS BULK UNIFIED] Processing fileId:', fileId);
        
        // جلب تسلسل الاعتماد (custom أو approval)
        let sequence = [];
        let useCustom = false;
        const [contentRows] = await db.execute('SELECT custom_approval_sequence, folder_id FROM contents WHERE id = ?', [fileId]);
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
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            const [seqRows] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
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
        
        console.log('[PROCESS BULK UNIFIED] Processing fileId:', fileId, 'delegatorId:', delegatorId, 'userId:', userId, 'sequence:', sequence);
        
        // أضف سجل بالنيابة وسجل عادي إذا كان للمستخدم موقع أصلي
        for (let i = 0; i < sequence.length; i++) {
          if (Number(sequence[i]) === Number(delegatorId)) {
            console.log('[PROCESS BULK UNIFIED] Found delegator in sequence at position', i, ':', sequence[i]);
            // سجل بالنيابة
            const [existingProxy] = await db.execute(
              `SELECT * FROM approval_logs WHERE content_id = ? AND approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1`,
              [fileId, userId, delegatorId]
            );
            if (!existingProxy.length) {
              await db.execute(
                `INSERT INTO approval_logs (
                  content_id, approver_id, delegated_by, signed_as_proxy, status, created_at
                ) VALUES (?, ?, ?, 1, 'pending', NOW())`,
                [fileId, userId, delegatorId]
              );
            }
            sequence[i] = Number(userId);
            console.log('[PROCESS BULK UNIFIED] Replaced delegator with delegatee in sequence:', sequence);
          }
          if (Number(sequence[i]) === Number(userId)) {
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
          }
        }
        
        // تحديث التسلسل في الملف أو القسم
        if (useCustom) {
          await db.execute('UPDATE contents SET custom_approval_sequence = ? WHERE id = ?', [JSON.stringify(sequence), fileId]);
          console.log('[PROCESS BULK UNIFIED] Updated custom_approval_sequence:', sequence);
        }
        
        // تحديث approval_sequence في جدول departments أيضاً إذا كان هناك folder_id
        if (contentRows.length && contentRows[0].folder_id) {
          const folderId = contentRows[0].folder_id;
          const [deptRows] = await db.execute('SELECT department_id FROM folders WHERE id = ?', [folderId]);
          if (deptRows.length) {
            const departmentId = deptRows[0].department_id;
            
            // جلب approval_sequence الحالي من جدول departments
            const [currentDeptSeq] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
            let currentSequence = [];
            if (currentDeptSeq.length && currentDeptSeq[0].approval_sequence) {
              try {
                currentSequence = Array.isArray(currentDeptSeq[0].approval_sequence) 
                  ? currentDeptSeq[0].approval_sequence 
                  : JSON.parse(currentDeptSeq[0].approval_sequence);
              } catch { currentSequence = []; }
            }
            console.log('[PROCESS BULK UNIFIED] Current department approval_sequence:', currentSequence);
            
            // إزالة المفوض الأصلي من approval_sequence في جدول departments
            let newDeptSequence = [];
            console.log('[PROCESS BULK UNIFIED] Processing department sequence. Current:', currentSequence, 'Looking for delegator:', delegatorId);
            for (let i = 0; i < currentSequence.length; i++) {
              if (Number(currentSequence[i]) !== Number(delegatorId)) {
                newDeptSequence.push(currentSequence[i]);
              } else {
                console.log('[PROCESS BULK UNIFIED] Removed delegator from department sequence:', delegatorId, 'at position:', i);
              }
            }
            
            // إضافة المفوض الجديد إذا لم يكن موجوداً بالفعل
            if (!newDeptSequence.includes(Number(userId))) {
              newDeptSequence.push(Number(userId));
              console.log('[PROCESS BULK UNIFIED] Added delegatee to department sequence:', userId);
            }
            
            await db.execute('UPDATE departments SET approval_sequence = ? WHERE id = ?', [JSON.stringify(newDeptSequence), departmentId]);
            console.log('[PROCESS BULK UNIFIED] Updated department approval_sequence:', newDeptSequence, 'for department:', departmentId);
            
            // التحقق من أن التحديث تم بنجاح
            const [verifyUpdate] = await db.execute('SELECT approval_sequence FROM departments WHERE id = ?', [departmentId]);
            if (verifyUpdate.length) {
              console.log('[PROCESS BULK UNIFIED] Verification - department approval_sequence after update:', verifyUpdate[0].approval_sequence);
            }
          }
        }
        console.log('[PROCESS BULK UNIFIED] Finished processing fileId:', fileId);
      }
      
      // قبول التفويض الجماعي
      // تحديث سجلات التفويض إلى مقبولة
      await db.execute(`
        UPDATE approval_logs 
        SET status = 'accepted', comments = 'تم قبول التفويض الجماعي'
        WHERE approver_id = ? AND delegated_by = ? AND signed_as_proxy = 1 AND status = 'pending'
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
  processBulkDelegation,
  getDelegationStatus,
  getPendingDelegationsUnified,
  getDelegationLogs,
  processDirectDelegationUnified,
  processBulkDelegationUnified,
};




