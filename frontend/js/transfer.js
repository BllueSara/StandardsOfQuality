document.addEventListener('DOMContentLoaded', function() {
    const personCount = document.getElementById('personCount');
    // تعبئة خيارات عدد الأشخاص (من 1 إلى 5)
    for (let i = 1; i <= 5; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        personCount.appendChild(opt);
    }
    const personsFields = document.getElementById('personsFields');
    const personsChain = document.getElementById('personsChain');
    const departmentSelect = document.getElementById('departmentSelect');
    const apiBase = 'http://localhost:3006/api';

    let departmentUsers = [];

    // Toast notification function
    function showToast(message, type = 'info', duration = 3000) {
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            document.body.appendChild(toastContainer);
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        toastContainer.appendChild(toast);

        // Force reflow to ensure animation plays from start
        toast.offsetWidth;

        // Set a timeout to remove the toast
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            // Remove element after animation completes
            setTimeout(() => {
                toast.remove();
            }, 500); // Should match CSS animation duration
        }, duration);
    }

    // ترجمة
    function getTranslation(key) {
        const lang = localStorage.getItem('language') || 'ar';
        const translations = window.translations || {};
        return translations[lang]?.[key] || key;
    }

    async function fetchApprovalSequence(departmentId) {
        const res = await fetch(`${apiBase}/departments/${departmentId}/approval-sequence`);
        const data = await res.json();
        return {
            approval_sequence: data.approval_sequence || [],
            approval_roles: data.approval_roles || []
        };
    }

    async function saveApprovalSequence(departmentId, sequence, roles) {
        await fetch(`${apiBase}/departments/${departmentId}/approval-sequence`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                approval_sequence: sequence,
                approval_roles: roles 
            })
        });
    }

    // عند اختيار قسم، جلب السلسلة وملء الدروب داون تلقائياً
    departmentSelect.addEventListener('change', async function(e) {
        const deptId = this.value;
        personsFields.innerHTML = '';
        personsChain.innerHTML = '';
        departmentUsers = [];
        if (!deptId) return;
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiBase}/users?departmentId=${deptId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || getTranslation('error-loading'));
            departmentUsers = data.data || [];
        } catch (err) {
            console.error(getTranslation('error-loading'), err);
            showToast(getTranslation('error-loading'), 'error');
            departmentUsers = [];
        }
        // جلب التسلسل المحفوظ
        const { approval_sequence, approval_roles } = await fetchApprovalSequence(deptId);
        // جلب مستخدمي الجودة ومدير المستشفى
        const qualityUsers = await fetchQualityUsers();
        window.qualityUsers = qualityUsers;
        let managerId = null;
        let managerObj = null;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${apiBase}/users/hospital-manager`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.status === 'success' && data.data && data.data.id) {
                managerId = data.data.id;
                managerObj = data.data;
            }
        } catch {}
        window.managerObj = managerObj;
        if (approval_sequence.length) {
            // استخرج الأشخاص العاديين والجودة والمدير من sequence
            let normalIds = [];
            let qualityIds = [];
            let managerInSeq = false;
            approval_sequence.forEach(id => {
                if (managerId && id == managerId) managerInSeq = true;
                else if (qualityUsers.find(u => u.id == id)) qualityIds.push(id);
                else normalIds.push(id);
            });
            // لا تضبط personCount.value تلقائيًا!
            // qualityPersonCount = qualityIds.length > 0 ? qualityIds.length : 1;
            await renderPersonFields(parseInt(personCount.value) || normalIds.length || 1);
            await renderQualityUserSelects();
            // عيّن القيم في قوائم الأشخاص العاديين
            document.querySelectorAll('.person-select').forEach((select, idx) => {
                if (normalIds[idx]) select.value = normalIds[idx];
            });
            // عيّن القيم في قوائم الجودة
            for (let i = 1; i <= qualityPersonCount; i++) {
                const select = document.getElementById(`qualityUserSelect${i}`);
                if (select && qualityIds[i-1]) select.value = qualityIds[i-1];
            }
            // عيّن الأدوار للأشخاص العاديين
            document.querySelectorAll('.person-select').forEach((select, idx) => {
                if (normalIds[idx] && approval_roles[idx]) {
                    const roleSelect = document.querySelector(`select[name="person${idx + 1}Role"]`);
                    if (roleSelect) roleSelect.value = approval_roles[idx];
                }
            });
            // عيّن الأدوار لأشخاص الجودة
            for (let i = 1; i <= qualityPersonCount; i++) {
                const select = document.getElementById(`qualityUserSelect${i}`);
                if (select && qualityIds[i-1]) {
                    const roleIndex = approval_sequence.indexOf(qualityIds[i-1]);
                    if (roleIndex !== -1 && approval_roles[roleIndex]) {
                        const roleSelect = document.getElementById(`qualityUserRole${i}`);
                        if (roleSelect) roleSelect.value = approval_roles[roleIndex];
                    }
                }
            }
            renderPersonsChain(approval_sequence, approval_roles, departmentUsers, qualityUsers, managerObj);
        } else {
            // إذا لا يوجد تسلسل، أبقِ السلوك كما هو
            const count = parseInt(personCount.value);
            if (count > 0) {
                await renderPersonFields(count);
                await renderQualityUserSelects();
            }
        }
    });

    async function renderPersonFields(count) {
        personsFields.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const group = document.createElement('div');
            group.className = 'form-group';
            group.style.marginBottom = '15px';
            
            const label = document.createElement('label');
            label.textContent = `${getTranslation('select-person')} ${i}`;
            
            const select = document.createElement('select');
            select.name = `person${i}`;
            select.className = 'person-select';
            select.innerHTML = `<option value="">${getTranslation('select-person')}</option>`;
            
            // عبئ الخيارات من departmentUsers
            departmentUsers.forEach(user => {
                const opt = document.createElement('option');
                opt.value = user.id;
                opt.textContent = user.name;
                select.appendChild(opt);
            });
            
            // إضافة اختيار الدور
            const roleSelect = document.createElement('select');
            roleSelect.name = `person${i}Role`;
            roleSelect.className = 'person-role-select';
            roleSelect.style.marginTop = '8px';
            roleSelect.style.width = '100%';
            roleSelect.innerHTML = `
                <option value="">${getTranslation('select-role') || 'اختر الدور'}</option>
                <option value="prepared">${getTranslation('prepared') || 'Prepared'}</option>
                <option value="updated">${getTranslation('updated') || 'Updated'}</option>
                <option value="reviewed">${getTranslation('reviewed') || 'Reviewed'}</option>
                <option value="approved">${getTranslation('approved') || 'Approved'}</option>
            `;
            
            group.appendChild(label);
            group.appendChild(select);
            group.appendChild(roleSelect);
            personsFields.appendChild(group);
        }
        
        // عند كل تغيير، أعد بناء السلسلة من القيم المختارة
        function updateChain() {
            const currentSequence = [];
            const currentRoles = [];
            
            document.querySelectorAll('.person-select').forEach((select, index) => {
                if (select.value) {
                    currentSequence.push(select.value);
                    const roleSelect = document.querySelector(`select[name="person${index + 1}Role"]`);
                    currentRoles.push(roleSelect ? roleSelect.value : '');
                }
            });
            
            for (let i = 1; i <= qualityPersonCount; i++) {
                const select = document.getElementById(`qualityUserSelect${i}`);
                if (select && select.value) {
                    currentSequence.push(select.value);
                    const roleSelect = document.getElementById(`qualityUserRole${i}`);
                    currentRoles.push(roleSelect ? roleSelect.value : '');
                }
            }
            
            if (window.managerObj && window.managerObj.id && !currentSequence.includes(window.managerObj.id)) {
                currentSequence.push(window.managerObj.id);
                currentRoles.push('approved'); // المدير دائماً approved
            }
            
            renderPersonsChain(currentSequence, currentRoles, departmentUsers, window.qualityUsers, window.managerObj);
        }
        
        document.querySelectorAll('.person-select, .person-role-select').forEach(sel => {
            sel.addEventListener('change', updateChain);
        });
        
        updateChain();
    }

    async function fetchQualityUsers() {
        // جلب الأشخاص من قسم الجودة (departmentId=9)
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiBase}/users?departmentId=9`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || getTranslation('error-loading'));
            return data.data || [];
        } catch (err) {
            console.error(getTranslation('error-loading'), err);
            showToast(getTranslation('error-loading'), 'error');
            return [];
        }
    }

    // عنصر اختيار عدد الأشخاص من قسم الجودة
    let qualityPersonCountSelect = null;
    let qualityUserSelectDiv = null;
    let qualityPersonCount = 1; // default

    async function renderQualityUserSelects() {
        // إزالة العناصر القديمة إذا وجدت
        if (qualityUserSelectDiv && qualityUserSelectDiv.parentNode) {
            qualityUserSelectDiv.parentNode.removeChild(qualityUserSelectDiv);
        }
        if (qualityPersonCountSelect && qualityPersonCountSelect.parentNode) {
            qualityPersonCountSelect.parentNode.removeChild(qualityPersonCountSelect);
        }
        // عنصر اختيار عدد الأشخاص
        qualityPersonCountSelect = document.createElement('div');
        qualityPersonCountSelect.className = 'quality-person-count-group';
        qualityPersonCountSelect.style.marginBottom = '10px';
        qualityPersonCountSelect.innerHTML = `
            <label style="font-weight:600;display:block;margin-bottom:8px;">
                ${getTranslation('select-quality-person-count')}
            </label>
            <select id="qualityPersonCountSelect" style="width:100%;max-width:120px;">
                ${[1,2,3,4,5].map(i => `<option value="${i}">${i}</option>`).join('')}
            </select>
        `;
        personsChain.parentNode.insertBefore(qualityPersonCountSelect, personsChain);
        // عنصر اختيار الأشخاص من الجودة
        qualityUserSelectDiv = document.createElement('div');
        qualityUserSelectDiv.className = 'quality-user-select-group';
        qualityUserSelectDiv.style.marginBottom = '18px';
        qualityUserSelectDiv.innerHTML = '';
        personsChain.parentNode.insertBefore(qualityUserSelectDiv, personsChain);
        // جلب الأشخاص من قسم الجودة وتعبئة القوائم
        const qualityUsers = await fetchQualityUsers();
        window.qualityUsers = qualityUsers;
        // دالة رسم القوائم
        function renderQualityDropdowns(count) {
            qualityUserSelectDiv.innerHTML = '';
            for (let i = 1; i <= count; i++) {
                const group = document.createElement('div');
                group.className = 'form-group';
                group.style.marginBottom = '15px';
                
                const label = document.createElement('label');
                label.textContent = `${getTranslation('select-quality-person')} ${i}`;
                
                const select = document.createElement('select');
                select.name = `qualityPerson${i}`;
                select.className = 'person-select-quality';
                select.id = `qualityUserSelect${i}`;
                select.style = 'width:100%;max-width:300px;';
                select.required = true;
                select.innerHTML = `<option value="">${getTranslation('select-person')}</option>`;
                
                qualityUsers.forEach(user => {
                    const opt = document.createElement('option');
                    opt.value = user.id;
                    opt.textContent = user.name;
                    select.appendChild(opt);
                });
                
                // إضافة اختيار الدور لأشخاص الجودة
                const roleSelect = document.createElement('select');
                roleSelect.name = `qualityPerson${i}Role`;
                roleSelect.className = 'person-role-select';
                roleSelect.id = `qualityUserRole${i}`;
                roleSelect.style.marginTop = '8px';
                roleSelect.style.width = '100%';
                roleSelect.style.maxWidth = '300px';
                roleSelect.innerHTML = `
                    <option value="">${getTranslation('select-role') || 'اختر الدور'}</option>
                    <option value="prepared">${getTranslation('prepared') || 'Prepared'}</option>
                    <option value="updated">${getTranslation('updated') || 'Updated'}</option>
                    <option value="reviewed">${getTranslation('reviewed') || 'Reviewed'}</option>
                    <option value="approved">${getTranslation('approved') || 'Approved'}</option>
                `;
                
                group.appendChild(label);
                group.appendChild(select);
                group.appendChild(roleSelect);
                qualityUserSelectDiv.appendChild(group);
                
                // إضافة event listeners لكل من الشخص والدور
                [select, roleSelect].forEach(sel => {
                    sel.addEventListener('change', () => {
                        // عند كل تغيير، أعد بناء السلسلة من القيم المختارة
                        const currentSequence = [];
                        const currentRoles = [];
                        
                        document.querySelectorAll('.person-select').forEach((sel, idx) => {
                            if (sel.value) {
                                currentSequence.push(sel.value);
                                const roleSelect = document.querySelector(`select[name="person${idx + 1}Role"]`);
                                currentRoles.push(roleSelect ? roleSelect.value : '');
                            }
                        });
                        
                        for (let j = 1; j <= qualityPersonCount; j++) {
                            const qSelect = document.getElementById(`qualityUserSelect${j}`);
                            if (qSelect && qSelect.value) {
                                currentSequence.push(qSelect.value);
                                const roleSelect = document.getElementById(`qualityUserRole${j}`);
                                currentRoles.push(roleSelect ? roleSelect.value : '');
                            }
                        }
                        
                        if (window.managerObj && window.managerObj.id && !currentSequence.includes(window.managerObj.id)) {
                            currentSequence.push(window.managerObj.id);
                            currentRoles.push('approved');
                        }
                        
                        renderPersonsChain(currentSequence, currentRoles, departmentUsers, window.qualityUsers, window.managerObj);
                    });
                });
            }
        }
        // استمع لتغيير العدد
        const countSelect = qualityPersonCountSelect.querySelector('#qualityPersonCountSelect');
        countSelect.value = qualityPersonCount;
        countSelect.addEventListener('change', function() {
            qualityPersonCount = parseInt(this.value);
            renderQualityDropdowns(qualityPersonCount);
            // تمرير مصفوفة فارغة للأدوار عند تغيير العدد
            const currentSequence = [];
            const currentRoles = [];
            document.querySelectorAll('.person-select').forEach((select, index) => {
                if (select.value) {
                    currentSequence.push(select.value);
                    const roleSelect = document.querySelector(`select[name="person${index + 1}Role"]`);
                    currentRoles.push(roleSelect ? roleSelect.value : '');
                }
            });
            renderPersonsChain(currentSequence, currentRoles, departmentUsers, window.qualityUsers, window.managerObj);
        });
        renderQualityDropdowns(qualityPersonCount);
    }

    // تعديل renderPersonsChain ليأخذ sequence ويعرضهم بالترتيب
    function renderPersonsChain(sequence, roles, departmentUsers, qualityUsers, managerObj) {
        personsChain.innerHTML = '';
        if (!sequence || !Array.isArray(sequence)) return;
        
        // بناء مصفوفة الأشخاص مع أدوارهم
        let nodes = sequence.map((id, index) => {
            let userName = '';
            let icon = '<i class="fa fa-user"></i>';
            let isManager = false;
            let role = roles[index] || '';
            
            if (managerObj && id == managerObj.id) {
                userName = managerObj.name || getTranslation('hospital-manager');
                isManager = true;
                role = 'approved'; // المدير دائماً approved
            } else if (qualityUsers && qualityUsers.find(u => u.id == id)) {
                const qUser = qualityUsers.find(u => u.id == id);
                userName = qUser ? qUser.name : getTranslation('unknown');
            } else if (departmentUsers && departmentUsers.find(u => u.id == id)) {
                const dUser = departmentUsers.find(u => u.id == id);
                userName = dUser ? dUser.name : getTranslation('unknown');
            } else {
                userName = getTranslation('unknown');
            }
            
            return { id, userName, icon, isManager, role };
        });
        
        // إذا يوجد مدير، أزله مؤقتاً من السلسلة وأضفه في النهاية
        let managerNode = null;
        nodes = nodes.filter(n => {
            if (n.isManager) {
                managerNode = n;
                return false;
            }
            return true;
        });
        
        // تقسيم إلى صفوف كل صف فيه 3 أشخاص
        function chunkArray(arr, size) {
            const result = [];
            for (let i = 0; i < arr.length; i += size) {
                result.push(arr.slice(i, i + size));
            }
            return result;
        }
        
        const rows = chunkArray(nodes, 3);
        
        // رسم كل صف
        rows.forEach((rowNodes, rowIdx) => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'persons-chain-row';
            
            rowNodes.forEach((node, idx) => {
                if (rowIdx > 0 && idx === 0) {
                    // سهم بين آخر عنصر في الصف السابق وأول عنصر في الصف الحالي
                    const arrow = document.createElement('div');
                    arrow.className = 'arrow-line';
                    arrow.innerHTML = '<div class="dashed"></div><div class="arrow-head"></div>';
                    rowDiv.appendChild(arrow);
                }
                
                if (idx > 0) {
                    // سهم بين الأشخاص في نفس الصف
                    const arrow = document.createElement('div');
                    arrow.className = 'arrow-line';
                    arrow.innerHTML = '<div class="dashed"></div><div class="arrow-head"></div>';
                    rowDiv.appendChild(arrow);
                }
                
                const personNode = document.createElement('div');
                personNode.className = 'person-node';
                
                // إضافة الدور تحت اسم الشخص
                const roleBadge = node.role ? `<div class="role-badge role-${node.role}">${getRoleTranslation(node.role)}</div>` : '';
                
                personNode.innerHTML = `
                    <div class="person-circle">${node.icon}</div>
                    <div class="person-name">${node.userName}</div>
                    ${roleBadge}
                `;
                
                rowDiv.appendChild(personNode);
            });
            
            personsChain.appendChild(rowDiv);
        });
        
        // أضف المدير في النهاية (مع سهم إذا فيه أشخاص)
        if (managerNode) {
            if (rows.length > 0 && nodes.length > 0) {
                const lastRowDiv = personsChain.lastChild;
                const arrow = document.createElement('div');
                arrow.className = 'arrow-line';
                arrow.innerHTML = '<div class="dashed"></div><div class="arrow-head"></div>';
                lastRowDiv.appendChild(arrow);
                
                const managerDiv = document.createElement('div');
                managerDiv.className = 'person-node';
                const roleBadge = managerNode.role ? `<div class="role-badge role-${managerNode.role}">${getRoleTranslation(managerNode.role)}</div>` : '';
                managerDiv.innerHTML = `
                    <div class="person-circle no-bg">${managerNode.icon}</div>
                    <div class="person-name">${managerNode.userName}</div>
                    ${roleBadge}
                `;
                lastRowDiv.appendChild(managerDiv);
            } else {
                // إذا فقط المدير
                const rowDiv = document.createElement('div');
                rowDiv.className = 'persons-chain-row';
                const managerDiv = document.createElement('div');
                managerDiv.className = 'person-node';
                const roleBadge = managerNode.role ? `<div class="role-badge role-${managerNode.role}">${getRoleTranslation(managerNode.role)}</div>` : '';
                managerDiv.innerHTML = `
                    <div class="person-circle no-bg">${managerNode.icon}</div>
                    <div class="person-name">${managerNode.userName}</div>
                    ${roleBadge}
                `;
                rowDiv.appendChild(managerDiv);
                personsChain.appendChild(rowDiv);
            }
        }
        
        // إذا أكثر من 4 أضف كلاس multi-line-chain
        if (nodes.length > 4) {
            personsChain.classList.add('multi-line-chain');
        } else {
            personsChain.classList.remove('multi-line-chain');
        }
    }
    
    // دالة مساعدة لترجمة الأدوار
    function getRoleTranslation(role) {
        const roleTranslations = {
            'prepared': getTranslation('prepared') || 'Prepared',
            'updated': getTranslation('updated') || 'Updated',
            'reviewed': getTranslation('reviewed') || 'Reviewed',
            'approved': getTranslation('approved') || 'Approved'
        };
        return roleTranslations[role] || role;
    }

    async function fetchDepartments() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiBase}/departments/all`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || getTranslation('error-loading'));

            // التعامل مع الهيكل الجديد للبيانات
            const data = result.data || result;
            if (!Array.isArray(data)) {
                throw new Error('Invalid data format');
            }

            const lang = localStorage.getItem('language') || 'ar';
            const defaultText = getTranslation('select-department');
            departmentSelect.innerHTML = `<option value="">${defaultText}</option>`;

            data.forEach(dept => {
                let parsed;
                try {
                    parsed = JSON.parse(dept.name);
                } catch {
                    parsed = { ar: dept.name, en: dept.name };
                }
                const label = parsed[lang] ?? parsed.ar ?? parsed.en;
                const opt = document.createElement('option');
                opt.value = dept.id;
                opt.textContent = label;
                departmentSelect.appendChild(opt);
            });
        } catch (err) {
            console.error(err);
            showToast(getTranslation('error-loading'), 'error');
            departmentSelect.innerHTML = `<option value="">${getTranslation('error-loading')}</option>`;
        }
    }

    // Call fetchDepartments on page load
    fetchDepartments();

    // Update department list when language changes
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            fetchDepartments();
        }
    });

    personCount.addEventListener('change', async function() {
        const count = parseInt(this.value);
        if (count > 0) {
            await renderPersonFields(count);
        } else {
            personsFields.innerHTML = '';
            personsChain.innerHTML = '';
        }
    });

    window.submitTransfer = async function() {
        const deptId = departmentSelect.value;
        const sequence = [];
        const roles = [];
        
        // جمع الأشخاص العاديين مع أدوارهم
        document.querySelectorAll('.person-select').forEach((select, index) => {
            if (select.value) {
                sequence.push(select.value);
                const roleSelect = document.querySelector(`select[name="person${index + 1}Role"]`);
                roles.push(roleSelect ? roleSelect.value : '');
            }
        });
        
        // أضف جميع الأشخاص المختارين من الجودة مع أدوارهم
        for (let i = 1; i <= qualityPersonCount; i++) {
            const select = document.getElementById(`qualityUserSelect${i}`);
            if (select && select.value) {
                sequence.push(select.value);
                const roleSelect = document.getElementById(`qualityUserRole${i}`);
                roles.push(roleSelect ? roleSelect.value : '');
            }
        }
        
        // جلب مدير المستشفى من الباكند وإضافته للسلسلة فقط إذا لم يكن موجود
        let managerId = null;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${apiBase}/users/hospital-manager`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.status === 'success' && data.data && data.data.id) {
                managerId = data.data.id;
            }
        } catch {}
        
        if (managerId && !sequence.includes(managerId)) {
            sequence.push(managerId);
            roles.push('approved'); // المدير دائماً approved
        }
        
        // حفظ التسلسل مع الأدوار
        await saveApprovalSequence(deptId, sequence, roles);
        showToast(getTranslation('transfer-confirmed'), 'success');
        // أكمل منطق التحويل الحالي إذا لزم...
    }

    // استدعِ اختيار الجودة عند تحميل الصفحة
    renderQualityUserSelects();

    // تحديث النصوص عند تغيير اللغة
    window.addEventListener('storage', function(e) {
        if (e.key === 'language') {
            // إعادة تعيين النصوص الثابتة
            document.querySelectorAll('[data-translate]').forEach(element => {
                const key = element.getAttribute('data-translate');
                element.textContent = getTranslation(key);
            });
            document.querySelectorAll('[data-translate-placeholder]').forEach(element => {
                const key = element.getAttribute('data-translate-placeholder');
                element.placeholder = getTranslation(key);
            });
            fetchDepartments();
            renderQualityUserSelects();
            if (personCount.value > 0) renderPersonFields(parseInt(personCount.value));
        }
    });
}); 
