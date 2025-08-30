function flagEmoji(code) {
    // code: "US", "RU", "TH"...
    if (!code || code.length !== 2) return '';
    const A = 0x1F1E6;
    const cc = code.toUpperCase();
    return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

// Поддерживаемые валюты (добавьте новые здесь!)
const CURRENCIES = [
    { code: 'RUB', name: 'Рубль', flag: flagEmoji('RU') },
    { code: 'USD', name: 'Доллар', flag: flagEmoji('US') },
    { code: 'EUR', name: 'Евро', flag: flagEmoji('EU') },
    { code: 'CNY', name: 'Юань', flag: flagEmoji('CN') },
    { code: 'THB', name: 'Бат', flag: flagEmoji('TH') },
    { code: 'AED', name: 'Дирхам', flag: flagEmoji('AE') },
    { code: 'HKD', name: 'Гонконг.', flag: flagEmoji('HK') },
    { code: 'USDT', name: 'Tether', flag: '₮' }
];

let ratesCbr = {}; // ЦБ РФ RUB за 1 единицу
let bitkap = {};   // Bitkap tickers
let fromCurrency = 'USD', toCurrency = 'RUB';

// Заполняем селекты валют
function fillCurrencySelect() {
    const fromSelect = document.getElementById('from-currency');
    const toSelect = document.getElementById('to-currency');
    fromSelect.innerHTML = '';
    toSelect.innerHTML = '';
    for (const c of CURRENCIES) {
        let opt = document.createElement('option');
        opt.value = c.code;
        opt.innerText = `${c.code} ${c.name}`;
        fromSelect.appendChild(opt.cloneNode(true));
        toSelect.appendChild(opt);
    }
    fromSelect.value = fromCurrency;
    toSelect.value = toCurrency;
    document.getElementById('flag-from').innerText = CURRENCIES.find(v => v.code === fromCurrency)?.flag || '';
    document.getElementById('flag-to').innerText = CURRENCIES.find(v => v.code === toCurrency)?.flag || '';
}

document.getElementById('from-currency').onchange = e => {
    fromCurrency = e.target.value;
    document.getElementById('flag-from').innerText = CURRENCIES.find(v => v.code === fromCurrency)?.flag || '';
    update();
};
document.getElementById('to-currency').onchange = e => {
    toCurrency = e.target.value;
    document.getElementById('flag-to').innerText = CURRENCIES.find(v => v.code === toCurrency)?.flag || '';
    update();
};
document.getElementById('amount').oninput = update;

// Получаем курсы ЦБ РФ
async function fetchRates() {
    try {
        const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
        const data = await response.json();
        CURRENCIES.forEach(c => {
            if (c.code !== "RUB" && data.Valute[c.code]) {
                ratesCbr[c.code] = data.Valute[c.code]?.Value;
            }
        });
        ratesCbr["RUB"] = 1;
        update();
    } catch (e) {
        document.getElementById('rate').innerText = 'Ошибка курса';
    }
}

// Получаем курсы Bitkap
async function fetchBitkap() {
    try {
        const res = await fetch('https://bitkap.net/api/v2/public/tickers');
        const data = await res.json();
        bitkap = {};
        Object.keys(data.data).forEach(pair => {
            bitkap[pair] = Number(data.data[pair]?.last);
        });
        update();
    } catch (e) {
        bitkap = {};
        update();
    }
}

function getCbrRate(from, to) {
    // RUB -> XXX: 1/rate; XXX -> RUB: rate; XXX1->XXX2: rate1/rate2
    if (from === to) return 1;
    if (from === 'RUB') return 1 / (ratesCbr[to] || 1);
    if (to === 'RUB') return ratesCbr[from] || 1;
    return (ratesCbr[from] || 1) / (ratesCbr[to] || 1);
}

// Bitkap: RUB<->USDT, USD<->USDT, THB<->USDT, etc
function getBitkapRate(from, to) {
    if (from === to) return 1;
    // Пробуем искать прямую пару
    let direct = `${from}_${to}`;
    let reverse = `${to}_${from}`;
    if (bitkap[direct]) return bitkap[direct];
    if (bitkap[reverse]) return 1 / bitkap[reverse];
    // Через USDT как мост (например EUR->USDT->THB)
    if (from !== 'USDT' && bitkap[`${from}_USDT`] && bitkap[`USDT_${to}`]) {
        return bitkap[`${from}_USDT`] * bitkap[`USDT_${to}`];
    }
    if (to !== 'USDT' && bitkap[`USDT_${from}`] && bitkap[`${to}_USDT`]) {
        return (1 / bitkap[`USDT_${from}`]) * (1 / bitkap[`${to}_USDT`]);
    }
    return null; // не нашёл
}

// Логика расчёта для любой пары
function update() {
    const amount = Math.max(+document.getElementById('amount').value, 0);
    if (!amount) {
        document.getElementById('rate').innerText = '—';
        document.getElementById('result').innerHTML = '—';
        document.getElementById('result-usdt').style.display = 'none';
        return;
    }
    let showRate = '—', showResult = '—', showUsdt = '';
    let viaCbr = false, viaBitkap = false, usdtMidVal = 0;

    // Всегда сначала пытаемся Bitkap, если связаны USDT или RUB, иначе используем ЦБ РФ
    if (fromCurrency === 'USDT' || toCurrency === 'USDT') {
        const rate = getBitkapRate(fromCurrency, toCurrency);
        if (rate) {
            showRate = rate.toFixed(5);
            showResult = `<b>${(amount * rate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${toCurrency}</b>`;
            viaBitkap = true;
            usdtMidVal = (fromCurrency === 'USDT') ? amount : (fromCurrency === 'RUB' && bitkap['USDT_RUB'] ? amount / bitkap['USDT_RUB'] : null);
        }
    } else if (fromCurrency === 'RUB' || toCurrency === 'RUB') {
        const cbrRate = getCbrRate(fromCurrency, toCurrency);
        showRate = cbrRate.toFixed(5);
        showResult = `<b>${(amount * cbrRate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${toCurrency}</b>`;
        viaCbr = true;
        // Счёт по USDT (через RUB->USDT->toCurrency)
        if (fromCurrency === 'RUB' && bitkap['USDT_RUB']) {
            const usdt = amount / bitkap['USDT_RUB'];
            usdtMidVal = usdt;
        } else if (toCurrency === 'RUB' && bitkap['USDT_RUB']) {
            const usdt = (amount * cbrRate) / bitkap['USDT_RUB'];
            usdtMidVal = usdt;
        }
    } else {
        // Между двумя не-RUB, не-USDT валютами: сначала CBR (через RUB)
        const cbrRate = getCbrRate(fromCurrency, toCurrency);
        showRate = cbrRate.toFixed(5);
        showResult = `<b>${(amount * cbrRate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${toCurrency}</b>`;
        viaCbr = true;
        // Через USDT сейчас ищется только если обе есть на Bitkap
        const rateToUsdt = getBitkapRate(fromCurrency, 'USDT');
        const rateUsdtTo = getBitkapRate('USDT', toCurrency);
        if (rateToUsdt && rateUsdtTo) {
            const viaUSDT = (amount * rateToUsdt) * rateUsdtTo;
            showResult += `<div style="opacity:0.84;font-size:0.89em; margin-top:3px;">(Через USDT: ${viaUSDT.toLocaleString('ru-RU', { maximumFractionDigits: 2 })})</div>`;
            usdtMidVal = amount * rateToUsdt;
        }
    }

    document.getElementById('rate').innerText = showRate;
    document.getElementById('result').innerHTML = showResult;

    // Показываем результат в USDT
    if (usdtMidVal && usdtMidVal > 0) {
        document.getElementById('result-usdt').style.display = '';
        document.getElementById('result-usdt').innerText = `Эквивалент в USDT: ${usdtMidVal.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ₮`;
    } else {
        document.getElementById('result-usdt').style.display = 'none';
    }
}

// init
window.onload = async () => {
    fillCurrencySelect();
    await fetchRates();
    await fetchBitkap();
    update();
};

// Авто-обновление курсов Bitkap раз в минуту
setInterval(fetchBitkap, 60000);