
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const mysql = require('mysql2/promise');
const { logAction } = require('../models/logger');



const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'StandardOfQuality'
});

// إعداد البريد الإلكتروني
const transporter = nodemailer.createTransport({
  service: 'gmail',

  auth: {
    user: 'sup.it.system.medical@gmail.com',
    pass: 'bwub ozwj dzlg uicp' // App Password من Gmail
  }
});



// 1) تسجيل مستخدم جديد
const register = async (req, res) => {
  try {
    const { username, email, password, department_id, role, employee_number, job_title } = req.body;

    // 1) الحقول الأساسية
    if (!username || !email || !password ) {
      return res.status(400).json({
        status: 'error',
        message: 'اسم المستخدم، البريد الإلكتروني، كلمة المرور مطلوبة'
      });
    }

    // 2) تحقق من صحة البريد
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'البريد الإلكتروني غير صالح'
      });
    }

    // 3) تحقق من طول كلمة المرور
    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
      });
    }

    // 4) تحقق من عدم تكرار اسم مستخدم أو بريد أو رقم وظيفي
    const [existing] = await db.execute(
      `SELECT id FROM users 
       WHERE username = ? OR email = ? OR employee_number = ?`,
      [username, email, employee_number]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'اسم المستخدم أو البريد الإلكتروني أو الرقم الوظيفي مستخدم مسبقاً'
      });
    }

    // 5) تحقق من وجود القسم
    if (department_id) {
      const [deps] = await db.execute('SELECT id FROM departments WHERE id = ?', [department_id]);
      if (deps.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'القسم المحدد غير موجود'
        });
      }
    }

    // 6) تحقق من وجود المسمى الوظيفي للمستخدمين غير admin
    if (username.toLowerCase() !== 'admin' && !job_title) {
      return res.status(400).json({
        status: 'error',
        message: 'المسمى الوظيفي مطلوب'
      });
    }

    // 7) تشفير كلمة المرور
    const hashedPassword = await bcrypt.hash(password, 10);

    // 8) دور المستخدم
    const userRole = role || 'user';

    // 9) إدخال المستخدم
    const [result] = await db.execute(
      `INSERT INTO users 
        (username, email, employee_number, job_title, password, department_id, role, created_at, updated_at)
       VALUES (?,       ?,     ?,                 ?,        ?,             ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [username, email, employee_number, job_title, hashedPassword, department_id || null, userRole]
    );
    const userId = result.insertId;

    // 10) إنشاء JWT
    const token = jwt.sign(
      { id: userId, username, email, employee_number, job_title, department_id, role: userRole },
      process.env.JWT_SECRET
    );

     const logDescription = {
            ar: 'تم تسجيل مستخدم جديد: ' + username,
            en: 'Registered new user: ' + username
        };
        
    await logAction(
      userId,
      'register_user',
JSON.stringify(logDescription),      'user',
      userId
    );
    

    // 11) ردّ العميل
    res.status(201).json({
      status: 'success',
      message: 'تم إنشاء الحساب وتسجيل الدخول تلقائياً',
      token,
      user: { id: userId, username, email, employee_number, job_title, department_id, role: userRole }
    });

  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ status: 'error', message: 'خطأ في التسجيل' });
  }
};


// 2) تسجيل الدخول
const login = async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'حقل الدخول وكلمة المرور مطلوبان'
      });
    }

    // جلب المستخدم عبر username أو email أو employee_number
    const [rows] = await db.execute(
      `SELECT 
         u.id, u.username, u.email, u.password,
         u.employee_number, u.job_title,
         u.department_id, u.role,
         u.status,
         d.name AS department_name
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.id
       WHERE u.username = ? OR u.email = ? OR u.employee_number = ?`,
      [identifier, identifier, identifier]
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'بيانات الدخول أو كلمة المرور غير صحيحة'
      });
    }
    // **منع تسجيل الدخول إذا كانت الحالة غير نشطة**
    if (user.status !== 'active') {
      return res.status(403).json({
        status: 'error',
        message: 'حسابك معطل، لا يمكنك تسجيل الدخول'
      });
    }
    // تحقق من كلمة المرور
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'بيانات الدخول أو كلمة المرور غير صحيحة'
      });
    }
const [departmentRows] = await db.query(
  'SELECT name FROM departments WHERE id = ?',
  [user.department_id]
);

const departmentName = departmentRows[0]?.name || '';
    // إنشاء التوكن
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        employee_number: user.employee_number,
        job_title: user.job_title,
        department_id: user.department_id,
        department_name: departmentName, // ✅ أضف اسم القسم هنا
        role: user.role
      },
      process.env.JWT_SECRET
    );



    

    // ✅ تسجيل اللوق بعد نجاح تسجيل الدخول
    try {
        const logDescription = {
            ar: 'تم تسجيل الدخول',
            en: 'User logged in'
        };
        
        await logAction(user.id, 'login', JSON.stringify(logDescription), 'user', user.id);
    } catch (logErr) {
        console.error('logAction error:', logErr);
    }

    res.status(200).json({
      status: 'success',
      message: 'تم تسجيل الدخول بنجاح',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        employee_number: user.employee_number,
        job_title: user.job_title,
        department_id: user.department_id,
        department_name: user.department_name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'خطأ في تسجيل الدخول' });
  }
};



// 3) نسيان كلمة المرور
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'البريد الإلكتروني مطلوب' 
    });
  }

  try {
    const [rows] = await db.execute('SELECT id, username FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'البريد الإلكتروني غير مسجل' 
      });
    }

    const userId = rows[0].id;
    const username = rows[0].username;
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600 * 1000);

    await db.execute(
      `UPDATE users 
       SET reset_token = ?, 
           reset_token_expires = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [token, expires, userId]
    );

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    const currentDate = new Date().toLocaleString('ar-EG', { dateStyle: 'full', timeStyle: 'short' });
    // تصميم حديث مخصص لنظام الجودة (أحمر)
    const emailHtml = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إعادة تعيين كلمة المرور - نظام الجودة</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5; direction: rtl;">
        <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="background: linear-gradient(135deg, #dc3545, #dc3545dd); padding: 25px; text-align: center;">
            <div style="display: inline-block; background-color: rgba(255,255,255,0.2); border-radius: 50%; width: 60px; height: 60px; line-height: 60px; margin-bottom: 15px;">
              <span style="font-size: 24px; color: white;">🔐</span>
            </div>
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 300;">نظام الجودة</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 16px;">إعادة تعيين كلمة المرور</p>
          </div>
          <div style="padding: 30px;">
            <div style="margin-bottom: 25px;">
              <h2 style="color: #333; margin: 0 0 10px 0; font-size: 20px; font-weight: 500;">مرحباً ${username} 👋</h2>
              <p style="color: #666; margin: 0; line-height: 1.6; font-size: 16px;">لقد تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في نظام الجودة.</p>
            </div>
            <div style="background: linear-gradient(135deg, #f8f9fa, #e9ecef); border-radius: 10px; padding: 25px; margin-bottom: 25px; border-right: 4px solid #dc3545;">
              <div style="display: flex; align-items: center; margin-bottom: 15px;">
                <div style="width: 12px; height: 12px; background-color: #dc3545; border-radius: 50%; margin-left: 10px;"></div>
                <h3 style="color: #333; margin: 0; font-size: 18px; font-weight: 600;">طلب إعادة تعيين كلمة المرور</h3>
              </div>
              <div style="background-color: white; border-radius: 8px; padding: 20px; border: 1px solid #e0e0e0;">
                <p style="color: #495057; margin: 0 0 15px 0; line-height: 1.7; font-size: 15px; text-align: justify;">
                  إذا كنت قد طلبت إعادة تعيين كلمة المرور، يرجى النقر على الزر أدناه لإنشاء كلمة مرور جديدة.
                </p>
                <p style="color: #6c757d; margin: 0; line-height: 1.7; font-size: 14px; text-align: justify;">
                  <strong>ملاحظة:</strong> هذا الرابط صالح لمدة ساعة واحدة فقط. إذا لم تقم بإعادة تعيين كلمة المرور خلال هذه المدة، ستحتاج إلى طلب رابط جديد.
                </p>
              </div>
            </div>
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 25px; text-align: center;">
              <p style="color: #6c757d; margin: 0; font-size: 14px;">
                <span style="font-weight: 600;">تاريخ الطلب:</span> ${currentDate}
              </p>
            </div>
            <div style="text-align: center; margin-bottom: 25px;">
              <a href="${resetLink}" style="background: linear-gradient(135deg, #dc3545, #dc3545dd); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 15px rgba(220, 53, 69, 0.3); transition: all 0.3s ease;">
                🔑 إعادة تعيين كلمة المرور
              </a>
            </div>
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
              <div style="display: flex; align-items: center; margin-bottom: 10px;">
                <span style="font-size: 18px; margin-left: 10px;">⚠️</span>
                <h4 style="color: #856404; margin: 0; font-size: 16px; font-weight: 600;">تنبيه أمني</h4>
              </div>
              <ul style="color: #856404; margin: 0; padding-right: 20px; font-size: 14px; line-height: 1.6;">
                <li>لا تشارك هذا الرابط مع أي شخص آخر</li>
                <li>تأكد من أنك على الموقع الصحيح قبل إدخال كلمة المرور الجديدة</li>
                <li>إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا الإيميل</li>
              </ul>
            </div>
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; border-top: 3px solid #dc3545;">
              <p style="color: #6c757d; margin: 0 0 10px 0; font-size: 13px; line-height: 1.5;">
                هذا البريد الإلكتروني تم إرساله تلقائياً من نظام الجودة
              </p>
              <p style="color: #6c757d; margin: 0; font-size: 13px; line-height: 1.5;">
                إذا واجهت أي مشكلة، يرجى التواصل مع فريق الدعم التقني
              </p>
            </div>
          </div>
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e0e0e0;">
            <p style="color: #6c757d; margin: 0; font-size: 12px;">
              © 2024 نظام الجودة - Quality Management System
            </p>
          </div>
        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER || 'sup.it.system.medical@gmail.com',
      to: email,
      subject: 'إعادة تعيين كلمة المرور - نظام الجودة',
      html: emailHtml
    });


    res.json({ 
      status: 'success', 
      message: 'تم إرسال رابط إعادة الضبط إلى بريدك الإلكتروني.' 
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ status: 'error', message: 'فشل في إرسال رابط إعادة الضبط.' });
  }
};

// 4) إعادة تعيين كلمة المرور
const resetPassword = async (req, res) => {
  const token = req.params.token;
  const { newPassword } = req.body;
  
  if (!newPassword) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'كلمة المرور الجديدة مطلوبة' 
    });
  }

  try {
    const [rows] = await db.execute(
      'SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > NOW()',
      [token]
    );

    if (rows.length === 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'التوكن غير صالح أو منتهي الصلاحية' 
      });
    }

    const userId = rows[0].id;
    const hashed = await bcrypt.hash(newPassword, 12);

    await db.execute(
      `UPDATE users
       SET password = ?, 
           reset_token = NULL, 
           reset_token_expires = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [hashed, userId]
    );

    res.json({ 
      status: 'success', 
      message: 'تم إعادة ضبط كلمة المرور بنجاح.' 
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Failed to reset password.' });
  }
};

// 5) التحقق من التوكن
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/, '');
  
  if (!token) {
    return res.status(401).json({ 
      status: 'error', 
      message: 'محتاج توكن' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        status: 'error', 
        message: 'توكن غير صالح' 
      });
    }
    req.user = user;
    next();
  });
};

// 6) إعادة تعيين كلمة المرور من قبل المدير
const adminResetPassword = async (req, res) => {
  const userId = req.params.id;
  const { newPassword } = req.body;
  
  if (!newPassword) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'كلمة المرور جديدة مطلوبة' 
    });
  }

  try {
    // تشفير الكلمة الجديدة
    const hashed = await bcrypt.hash(newPassword, 12);

    // تحديث كلمة المرور
    const [result] = await db.execute(
      `UPDATE users 
       SET password = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [hashed, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'المستخدم غير موجود' 
      });
    }

    res.status(200).json({ 
      status: 'success',
      message: 'تم إعادة تعيين كلمة المرور بنجاح'
    });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في إعادة تعيين كلمة المرور' });
  }
};
function checkRole(allowedRoles = []) {
  return (req, res, next) => {
    const user = req.user;
    if (!user || !user.role) {
      return res.status(401).json({ status: 'error', message: 'مستخدم غير مصادق' });
    }
    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ status: 'error', message: 'ليس لديك صلاحية الوصول إلى هذا القسم' });
    }
    next();
  };
}
module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  authenticateToken,
  adminResetPassword,
  checkRole
};
