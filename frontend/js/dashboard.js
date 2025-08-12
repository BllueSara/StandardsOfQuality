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
  if (
    translations[currentLang] &&
    translations[currentLang].statuses &&
    translations[currentLang].statuses[status]
  ) {
    return translations[currentLang].statuses[status];
  }
  // fallback: حاول مع العربية
  if (translations.ar && translations.ar.statuses && translations.ar.statuses[status]) {
    return translations.ar.statuses[status];
  }
  // fallback: النص الأصلي
  return status;
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
function renderStatusPie(dashboardData = null) {
  const canvas = document.getElementById('statusPie');
  if (!canvas) {
    console.warn('Canvas element statusPie not found');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Could not get 2D context for statusPie');
    return;
  }
  
  // حساب الأعداد - استخدام البيانات الحقيقية إذا كانت متوفرة
  let statusCounts = { approved: 0, pending: 0, rejected: 0 };
  
  if (dashboardData) {
    // استخدام البيانات من الباك إند
    statusCounts = {
      approved: dashboardData.approved || 0,
      pending: dashboardData.pending || 0,
      rejected: dashboardData.rejected || 0
    };
  } else if (mockData && mockData.files) {
    // fallback للبيانات الوهمية
    mockData.files.forEach(f => {
      if (statusCounts[f.status] !== undefined) statusCounts[f.status]++;
    });
  }
  
  const labels = [t('approved'), t('pending'), t('rejected')];
  const data = [statusCounts.approved, statusCounts.pending, statusCounts.rejected];
  const colors = ['#43c97f', '#ffb300', '#e74c3c'];
  
  // تنظيف الرسم البياني السابق إذا وجد
  if (window.statusPieChart) {
    window.statusPieChart.destroy();
  }
  
  try {
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
          legend: { 
            display: true, 
            position: 'bottom', 
            labels: { 
              font: { 
                size: 18,
                family: "'Tajawal', 'Arial', sans-serif"
              },
              padding: 20,
              usePointStyle: true
            } 
          },
          title: { 
            display: true, 
            text: t('status'), 
            font: { 
              size: 22,
              family: "'Tajawal', 'Arial', sans-serif"
            } 
          },
          datalabels: {
            color: '#fff',
            font: { 
              weight: 'bold', 
              size: 24,
              family: "'Tajawal', 'Arial', sans-serif"
            },
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
            },
            titleFont: {
              size: 16,
              family: "'Tajawal', 'Arial', sans-serif"
            },
            bodyFont: {
              size: 14,
              family: "'Tajawal', 'Arial', sans-serif"
            }
          }
        },
        animation: { animateRotate: true, animateScale: true, duration: 1200 },
        responsive: true,
        maintainAspectRatio: false,
      },
      plugins: [ChartDataLabels]
    });
  } catch (error) {
    console.error('Error rendering status pie chart:', error);
  }
}

// جدول أحدث 10 ملفات
function renderTable(dashboardData = null) {
  const tbody = document.querySelector('#filesTable tbody');
  if (!tbody) {
    console.warn('Table body not found');
    return;
  }
  
  tbody.innerHTML = '';
  
  let filesToRender = [];
  
  if (dashboardData && dashboardData.latest) {
    // استخدام البيانات من الباك إند
    console.log('Rendering table with backend data:', dashboardData.latest);
    filesToRender = dashboardData.latest;
  } else if (mockData && mockData.files) {
    // fallback للبيانات الوهمية
    console.log('Rendering table with mock data:', mockData.files);
    filesToRender = mockData.files.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
  }
  
  console.log('Files to render:', filesToRender);
  
  filesToRender.forEach(row => {
    console.log('Processing row:', row);
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
    
    // استخدام approval_status من الباك إند أو status من البيانات الوهمية
    const status = row.approval_status || row.status;
    
    tr.innerHTML = `
      <td>${row.title}</td>
      <td>${deptName}</td>
      <td><span class="status ${status}">${tStatus(status)}</span></td>
      <td>${displayDate}</td>
      <td>${row.user || ''}</td>
    `;
    tbody.appendChild(tr);
  });
  
  // تحديث رؤوس الجدول حسب اللغة
  const ths = document.querySelectorAll('#filesTable th');
  if (ths.length > 0) {
    const lang = localStorage.getItem('language') || 'ar';
    if (ths[0]) ths[0].textContent = t('title');
    if (ths[1]) ths[1].textContent = t('department');
    if (ths[2]) ths[2].textContent = t('status');
    if (ths[3]) ths[3].textContent = lang === 'ar' ? t('created-at') : t('created-at');
    if (ths[4]) ths[4].textContent = lang === 'ar' ? t('user') : t('user');
  }
  
  // تحديث عنوان الجدول
  const tableTitle = document.querySelector('.dashboard-table h2');
  if (tableTitle) {
    const lang = localStorage.getItem('language') || 'ar';
    tableTitle.textContent = lang === 'ar' ? t('latest-files') : t('latest-files');
  }
}

function updateCards(dashboardData = null) {
  // تحديث العدادات بناءً على البيانات الحقيقية أو الوهمية
  const totalFilesEl = document.getElementById('total-files');
  const approvedFilesEl = document.getElementById('approved-files');
  const pendingFilesEl = document.getElementById('pending-files');
  const rejectedFilesEl = document.getElementById('rejected-files');
  
  if (dashboardData) {
    // استخدام البيانات من الباك إند
    if (totalFilesEl) totalFilesEl.textContent = dashboardData.total || 0;
    if (approvedFilesEl) approvedFilesEl.textContent = dashboardData.approved || 0;
    if (pendingFilesEl) pendingFilesEl.textContent = dashboardData.pending || 0;
    if (rejectedFilesEl) rejectedFilesEl.textContent = dashboardData.rejected || 0;
  } else if (mockData && mockData.files) {
    // fallback للبيانات الوهمية
    if (totalFilesEl) totalFilesEl.textContent = mockData.files.length;
    if (approvedFilesEl) approvedFilesEl.textContent = mockData.files.filter(f => f.status === 'approved').length;
    if (pendingFilesEl) pendingFilesEl.textContent = mockData.files.filter(f => f.status === 'pending').length;
    if (rejectedFilesEl) rejectedFilesEl.textContent = mockData.files.filter(f => f.status === 'rejected').length;
  }
  
  // تحديث عناوين البطاقات
  const totalCardTitle = document.querySelector('.stat-card.total .card-title');
  const pendingCardTitle = document.querySelector('.stat-card.pending .card-title');
  const approvedCardTitle = document.querySelector('.stat-card.approved .card-title');
  const rejectedCardTitle = document.querySelector('.stat-card.rejected .card-title');
  
  if (totalCardTitle) totalCardTitle.textContent = t('total');
  if (pendingCardTitle) pendingCardTitle.textContent = t('pending');
  if (approvedCardTitle) approvedCardTitle.textContent = t('approved');
  if (rejectedCardTitle) rejectedCardTitle.textContent = t('rejected');
  
  // تحديث النسب المئوية مع الترجمة
  updateCardPercentages();
}

// دالة تحديث النسب المئوية في البطاقات
function updateCardPercentages() {
  const totalChangeEl = document.querySelector('[data-translate="total-files-change"]');
  const approvedChangeEl = document.querySelector('[data-translate="approved-files-change"]');
  const pendingChangeEl = document.querySelector('[data-translate="pending-files-change"]');
  const rejectedChangeEl = document.querySelector('[data-translate="rejected-files-change"]');
  
  if (totalChangeEl) {
    const totalChange = totalChangeEl.textContent;
    const percentage = totalChange.match(/[+-]\d+%/)[0];
    totalChangeEl.textContent = `${percentage} ${t('this-month')}`;
  }
  
  if (approvedChangeEl) {
    const approvedChange = approvedChangeEl.textContent;
    const percentage = approvedChange.match(/[+-]\d+%/)[0];
    approvedChangeEl.textContent = `${percentage} ${t('this-month')}`;
  }
  
  if (pendingChangeEl) {
    const pendingChange = pendingChangeEl.textContent;
    const percentage = pendingChange.match(/[+-]\d+%/)[0];
    pendingChangeEl.textContent = `${percentage} ${percentage} ${t('this-month')}`;
  }
  
  if (rejectedChangeEl) {
    const rejectedChange = rejectedChangeEl.textContent;
    const percentage = rejectedChange.match(/[+-]\d+%/)[0];
    rejectedChangeEl.textContent = `${percentage} ${t('this-month')}`;
  }
}

// دالة جلب البيانات من الخادم
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
    console.error('خطأ في جلب بيانات الداشبورد:', e);
    return null;
  }
}

// دالة جلب إحصائيات الأقسام
async function fetchDepartmentStats() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3006/api/dashboard/department-stats', {
      headers: { Authorization: token ? `Bearer ${token}` : undefined }
    });
    const json = await res.json();
    if (json.status === 'success') {
      return json.data;
    } else {
      throw new Error(json.message || 'خطأ في جلب إحصائيات الأقسام');
    }
  } catch (e) {
    console.error('خطأ في جلب إحصائيات الأقسام:', e);
    return [];
  }
}

// دالة جلب الأداء الشهري
async function fetchMonthlyPerformance() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3006/api/dashboard/monthly-performance', {
      headers: { Authorization: token ? `Bearer ${token}` : undefined }
    });
    const json = await res.json();
    if (json.status === 'success') {
      return json.data;
    } else {
      throw new Error(json.message || 'خطأ في جلب الأداء الشهري');
    }
  } catch (e) {
    console.error('خطأ في جلب الأداء الشهري:', e);
    return [];
  }
}

// دالة معالجة اسم القسم حسب اللغة
function getDepartmentNameByLanguage(departmentNameData, userLanguage = 'ar') {
  try {
    // إذا كانت البيانات نص JSON
    if (typeof departmentNameData === 'string' && departmentNameData.startsWith('{')) {
      const parsed = JSON.parse(departmentNameData);
      return parsed[userLanguage] || parsed['ar'] || parsed['en'] || departmentNameData;
    }
    // إذا كانت البيانات كائن
    if (typeof departmentNameData === 'object' && departmentNameData !== null) {
      return departmentNameData[userLanguage] || departmentNameData['ar'] || departmentNameData['en'] || JSON.stringify(departmentNameData);
    }
    // إذا كانت البيانات نص عادي
    return departmentNameData || 'غير معروف';
  } catch (error) {
    // في حالة حدوث خطأ، إرجاع النص الأصلي
    return departmentNameData || 'غير معروف';
  }
}

// دالة عرض رسم بياني دائري للأقسام
function renderDepartmentChart(data) {
  if (!data || data.length === 0) {
    const canvas = document.getElementById('departmentChart');
    if (canvas) {
      canvas.style.display = 'none';
      canvas.parentElement.innerHTML = '<div class="chart-loading">لا توجد بيانات متاحة</div>';
    }
    return;
  }

  const canvas = document.getElementById('departmentChart');
  if (!canvas) {
    console.warn('Canvas element departmentChart not found');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Could not get 2D context for departmentChart');
    return;
  }

  const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
  const labels = data.map(d => getDepartmentNameByLanguage(d.department_name, lang));
  const approvedData = data.map(d => d.approved_contents);
  const pendingData = data.map(d => d.pending_contents);

  try {
    // تنظيف الرسم البياني السابق إذا وجد
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          label: t('approved-contents'),
          data: approvedData,
          backgroundColor: [
            '#28a745', '#20c997', '#17a2b8', '#007bff', '#6f42c1',
            '#e83e8c', '#fd7e14', '#ffc107', '#28a745', '#6c757d'
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }, {
          label: t('pending-contents'),
          data: pendingData,
          backgroundColor: [
            '#dc3545', '#fd7e14', '#ffc107', '#17a2b8', '#6f42c1',
            '#e83e8c', '#28a745', '#20c997', '#007bff', '#6c757d'
          ],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 20,
              usePointStyle: true,
              font: { 
                size: 13,
                family: "'Tajawal', 'Arial', sans-serif"
              }
            }
          },
          tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            callbacks: {
              label: function(context) {
                const label = context.label || '';
                const value = context.parsed;
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value} (${percentage}%)`;
              }
            },
            titleFont: {
              size: 14,
              family: "'Tajawal', 'Arial', sans-serif"
            },
            bodyFont: {
              size: 13,
              family: "'Tajawal', 'Arial', sans-serif"
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error rendering department chart:', error);
  }
}

// دالة عرض رسم بياني شريطي لأداء الأقسام
function renderDepartmentPerformanceChart(data) {
  if (!data || data.length === 0) {
    const canvas = document.getElementById('departmentPerformanceChart');
    if (canvas) {
      canvas.style.display = 'none';
      canvas.parentElement.innerHTML = '<div class="chart-loading">لا توجد بيانات متاحة</div>';
    }
    return;
  }

  const canvas = document.getElementById('departmentPerformanceChart');
  if (!canvas) {
    console.warn('Canvas element departmentPerformanceChart not found');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Could not get 2D context for departmentPerformanceChart');
    return;
  }

  const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
  const labels = data.map(d => getDepartmentNameByLanguage(d.department_name, lang));
  const approvalRates = data.map(d => parseFloat(d.approval_rate));

  try {
    // تنظيف الرسم البياني السابق إذا وجد
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: t('approval-rate') + ' (%)',
          data: approvalRates,
          backgroundColor: approvalRates.map(rate => 
            rate >= 80 ? '#28a745' : 
            rate >= 60 ? '#ffc107' : 
            rate >= 40 ? '#fd7e14' : '#dc3545'
          ),
          borderColor: approvalRates.map(rate => 
            rate >= 80 ? '#1e7e34' : 
            rate >= 60 ? '#e0a800' : 
            rate >= 40 ? '#e55a00' : '#c82333'
          ),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        scales: {
          y: { 
            beginAtZero: true, 
            max: 100,
            grid: { color: '#e0e0e0', drawBorder: false },
            ticks: {
              callback: function(value) {
                return value + '%';
              },
              font: {
                size: 13,
                family: "'Tajawal', 'Arial', sans-serif"
              }
            }
          },
          x: { 
            grid: { display: false },
            ticks: {
              maxRotation: 0,
              minRotation: 0,
              autoSkip: true,
              maxTicksLimit: 8,
              font: {
                size: 13,
                family: "'Tajawal', 'Arial', sans-serif"
              }
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            callbacks: {
              label: function(context) {
                return t('approval-rate') + ': ' + context.parsed.y + '%';
              }
            },
            titleFont: {
              size: 14,
              family: "'Tajawal', 'Arial', sans-serif"
            },
            bodyFont: {
              size: 13,
              family: "'Tajawal', 'Arial', sans-serif"
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error rendering department performance chart:', error);
  }
}

// دالة عرض رسم بياني خطي للأداء الشهري
function renderMonthlyTrendsChart(data) {
  if (!data || data.length === 0) {
    const canvas = document.getElementById('monthlyTrendsChart');
    if (canvas) {
      canvas.style.display = 'none';
      canvas.parentElement.innerHTML = '<div class="chart-loading">لا توجد بيانات متاحة</div>';
    }
    return;
  }

  const canvas = document.getElementById('monthlyTrendsChart');
  if (!canvas) {
    console.warn('Canvas element monthlyTrendsChart not found');
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.warn('Could not get 2D context for monthlyTrendsChart');
    return;
  }

  const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
  const labels = data.map(m => {
    const [year, month] = m.month.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'ar-SA', { 
      year: 'numeric', 
      month: 'short' 
    });
  });
  const totalData = data.map(m => m.total_contents);
  const approvedData = data.map(m => m.approved_contents);
  const pendingData = data.map(m => m.pending_contents);

  try {
    // تنظيف الرسم البياني السابق إذا وجد
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      existingChart.destroy();
    }

    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: t('total-contents'),
          data: totalData,
          borderColor: '#007bff',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4
        }, {
          label: t('approved-contents'),
          data: approvedData,
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4
        }, {
          label: t('pending-contents'),
          data: pendingData,
          borderColor: '#ffc107',
          backgroundColor: 'rgba(255, 193, 7, 0.1)',
          borderWidth: 3,
          fill: false,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        scales: {
          y: { 
            beginAtZero: true, 
            grid: { color: '#e0e0e0', drawBorder: false },
            ticks: {
              font: {
                size: 13,
                family: "'Tajawal', 'Arial', sans-serif"
              }
            }
          },
          x: { 
            grid: { color: '#e0e0e0', drawBorder: false },
            ticks: {
              font: {
                size: 13,
                family: "'Tajawal', 'Arial', sans-serif"
              }
            }
          }
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              padding: 20,
              usePointStyle: true,
              font: {
                size: 13,
                family: "'Tajawal', 'Arial', sans-serif"
              }
            }
          },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + context.parsed.y;
              }
            },
            titleFont: {
              size: 14,
              family: "'Tajawal', 'Arial', sans-serif"
            },
            bodyFont: {
              size: 13,
              family: "'Tajawal', 'Arial', sans-serif"
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Error rendering monthly trends chart:', error);
  }
}

// وظيفة تصدير الداشبورد إلى Excel
async function exportDashboardToExcel() {
  try {
    // إظهار رسالة تحميل
    showToast(t('exporting'), 'info');
    
    const token = localStorage.getItem('token');
    const response = await fetch('http://localhost:3006/api/dashboard/export-excel', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 401) {
      showToast(t('please-login'), 'error');
      return;
    }

    if (!response.ok) {
      throw new Error('فشل في تصدير التقرير');
    }

    // تحميل الملف
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-report-${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showToast(t('export-success'), 'success');
  } catch (error) {
    console.error('خطأ في تصدير التقرير:', error);
    showToast(t('export-error'), 'error');
  }
}

// وظيفة إظهار رسائل Toast
function showToast(message, type = 'info') {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  toastContainer.appendChild(toast);

  // إظهار Toast
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 100);

  // إخفاء Toast بعد 3 ثوان
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-100%)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

// دالة لتنظيف الرسوم البيانية الموجودة
function destroyExistingCharts() {
  const chartIds = ['statusPie', 'departmentChart', 'departmentPerformanceChart', 'monthlyTrendsChart'];
  chartIds.forEach(chartId => {
    const canvas = document.getElementById(chartId);
    if (canvas) {
      const existingChart = Chart.getChart(canvas);
      if (existingChart) {
        existingChart.destroy();
      }
    }
  });
}

// دالة إظهار حالة التحميل
function showLoadingState() {
  const chartContainers = document.querySelectorAll('.chart-container');
  chartContainers.forEach(container => {
    if (!container.querySelector('canvas')) {
      container.innerHTML = '<div class="chart-loading">جاري التحميل...</div>';
    }
  });
}

// دالة إخفاء حالة التحميل
function hideLoadingState() {
  const loadingElements = document.querySelectorAll('.chart-loading');
  loadingElements.forEach(element => {
    if (element.textContent === 'جاري التحميل...') {
      element.remove();
    }
  });
}

async function rerenderAll() {
  document.body.classList.add('loading');
  
  try {
    // جلب البيانات من الخادم
    const [dashboardData, departmentStats, monthlyPerformance] = await Promise.all([
      fetchDashboardData(),
      fetchDepartmentStats(),
      fetchMonthlyPerformance()
    ]);

    console.log('Dashboard data received:', dashboardData);
    console.log('Department stats received:', departmentStats);
    console.log('Monthly performance received:', monthlyPerformance);

    if (dashboardData) {
      // تحديث العدادات والبطاقات
      updateCards(dashboardData);
      
      // تحديث الجدول
      renderTable(dashboardData);
      
      // تحديث الرسم البياني الدائري للحالات
      renderStatusPie(dashboardData);

      // تعبئة جدول نسبة اكتمال الاعتمادات لكل قسم
      const deptTable = document.querySelector('#departmentCompletionTable tbody');
      if (deptTable && dashboardData.departmentCompletion) {
        deptTable.innerHTML = '';
        dashboardData.departmentCompletion.forEach(row => {
          const tr = document.createElement('tr');
          let deptName = row.department;
          try {
            const parsed = JSON.parse(row.department);
            const lang = localStorage.getItem('language') || 'ar';
            deptName = parsed[lang] || parsed.ar || parsed.en || row.department;
          } catch {}
          let percentColor = '';
          if (row.percent >= 80) percentColor = 'style="color:#43c97f;font-weight:bold"';
          else if (row.percent >= 50) percentColor = 'style="color:#ffb300;font-weight:bold"';
          else percentColor = 'style="color:#e74c3c;font-weight:bold"';
          tr.innerHTML = `
            <td>${deptName}</td>
            <td>${row.total}</td>
            <td>${row.approved}</td>
            <td ${percentColor}>${row.percent}%</td>
          `;
          deptTable.appendChild(tr);
        });
      }
    }

    // تحديث الرسوم البيانية
    if (departmentStats && departmentStats.length > 0) {
      renderDepartmentChart(departmentStats);
      renderDepartmentPerformanceChart(departmentStats);
    }

    if (monthlyPerformance && monthlyPerformance.length > 0) {
      renderMonthlyTrendsChart(monthlyPerformance);
    }

    // تحديث العناوين حسب اللغة
    updateChartTitles();
    
  } catch (error) {
    console.error('خطأ في تحميل البيانات:', error);
    showToast(t('loading-error'), 'error');
  } finally {
    document.body.classList.remove('loading');
    hideLoadingState();
  }
}

// دالة تحديث عناوين الرسوم البيانية
function updateChartTitles() {
  const lang = localStorage.getItem('language') || document.documentElement.lang || 'ar';
  const titles = document.querySelectorAll('[data-translate]');
  titles.forEach(element => {
    const key = element.getAttribute('data-translate');
    const translation = t(key);
    if (translation && translation !== key) {
      element.textContent = translation;
    }
  });
}

// إضافة معالج الأحداث لتصدير Excel
function addExportButton() {
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.onclick = exportDashboardToExcel;
  } else {
    console.warn('Export button not found');
  }
}

// إضافة معالج الأحداث لتبديل اللغة
function addLanguageSwitcher() {
  const langSwitcher = document.getElementById('lang-switcher');
  if (langSwitcher) {
    langSwitcher.value = currentLang;
    langSwitcher.addEventListener('change', e => {
      currentLang = e.target.value;
      localStorage.setItem('language', currentLang);
      rerenderAll();
    });
  }
}

// دالة للتحقق من وجود جميع العناصر المطلوبة
function checkRequiredElements() {
  const requiredElements = [
    'statusPie',
    'departmentChart', 
    'departmentPerformanceChart',
    'monthlyTrendsChart',
    'total-files',
    'approved-files',
    'pending-files',
    'rejected-files',
    'filesTable',
    'departmentCompletionTable'
  ];
  
  const missingElements = [];
  
  requiredElements.forEach(id => {
    const element = document.getElementById(id);
    if (!element) {
      missingElements.push(id);
    }
  });
  
  if (missingElements.length > 0) {
    console.warn('Missing required elements:', missingElements);
    return false;
  }
  
  return true;
}

// تهيئة الصفحة
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // إضافة تأخير أطول للتأكد من تحميل جميع العناصر
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // التحقق من وجود جميع العناصر المطلوبة
    if (!checkRequiredElements()) {
      console.error('Some required elements are missing. Retrying in 1000ms...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (!checkRequiredElements()) {
        console.error('Still missing elements. Retrying one more time...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (!checkRequiredElements()) {
          throw new Error('Required elements not found after multiple retries');
        }
      }
    }
    
    console.log('All required elements found successfully');
    
    // إظهار حالة التحميل
    showLoadingState();
    
    // تنظيف الرسوم البيانية الموجودة
    destroyExistingCharts();
    
    // إضافة زر التصدير
    addExportButton();
    
    // إضافة معالج تبديل اللغة
    addLanguageSwitcher();
    
    // تحميل البيانات
    await rerenderAll();
    
    // لا حاجة لاستدعاء هذه الدوال مرة أخرى لأنها تُستدعى من rerenderAll
    
  } catch (error) {
    console.error('خطأ في تهيئة الصفحة:', error);
    showToast(t('loading-error'), 'error');
  }
});

// معالج الأخطاء العام
window.addEventListener('error', function(event) {
  console.error('Global error caught:', event.error);
  showToast('حدث خطأ غير متوقع. يرجى تحديث الصفحة.', 'error');
});

// معالج الأخطاء للوعود المرفوضة
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
  showToast('حدث خطأ في معالجة البيانات. يرجى المحاولة مرة أخرى.', 'error');
}); 