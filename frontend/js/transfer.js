document.addEventListener('DOMContentLoaded', function() {
    const personCount = document.getElementById('personCount');
    const personsFields = document.getElementById('personsFields');
    const personsChain = document.getElementById('personsChain');

    function renderPersonFields(count) {
        personsFields.innerHTML = '';
        for (let i = 1; i <= count; i++) {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('label');
            label.textContent = `اختر اسم الشخص ${i}`;
            const select = document.createElement('select');
            select.innerHTML = `<option value="">اختر الشخص</option>
                <option value="أحمد محمد">أحمد محمد</option>
                <option value="سارة خالد">سارة خالد</option>
                <option value="محمد عبدالله">محمد عبدالله</option>
                <option value="منى علي">منى علي</option>
                <option value="عمر يوسف">عمر يوسف</option>`;
            select.name = `person${i}`;
            select.className = 'person-select';
            group.appendChild(label);
            group.appendChild(select);
            personsFields.appendChild(group);
        }
        renderPersonsChain(count);
        document.querySelectorAll('.person-select').forEach(sel => {
            sel.addEventListener('change', () => renderPersonsChain(count));
        });
    }

    function renderPersonsChain(count) {
        personsChain.innerHTML = '';
        const names = [];
        document.querySelectorAll('.person-select').forEach(sel => {
            names.push(sel.value || `الشخص ${names.length+1}`);
        });
        for (let i = 0; i < count; i++) {
            const node = document.createElement('div');
            node.className = 'person-node';
            node.innerHTML = `
                <div class="person-circle"><i class="fa fa-user"></i></div>
                <div class="person-name">${names[i] || `الشخص ${i+1}`}</div>
                <div class="person-role">${getRole(names[i])}</div>
            `;
            personsChain.appendChild(node);
            if (i < count - 1) {
                // خط متقطع مع سهم
                const arrowLine = document.createElement('div');
                arrowLine.className = 'arrow-line';
                arrowLine.innerHTML = '<div class="dashed"></div><div class="arrow-head"></div>';
                personsChain.appendChild(arrowLine);
            }
        }
    }

    function getRole(name) {
        switch(name) {
            case 'أحمد محمد': return 'مدير القسم';
            case 'سارة خالد': return 'مراجع الجودة';
            case 'محمد عبدالله': return 'منسق القسم';
            case 'منى علي': return 'مدقق داخلي';
            case 'عمر يوسف': return 'رئيس شعبة';
            default: return 'اختر الدور';
        }
    }

    personCount.addEventListener('change', function() {
        const count = parseInt(this.value);
        if (count > 0) {
            renderPersonFields(count);
        } else {
            personsFields.innerHTML = '';
            personsChain.innerHTML = '';
        }
    });

    window.submitTransfer = function() {
        alert('تم تأكيد التحويل!');
    }
}); 