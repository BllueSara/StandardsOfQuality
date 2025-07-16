// بيانات وهمية مؤقتة
const mockData = {
  total: 120,
  pending: 35,
  approved: 70,
  rejected: 15,
  byDepartment: [
    { name: { ar: 'المالية', en: 'Finance' }, value: 30 },
    { name: { ar: 'الموارد البشرية', en: 'HR' }, value: 25 },
    { name: { ar: 'الجودة', en: 'Quality' }, value: 20 },
    { name: { ar: 'التمريض', en: 'Nursing' }, value: 15 },
    { name: { ar: 'الطوارئ', en: 'Emergency' }, value: 10 },
    { name: { ar: 'أخرى', en: 'Other' }, value: 20 },
  ],
  byUser: [
    { name: 'Sara', value: 22 },
    { name: 'Mohammed', value: 18 },
    { name: 'Aisha', value: 15 },
    { name: 'Fahad', value: 12 },
    { name: 'Laila', value: 10 },
    { name: 'Other', value: 43 },
  ],
  timeline: [
    { date: '2024-06-01', approved: 2, rejected: 1, pending: 3 },
    { date: '2024-06-02', approved: 4, rejected: 0, pending: 2 },
    { date: '2024-06-03', approved: 6, rejected: 2, pending: 1 },
    { date: '2024-06-04', approved: 3, rejected: 1, pending: 2 },
    { date: '2024-06-05', approved: 5, rejected: 0, pending: 1 },
    { date: '2024-06-06', approved: 7, rejected: 2, pending: 0 },
    { date: '2024-06-07', approved: 8, rejected: 1, pending: 1 },
  ],
  files: [
    { title: 'سياسة الجودة', department: 'الجودة', status: 'approved', created_at: '2024-06-01', user: 'Sara' },
    { title: 'تقرير مالي', department: 'المالية', status: 'pending', created_at: '2024-06-02', user: 'Mohammed' },
    { title: 'خطة تدريب', department: 'الموارد البشرية', status: 'rejected', created_at: '2024-06-03', user: 'Aisha' },
    { title: 'إجراء تمريضي', department: 'التمريض', status: 'approved', created_at: '2024-06-04', user: 'Fahad' },
    { title: 'تقرير طوارئ', department: 'الطوارئ', status: 'pending', created_at: '2024-06-05', user: 'Laila' },
  ]
};


let currentLang = localStorage.getItem('language') || 'ar';

function t(key) {
  return translations[currentLang][key] || key;
}
function tStatus(status) {
  return translations[currentLang].statuses[status] || status;
}

// أضف مكتبة datalabels
const chartDatalabelsScript = document.createElement('script');
chartDatalabelsScript.src = 'https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js';
document.head.appendChild(chartDatalabelsScript);

// ألوان ثابتة للأقسام
const departmentColors = [
  '#4f8cff', '#43c97f', '#ffb300', '#e74c3c', '#6ed6ff', '#8884d8', '#bdbdbd'
];

// رسم Pie كبير وواضح للحالات فقط
function renderStatusPie() {
  const ctx = document.getElementById('statusPie').getContext('2d');
  // حساب الأعداد
  const statusCounts = { approved: 0, pending: 0, rejected: 0 };
  mockData.files.forEach(f => {
    if (statusCounts[f.status] !== undefined) statusCounts[f.status]++;
  });
  const labels = [t('approved'), t('pending'), t('rejected')];
  const data = [statusCounts.approved, statusCounts.pending, statusCounts.rejected];
  const colors = ['#43c97f', '#ffb300', '#e74c3c'];
  if (window.statusPieChart) window.statusPieChart.destroy();
  window.statusPieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 0,
      }]
    },
    options: {
      plugins: {
        legend: { display: true, position: 'bottom', labels: { font: { size: 18 } } },
        title: { display: true, text: 'توزيع الحالات', font: { size: 22 } },
        datalabels: {
          color: '#fff',
          font: { weight: 'bold', size: 24 },
          formatter: (v, ctx) => {
            const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
            const percent = total ? Math.round((v / total) * 100) : 0;
            return percent > 0 ? percent + '%' : '';
          },
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percent = ((value / total) * 100).toFixed(1) + '%';
              return `${label}: ${value} (${percent})`;
            }
          }
        }
      },
      animation: { animateRotate: true, animateScale: true, duration: 1200 },
      responsive: true,
    },
    plugins: [ChartDataLabels]
  });
}

// جدول أحدث 10 ملفات
function renderTable() {
  const tbody = document.querySelector('#filesTable tbody');
  tbody.innerHTML = '';
  // ترتيب حسب التاريخ وأخذ الأحدث 10
  const sorted = mockData.files.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
  sorted.forEach(row => {
    const tr = document.createElement('tr');
    // اسم القسم حسب اللغة
    let deptName = row.department;
    try {
      const parsed = JSON.parse(row.department);
      const lang = localStorage.getItem('language') || 'ar';
      deptName = parsed[lang] || parsed.ar || parsed.en || row.department;
    } catch {}
    // التاريخ
    const lang = localStorage.getItem('language') || 'ar';
    const displayDate = row.created_at ? new Date(row.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '';
    tr.innerHTML = `
      <td>${row.title}</td>
      <td>${deptName}</td>
      <td><span class="status ${row.status}">${tStatus(row.status)}</span></td>
      <td>${displayDate}</td>
      <td>${row.user || ''}</td>
    `;
    tbody.appendChild(tr);
  });
  // تحديث رؤوس الجدول حسب اللغة
  const ths = document.querySelectorAll('#filesTable th');
  const lang = localStorage.getItem('language') || 'ar';
  ths[0].textContent = t('title');
  ths[1].textContent = t('department');
  ths[2].textContent = t('status');
  ths[3].textContent = lang === 'ar' ? 'تاريخ الإنشاء' : 'Created At';
  ths[4].textContent = lang === 'ar' ? 'اسم المستخدم' : 'User';
  document.querySelector('.dashboard-table h2').textContent = lang === 'ar' ? 'أحدث الملفات' : 'Latest Files';
}

function updateCards() {
  // تحديث العدادات بناءً على mockData
  document.getElementById('total-files').textContent = mockData.files.length;
  document.getElementById('approved-files').textContent = mockData.files.filter(f => f.status === 'approved').length;
  document.getElementById('pending-files').textContent = mockData.files.filter(f => f.status === 'pending').length;
  document.getElementById('rejected-files').textContent = mockData.files.filter(f => f.status === 'rejected').length;
  document.querySelector('.card.total .card-title').textContent = t('total');
  document.querySelector('.card.pending .card-title').textContent = t('pending');
  document.querySelector('.card.approved .card-title').textContent = t('approved');
  document.querySelector('.card.rejected .card-title').textContent = t('rejected');
}

async function fetchDashboardData() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3006/api/dashboard/summary', {
      headers: { Authorization: token ? `Bearer ${token}` : undefined }
    });
    const json = await res.json();
    if (json.status === 'success') {
      return json.data;
    } else {
      throw new Error(json.message || 'خطأ في جلب البيانات');
    }
  } catch (e) {
    alert('خطأ في تحميل بيانات الداشبورد');
    return null;
  }
}

async function rerenderAll() {
  document.body.classList.add('loading');
  const data = await fetchDashboardData();
  document.body.classList.remove('loading');
  if (!data) return;
  // تحديث العدادات
  document.getElementById('total-files').textContent = data.total;
  document.getElementById('approved-files').textContent = data.approved;
  document.getElementById('pending-files').textContent = data.pending;
  document.getElementById('rejected-files').textContent = data.rejected;
  // تحديث الجدول
  const tbody = document.querySelector('#filesTable tbody');
  tbody.innerHTML = '';
  data.latest.forEach(row => {
    const tr = document.createElement('tr');
    let deptName = row.department;
    try {
      const parsed = JSON.parse(row.department);
      const lang = localStorage.getItem('language') || 'ar';
      deptName = parsed[lang] || parsed.ar || parsed.en || row.department;
    } catch {}
    const lang = localStorage.getItem('language') || 'ar';
    const displayDate = row.created_at ? new Date(row.created_at).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US') : '';
    tr.innerHTML = `
      <td>${row.title}</td>
      <td>${deptName}</td>
      <td><span class="status ${row.approval_status}">${tStatus(row.approval_status)}</span></td>
      <td>${displayDate}</td>
      <td>${row.user || ''}</td>
    `;
    tbody.appendChild(tr);
  });
  // تحديث رؤوس الجدول حسب اللغة
  const ths = document.querySelectorAll('#filesTable th');
  const lang = localStorage.getItem('language') || 'ar';
  ths[0].textContent = t('title');
  ths[1].textContent = t('department');
  ths[2].textContent = t('status');
  ths[3].textContent = lang === 'ar' ? 'تاريخ الإنشاء' : 'Created At';
  ths[4].textContent = lang === 'ar' ? 'اسم المستخدم' : 'User';
  document.querySelector('.dashboard-table h2').textContent = lang === 'ar' ? 'أحدث الملفات' : 'Latest Files';
}

document.addEventListener('DOMContentLoaded', rerenderAll);
const langSwitcher = document.getElementById('lang-switcher');
if (langSwitcher) {
  langSwitcher.value = currentLang;
  langSwitcher.addEventListener('change', e => {
    currentLang = e.target.value;
    localStorage.setItem('language', currentLang);
    rerenderAll();
  });
} 