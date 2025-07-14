require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const path    = require('path');
const cors    = require('cors');

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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', require('express').static('uploads'));

app.use('/api/auth',        authRouter);
app.use('/api/users', permsRouter);
app.use('/api/users',       usersRouter);
app.use('/api/permissions/definitions', permissionsDefRouter);

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
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
