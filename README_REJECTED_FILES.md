# نظام إدارة الملفات المرفوضة

## نظرة عامة
تم تطوير نظام متكامل لإدارة الملفات المرفوضة في نظام إدارة الجودة والسلامة. النظام يتيح للمستخدمين عرض وإدارة الملفات التي تم رفضها مع أسباب الرفض.

## الميزات الرئيسية

### 1. عرض الملفات المرفوضة
- قائمة بجميع الملفات المرفوضة
- عرض سبب الرفض لكل ملف
- تاريخ الرفض
- اسم القسم والمنشئ

### 2. البحث والفلترة
- البحث في أسماء الملفات
- البحث في أسماء الأقسام
- البحث في أسباب الرفض

### 3. عرض التفاصيل
- مودال تفصيلي لكل ملف
- عرض معلومات كاملة عن الملف
- إمكانية تحميل الملف الأصلي

### 4. التكامل مع النظام
- ربط مع نظام الاعتماد
- إشعارات فورية عند الرفض
- تسجيل جميع العمليات

## الملفات المضافة/المحدثة

### Frontend
1. **`frontend/js/rejected-files.js`** - ملف JavaScript الرئيسي
   - جلب الملفات المرفوضة من API
   - عرض البطاقات
   - البحث والفلترة
   - عرض التفاصيل في مودال

2. **`frontend/html/rejected-files.html`** - صفحة HTML
   - هيكل الصفحة
   - ربط مع ملف JavaScript

3. **`frontend/css/rejected-files.css`** - ملف CSS
   - تصميم البطاقات
   - تحسينات المودال
   - تأثيرات التفاعل

### Backend
1. **`backend/controllers/contentController.js`**
   - إضافة دالة `getRejectedContents`
   - جلب الملفات المرفوضة مع أسباب الرفض

2. **`backend/controllers/approvalController.js`**
   - تحديث دالة `handleApproval`
   - إضافة تحديث حالة الملف عند الرفض

3. **`backend/routers/contentRoutes.js`**
   - إضافة route `/api/contents/rejected`

## API Endpoints

### جلب الملفات المرفوضة
```
GET /api/contents/rejected
Headers: Authorization: Bearer <token>
Response: {
  "status": "success",
  "data": [
    {
      "id": 1,
      "title": "اسم الملف",
      "source_name": "اسم القسم",
      "reject_reason": "سبب الرفض",
      "rejected_at": "2024-01-15T10:30:00Z",
      "file_path": "path/to/file.pdf"
    }
  ]
}
```

### جلب تفاصيل ملف واحد
```
GET /api/contents/:id
Headers: Authorization: Bearer <token>
Response: {
  "status": "success",
  "data": {
    "id": 1,
    "title": "اسم الملف",
    "file_path": "path/to/file.pdf",
    "reject_reason": "سبب الرفض",
    // ... المزيد من التفاصيل
  }
}
```

## قاعدة البيانات

### الجداول المستخدمة
1. **`contents`** - الملفات الرئيسية
2. **`approval_logs`** - سجل الاعتماد والرفض
3. **`departments`** - الأقسام
4. **`folders`** - المجلدات
5. **`users`** - المستخدمين

### الاستعلام الرئيسي
```sql
SELECT 
    c.id, 
    c.title, 
    c.file_path, 
    c.approval_status,
    f.name as folder_name,
    d.name as source_name,
    u.username as created_by_username,
    al.comments as reject_reason,
    al.created_at as rejected_at
FROM contents c
LEFT JOIN folders f ON c.folder_id = f.id
LEFT JOIN departments d ON f.department_id = d.id
LEFT JOIN users u ON c.created_by = u.id
LEFT JOIN approval_logs al ON c.id = al.content_id AND al.status = 'rejected'
WHERE c.approval_status = 'rejected'
ORDER BY al.created_at DESC
```

## كيفية الاستخدام

### 1. الوصول للصفحة
- انتقل إلى `frontend/html/rejected-files.html`
- تأكد من تسجيل الدخول أولاً

### 2. عرض الملفات
- ستظهر جميع الملفات المرفوضة تلقائياً
- يمكن البحث في الملفات باستخدام شريط البحث

### 3. عرض التفاصيل
- انقر على "عرض تفاصيل" لأي ملف
- ستظهر نافذة منبثقة مع جميع التفاصيل
- يمكن تحميل الملف الأصلي من النافذة

### 4. رفض ملف جديد
- من صفحة الملفات المعلقة
- انقر على "رفض"
- أدخل سبب الرفض
- سيتم توجيهك تلقائياً لصفحة الملفات المرفوضة

## الأمان
- التحقق من التوكن في جميع الطلبات
- التحقق من صلاحيات المستخدم
- تسجيل جميع العمليات في سجل النشاطات

## التطوير المستقبلي
1. إضافة إمكانية إعادة تقديم الملفات المرفوضة
2. إضافة تصفية حسب التاريخ
3. إضافة إحصائيات الملفات المرفوضة
4. إضافة إشعارات فورية للملفات المرفوضة

## الدعم التقني
لأي استفسارات أو مشاكل تقنية، يرجى التواصل مع فريق التطوير. 