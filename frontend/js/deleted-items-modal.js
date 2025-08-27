/**
 * Deleted Items Modal - Modal for displaying deleted items
 * This file provides functionality for showing deleted items in a popup modal
 * instead of redirecting to a separate page.
 */

class DeletedItemsModal {
    constructor() {
        this.modal = null;
        this.currentPageType = null;
        this.apiBase = 'http://localhost:3006/api'; // Backend API base URL
        this.init();
    }

    init() {
        this.createModal();
        this.bindEvents();
    }

    createModal() {
        // Create modal HTML structure
        const modalHTML = `
            <div id="deletedItemsModal" class="deleted-items-modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 data-translate="deleted-items">ما تم حذفه</h2>
                        <button class="modal-close" id="modalClose">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-loading">
                            <div class="spinner"></div>
                            <p data-translate="loading">جاري التحميل...</p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" id="modalCancel" data-translate="close">إغلاق</button>
                    </div>
                </div>
            </div>
        `;

        // Insert modal into DOM
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.modal = document.getElementById('deletedItemsModal');
    }

    bindEvents() {
        // Close modal events
        document.getElementById('modalClose').addEventListener('click', () => this.hide());
        document.getElementById('modalCancel').addEventListener('click', () => this.hide());
        
        // Close modal when clicking outside
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    show(pageType) {
        this.currentPageType = pageType;
        this.modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        this.loadDeletedItems(pageType);
    }

    hide() {
        this.modal.classList.remove('show');
        document.body.style.overflow = '';
        this.currentPageType = null;
    }

    isVisible() {
        return this.modal.classList.contains('show');
    }

    async loadDeletedItems(pageType) {
        const modalBody = this.modal.querySelector('.modal-body');
        
        console.log('🔍 Loading deleted items for page type:', pageType);
        
        try {
            // Show loading state
            modalBody.innerHTML = `
                <div class="modal-loading">
                    <div class="spinner"></div>
                    <p data-translate="loading">جاري التحميل...</p>
                </div>
            `;

            // Fetch deleted items from backend API
            const deletedItems = await this.fetchDeletedItems(pageType);
            
            console.log('🔍 Fetched deleted items:', deletedItems);
            
            if (deletedItems && deletedItems.length > 0) {
                this.renderDeletedItems(deletedItems, pageType);
            } else {
                this.showNoItems();
            }
        } catch (error) {
            console.error('Error loading deleted items:', error);
            this.showError('error-loading-data');
        }
    }

    async fetchDeletedItems(pageType) {
        try {
            let endpoint = '';
            
            // Determine the appropriate API endpoint based on page type
            switch (pageType) {
                case 'departments':
                    endpoint = '/deleted-items/departments';
                    break;
                case 'committees':
                    endpoint = '/deleted-items/committees';
                    break;
                case 'protocols':
                    endpoint = '/deleted-items/protocols';
                    break;
                case 'content':
                    endpoint = '/deleted-items/contents';
                    break;
                case 'tickets':
                    endpoint = '/deleted-items/tickets';
                    break;
                default:
                    console.warn('Unknown page type:', pageType);
                    return [];
            }

            // Get token from localStorage
            const token = localStorage.getItem('token');
            console.log('🔍 Token from localStorage:', token ? 'Token exists' : 'No token');
            
            if (!token) {
                console.error('No authentication token found');
                return [];
            }

            console.log('🔍 Making request to:', `${this.apiBase}${endpoint}`);
            
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('🔍 Response status:', response.status);
            console.log('🔍 Response ok:', response.ok);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('🔍 Response data:', data);
            
            // الباك إند يرسل البيانات في data.data
            return data.data || data.deletedItems || data || [];

        } catch (error) {
            console.error('Error fetching deleted items from API:', error);
            
            // Fallback to mock data if API fails (for development/testing)
            console.log('Falling back to mock data due to API error');
            return this.getMockData(pageType);
        }
    }

    getMockData(pageType) {
        // Fallback mock data in case API is not available
        const mockData = {
            'departments': [
                { id: 1, name: 'قسم الطب الباطني', deletedAt: '2024-01-15', deletedBy: 'أحمد محمد' },
                { id: 2, name: 'قسم الجراحة', deletedAt: '2024-01-14', deletedBy: 'فاطمة علي' }
            ],
            'committees': [
                { id: 1, name: 'لجنة الجودة', deletedAt: '2024-01-13', deletedBy: 'خالد عبدالله' }
            ],
            'protocols': [
                { id: 1, name: 'بروتوكول العلاج', deletedAt: '2024-01-12', deletedBy: 'سارة أحمد' },
                { id: 2, name: 'بروتوكول الطوارئ', deletedAt: '2024-01-11', deletedBy: 'محمد علي' }
            ],
            'content': [
                { id: 1, name: 'ملف الميزانية', type: 'PDF', deletedAt: '2024-01-10', deletedBy: 'علي حسن' },
                { id: 2, name: 'مجلد التقارير', type: 'Folder', deletedAt: '2024-01-09', deletedBy: 'نورا سعد' }
            ],
            'tickets': [
                { id: 1, name: 'تذكرة صيانة الطوارئ', deletedAt: '2024-01-08', deletedBy: 'أحمد محمد' },
                { id: 2, name: 'تذكرة طلب معدات', deletedAt: '2024-01-07', deletedBy: 'فاطمة علي' }
            ]
        };

        return mockData[pageType] || [];
    }

    renderDeletedItems(items, pageType) {
        const modalBody = this.modal.querySelector('.modal-body');
        
        const itemsHTML = items.map(item => {
            console.log('🔍 Processing item:', item);
            
            const itemType = this.getItemTypeText(item, pageType);
            
            // معالجة العنوان - إذا كان JSON object، استخراج النص العربي
            let itemName = item.name || item.title || item.username || `ID: ${item.id}`;
            if (typeof itemName === 'string' && itemName.startsWith('{')) {
                try {
                    const nameObj = JSON.parse(itemName);
                    itemName = nameObj.ar || nameObj.en || itemName;
                } catch (e) {
                    // إذا فشل في parse، استخدم النص كما هو
                    console.log('🔍 Failed to parse name JSON:', e);
                }
            }
            
            const deletedBy = item.deleted_by_username || item.deleted_by || 'غير معروف';
            const deletedAt = item.deleted_at || item.deletedAt;
            
            console.log('🔍 Item name processed:', itemName);
            console.log('🔍 Deleted by:', deletedBy);
            console.log('🔍 Deleted at:', deletedAt);
            
            return `
                <div class="deleted-item" data-id="${item.id}">
                    <div class="deleted-item-info">
                        <div class="deleted-item-name">${itemName}</div>
                        <div class="deleted-item-details">
                            ${itemType} • ${this.formatDate(deletedAt)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        modalBody.innerHTML = `
            <ul class="deleted-items-list">
                ${itemsHTML}
            </ul>
        `;
        
        // Apply translations if available
        if (typeof applyTranslations === 'function') {
            applyTranslations();
        }
    }

    getItemTypeText(item, pageType) {
        console.log('🔍 Getting item type for pageType:', pageType, 'item:', item);
        
        const typeMap = {
            'departments': this.translate('department'),
            'committees': this.translate('committee'),
            'protocols': this.translate('protocol'),
            'content': this.getContentTypeText(item),
            'tickets': this.translate('ticket')
        };
        
        const result = typeMap[pageType] || this.translate('item');
        console.log('🔍 Item type result:', result);
        console.log('🔍 Available pageTypes:', Object.keys(typeMap));
        
        return result;
    }

    getContentTypeText(item) {
        // تحديد نوع المحتوى بناءً على البيانات
        if (item.type) return item.type;
        if (item.file_type) return item.file_type;
        if (item.folder_id) return this.translate('file');
        if (item.committee_id) return this.translate('committee-content');
        return this.translate('file');
    }

    showNoItems() {
        const modalBody = this.modal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div class="no-deleted-items">
                <i class="fas fa-trash"></i>
                <p data-translate="no-deleted-items">لا توجد عناصر محذوفة</p>
            </div>
        `;
        
        // Apply translations if available
        if (typeof applyTranslations === 'function') {
            applyTranslations();
        }
    }

    showError(translationKey = 'error-loading-data') {
        const modalBody = this.modal.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div class="no-deleted-items">
                <i class="fas fa-exclamation-triangle"></i>
                <p data-translate="${translationKey}">حدث خطأ أثناء تحميل البيانات</p>
            </div>
        `;
        
        // Apply translations if available
        if (typeof applyTranslations === 'function') {
            applyTranslations();
        }
    }

    formatDate(dateString) {
        if (!dateString) return 'غير محدد';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'غير محدد';
            
            return date.toLocaleDateString('ar-SA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            console.error('Error formatting date:', error);
            return 'غير محدد';
        }
    }

    translate(key) {
        // Use the global translation system if available
        if (typeof getTranslation === 'function') {
            return getTranslation(key);
        }
        
        // Fallback to simple translations if global system is not available
        const translations = {
            'loading': 'جاري التحميل...',
            'close': 'إغلاق',
            'department': 'قسم',
            'committee': 'لجنة',
            'protocol': 'محضر',
            'ticket': 'تذكرة',
            'file': 'ملف',
            'item': 'عنصر',
            'deleted-by': 'تم الحذف بواسطة',
            'no-deleted-items': 'لا توجد عناصر محذوفة',
            'error-loading': 'حدث خطأ أثناء تحميل البيانات'
        };
        
        return translations[key] || key;
    }
}

// Export for use in other files
window.DeletedItemsModal = DeletedItemsModal;

// Apply translations when the modal is created
document.addEventListener('DOMContentLoaded', () => {
    if (typeof applyTranslations === 'function') {
        applyTranslations();
    }
});
