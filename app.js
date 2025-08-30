// Для emoji-флагов:
function flagEmoji(code) {
    // code вида 'US', 'RU', 'TH', etc.
    if (!code || code.length !== 2) return '';
    const A = 0x1F1E6;
    const cc = code.toUpperCase();
    return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

const CURRENCIES = [
    { code: 'USD', name: 'Доллар', flag: flagEmoji('US') },
    { code: 'EUR', name: 'Евро', flag: flagEmoji('EU') },
    { code: 'CNY', name: 'Юань', flag: flagEmoji('CN') },
    { code: 'THB', name: 'Бат', flag: flagEmoji('TH') },
    { code: 'AED', name: 'Дирхам', flag: flagEmoji('AE') },
    { code: 'HKD', name: 'Гонконг.', flag: flagEmoji('HK') }
];

// Валюты, для которых есть сравнение с BitKap
const BITKAP_COMPARE = {
    'USD': { pair: 'USDT_RUB', via: null, symbol: 'USDT', flag: flagEmoji('US') },
    'THB': { pair: 'USDT_RUB', via: 'USDT_THB', symbol: 'USDT', flag: flagEmoji('TH') }
};

let rates_cbr = {}; // курсы ЦБ на основные валюты
let current = 'USD';
let bitkap = {}; // Bitkap тикеры

// Рендерим кнопки валют
const currenciesDiv = document.getElementById('currencies');
CURRENCIES.forEach(c => {
    const btn = document.createElement('button');
    btn.innerText = c.flag + ' ' + c.code;
    btn.className = 'curr-btn' + (c.code === current ? ' active' : '');
    btn.onclick = () => handleCurrency(c.code);
    currenciesDiv.appendChild(btn);
});

function handleCurrency(code) {
    current = code;
    [...currenciesDiv.children].forEach(btn => {
        btn.classList.toggle('active', btn.innerText.endsWith(code));
    });
    document.getElementById('currency-label').innerText = code;
    let cinfo = CURRENCIES.find(c => c.code === code);
    document.getElementById('flag-current').innerText = cinfo ? cinfo.flag : '';
    update();
}

// Получить все курсы ЦБ РФ (RUB за единицу валюты)
async function fetchRates() {
    try {
        const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
        const data = await response.json();
        CURRENCIES.forEach(c => {
            rates_cbr[c.code] = data.Valute[c.code]?.Value || 0;
        });
        rates_cbr["RUB"] = 1;
        update();
    } catch (e) {
        document.getElementById('rate').innerText = 'Ошибка курса';
    }
}

// Получить все курсы Bitkap (кратные 1 основной валюте)
async function fetchBitkap() {
    try {
        const res = await fetch('https://bitkap.net/api/v2/public/tickers');
        const data = await res.json();
        bitkap = {};
        Object.keys(data.data).forEach(pair => {
            bitkap[pair] = Number(data.data[pair].last);
        });
        update();
    } catch (e) {
        bitkap = {};
        update();
    }
}

document.getElementById('amount').oninput = update;

// Главная логика расчёта
function update() {
    const amount = Math.max(+document.getElementById('amount').value, 0);
    const rate = rates_cbr[current] || 0;
    document.getElementById('rate').innerText = rate ? rate.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : '—';

    let result = '—';
    const compareBlock = document.getElementById('compare');
    compareBlock.style.display = "none";
    compareBlock.innerHTML = '';

    if (rate && amount > 0) {
        const rub = amount * rate;
        result = `<b>${rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</b>`;

        // Возможность сравнения с BitKap: для USD и THB (RUB→USD→USDT или RUB→THB→USDT)
        if (BITKAP_COMPARE[current]) {
            let compareHtml = '';
            if (current === 'USD' && bitkap['USDT_RUB']) {
                // перевести рубли в usdt, потом usdt в usd (1:1)
                const via_usdt = rub / bitkap['USDT_RUB'];
                const usd_via_usdt = via_usdt; // для USD 1:1
                const rub_via_usdt = usd_via_usdt * bitkap['USDT_RUB']; // всегда руб
                compareHtml = `
          <span class="compare-title">Перевод через USDT по BitKap:</span>
          <span class="compare-res">${rub_via_usdt.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>
          <span class="compare-warning">Разница: ${(rub - rub_via_usdt > 0 ? '+' : '')}${(rub - rub_via_usdt).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽</span>
        `;
                addToHistory(`${amount} USD → ${rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽ | USDT: ${rub_via_usdt.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`);
            }
            if (current === 'THB' && bitkap['USDT_RUB'] && bitkap['USDT_THB']) {
                // RUB → USDT → THB
                const usdt_amount = rub / bitkap['USDT_RUB'];
                const thb_via_usdt = usdt_amount * bitkap['USDT_THB'];
                const rub_via_usdt = thb_via_usdt * rate / amount; // сколько рублей было бы, если конвертир. через USDT
                compareHtml = `
          <span class="compare-title">Эквивалент через USDT по BitKap:</span>
          <span class="compare-res">${thb_via_usdt.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ฿</span>
          <span class="compare-warning">Δ = ${(amount - thb_via_usdt > 0 ? '+' : '')}${(amount - thb_via_usdt).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ฿</span>
        `;
                addToHistory(`${amount} THB → ${rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽ | через USDT: ${thb_via_usdt.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ฿`);
            }
            if (compareHtml) {
                compareBlock.style.display = "";
                compareBlock.innerHTML = compareHtml;
            }
        } else {
            addToHistory(`${amount} ${current} → ${rub.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ₽`);
        }
    } else {
        compareBlock.style.display = "none";
    }

    document.getElementById('result').innerHTML = result;
}

// История и рендеринг
function addToHistory(str) {
    let hArr = JSON.parse(sessionStorage.getItem('_history') || '[]');
    if (str && hArr[0] !== str) {
        hArr.unshift(str);
        if (hArr.length > 4) hArr = hArr.slice(0, 4);
        sessionStorage.setItem('_history', JSON.stringify(hArr));
        renderHistory();
    }
}
function renderHistory() {
    let hArr = JSON.parse(sessionStorage.getItem('_history') || '[]');
    document.getElementById('history').innerHTML = hArr.map(v => {
        return v.replace(/(\d{1,} [A-Z]{3})/g, '<b>$1</b>').replace(/USDT/g, '<b>USDT</b>').replace(/(\d{1,}(?:[.,]\d{1,})?) ₽/g, `<span style="color:#81ffba;font-weight:600">$1 ₽</span>`);
    }).join('<br>');
}

window.onload = async () => {
    renderHistory();
    await fetchRates();
    await fetchBitkap();
    update();
};

// Периодически обновлять Bitkap (напр. кажд. 60 сек - если нужно real time)
setInterval(fetchBitkap, 60000);