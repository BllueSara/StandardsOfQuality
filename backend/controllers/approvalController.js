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
  const { approved, signature, notes, electronic_signature, on_behalf_of, } = req.body;

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

// ——— fallback لحفظ التفويض القديم إذا ما جالنا on_behalf_of ———
// أولاً حدد القيم الواردة من الـ body
let delegatedBy = on_behalf_of || null;
let isProxy    = Boolean(on_behalf_of);

// إذا ما وصلنا on_behalf_of نقرأ من القاعدة السجل القديم
if (!on_behalf_of) {
  const [existing] = await db.execute(`
    SELECT delegated_by, signed_as_proxy
    FROM approval_logs
    WHERE content_id = ? AND approver_id = ?
    LIMIT 1
  `, [contentId, currentUserId]);

  if (existing.length && existing[0].signed_as_proxy === 1) {
    // احتفظ بقيم التفويض القديمة بدل مسحها
    delegatedBy = existing[0].delegated_by;
    isProxy    = true;
  }
}

// بعدين استخدم currentUserId كموقّع فعلي
const approverId = currentUserId;
// ————————————————————————————————————————————————


    if (approved === true && !signature && !electronic_signature) {
      return res.status(400).json({ status: 'error', message: 'التوقيع مفقود' });
    }

    const approvalLogsTable = 'approval_logs';
    const contentApproversTable = 'content_approvers';
    const contentsTable = 'contents';
    const generatePdfFunction = generateFinalSignedPDF;

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
       delegated_by    = COALESCE(VALUES(delegated_by), delegated_by),

signed_as_proxy = COALESCE(VALUES(signed_as_proxy), signed_as_proxy),
        status = VALUES(status),
        signature = VALUES(signature),
        electronic_signature = VALUES(electronic_signature),
        comments = VALUES(comments),
        created_at = NOW()
    `, [
      contentId,
      approverId,
      delegatedBy,
      isProxy ? 1 : 0,
      approved ? 'approved' : 'rejected',
      signature || null,
      electronic_signature || null,
      notes || ''
    ]);

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

    // إضافة الشخص التالي في approval_sequence إلى content_approvers (إن وجد)
    if (approved) {
      try {
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
              let approvalSequence2 = [];
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
              // حدد ترتيب المعتمد الحالي
              const idx = approvalSequence2.findIndex(x => Number(x) === Number(approverId));
              // إشعار للشخص الأول في التسلسل إذا كان هو المعتمد الحالي
              if (idx === 0) {
                const [contentRows] = await db.execute(`SELECT title FROM ${contentsTable} WHERE id = ?`, [contentId]);
                const fileTitle = contentRows.length ? contentRows[0].title : '';
                await insertNotification(
                  approverId,
                  'ملف جديد بانتظار اعتمادك',
                  `لديك ملف بعنوان "${fileTitle}" بحاجة لاعتمادك.`,
                  'approval'
                );
              }
              if (idx !== -1 && idx < approvalSequence2.length - 1) {
                const nextApproverId = approvalSequence2[idx + 1];
                // تحقق إذا كان التالي لم يعتمد بعد
                const [logNext] = await db.execute(`SELECT status FROM approval_logs WHERE content_id = ? AND approver_id = ?`, [contentId, nextApproverId]);
                if (!logNext.length || logNext[0].status !== 'approved') {
                  // أضف التالي إلى content_approvers إذا لم يكن موجودًا
                  const [insertResult] = await db.execute(`INSERT IGNORE INTO ${contentApproversTable} (content_id, user_id) VALUES (?, ?)`, [contentId, nextApproverId]);
                  // إرسال إشعار للشخص التالي
                  // جلب عنوان الملف
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

    if (isProxy && approverId) {
      // لم يعد هناك إشعار هنا
    }


    if (approved === true && isProxy) {
      await db.execute(`
        INSERT IGNORE INTO ${contentApproversTable} (content_id, user_id)
        VALUES (?, ?)
      `, [contentId, approverId]);
    }

    // تحقق من اكتمال الاعتماد من جميع أعضاء approval_sequence
    // 1. جلب folder_id من جدول contents
    const [folderRows] = await db.execute(`SELECT folder_id FROM ${contentsTable} WHERE id = ?`, [contentId]);
    if (folderRows.length) {
      const folderId = folderRows[0].folder_id;
      // 2. جلب department_id من جدول folders
      const [deptRows] = await db.execute(`SELECT department_id FROM folders WHERE id = ?`, [folderId]);
      if (deptRows.length) {
        const departmentId = deptRows[0].department_id;
        // 3. جلب approval_sequence من جدول departments
        const [seqRows] = await db.execute(`SELECT approval_sequence FROM departments WHERE id = ?`, [departmentId]);
        if (seqRows.length) {
          let approvalSequence = [];
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
          approvalSequence = (approvalSequence || []).map(x => Number(String(x).trim())).filter(x => !isNaN(x));
          // 4. تحقق أن كل من في approval_sequence اعتمد الملف فعلاً
          const [logs] = await db.execute(`SELECT approver_id, status FROM approval_logs WHERE content_id = ?`, [contentId]);
          const approvedSet = new Set(logs.filter(l => l.status === 'approved').map(l => Number(l.approver_id)));

          // شرط أكثر أمانًا: كل من في approval_sequence وقع وعددهم متساوي
          const allApproved = approvalSequence.length > 0 &&
            approvalSequence.every(approverId => approvedSet.has(approverId)) &&
            approvedSet.size === approvalSequence.length;
          console.log('allApproved (final):', allApproved);
          if (allApproved) {
            await generatePdfFunction(contentId);
            await db.execute(`
              UPDATE ${contentsTable}
              SET is_approved = 1,
                  approval_status = 'approved',
                  approved_by = ?,
                  updated_at = NOW()
              WHERE id = ?
            `, [approverId, contentId]);
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
            console.log('تم اعتماد الملف نهائيًا!');
          } else {
            console.log('لم يتم الاعتماد النهائي رغم التحقق.');
          }
        } else {
          console.log('seqRows is empty, لم يتم جلب approval_sequence');
        }
      } else {
        console.log('deptRows is empty, لم يتم جلب department_id');
      }
    } else {
      console.log('folderRows is empty, لم يتم جلب folder_id');
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
  for (const log of logs) {
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
    const label = log.signed_as_proxy
      ? `Signed by ${log.actual_signer} on behalf of ${log.original_user}`
      : `Signed by ${log.actual_signer}`;
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

// جلب الملفات المكلف بها المستخدم
const getAssignedApprovals = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ status: 'error', message: 'لا يوجد توكن' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;
    const userRole = decoded.role;

    const permsSet = await getUserPermissions(userId);
    const canViewAll = userRole === 'admin' || permsSet.has('transfer_credits');

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
      console.log('raw department_approval_sequence:', row.department_approval_sequence);
      try {
        row.approvers_required = JSON.parse(row.approvers_required);
      } catch {
        row.approvers_required = [];
      }
      // تصحيح التحويل لقبول array أو string
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
      // تصحيح approvals_log ليقبل Array أو String أو null
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

    if (canViewAll) {
      // الأدمن أو من لديه صلاحية يرى كل الملفات
      return res.json({ status: 'success', data: rows });
    }

    // لوجات تشخيصية قبل الفلترة
    console.log('userId:', userId, typeof userId);
    rows.forEach(row => {
      console.log('row.approval_sequence:', row.approval_sequence, typeof row.approval_sequence?.[0]);
      console.log('row.approvals_log:', row.approvals_log);
      console.log('row.approval_status:', row.approval_status);
    });
    // فلترة الملفات حسب تسلسل الاعتماد للمستخدم العادي فقط
    const filteredRows = rows.filter(row => {
      // تحويل عناصر السيكونس إلى أرقام مع إزالة الفراغات
      const sequence = (row.approval_sequence || []).map(x => Number(String(x).trim()));
      const myIndex = sequence.indexOf(Number(userId));
      if (myIndex === -1) return false; // المستخدم ليس ضمن السلسلة
      // إذا الملف معتمد أو مرفوض، يظهر للجميع في السلسلة
      if (row.approval_status === 'approved' || row.approval_status === 'rejected') {
        return true;
      }
      // تحقق من أن كل من قبله اعتمد الملف (فقط إذا كان pending)
      let allPreviousApproved = true;
      for (let i = 0; i < myIndex; i++) {
        const approverId = sequence[i];
        // تأكد أن user_id رقم للمقارنة الصحيحة
        const approved = row.approvals_log?.find(log => Number(log.user_id) === approverId && log.status === 'approved');
        if (!approved) {
          allPreviousApproved = false;
          break;
        }
      }
      // إذا كل من قبله اعتمد، يعرض له الملف
      return allPreviousApproved && row.approval_status === 'pending';
    });

    return res.json({ status: 'success', data: filteredRows });
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
    // أضف المستخدم لجدول المعيّنين
    await db.execute(
      'INSERT IGNORE INTO content_approvers (content_id, user_id) VALUES (?, ?)',
      [contentId, userId]
    );



    res.json({ status: 'success', message: 'تم قبول التفويض وستظهر لك في التقارير المكلف بها' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'فشل قبول التفويض' });
  }
};

module.exports = {
  getUserPendingApprovals,
  handleApproval,
  delegateApproval,
  getAssignedApprovals,
  getProxyApprovals,
  acceptProxyDelegation,
};


