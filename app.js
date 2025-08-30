function flagEmoji(code) {
    if (!code || code.length !== 2) return '';
    const A = 0x1F1E6;
    const cc = code.toUpperCase();
    return String.fromCodePoint(A + cc.charCodeAt(0) - 65, A + cc.charCodeAt(1) - 65);
}

const CURRENCIES = [
    { code: 'RUB', name: 'Рубль', flag: flagEmoji('RU') },
    { code: 'USD', name: 'Доллар', flag: flagEmoji('US') },
    { code: 'EUR', name: 'Евро', flag: flagEmoji('EU') },
    { code: 'CNY', name: 'Юань', flag: flagEmoji('CN') },
    { code: 'THB', name: 'Бат', flag: flagEmoji('TH') },
    { code: 'AED', name: 'Дирхам', flag: flagEmoji('AE') },
    { code: 'HKD', name: 'Гонконг.', flag: flagEmoji('HK') },
    { code: 'USDT', name: 'Tether', flag: "₮" }
];

let ratesCbr = {};
let bitkap = {};
let fromCurrency = 'USD', toCurrency = 'RUB';

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

// ЦБ РФ: сколько одной валюты за одну другую (RUB->USD, USD->RUB, EUR->CNY и т.д.)
function getCbrRate(from, to) {
    if (from === to) return 1;
    if (from === 'RUB') return 1 / (ratesCbr[to] || 1);
    if (to === 'RUB') return ratesCbr[from] || 1;
    return (ratesCbr[from] || 1) / (ratesCbr[to] || 1);
}

// Bitkap: RUB<->USDT, USD<->USDT, THB<->USDT, и любые пары где возможно
function getBitkapRate(from, to) {
    if (from === to) return 1;
    let direct = `${from}_${to}`;
    let reverse = `${to}_${from}`;
    if (bitkap[direct]) return bitkap[direct];
    if (bitkap[reverse]) return 1 / bitkap[reverse];
    // Через USDT как мост: EUR->USDT->THB
    if (from !== 'USDT' && bitkap[`${from}_USDT`] && bitkap[`USDT_${to}`]) {
        return bitkap[`${from}_USDT`] * bitkap[`USDT_${to}`];
    }
    if (to !== 'USDT' && bitkap[`USDT_${from}`] && bitkap[`${to}_USDT`]) {
        return (1 / bitkap[`USDT_${from}`]) * (1 / bitkap[`${to}_USDT`]);
    }
    return null;
}

// Ключевая функция: расчёт (и обязательно результат в USDT через USD)
function update() {
    const amount = Math.max(+document.getElementById('amount').value, 0);
    if (!amount) {
        document.getElementById('rate').innerText = '—';
        document.getElementById('result').innerHTML = '—';
        document.getElementById('result-usdt').style.display = 'none';
        return;
    }

    let cbrRate = getCbrRate(fromCurrency, toCurrency);
    let bitkapRate = getBitkapRate(fromCurrency, toCurrency);

    let showRate = '—', showResult = '—';

    // Основной результат по BitKap, если возможно, иначе по ЦБ:
    let useBitkap = !!bitkapRate && !isNaN(bitkapRate) && bitkapRate > 0;
    let resultValue = useBitkap ? amount * bitkapRate : amount * cbrRate;
    showRate = (useBitkap ? bitkapRate : cbrRate).toLocaleString('ru-RU', { maximumFractionDigits: 6 });
    showResult = `<b>${resultValue.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${toCurrency}</b>`;

    document.getElementById('rate').innerText = showRate;
    document.getElementById('result').innerHTML = showResult;

    // Расчёт через USD и USDT: first из from-в-USD (через ЦБ или BitKap), потом USD→USDT по BitKap
    let usdt = 0, warning = "";
    // Сколько USD за эту сумму
    let usdRateFrom = 1;
    if (fromCurrency === "USD") {
        usdRateFrom = 1;
    } else if (fromCurrency === "USDT" && bitkap['USD_USDT']) {
        usdRateFrom = bitkap['USD_USDT'];
    } else if (fromCurrency === "RUB") {
        usdRateFrom = 1 / (ratesCbr["USD"] || 1);
    } else if (ratesCbr[fromCurrency] && ratesCbr['USD']) {
        usdRateFrom = (ratesCbr[fromCurrency] || 1) / (ratesCbr['USD'] || 1);
    } else if (bitkap[`${fromCurrency}_USDT`] && bitkap['USD_USDT']) {
        usdRateFrom = bitkap[`${fromCurrency}_USDT`] * bitkap['USD_USDT'];
        warning += "Расчёт через BitKap";
    }

    let sumUSD = amount * usdRateFrom;
    // Теперь узнаём сколько это в USDT: (USD→USDT по BitKap)
    let usd_usdt = bitkap['USDT_USD'] ? 1 / bitkap['USDT_USD'] : bitkap['USD_USDT'];
    if (!usd_usdt) usd_usdt = bitkap['USDT_RUB'] && ratesCbr['USD'] ? (ratesCbr['USD'] / bitkap['USDT_RUB']) : null;

    if (usd_usdt) {
        usdt = sumUSD * usd_usdt;
        document.getElementById('result-usdt').style.display = '';
        document.getElementById('result-usdt').innerHTML =
            `Эквивалент в USDT (через USD): ${usdt.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ₮` +
            (warning ? `<span class="usdt-warning">${warning}</span>` : "");
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

// Авто-обновление курсов Bitkap
setInterval(fetchBitkap, 60000);