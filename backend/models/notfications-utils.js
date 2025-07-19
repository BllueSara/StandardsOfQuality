// utils/notificationUtils.js
const mysql = require('mysql2/promise');
const nodemailer = require('nodemailer');
const { promisify } = require('util');

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Quality'
});

// إعداد البريد الإلكتروني
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'sup.it.system.medical@gmail.com',
    pass: 'bwub ozwj dzlg uicp' // App Password من Gmail
  },
  // تحسينات الأداء
  pool: true, // استخدام pool للاتصالات
  maxConnections: 5, // عدد أقصى للاتصالات المتزامنة
  maxMessages: 100, // عدد أقصى للرسائل في الاتصال الواحد
  rateLimit: 5, // عدد الرسائل في الثانية
  rateDelta: 1000, // الفاصل الزمني بين الرسائل (ملي ثانية)
  // إعدادات إضافية للأداء
  connectionTimeout: 60000, // timeout للاتصال (60 ثانية)
  greetingTimeout: 30000, // timeout للتحية
  socketTimeout: 60000, // timeout للـ socket
});

const sendMail = transporter.sendMail.bind(transporter);

// دالة استخراج النص العربي من JSON string أو إرجاع النص كما هو
function extractArabic(str) {
  if (!str) return '';
  try {
    const obj = JSON.parse(str);
    if (obj && obj.ar) return obj.ar;
  } catch {
    // ليس JSON
  }
  return str;
}

// دالة استخراج كل النصوص العربية من أي JSON مضمّن داخل النص
function extractAllArabic(str) {
  if (!str) return '';
  // استبدل كل JSON مضمّن بالنص العربي فقط
  return str.replace(/\{"ar":"(.*?)","en":"(.*?)"\}/g, '$1');
}

// تصميم HTML احترافي للإشعارات
function getEmailTemplate(notification) {
  const { title, message, type, created_at, userName } = notification;

  // ألوان لكل نوع إشعار
  const typeColors = {
    ticket:    { main: '#2563eb' },
    approval:  { main: '#059669' },
    signature: { main: '#a21caf' },
    proxy:     { main: '#f59e42' },
    add:       { main: '#06b6d4' },
    update:    { main: '#fbbf24' },
    delete:    { main: '#ef4444' },
    close:     { main: '#6b7280' },
    alert:     { main: '#f97316' },
    system:    { main: '#6366f1' },
    default:   { main: '#64748b' }
  };
  const getTypeIcon = (type) => {
    switch(type) {
      case 'ticket': return '🎫';
      case 'approval': return '✅';
      case 'signature': return '✍️';
      case 'proxy': return '👥';
      case 'add': return '➕';
      case 'update': return '✏️';
      case 'delete': return '🗑️';
      case 'close': return '🔒';
      case 'alert': return '⚠️';
      case 'system': return '⚙️';
      default: return '🔔';
    }
  };
  const getTypeLabel = (type) => {
    switch(type) {
      case 'ticket': return 'تقرير OVR جديد';
      case 'approval': return 'اعتماد جديد';
      case 'signature': return 'توقيع جديد';
      case 'proxy': return 'تفويض جديد';
      case 'add': return 'إضافة جديدة';
      case 'update': return 'تحديث جديد';
      case 'delete': return 'حذف جديد';
      case 'close': return 'إغلاق';
      case 'alert': return 'تنبيه';
      case 'system': return 'إشعار نظام';
      default: return 'إشعار جديد';
    }
  };
  const color = typeColors[type] ? typeColors[type].main : typeColors.default.main;
  const typeIcon = getTypeIcon(type);
  const typeLabel = getTypeLabel(type);
  // استخدم extractAllArabic على الحقول
  const cleanUserName = extractAllArabic(userName || '');
  const cleanMessage = extractAllArabic(message || '');
  const cleanTitle = extractAllArabic(title || '');
  const currentDate = new Date(created_at || Date.now()).toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>إشعار جديد - نظام الجودة</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;900&display=swap" rel="stylesheet">
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Tajawal', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; direction: rtl;">
      <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
        <!-- Header مع اللون -->
        <div style="background: linear-gradient(135deg, ${color}, ${color}dd); padding: 25px; text-align: center;">
          <div style="display: inline-block; background-color: rgba(255,255,255,0.2); border-radius: 50%; width: 60px; height: 60px; line-height: 60px; margin-bottom: 15px;">
            <span style="font-size: 24px; color: white;">${typeIcon}</span>
          </div>
          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 300; font-family: 'Tajawal', sans-serif;">نظام الجودة</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 16px;">إشعار جديد</p>
        </div>
        <!-- محتوى الإشعار -->
        <div style="padding: 30px;">
          <!-- تحية المستخدم -->
          <div style="margin-bottom: 25px;">
            <h2 style="color: #333; margin: 0 0 10px 0; font-size: 20px; font-weight: 500; font-family: 'Tajawal', sans-serif;">مرحباً${cleanUserName ? '، ' + cleanUserName : ''} 👋</h2>
            <p style="color: #666; margin: 0; line-height: 1.6; font-size: 16px; font-family: 'Tajawal', sans-serif;">لديك إشعار جديد في نظام الجودة</p>
          </div>
          <!-- تفاصيل الإشعار -->
          <div style="background: linear-gradient(135deg, #f8f9fa, #e9ecef); border-radius: 10px; padding: 25px; margin-bottom: 25px; border-right: 4px solid ${color};">
            <div style="display: flex; align-items: center; margin-bottom: 15px;">
              <div style="width: 12px; height: 12px; background-color: ${color}; border-radius: 50%; margin-left: 10px;"></div>
              <h3 style="color: #333; margin: 0; font-size: 18px; font-weight: 600; font-family: 'Tajawal', sans-serif;">${typeLabel}</h3>
            </div>
            <div style="background-color: white; border-radius: 8px; padding: 20px; border: 1px solid #e0e0e0;">
              <p style="color: #495057; margin: 0; line-height: 1.7; font-size: 15px; text-align: justify; font-family: 'Tajawal', sans-serif;">${cleanMessage}</p>
            </div>
          </div>
          <!-- معلومات إضافية -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 25px; text-align: center;">
            <p style="color: #6c757d; margin: 0; font-size: 14px; font-family: 'Tajawal', sans-serif;">
              <span style="font-weight: 600;">التاريخ:</span> ${currentDate}
            </p>
          </div>
          <!-- معلومات النظام -->
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; border-top: 3px solid ${color};">
            <p style="color: #6c757d; margin: 0 0 10px 0; font-size: 13px; line-height: 1.5; font-family: 'Tajawal', sans-serif;">
              هذا البريد الإلكتروني تم إرساله تلقائياً من نظام الجودة
            </p>
          </div>
        </div>
        <!-- Footer -->
        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="color: #6c757d; margin: 0; font-size: 12px; font-family: 'Tajawal', sans-serif;">
            © 2024 نظام الجودة
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// دالة إدراج إشعار مع إرسال بريد إلكتروني
async function insertNotification(userId, title, message, type = 'ticket', messageData = null) {
  try {
    // 1) إدراج الإشعار في قاعدة البيانات
    const [result] = await db.execute(
      `INSERT INTO notifications 
       (user_id, title, message, type, message_data, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, title, message, type, messageData]
    );

    // 2) إرسال البريد الإلكتروني في الخلفية (بدون await)
    (async () => {
      try {
        // جلب معلومات المستخدم
        const [userRows] = await db.execute(
          'SELECT email, username FROM users WHERE id = ?',
          [userId]
        );

        if (userRows.length > 0 && userRows[0].email) {
          const user = userRows[0];
          const notification = {
            title,
            message,
            type,
            created_at: new Date(),
            userName: user.username // تمرير اسم المستخدم
          };

          // إرسال البريد الإلكتروني
          await transporter.sendMail({
            from: process.env.EMAIL_USER || 'sup.it.system.medical@gmail.com',
            to: user.email,
            subject: `إشعار جديد: ${title}`,
            html: getEmailTemplate(notification)
          });
        }
      } catch (emailError) {
        console.error('Error sending email notification:', emailError);
        // لا نوقف العملية إذا فشل إرسال البريد
      }
    })();

    return result.insertId;
  } catch (error) {
    console.error('Error inserting notification:', error);
    throw error;
  }
}

// دالة إرسال إشعارات التذاكر
async function sendTicketNotification(userId, action, ticketId, ticketTitle) {
  const notifications = {
    create: {
      title: 'تم إنشاء تقرير OVR جديد',
      message: `تم إنشاء تقرير OVR جديد برقم ${ticketId}`,
      type: 'ticket'
    },
    update: {
      title: 'تم تحديث تقرير OVR',
      message: `تم تحديث تقرير OVR برقم ${ticketId}`,
      type: 'update'
    },
    close: {
      title: 'تم إغلاق تقرير OVR',
      message: `تم إغلاق تقرير OVR برقم ${ticketId}`,
      type: 'close'
    },
    assign: {
      title: 'تم تعيين تقرير OVR لك',
      message: `تم تعيين تقرير OVR برقم ${ticketId} لك`,
      type: 'ticket'
    }
  };

  const notification = notifications[action];
  if (notification) {
    return await insertNotification(userId, notification.title, notification.message, notification.type);
  }
}

// دالة إرسال إشعارات الاعتماد
async function sendApprovalNotification(userId, action, contentId, contentTitle) {
  const notifications = {
    request: {
      title: 'طلب اعتماد جديد',
      message: `طلب اعتماد جديد للمحتوى: ${contentTitle}`,
      type: 'approval'
    },
    approved: {
      title: 'تم اعتماد المحتوى',
      message: `تم اعتماد المحتوى: ${contentTitle}`,
      type: 'approval'
    },
    rejected: {
      title: 'تم رفض المحتوى',
      message: `تم رفض المحتوى: ${contentTitle}`,
      type: 'approval'
    }
  };

  const notification = notifications[action];
  if (notification) {
    return await insertNotification(userId, notification.title, notification.message, notification.type);
  }
}

// دالة إرسال إشعار حذف التذكرة
async function sendDeleteNotification(userId, ticketId, ticketTitle) {
  return await insertNotification(
    userId,
    'تم حذف تقرير OVR',
    `تم حذف تقرير OVR برقم ${ticketId}`,
    'delete'
  );
}

// دالة إرسال إشعار تعيين التذكرة
async function sendAssignmentNotification(userId, ticketId, assigneesInfo, ticketTitle) {
  return await insertNotification(
    userId,
    'تم تعيين تقرير OVR',
    `تم تعيين تقرير OVR برقم ${ticketId} إلى: ${assigneesInfo}`,
    'assignment'
  );
}

// دالة إرسال إشعار تفويض (توقيع بالنيابة)
async function sendProxyNotification(userId, contentId, isCommittee = false) {
  return await insertNotification(
    userId,
    'تم تفويضك للتوقيع',
    isCommittee
      ? `تم تفويضك للتوقيع على ملف لجنة جديد رقم ${contentId}`
      : `تم تفويضك للتوقيع على ملف جديد رقم ${contentId}`,
    'proxy'
  );
}

// دالة إرسال إشعار اعتماد أو رفض ملف (للمالك)
async function sendOwnerApprovalNotification(userId, fileTitle, approved, isCommittee = false) {
  return await insertNotification(
    userId,
    approved ? 'تم اعتماد ملفك' : 'تم رفض ملفك',
    isCommittee
      ? `ملف اللجنة "${fileTitle}" ${approved ? 'تم اعتماده' : 'تم رفضه'} من قبل الإدارة.`
      : `الملف "${fileTitle}" ${approved ? 'تم اعتماده' : 'تم رفضه'} من قبل الإدارة.`,
    approved ? 'approval' : 'rejected'
  );
}

// دوال إشعارات انتهاء صلاحية المحتوى
async function sendContentExpirySoonMonthNotification(userId, row, departmentName, folderName, formattedDate) {
  const notificationMsg = `اقترب انتهاء صلاحية المحتوى "${row.title}" في  "${departmentName}"، مجلد "${folderName}" بتاريخ ${formattedDate}. يرجى تحديثه أو رفع نسخة جديدة.`;
  return await insertNotification(
    userId,
    'اقترب انتهاء صلاحية المحتوى',
    notificationMsg,
    `content_expiry_soon_month_${row.id}`
  );
}

async function sendContentExpirySoonDayNotification(userId, row, departmentName, folderName, formattedDate) {
  const notificationMsg = `غدًا تنتهي صلاحية المحتوى "${row.title}" في  "${departmentName}"، مجلد "${folderName}" بتاريخ ${formattedDate}. يرجى تحديثه أو رفع نسخة جديدة.`;
  return await insertNotification(
    userId,
    'غدًا تنتهي صلاحية المحتوى',
    notificationMsg,
    `content_expiry_soon_day_${row.id}`
  );
}

async function sendContentExpiredNotification(userId, row, departmentName, folderName, formattedDate) {
  const notificationMsg = `انتهت صلاحية المحتوى "${row.title}" في  "${departmentName}"، مجلد "${folderName}" بتاريخ ${formattedDate}. يرجى تحديثه أو رفع نسخة جديدة.`;
  return await insertNotification(
    userId,
    'انتهت صلاحية المحتوى',
    notificationMsg,
    `content_expired_${row.id}`
  );
}

// دالة إرسال إشعار إضافة محتوى جديد (ملف جديد بانتظار اعتمادك)
async function sendNewContentNotification(userId, fileTitle) {
  return await insertNotification(
    userId,
    'ملف جديد بانتظار اعتمادك',
    `لديك ملف بعنوان "${fileTitle}" بحاجة لاعتمادك.`,
    'approval'
  );
}

// دالة إرسال إشعار تذكير اعتماد (تأخير)
async function sendApprovalReminderNotification(userId, fileTitle) {
  return await insertNotification(
    userId,
    'تذكير اعتماد ملف',
    `لديك ملف بعنوان "${fileTitle}" بانتظار اعتمادك منذ أكثر من 3 أيام. يرجى اتخاذ الإجراء المناسب.`,
    'approval_reminder'
  );
}

module.exports = {
  insertNotification,
  sendTicketNotification,
  sendApprovalNotification,
  getEmailTemplate,
  sendDeleteNotification,
  sendAssignmentNotification,
  sendProxyNotification,
  sendOwnerApprovalNotification,
  sendContentExpirySoonMonthNotification,
  sendContentExpirySoonDayNotification,
  sendContentExpiredNotification,
  sendNewContentNotification,
  sendApprovalReminderNotification
};
