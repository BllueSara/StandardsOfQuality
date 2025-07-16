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

    // ترجمة
    function getTranslation(key) {
        const lang = localStorage.getItem('language') || 'ar';
        const translations = window.translations || {};
        return translations[lang]?.[key] || key;
    }

    async function fetchApprovalSequence(departmentId) {
        const res = await fetch(`${apiBase}/departments/${departmentId}/approval-sequence`);
        const data = await res.json();
        return data.approval_sequence || [];
    }

    async function saveApprovalSequence(departmentId, sequence) {
        await fetch(`${apiBase}/departments/${departmentId}/approval-sequence`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approval_sequence: sequence })
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
            departmentUsers = [];
        }
        // جلب التسلسل المحفوظ
        const sequence = await fetchApprovalSequence(deptId);
        if (sequence.length) {
            // اضبط عدد الأشخاص تلقائيًا حسب التسلسل (آخر عنصر غالبًا للجودة)
            const personsCountValue = sequence.length > 1 ? sequence.length - 1 : 1;
            personCount.value = personsCountValue;
            await renderPersonFields(personsCountValue);
            setTimeout(() => {
                document.querySelectorAll('.person-select').forEach((select, idx) => {
                    if (sequence[idx]) select.value = sequence[idx];
                });
                const qualitySelect = document.getElementById('qualityUserSelect');
                if (qualitySelect && sequence.length > document.querySelectorAll('.person-select').length) {
                    qualitySelect.value = sequence[sequence.length - 1];
                }
                renderPersonsChain(personsCountValue);
            }, 0);
        } else {
            // إذا لا يوجد تسلسل، أبقِ السلوك كما هو
            const count = parseInt(personCount.value);
            if (count > 0) {
                await renderPersonFields(count);
            }
        }
    });

    async function renderPersonFields(count) {
        personsFields.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const group = document.createElement('div');
            group.className = 'form-group';
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
            group.appendChild(label);
            group.appendChild(select);
            personsFields.appendChild(group);
        }
        await renderPersonsChain(count);
        document.querySelectorAll('.person-select').forEach(sel => {
            sel.addEventListener('change', () => renderPersonsChain(count));
        });
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
            return [];
        }
    }

    // عنصر اختيار شخص من قسم الجودة فوق السلسلة
    let qualityUserSelectDiv = null;

    async function renderQualityUserSelect() {
        // إزالة العنصر القديم إذا وجد
        if (qualityUserSelectDiv && qualityUserSelectDiv.parentNode) {
            qualityUserSelectDiv.parentNode.removeChild(qualityUserSelectDiv);
        }
        qualityUserSelectDiv = document.createElement('div');
        qualityUserSelectDiv.className = 'quality-user-select-group';
        qualityUserSelectDiv.style.marginBottom = '18px';
        qualityUserSelectDiv.innerHTML = `
            <label style="font-weight:600;display:block;margin-bottom:8px;">
                ${getTranslation('select-quality-person')} <span style='color:red;'>*</span>
            </label>
            <select id="qualityUserSelect" class="person-select-quality" style="width:100%;max-width:300px;" required>
                <option value="">${getTranslation('select-person')}</option>
            </select>
        `;
        personsChain.parentNode.insertBefore(qualityUserSelectDiv, personsChain);
        // جلب الأشخاص من قسم الجودة وتعبئة القائمة
        const qualityUsers = await fetchQualityUsers();
        window.qualityUsers = qualityUsers; // حفظهم في window لاستخدامهم لاحقاً في عرض الاسم
        const select = qualityUserSelectDiv.querySelector('#qualityUserSelect');
        qualityUsers.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.textContent = user.name;
            select.appendChild(opt);
        });
        select.addEventListener('change', () => renderPersonsChain(parseInt(personCount.value)));
    }

    async function renderPersonsChain(count) {
        personsChain.innerHTML = '';
        const names = [];
        document.querySelectorAll('.person-select').forEach(sel => {
            // بدلاً من دفع الـ id مباشرة، جلب الاسم من departmentUsers أو qualityUsers
            const userId = sel.value;
            let userName = userId;
            if (userId) {
                let userObj = departmentUsers.find(u => u.id == userId);
                if (!userObj && window.qualityUsers) {
                    userObj = window.qualityUsers.find(u => u.id == userId);
                }
                if (userObj) {
                    userName = userObj.name;
                } else {
                    userName = getTranslation('unknown');
                }
            }
            names.push(userName || `${getTranslation('person')} ${names.length+1}`);
        });
        // أضف الأشخاص المختارين من القسم
        for (let i = 0; i < count; i++) {
            const node = document.createElement('div');
            node.className = 'person-node';
            node.innerHTML = `
                <div class=\"person-circle\"><i class=\"fa fa-user\"></i></div>
                <div class=\"person-name\">${names[i] || `${getTranslation('person')} ${i+1}`}</div>
            `;
            personsChain.appendChild(node);
            // سهم بين الأشخاص
            const isLastPerson = (i === count - 1);
            if (!isLastPerson) {
                const arrowLine = document.createElement('div');
                arrowLine.className = 'arrow-line';
                arrowLine.innerHTML = '<div class=\"dashed\"></div><div class=\"arrow-head\"></div>';
                personsChain.appendChild(arrowLine);
            }
        }
        // أضف الشخص المختار من الجودة (من الدروب داون فوق)
        const qualitySelect = document.getElementById('qualityUserSelect');
        if (count > 0 && qualitySelect && qualitySelect.value) {
            // جلب اسم الشخص من qualityUsers إذا متوفر
            let qualityName = qualitySelect.value;
            if (window.qualityUsers && Array.isArray(window.qualityUsers)) {
                const qUser = window.qualityUsers.find(u => u.id == qualitySelect.value);
                if (qUser) qualityName = qUser.name;
            }
            const arrowLine = document.createElement('div');
            arrowLine.className = 'arrow-line';
            arrowLine.innerHTML = '<div class="dashed"></div><div class="arrow-head"></div>';
            personsChain.appendChild(arrowLine);

            const qualityNode = document.createElement('div');
            qualityNode.className = 'person-node';
            qualityNode.innerHTML = `
                <div class="person-circle"><i class="fa fa-user"></i></div>
                <div class="person-name">${qualityName}</div>
            `;
            personsChain.appendChild(qualityNode);
        }
        // أضف مدير المستشفى
        if (count > 0) {
            const arrowLine2 = document.createElement('div');
            arrowLine2.className = 'arrow-line';
            arrowLine2.innerHTML = '<div class="dashed"></div><div class="arrow-head"></div>';
            personsChain.appendChild(arrowLine2);

            const managerNode = document.createElement('div');
            managerNode.className = 'person-node';
            managerNode.innerHTML = `
                <div class="person-circle"><i class="fa fa-user"></i></div>
                <div class="person-name">${getTranslation('hospital-manager')}</div>
            `;
            personsChain.appendChild(managerNode);
        }
    }

    async function fetchDepartments() {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${apiBase}/departments`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || getTranslation('error-loading'));

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
        document.querySelectorAll('.person-select').forEach(select => {
            if (select.value) sequence.push(select.value);
        });
        const qualitySelect = document.getElementById('qualityUserSelect');
        if (qualitySelect && qualitySelect.value) sequence.push(qualitySelect.value);
        await saveApprovalSequence(deptId, sequence);
        alert(getTranslation('transfer-confirmed'));
        // أكمل منطق التحويل الحالي إذا لزم...
    }

    // استدعِ اختيار الجودة عند تحميل الصفحة
    renderQualityUserSelect();

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
            renderQualityUserSelect();
            if (personCount.value > 0) renderPersonFields(parseInt(personCount.value));
        }
    });
}); 