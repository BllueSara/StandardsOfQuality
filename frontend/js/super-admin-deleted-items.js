// Global variables
let currentTable = '';
let currentPage = 1;
let totalPages = 1;
const itemsPerPage = 20;
const apiBase = 'http://localhost:3006';

// DOM elements
const tableSelect = document.getElementById('tableSelect');
const loadItemsBtn = document.getElementById('loadItemsBtn');
const restoreAllBtn = document.getElementById('restoreAllBtn');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const tableContent = document.getElementById('tableContent');
const statsGrid = document.getElementById('statsGrid');
const alertContainer = document.getElementById('alertContainer');
const confirmModal = document.getElementById('confirmModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const confirmBtn = document.getElementById('confirmBtn');
const cancelBtn = document.getElementById('cancelBtn');

// Check if all required DOM elements exist
if (!tableSelect || !loadItemsBtn || !restoreAllBtn || !deleteAllBtn || 
    !tableContent || !statsGrid || !alertContainer || !confirmModal || 
    !modalTitle || !modalMessage || !confirmBtn || !cancelBtn) {
    console.error('Some required DOM elements are missing');
}

// Table name mappings
const tableNames = {
    'all': 'جميع العناصر',
    'users': 'المستخدمون',
    'departments': 'الأقسام',
    'folders': 'المجلدات',
    'contents': 'المحتويات',
    'folder_names': 'اسماء المجلدات'
};

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    loadStatistics();
    setupEventListeners();
    
    // Set "all" as default selection and load all items automatically
    tableSelect.value = 'all';
    currentTable = 'all';
    loadItemsBtn.textContent = 'عرض جميع العناصر المحذوفة';
    
    // Automatically load all deleted items
    loadDeletedItems();
});

// Setup event listeners
function setupEventListeners() {
    loadItemsBtn.addEventListener('click', handleLoadItems);
    restoreAllBtn.addEventListener('click', () => handleBulkAction('restore'));
    deleteAllBtn.addEventListener('click', () => handleBulkAction('delete'));
    cancelBtn.addEventListener('click', closeModal);
    
    // Update button text when table selection changes
    tableSelect.addEventListener('change', function() {
        const selectedTable = this.value;
        if (selectedTable === 'all') {
            loadItemsBtn.textContent = 'عرض جميع العناصر المحذوفة';
        } else if (selectedTable) {
            loadItemsBtn.textContent = `عرض عناصر ${tableNames[selectedTable]}`;
        }
        
        // Update current table and reload items
        currentTable = selectedTable;
        currentPage = 1;
        loadDeletedItems();
    });
    
    // Close modal when clicking outside
    confirmModal.addEventListener('click', function(e) {
        if (e.target === confirmModal) {
            closeModal();
        }
    });
}

// Load statistics
async function loadStatistics() {
    try {
        showLoading(statsGrid);
        
        const response = await fetch(`${apiBase}/api/super-admin/deleted-stats`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('فشل في جلب الإحصائيات');
        }
        
        const result = await response.json();
        displayStatistics(result.data);
        
    } catch (error) {
        console.error('Error loading statistics:', error);
        showAlert('error', 'فشل في جلب الإحصائيات: ' + error.message);
        statsGrid.innerHTML = '<div class="error">فشل في جلب الإحصائيات</div>';
    }
}

// Display statistics
function displayStatistics(stats) {
    statsGrid.innerHTML = '';
    
    // Calculate total deleted items
    const totalDeleted = Object.values(stats).reduce((sum, count) => sum + count, 0);
    
    // Add total summary card if there are deleted items
    if (totalDeleted > 0) {
        const totalCard = document.createElement('div');
        totalCard.className = 'stat-card total-card';
        totalCard.innerHTML = `
            <h3>إجمالي العناصر المحذوفة</h3>
            <div class="count">${totalDeleted}</div>
            <p>عنصر محذوف من جميع الجداول</p>
        `;
        statsGrid.appendChild(totalCard);
    }
    
    Object.entries(stats).forEach(([table, count]) => {
        if (count > 0) {
            const statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = `
                <h3>${tableNames[table] || table}</h3>
                <div class="count">${count}</div>
                <p>عنصر محذوف</p>
            `;
            statsGrid.appendChild(statCard);
        }
    });
    
    if (statsGrid.children.length === 0) {
        statsGrid.innerHTML = `
            <div class="stat-card" style="grid-column: 1 / -1; text-align: center; color: #28a745;">
                <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 10px;"></i>
                <h3>لا توجد عناصر محذوفة</h3>
                <p>جميع العناصر في حالة نشطة</p>
            </div>
        `;
    }
}

// Handle load items button click
function handleLoadItems() {
    const selectedTable = tableSelect.value;
    if (!selectedTable) {
        showAlert('warning', 'يرجى اختيار نوع العناصر أولاً');
        return;
    }
    
    // Update button text based on selection
    if (selectedTable === 'all') {
        loadItemsBtn.textContent = 'عرض جميع العناصر المحذوفة';
    } else {
        loadItemsBtn.textContent = `عرض عناصر ${tableNames[selectedTable]}`;
    }
    
    // Refresh the current view
    currentPage = 1;
    loadDeletedItems();
}

// Load deleted items for selected table
async function loadDeletedItems() {
    try {
        showLoading(tableContent);
        
        let response;
        if (currentTable === 'all') {
            // جلب جميع العناصر المحذوفة من جميع الجداول
            response = await fetch(`${apiBase}/api/super-admin/deleted-all?page=${currentPage}&limit=${itemsPerPage}`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
        } else {
            // جلب العناصر المحذوفة من جدول محدد
            response = await fetch(`${apiBase}/api/super-admin/deleted/${currentTable}?page=${currentPage}&limit=${itemsPerPage}`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });
        }
        
        if (!response.ok) {
            throw new Error('فشل في جلب العناصر المحذوفة');
        }
        
        const result = await response.json();
        displayDeletedItems(result.data);
        
        // Show/hide bulk action buttons
        const hasItems = result.data.items.length > 0;
        restoreAllBtn.style.display = hasItems ? 'inline-flex' : 'none';
        deleteAllBtn.style.display = hasItems ? 'inline-flex' : 'none';
        
    } catch (error) {
        console.error('Error loading deleted items:', error);
        showAlert('error', 'فشل في جلب العناصر المحذوفة: ' + error.message);
        tableContent.innerHTML = '<div class="error">فشل في جلب العناصر المحذوفة</div>';
    }
}

// Display deleted items in table
function displayDeletedItems(data) {
    const { items, pagination } = data;
    
    if (items.length === 0) {
        tableContent.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-smile"></i>
                <h3>لا توجد عناصر محذوفة</h3>
                <p>جميع عناصر ${currentTable === 'all' ? 'الجداول' : tableNames[currentTable]} في حالة نشطة</p>
            </div>
        `;
        return;
    }
    
    // Build table
    let tableHTML = `
        <table class="deleted-items-table">
            <thead>
                <tr>
                    <th>المعرف</th>
                    ${currentTable === 'all' ? '<th>نوع الجدول</th>' : ''}
                    <th>الاسم/العنوان</th>
                    <th>تاريخ الحذف</th>
                    <th>حذف بواسطة</th>
                    <th>الإجراءات</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    items.forEach(item => {
        const itemName = getItemDisplayName(item);
        const deletedAt = new Date(item.deleted_at).toLocaleString('ar-SA');
        const deletedBy = item.deleted_by_username || 'غير محدد';
        const tableType = currentTable === 'all' ? (tableNames[item.table_name] || item.table_name) : '';
        
        tableHTML += `
            <tr>
                <td>${item.id}</td>
                ${currentTable === 'all' ? `<td>${tableType}</td>` : ''}
                <td>${itemName}</td>
                <td>${deletedAt}</td>
                <td>${deletedBy}</td>
                <td>
                    <div class="item-actions">
                        <button type="button" class="btn btn-success" onclick="restoreItem(${item.id}, '${item.table_name || currentTable}')" title="استرجاع">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button type="button" class="btn btn-danger" onclick="permanentDeleteItem(${item.id}, '${item.table_name || currentTable}')" title="حذف نهائي">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tableHTML += `
            </tbody>
        </table>
    `;
    
    // Add pagination
    if (pagination.total_pages > 1) {
        tableHTML += buildPagination(pagination);
    }
    
    tableContent.innerHTML = tableHTML;
    totalPages = pagination.total_pages;
}

// Get display name for item
function getItemDisplayName(item) {
    // Helper function to extract Arabic text from JSON strings
    function extractArabicText(text) {
        if (typeof text === 'string') {
            try {
                const parsed = JSON.parse(text);
                if (parsed && typeof parsed === 'object' && parsed.ar) {
                    return parsed.ar;
                }
            } catch (e) {
                // If not JSON, return as is
            }
        }
        return text;
    }
    
    // Try different name fields based on table type
    if (item.name) return extractArabicText(item.name);
    if (item.title) return extractArabicText(item.title);
    if (item.username) return item.username;
    if (item.first_name || item.last_name) {
        return `${item.first_name || ''} ${item.last_name || ''}`.trim();
    }
    
    // If we have table name info, show it in the fallback
    if (item.table_name) {
        return `العنصر رقم ${item.id} من ${tableNames[item.table_name] || item.table_name}`;
    }
    
    return `العنصر رقم ${item.id}`;
}

// Build pagination HTML
function buildPagination(pagination) {
    let paginationHTML = '<div class="pagination">';
    
    // Previous button
    paginationHTML += `
        <button ${currentPage <= 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">
            <i class="fas fa-chevron-right"></i> السابق
        </button>
    `;
    
    // Page info
    paginationHTML += `
        <span class="current-page">
            صفحة ${currentPage} من ${pagination.total_pages}
        </span>
    `;
    
    // Next button
    paginationHTML += `
        <button ${currentPage >= pagination.total_pages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">
            التالي <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    paginationHTML += '</div>';
    return paginationHTML;
}

// Change page
function changePage(page) {
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    loadDeletedItems();
}

// Restore single item
async function restoreItem(itemId, tableType) {
    showConfirmModal(
        'استرجاع العنصر',
        'هل أنت متأكد من استرجاع هذا العنصر؟',
        async () => {
            try {
                const response = await fetch(`${apiBase}/api/super-admin/restore/${tableType}/${itemId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${getToken()}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error('فشل في استرجاع العنصر');
                }
                
                showAlert('success', 'تم استرجاع العنصر بنجاح');
                loadDeletedItems();
                loadStatistics(); // Refresh stats
                
            } catch (error) {
                console.error('Error restoring item:', error);
                showAlert('error', 'فشل في استرجاع العنصر: ' + error.message);
            }
        }
    );
}

// Permanent delete single item
async function permanentDeleteItem(itemId, tableType) {
    showConfirmModal(
        'حذف نهائي',
        'هل أنت متأكد من حذف هذا العنصر نهائياً؟ هذا الإجراء لا يمكن التراجع عنه!',
        async () => {
            try {
                const response = await fetch(`${apiBase}/api/super-admin/permanent-delete/${tableType}/${itemId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${getToken()}`
                    }
                });
                
                if (!response.ok) {
                    throw new Error('فشل في حذف العنصر نهائياً');
                }
                
                showAlert('success', 'تم حذف العنصر نهائياً');
                loadDeletedItems();
                loadStatistics(); // Refresh stats
                
            } catch (error) {
                console.error('Error deleting item permanently:', error);
                showAlert('error', 'فشل في الحذف النهائي: ' + error.message);
            }
        }
    );
}

// Handle bulk actions
function handleBulkAction(action) {
    const isRestore = action === 'restore';
    const title = isRestore ? 'استرجاع جميع العناصر' : 'حذف جميع العناصر نهائياً';
    
    let message;
    if (currentTable === 'all') {
        message = isRestore 
            ? 'هل أنت متأكد من استرجاع جميع العناصر المحذوفة من جميع الجداول؟'
            : 'هل أنت متأكد من حذف جميع العناصر المحذوفة من جميع الجداول نهائياً؟ هذا الإجراء لا يمكن التراجع عنه!';
    } else {
        message = isRestore 
            ? `هل أنت متأكد من استرجاع جميع عناصر ${tableNames[currentTable]}؟`
            : `هل أنت متأكد من حذف جميع عناصر ${tableNames[currentTable]} نهائياً؟ هذا الإجراء لا يمكن التراجع عنه!`;
    }
    
    showConfirmModal(title, message, () => {
        if (isRestore) {
            restoreAllItems();
        } else {
            deleteAllItems();
        }
    });
}

// Restore all items for current table
async function restoreAllItems() {
    try {
        let endpoint;
        if (currentTable === 'all') {
            endpoint = `${apiBase}/api/super-admin/restore-all`;
        } else {
            endpoint = `${apiBase}/api/super-admin/restore-all/${currentTable}`;
        }
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('فشل في استرجاع جميع العناصر');
        }
        
        const result = await response.json();
        showAlert('success', result.message);
        loadDeletedItems();
        loadStatistics(); // Refresh stats
        
    } catch (error) {
        console.error('Error restoring all items:', error);
        showAlert('error', 'فشل في استرجاع جميع العناصر: ' + error.message);
    }
}

// Delete all items permanently for current table
async function deleteAllItems() {
    try {
        let endpoint;
        if (currentTable === 'all') {
            endpoint = `${apiBase}/api/super-admin/permanent-delete-all`;
        } else {
            endpoint = `${apiBase}/api/super-admin/permanent-delete-all/${currentTable}`;
        }
        
        const response = await fetch(endpoint, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        if (!response.ok) {
            throw new Error('فشل في حذف جميع العناصر نهائياً');
        }
        
        const result = await response.json();
        showAlert('success', result.message);
        loadDeletedItems();
        loadStatistics(); // Refresh stats
        
    } catch (error) {
        console.error('Error deleting all items:', error);
        showAlert('error', 'فشل في الحذف النهائي للجميع: ' + error.message);
    }
}

// Show confirmation modal
function showConfirmModal(title, message, onConfirm) {
    // Check if modal elements exist
    if (!confirmModal || !modalTitle || !modalMessage || !confirmBtn) {
        console.error('Modal elements not found');
        return;
    }
    
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmModal.style.display = 'block';
    
    // Remove any existing event listeners
    const newConfirmBtn = confirmBtn.cloneNode(true);
    if (confirmBtn.parentNode) {
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        // Update the global reference
        Object.defineProperty(window, 'confirmBtn', {
            value: newConfirmBtn,
            writable: true
        });
        
        // Add new event listener
        newConfirmBtn.addEventListener('click', () => {
            closeModal();
            onConfirm();
        });
    }
}

// Close modal
function closeModal() {
    confirmModal.style.display = 'none';
}

// Show alert message
function showAlert(type, message) {
    const alertClass = type === 'error' ? 'alert-danger' : 
                     type === 'success' ? 'alert-success' : 
                     type === 'warning' ? 'alert-warning' : 'alert-info';
    
    const alertHTML = `
        <div class="alert ${alertClass}">
            <strong>${message}</strong>
            <button type="button" onclick="this.parentElement.remove()" style="float: left; background: none; border: none; font-size: 18px; cursor: pointer;">&times;</button>
        </div>
    `;
    
    alertContainer.innerHTML = alertHTML;
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        const alert = alertContainer.querySelector('.alert');
        if (alert) {
            alert.remove();
        }
    }, 5000);
}

// Show loading state
function showLoading(container) {
    container.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i>
            <p>جارٍ التحميل...</p>
        </div>
    `;
}

// Get auth token
function getToken() {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
}

// Check authentication on page load
document.addEventListener('DOMContentLoaded', async function() {
    const token = getToken();
    if (!token) {
        window.location.href = '/html/login.html';
        return;
    }
    
    // Check if user is admin
    try {
        const payload = await safeGetUserInfo(token);
        if (payload.role !== 'admin') {
            showAlert('error', 'غير مسموح - يتطلب صلاحيات السوبر أدمن');
            setTimeout(() => {
                window.location.href = '/html/dashboard.html';
            }, 2000);
            return;
        }
    } catch (error) {
        console.error('Invalid token:', error);
        window.location.href = '/html/login.html';
        return;
    }
});
