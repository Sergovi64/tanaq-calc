// Поддерживаемые валюты и эмодзи флагов
const CURRENCIES = [
    { code: 'USD', name: 'Доллар', flag: '🇺🇸' },
    { code: 'EUR', name: 'Евро', flag: '🇪🇺' },
    { code: 'CNY', name: 'Юань', flag: '🇨🇳' },
    { code: 'THB', name: 'Бат', flag: '🇹🇭' },
    { code: 'AED', name: 'Дирхам', flag: '🇦🇪' },
    { code: 'HKD', name: 'Гонконг.', flag: '🇭🇰' }
];

let rates = {}; // курсы ЦБ
let bitkapUsdtRub = 0;
let current = 'USD';

// Рендерим кнопки валют
const currenciesDiv = document.getElementById('currencies');
CURRENCIES.forEach(c => {
    const btn = document.createElement('button');
    btn.innerText = c.code;
    btn.className = 'curr-btn' + (c.code === current ? ' active' : '');
    btn.onclick = () => handleCurrency(c.code);
    currenciesDiv.appendChild(btn);
});

function handleCurrency(code) {
    current = code;
    [...currenciesDiv.children].forEach(btn => {
        btn.classList.toggle('active', btn.innerText === code);
    });
    document.getElementById('currency-label').innerText = code;
    document.getElementById('flag-usd').innerText = CURRENCIES.find(c => c.code === code).flag || '';
    update();
}

// Получение курсов с ЦБ РФ
async function fetchRates() {
    try {
        const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
        const data = await response.json();
        CURRENCIES.forEach(c => {
            rates[c.code] = data.Valute[c.code]?.Value || 0;
        });
        // Добавим курс RUB для самообмена (RUB->RUB)
        rates["RUB"] = 1;
        update();
    } catch (e) {
        document.getElementById('rate').innerText = 'Ошибка курса';
    }
}

// Получение курса USDT\RUB с BitKap
async function fetchBitkap() {
    try {
        const res = await fetch('https://bitkap.net/api/v2/public/tickers');
        const data = await res.json();
        bitkapUsdtRub = Number(data.data?.['USDT_RUB']?.last) || 0;
        update();
    } catch (e) {
        bitkapUsdtRub = 0;
        update();
    }
}

document.getElementById('amount').oninput = update;

// Основная функция расчёта и вывода
function update() {
    const amount = Math.max(+document.getElementById('amount').value, 0);
    const rate = rates[current] || 0;
    document.getElementById('rate').innerText = rate ? rate.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';

    let result = '—', usdtResult = '', diffResult = '', compareHtml = '';
    const resultBlock = document.getElementById('result-block');
    const compareBlock = document.getElementById('compare');
    compareBlock.style.display = "none";

    // Только если сумма > 0 и валюта поддерживается
    if (rate && amount > 0) {
        const rub = amount * rate;
        result = `<b>${rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</b>`;

        // USD - сравнение с USDT/BitKap
        if (current === 'USD' && bitkapUsdtRub > 0) {
            const usdt_rub = amount * bitkapUsdtRub;
            // Показываем блок сравнения
            usdtResult = `<span>Через <b>USDT/BitKap</b>: <span class="compare-res">${usdt_rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span></span>`;

            const diff = rub - usdt_rub;
            let sign = diff > 0 ? "+" : "";
            diffResult = `<span class="compare-warning">Разница: ${sign}${diff.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>`;

            compareHtml = usdtResult + diffResult;
            compareBlock.style.display = "";
            compareBlock.innerHTML = compareHtml;

            addToHistory(`${amount} USD → ${rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽ | USDT: ${usdt_rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`);
        } else {
            compareBlock.style.display = "none";
            addToHistory(`${amount} ${current} → ${rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`);
        }
    } else {
        compareBlock.style.display = "none";
    }

    document.getElementById('result').innerHTML = result;
}

function addToHistory(str) {
    // Память в сессии
    let hArr = JSON.parse(sessionStorage.getItem('_history') || '[]');
    if (str && hArr[0] !== str) { // Не повторять подряд
        hArr.unshift(str);
        if (hArr.length > 4) hArr = hArr.slice(0, 4);
        sessionStorage.setItem('_history', JSON.stringify(hArr));
        renderHistory();
    }
}
function renderHistory() {
    let hArr = JSON.parse(sessionStorage.getItem('_history') || '[]');
    document.getElementById('history').innerHTML = hArr.join('<br>');
}
window.onload = async () => {
    renderHistory();
    await fetchRates();
    await fetchBitkap();
    update();
}