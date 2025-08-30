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

let ratesCbr = {};     // RUB за 1 валюту по ЦБ (с приведением к 1 единице!)
let usdtRub = null;    // RUB за 1 USDT (биржа)
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

// Получить курсы ЦБ РФ c учетом номинала (всегда RUB за 1 ед. валюты)
async function fetchRates() {
    try {
        const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
        const data = await response.json();
        CURRENCIES.forEach(c => {
            if (c.code !== "RUB" && data.Valute[c.code]) {
                const obj = data.Valute[c.code];
                ratesCbr[c.code] = obj.Value / obj.Nominal;
            }
        });
        ratesCbr["RUB"] = 1;
        update();
    } catch (e) {
        document.getElementById('rate').innerText = 'Ошибка курса';
    }
}

// Получить курс THB за 1 USDT с Bitkub
async function fetchThbPerUsdt() {
    try {
        const resp = await fetch('https://api.bitkub.com/api/market/ticker?sym=THB_USDT');
        const data = await resp.json();
        if (data && data['THB_USDT'] && typeof data['THB_USDT'].last !== 'undefined') {
            return +data['THB_USDT'].last;
        }
        return null;
    } catch {
        return null;
    }
}

// Кросс-курс: RUB за 1 USDT (через бат)
async function fetchUsdtRub() {
    const thbPerUsdt = await fetchThbPerUsdt();
    const rubPerThb = ratesCbr["THB"];
    if (thbPerUsdt && rubPerThb) {
        usdtRub = thbPerUsdt * rubPerThb;
        console.log('thbPerUsdt:', thbPerUsdt, 'rubPerThb:', rubPerThb, 'usdtRub:', usdtRub);
    } else {
        usdtRub = null;
        console.log('Ошибка получения курса:', { thbPerUsdt, rubPerThb });
    }
    update();
}

// Курс по ЦБ РФ: from -> to
function getCbrRate(from, to) {
    if (from === to) return 1;
    if (from === 'RUB') return 1 / (ratesCbr[to] || 1);
    if (to === 'RUB') return ratesCbr[from] || 1;
    return (ratesCbr[from] || 1) / (ratesCbr[to] || 1);
}

// RUB за 1 валюту (по ЦБ)
function getRubFor(value, code) {
    if (code === 'RUB') return value;
    return value * (ratesCbr[code] || 1);
}

// RUB => USDT (биржа)
function rubToUsdt(rub) {
    return (usdtRub && usdtRub > 0) ? rub / usdtRub : null;
}

// Любая валюта => USDT (через RUB)
function anyToUsdt(amount, code) {
    if (code === 'USDT') return amount;
    const rub = getRubFor(amount, code);
    return rubToUsdt(rub);
}

// Строка: курс по ЦБ (from -> to)
function getCbrText(from, to) {
    if (from === to) return "1";
    let rate = getCbrRate(from, to);
    return rate ? rate.toLocaleString('ru-RU', { maximumFractionDigits: 6 }) : '—';
}

function update() {
    const amount = Math.max(+document.getElementById('amount').value, 0);
    let elRate = document.getElementById('rate');
    let elResCbr = document.getElementById('result-cbr');
    let elRateUsdt = document.getElementById('rate-usdt');
    let elResUsdt = document.getElementById('result-usdt');
    let elEco = document.getElementById('economy');

    if (!amount) {
        elRate.innerText = '—';
        elResCbr.innerHTML = '—';
        elRateUsdt.innerText = '—';
        elResUsdt.innerHTML = '—';
        elEco.style.display = 'none';
        return;
    }
    // По курсу ЦБ РФ
    let rateCbr = getCbrRate(fromCurrency, toCurrency);
    let resCbr = amount * rateCbr;
    elRate.innerText = getCbrText(fromCurrency, toCurrency);
    elResCbr.innerHTML =
        `<b>${resCbr.toLocaleString('ru-RU', { maximumFractionDigits: 3 })} ${toCurrency}</b>`;

    // По USDT/birja (через кросс-курс):
    elRateUsdt.innerText = (usdtRub && usdtRub > 0) ? `${usdtRub.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽` : "—";
    let usdt_val = anyToUsdt(amount, fromCurrency);

    if (usdt_val && usdtRub && usdtRub > 0) {
        elResUsdt.innerHTML = `<b>${usdt_val.toLocaleString('ru-RU', { maximumFractionDigits: 4 })} ₮</b>`;
    } else {
        elResUsdt.innerHTML = '—';
    }

    // Экономия (разница): только если конвертируем в RUB или USDT
    let economyInfo = "";
    if (fromCurrency !== 'USDT' && (toCurrency === 'RUB' || toCurrency === 'USDT') && usdtRub && amount > 0) {
        // сколько RUB получите по ЦБ (resCbr)
        // сколько RUB можно получить, если сначала купить USDT, а потом продать по бирже (usdt * usdtRub)
        let variantRub = (usdt_val * usdtRub);
        let delta = variantRub - resCbr;
        if (toCurrency === 'RUB') {
            economyInfo =
                (delta > 0 ? 'Выгода: ' : 'Потеря: ')
                + Math.abs(delta).toLocaleString('ru-RU', { maximumFractionDigits: 2 })
                + ' ₽ при операции через USDT';
        }
        if (toCurrency === 'USDT') {
            // в USDT: в одну сторону по ЦБ, в другую через биржу
            let variantUsdt = (resCbr && usdtRub) ? resCbr / usdtRub : 0;
            let deltaUsdt = usdt_val - variantUsdt;
            economyInfo =
                (deltaUsdt > 0 ? 'Выгода: ' : 'Потеря: ')
                + Math.abs(deltaUsdt).toLocaleString('ru-RU', { maximumFractionDigits: 4 })
                + ' ₮ при операции через USDT';
        }
    }
    // if (economyInfo) {
    //     elEco.style.display = '';
    //    elEco.innerText = economyInfo;
    // } else {
    //     elEco.style.display = 'none';
    //    elEco.innerText = '';
    // }
}

// init
window.onload = async () => {
    fillCurrencySelect();
    await fetchRates();
    await fetchUsdtRub();
    update();
};
// Периодическое обновление курса USDT
setInterval(fetchUsdtRub, 60000);