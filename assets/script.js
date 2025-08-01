// --- PWA Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => console.log('Service Worker registered: ', registration))
            .catch(err => console.log('Service Worker registration failed: ', err));
    });
}

// --- APPLICATION LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const state = {
        activeTab: 'synthèse',
        activeSheetId: null,
        incomes: [],
        fixedExpenses: [],
        sheets: [],
        settings: {
            password: null,
            isDarkMode: false,
        }
    };

    // --- UI ELEMENTS ---
    const appContainer = document.getElementById('app-container');
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');
    const sheetSelector = document.getElementById('sheet-selector');
    const newSheetBtn = document.getElementById('new-sheet-btn');

    // Summary UI
    const summaryIncomeEl = document.getElementById('summary-income');
    const summaryTotalExpensesEl = document.getElementById('summary-total-expenses');
    const summaryBalanceCard = document.getElementById('summary-balance-card');
    const summaryBalanceLabel = document.getElementById('summary-balance-label');
    const summaryBalanceEl = document.getElementById('summary-balance');
    const startingBalanceInput = document.getElementById('starting-balance-input');

    // Forms
    const incomeForm = document.getElementById('income-form');
    const fixedExpenseForm = document.getElementById('fixed-expense-form');
    const variableExpenseForm = document.getElementById('variable-expense-form');
    const createSheetForm = document.getElementById('create-sheet-form');

    // Lists
    const incomesList = document.getElementById('incomes-list');
    const fixedExpensesList = document.getElementById('fixed-expenses-list');
    const variableExpensesList = document.getElementById('variable-expenses-list');
    const variableIncomesList = document.getElementById('variable-incomes-list');

    // Modals
    const expensesModal = document.getElementById('expenses-modal');
    const createSheetModal = document.getElementById('create-sheet-modal');
    const passwordModal = document.getElementById('password-modal');
    const passwordForm = document.getElementById('password-form');
    const passwordPromptInput = document.getElementById('password-prompt-input');
    const passwordError = document.getElementById('password-error');

    // Settings UI
    const setPasswordSection = document.getElementById('set-password-section');
    const removePasswordSection = document.getElementById('remove-password-section');
    const newPasswordInput = document.getElementById('new-password-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');
    const currentPasswordInput = document.getElementById('current-password-input');
    const savePasswordBtn = document.getElementById('save-password-btn');
    const removePasswordBtn = document.getElementById('remove-password-btn');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const shareBtn = document.getElementById('share-btn');

    // --- LOCAL STORAGE ---
    const saveData = () => {
        try {
            localStorage.setItem('budgetAppData', JSON.stringify(state));
        } catch (error) {
            console.error("Could not save data to localStorage", error);
        }
    };

    const loadData = () => {
        const data = localStorage.getItem('budgetAppData');
        if (data) {
            try {
                const parsedData = JSON.parse(data);

                // --- Data Migration ---
                if (parsedData.sheets) {
                    parsedData.sheets.forEach(sheet => {
                        if (!sheet.monthlyIncomes) {
                            sheet.monthlyIncomes = {};
                            if (parsedData.incomes) {
                                parsedData.incomes.forEach(income => {
                                    if (income.type === 'fixe') {
                                        sheet.monthlyIncomes[income.id] = income.amount;
                                    }
                                });
                            }
                        }
                        if (sheet.startingBalance === undefined) sheet.startingBalance = 0;
                        if (!sheet.variableExpenses) sheet.variableExpenses = [];
                    });
                }
                if (parsedData.settings) {
                    parsedData.settings = {...state.settings, ...parsedData.settings};
                }

                Object.assign(state, parsedData);
            } catch (error) {
                console.error("Could not parse or migrate data from localStorage", error);
                localStorage.removeItem('budgetAppData');
            }
        }
    };

    // --- CORE LOGIC ---
    const formatCurrency = (value) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value || 0);
    const generateId = () => `id_${new Date().getTime()}_${Math.random().toString(36).substr(2, 9)}`;

    const render = () => {
        applyTheme();
        tabs.forEach(tab => tab.classList.toggle('active', tab.id === `tab-${state.activeTab}`));
        contents.forEach(content => content.classList.toggle('hidden', content.id !== `content-${state.activeTab}`));

        renderIncomesList();
        renderFixedExpensesList();

        renderSheetSelector();
        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
        if (activeSheet) {
            renderList(variableExpensesList, activeSheet.variableExpenses, 'variable');
            renderVariableIncomesForSheet();
            startingBalanceInput.value = activeSheet.startingBalance || '';
            startingBalanceInput.disabled = false;
        } else {
            variableExpensesList.innerHTML = '<li class="text-center text-gray-500">Veuillez créer ou sélectionner une feuille.</li>';
            variableIncomesList.innerHTML = '<li class="text-center text-gray-500">Veuillez créer ou sélectionner une feuille.</li>';
            startingBalanceInput.value = '';
            startingBalanceInput.disabled = true;
        }

        updateSummary();
        updateSettingsUI();
        saveData();
    };

    const renderList = (listElement, items, type) => {
        listElement.innerHTML = '';
        if (!items || items.length === 0) {
            listElement.innerHTML = '<li class="text-center" style="color: var(--muted-text-color);">Aucun élément.</li>';
            return;
        }
        items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center p-2 rounded-md';
            li.style.backgroundColor = 'var(--bg-color)';
            li.innerHTML = `
                <span>${item.name}</span>
                <div class="flex items-center gap-4">
                    <span class="font-semibold">${formatCurrency(item.amount)}</span>
                    <button class="btn btn-danger text-xs py-1 px-2" data-id="${item.id}" data-type="${type}">X</button>
                </div>
            `;
            listElement.appendChild(li);
        });
    };

    const renderIncomesList = () => {
        incomesList.innerHTML = '';
        if (state.incomes.length === 0) {
            incomesList.innerHTML = '<li class="text-center" style="color: var(--muted-text-color);">Aucun revenu ajouté.</li>';
            return;
        }

        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);

        state.incomes.forEach(item => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center p-2 rounded-md';
            li.style.backgroundColor = 'var(--bg-color)';
            const badgeClass = item.type === 'fixe' ? 'badge-blue' : 'badge-green';
            const badgeText = item.type === 'fixe' ? 'Fixe' : 'Variable';

            let amountText;
            if (item.type === 'fixe') {
                amountText = formatCurrency(item.amount);
            } else {
                const monthlyAmount = activeSheet?.monthlyIncomes?.[item.id];
                if (monthlyAmount !== undefined && monthlyAmount > 0) {
                    amountText = formatCurrency(monthlyAmount);
                } else {
                    amountText = 'À définir chaque mois';
                }
            }

            li.innerHTML = `
                <div>
                    <span>${item.name}</span>
                    <span class="badge ${badgeClass} ml-2">${badgeText}</span>
                </div>
                <div class="flex items-center gap-4">
                    <span class="font-semibold" style="color: var(--muted-text-color);">${amountText}</span>
                    <button class="btn btn-danger text-xs py-1 px-2" data-id="${item.id}" data-type="income">X</button>
                </div>
            `;
            incomesList.appendChild(li);
        });
    };

    const renderFixedExpensesList = () => {
        fixedExpensesList.innerHTML = '';

        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
        let referenceDateStr;

        if (activeSheet) {
            referenceDateStr = activeSheet.id;
        } else {
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            referenceDateStr = `${year}-${month}`;
        }

        const visibleFixedExpenses = state.fixedExpenses.filter(item => {
            return !item.endDate || item.endDate >= referenceDateStr;
        });

        if (!visibleFixedExpenses || visibleFixedExpenses.length === 0) {
            fixedExpensesList.innerHTML = '<li class="text-center" style="color: var(--muted-text-color);">Aucune dépense fixe active pour cette feuille.</li>';
            return;
        }
        visibleFixedExpenses.forEach(item => {
            const li = document.createElement('li');
            li.className = 'flex justify-between items-center p-2 rounded-md';
            li.style.backgroundColor = 'var(--bg-color)';
            const endDateText = item.endDate ? `<span class="text-xs ml-2" style="color: var(--muted-text-color);">(jusqu'au ${item.endDate.substring(5, 7)}/${item.endDate.substring(0, 4)})</span>` : '';
            li.innerHTML = `
                <div>
                    <span>${item.name}</span>
                    ${endDateText}
                </div>
                <div class="flex items-center gap-4">
                    <span class="font-semibold">${formatCurrency(item.amount)}</span>
                    <button class="btn btn-danger text-xs py-1 px-2" data-id="${item.id}" data-type="fixed">X</button>
                </div>
            `;
            fixedExpensesList.appendChild(li);
        });
    };

    const renderVariableIncomesForSheet = () => {
        variableIncomesList.innerHTML = '';
        const variableIncomes = state.incomes.filter(i => i.type === 'variable');
        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);

        if (variableIncomes.length === 0) {
            variableIncomesList.innerHTML = '<li class="text-center" style="color: var(--muted-text-color);">Aucun revenu variable défini.</li>';
            return;
        }

        if (!activeSheet) return;

        variableIncomes.forEach(income => {
            const li = document.createElement('li');
            li.className = 'flex flex-col sm:flex-row justify-between items-center gap-2';
            const currentAmount = activeSheet.monthlyIncomes?.[income.id] || '';
            li.innerHTML = `
                <label for="var-income-${income.id}" class="w-full sm:w-1/2">${income.name}</label>
                <input type="number" step="0.01" id="var-income-${income.id}" data-id="${income.id}" class="w-full sm:w-1/2" placeholder="Montant ce mois-ci" value="${currentAmount}">
            `;
            variableIncomesList.appendChild(li);
        });
    };

    const renderSheetSelector = () => {
        sheetSelector.innerHTML = '';
        if (state.sheets.length === 0) {
            sheetSelector.innerHTML = '<option>Aucune feuille disponible</option>';
            return;
        }
        state.sheets.sort((a, b) => b.id.localeCompare(a.id));
        state.sheets.forEach(sheet => {
            const option = document.createElement('option');
            option.value = sheet.id;
            option.textContent = sheet.name;
            option.selected = sheet.id === state.activeSheetId;
            sheetSelector.appendChild(option);
        });
    };

    const updateSummary = () => {
        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
        if (!activeSheet) {
            summaryIncomeEl.textContent = formatCurrency(0);
            summaryTotalExpensesEl.textContent = formatCurrency(0);
            summaryBalanceEl.textContent = formatCurrency(0);
            return;
        }

        const totalIncomeForMonth = activeSheet.monthlyIncomes ? Object.values(activeSheet.monthlyIncomes)
            .reduce((sum, amount) => sum + parseFloat(amount || 0), 0) : 0;

        const activeSheetDate = activeSheet.id;
        const applicableFixedExpenses = state.fixedExpenses.filter(expense => !expense.endDate || expense.endDate >= activeSheetDate);
        const totalFixedExpenses = applicableFixedExpenses.reduce((sum, item) => sum + item.amount, 0);

        const totalVariableExpenses = (activeSheet.variableExpenses || []).reduce((sum, item) => sum + item.amount, 0);
        const totalExpenses = totalFixedExpenses + totalVariableExpenses;

        const startingBalance = activeSheet.startingBalance || 0;
        const balance = startingBalance + totalIncomeForMonth - totalExpenses;

        summaryIncomeEl.textContent = formatCurrency(totalIncomeForMonth);
        summaryTotalExpensesEl.textContent = formatCurrency(totalExpenses);
        summaryBalanceEl.textContent = formatCurrency(balance);
        summaryBalanceEl.classList.toggle('positive', balance >= 0);
        summaryBalanceEl.classList.toggle('negative', balance < 0);
    };

    // --- MODAL LOGIC ---
    const openModal = (modal) => {
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('bg-opacity-50', 'opacity-0');
            modal.querySelector('.modal-content').classList.remove('scale-95');
        }, 10);
    };

    const closeModal = (modal) => {
        modal.classList.add('bg-opacity-50', 'opacity-0');
        modal.querySelector('.modal-content').classList.add('scale-95');
        setTimeout(() => modal.classList.add('hidden'), 300);
    };

    const openExpensesModal = () => {
        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
        if (!activeSheet) return;

        const activeSheetDate = activeSheet.id;
        const applicableFixedExpenses = state.fixedExpenses.filter(expense => !expense.endDate || expense.endDate >= activeSheetDate);
        const totalFixed = applicableFixedExpenses.reduce((sum, item) => sum + item.amount, 0);

        const totalVariable = (activeSheet.variableExpenses || []).reduce((sum, item) => sum + item.amount, 0);

        document.getElementById('modal-fixed-total').textContent = formatCurrency(totalFixed);
        document.getElementById('modal-variable-total').textContent = formatCurrency(totalVariable);
        document.getElementById('modal-grand-total').textContent = formatCurrency(totalFixed + totalVariable);
        openModal(expensesModal);
    };

    const openCreateSheetModal = () => {
        const now = new Date();
        document.getElementById('year-input').value = now.getFullYear();
        document.getElementById('month-select').value = now.getMonth();
        openModal(createSheetModal);
    };

    // --- SETTINGS LOGIC ---
    const applyTheme = () => {
        if (state.settings.isDarkMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    const updateSettingsUI = () => {
        darkModeToggle.checked = state.settings.isDarkMode;

        if (state.settings.password) {
            setPasswordSection.classList.add('hidden');
            removePasswordSection.classList.remove('hidden');
        } else {
            setPasswordSection.classList.remove('hidden');
            removePasswordSection.classList.add('hidden');
        }
    };

    // --- EVENT HANDLERS ---
    incomeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.elements['income-name-input'].value.trim();
        const isFixed = e.target.elements['income-type-checkbox'].checked;
        const amount = parseFloat(e.target.elements['income-amount-input'].value.replace(',', '.')) || 0;

        if (!name) return;
        if (isFixed && amount <= 0) {
            alert("Pour un revenu fixe, veuillez entrer un montant supérieur à zéro.");
            return;
        }

        const newIncome = { id: generateId(), name, amount: isFixed ? amount : 0, type: isFixed ? 'fixe' : 'variable' };
        state.incomes.push(newIncome);

        if (newIncome.type === 'fixe') {
            state.sheets.forEach(sheet => {
                if (sheet.monthlyIncomes) sheet.monthlyIncomes[newIncome.id] = newIncome.amount;
            });
        }
        e.target.reset();
        render();
    });

    fixedExpenseForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = e.target.elements['fixed-name-input'].value.trim();
        const amount = parseFloat(e.target.elements['fixed-amount-input'].value.replace(',', '.'));
        const endDate = e.target.elements['fixed-end-date-input'].value;

        if (name && !isNaN(amount) && amount > 0) {
            state.fixedExpenses.push({ id: generateId(), name, amount, endDate: endDate || null });
            e.target.reset();
            render();
        }
    });

    variableExpenseForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
        if (!activeSheet) { alert("Veuillez d'abord créer une feuille de calcul."); return; }

        const name = e.target.elements['variable-expense-name-input'].value.trim();
        const amount = parseFloat(e.target.elements['variable-expense-amount-input'].value.replace(',', '.'));
        if (name && !isNaN(amount) && amount > 0) {
            if (!activeSheet.variableExpenses) activeSheet.variableExpenses = [];
            activeSheet.variableExpenses.push({ id: generateId(), name, amount });
            e.target.reset();
            render();
        }
    });

    variableIncomesList.addEventListener('input', (e) => {
        if (e.target.matches('input[type="number"]')) {
            const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
            if (activeSheet) {
                if (!activeSheet.monthlyIncomes) activeSheet.monthlyIncomes = {};
                const incomeId = e.target.dataset.id;
                const amount = parseFloat(e.target.value.replace(',', '.'));
                activeSheet.monthlyIncomes[incomeId] = isNaN(amount) ? 0 : amount;
                updateSummary();
                saveData();
            }
        }
    });

    startingBalanceInput.addEventListener('input', (e) => {
        const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
        if (activeSheet) {
            const amount = parseFloat(e.target.value.replace(',', '.')) || 0;
            activeSheet.startingBalance = amount;
            updateSummary();
            saveData();
        }
    });

    document.body.addEventListener('click', (e) => {
        if (e.target.matches('[data-id]')) {
            const { id, type } = e.target.dataset;
            if (type === 'income') {
                state.incomes = state.incomes.filter(i => i.id !== id);
                state.sheets.forEach(sheet => {
                    if (sheet.monthlyIncomes && sheet.monthlyIncomes[id]) delete sheet.monthlyIncomes[id];
                });
            }
            if (type === 'fixed') state.fixedExpenses = state.fixedExpenses.filter(i => i.id !== id);
            if (type === 'variable') {
                const activeSheet = state.sheets.find(s => s.id === state.activeSheetId);
                if(activeSheet && activeSheet.variableExpenses) {
                    activeSheet.variableExpenses = activeSheet.variableExpenses.filter(i => i.id !== id);
                }
            }
            render();
        }
    });

    createSheetForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        const selectedMonth = parseInt(document.getElementById('month-select').value);
        const selectedYear = parseInt(document.getElementById('year-input').value);

        if (isNaN(selectedYear) || selectedYear < 2000 || selectedYear > 2100) { alert("Veuillez entrer une année valide."); return; }

        const monthPadded = (selectedMonth + 1).toString().padStart(2, '0');
        const sheetId = `${selectedYear}-${monthPadded}`;
        const sheetName = `${monthNames[selectedMonth]} ${selectedYear}`;

        if (state.sheets.find(s => s.id === sheetId)) { alert(`La feuille pour ${sheetName} existe déjà.`); return; }

        const initialMonthlyIncomes = {};
        state.incomes.forEach(income => {
            if (income.type === 'fixe') initialMonthlyIncomes[income.id] = income.amount;
        });

        state.sheets.push({ id: sheetId, name: sheetName, variableExpenses: [], monthlyIncomes: initialMonthlyIncomes, startingBalance: 0 });
        state.activeSheetId = sheetId;
        closeModal(createSheetModal);
        render();
    });

    // --- Settings Event Listeners ---
    savePasswordBtn.addEventListener('click', () => {
        const newPass = newPasswordInput.value;
        const confirmPass = confirmPasswordInput.value;
        if (!newPass) {
            alert('Le mot de passe ne peut pas être vide.');
            return;
        }
        if (newPass !== confirmPass) {
            alert('Les mots de passe ne correspondent pas.');
            return;
        }
        state.settings.password = newPass;
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        alert('Mot de passe enregistré !');
        render();
    });

    removePasswordBtn.addEventListener('click', () => {
        const currentPass = currentPasswordInput.value;
        if (currentPass !== state.settings.password) {
            alert('Mot de passe actuel incorrect.');
            return;
        }
        if (confirm('Êtes-vous sûr de vouloir supprimer le mot de passe ?')) {
            state.settings.password = null;
            currentPasswordInput.value = '';
            render();
        }
    });

    darkModeToggle.addEventListener('change', (e) => {
        state.settings.isDarkMode = e.target.checked;
        render();
    });

    shareBtn.addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({
                title: 'Mon Budget Personnel',
                text: 'Découvrez cette super application pour gérer votre budget !',
                url: window.location.href
            }).catch(console.error);
        } else {
            alert("La fonction de partage n'est pas disponible sur ce navigateur. Copiez simplement l'URL !");
        }
    });

    passwordForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (passwordPromptInput.value === state.settings.password) {
            passwordModal.style.display = 'none';
            appContainer.classList.remove('hidden');
        } else {
            passwordError.classList.remove('hidden');
        }
    });

    // --- Other Event Listeners ---
    document.querySelectorAll('.nav-tab').forEach(tab => tab.addEventListener('click', (e) => { state.activeTab = e.target.id.replace('tab-', ''); render(); }));
    document.getElementById('new-sheet-btn').addEventListener('click', openCreateSheetModal);
    document.getElementById('sheet-selector').addEventListener('change', (e) => { state.activeSheetId = e.target.value; render(); });
    document.getElementById('total-expenses-card').addEventListener('click', openExpensesModal);
    document.getElementById('close-expenses-modal-btn').addEventListener('click', () => closeModal(expensesModal));
    expensesModal.addEventListener('click', (e) => { if (e.target === expensesModal) closeModal(expensesModal); });
    document.getElementById('close-create-sheet-modal-btn').addEventListener('click', () => closeModal(createSheetModal));
    createSheetModal.addEventListener('click', (e) => { if (e.target === createSheetModal) closeModal(createSheetModal); });

    // --- INITIALIZATION ---
    const init = () => {
        const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
        document.getElementById('month-select').innerHTML = monthNames.map((name, index) => `<option value="${index}">${name}</option>`).join('');

        loadData();

        if (state.settings.password) {
            appContainer.classList.add('hidden');
            passwordModal.style.display = 'flex';
            applyTheme();
        }

        if (state.sheets.length === 0) {
            const now = new Date();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const year = now.getFullYear();
            const sheetId = `${year}-${month}`;
            const sheetName = `${monthNames[now.getMonth()]} ${year}`;

            const initialMonthlyIncomes = {};
            state.incomes.forEach(income => {
                if (income.type === 'fixe') initialMonthlyIncomes[income.id] = income.amount;
            });

            state.sheets.push({ id: sheetId, name: sheetName, variableExpenses: [], monthlyIncomes: initialMonthlyIncomes, startingBalance: 0 });
            state.activeSheetId = sheetId;
        } else if (!state.activeSheetId || !state.sheets.find(s => s.id === state.activeSheetId)) {
            state.sheets.sort((a, b) => b.id.localeCompare(a.id));
            state.activeSheetId = state.sheets[0].id;
        }
        render();
    };

    init();
});