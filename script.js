// ===== Crypto Live Dashboard - Real-Time Data =====

const BINANCE_API = 'https://api.binance.com';
const REFRESH_INTERVAL = 10000; // 10 seconds
const TOP_COINS_COUNT = 20;

// State
let previousPrices = {};
let selectedCoin = null;
let refreshTimer = null;

// ===== Utility Functions =====

function formatCurrency(value, decimals = 2) {
    const num = parseFloat(value);
    if (num >= 1000) {
        return '$' + num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } else if (num >= 1) {
        return '$' + num.toFixed(decimals);
    } else if (num >= 0.01) {
        return '$' + num.toFixed(4);
    } else {
        return '$' + num.toFixed(6);
    }
}

function formatLargeNumber(value) {
    const num = parseFloat(value);
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
}

function formatPercent(value) {
    const num = parseFloat(value);
    const sign = num >= 0 ? '+' : '';
    return sign + num.toFixed(2) + '%';
}

function getChangeClass(value) {
    return parseFloat(value) >= 0 ? 'change-positive' : 'change-negative';
}

function getCardChangeClass(value) {
    return parseFloat(value) >= 0 ? 'positive' : 'negative';
}

function getCoinIcon(symbol) {
    return `https://api.binance.com/bapi/asset/v2/public/asset-service/product/get-product-by-symbol?symbol=${symbol}`;
}

function getCoinLogo(symbol) {
    // Use CoinGecko for logos
    const symbolLower = symbol.toLowerCase();
    return `https://assets.coingecko.com/coins/images/1/standard/bitcoin.png`;
}

function getCoinLogoUrl(symbol) {
    // Use a simple approach with Binance asset API
    return `https://api.binance.com/bapi/asset/v2/public/asset-service/product/get-product-by-symbol?symbol=${symbol}`;
}

// ===== Sparkline Generator =====
function generateSparkline(data, isPositive) {
    if (!data || data.length < 2) return '';
    
    const width = 100;
    const height = 32;
    const padding = 2;
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * (width - padding * 2);
        const y = height - padding - ((val - min) / range) * (height - padding * 2);
        return `${x},${y}`;
    });
    
    const color = isPositive ? '#10b981' : '#ef4444';
    const gradientId = `grad-${Math.random().toString(36).substr(2, 9)}`;
    
    return `
        <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <defs>
                <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:${color};stop-opacity:0.3" />
                    <stop offset="100%" style="stop-color:${color};stop-opacity:0" />
                </linearGradient>
            </defs>
            <polyline
                fill="none"
                stroke="${color}"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                points="${points.join(' ')}"
            />
            <polygon
                fill="url(#${gradientId})"
                points="${padding},${height - padding} ${points.join(' ')} ${width - padding},${height - padding}"
            />
        </svg>
    `;
}

// ===== API Calls =====

async function fetchTickerData() {
    try {
        const response = await fetch(`${BINANCE_API}/api/v3/ticker/24hr`);
        if (!response.ok) throw new Error('Failed to fetch ticker data');
        return await response.json();
    } catch (error) {
        console.error('Error fetching ticker data:', error);
        return null;
    }
}

async function fetchKlines(symbol, interval = '1m', limit = 60) {
    try {
        const response = await fetch(
            `${BINANCE_API}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
        );
        if (!response.ok) throw new Error('Failed to fetch klines');
        return await response.json();
    } catch (error) {
        console.error('Error fetching klines:', error);
        return null;
    }
}

async function fetchExchangeInfo() {
    try {
        const response = await fetch(`${BINANCE_API}/api/v3/exchangeInfo`);
        if (!response.ok) throw new Error('Failed to fetch exchange info');
        return await response.json();
    } catch (error) {
        console.error('Error fetching exchange info:', error);
        return null;
    }
}

// ===== Render Functions =====

function renderMarketOverview(tickers) {
    // Calculate total market cap and volume from top coins
    const topTickers = tickers.slice(0, 50);
    const totalMarketCap = topTickers.reduce((sum, t) => sum + parseFloat(t.lastPrice) * parseFloat(t.volume) * 0.01, 0);
    const totalVolume = topTickers.reduce((sum, t) => sum + parseFloat(t.quoteVolume), 0);
    
    // BTC dominance
    const btcTicker = tickers.find(t => t.symbol === 'BTCUSDT');
    const btcVolume = btcTicker ? parseFloat(btcTicker.quoteVolume) : 0;
    const btcDominance = totalVolume > 0 ? ((btcVolume / totalVolume) * 100).toFixed(1) : '0';
    
    // BTC change
    const btcChange = btcTicker ? parseFloat(btcTicker.priceChangePercent) : 0;
    
    // Fear & Greed approximation based on BTC performance
    let fearGreed = 50;
    let fearGreedLabel = 'Neutral';
    if (btcChange > 5) { fearGreed = 85; fearGreedLabel = 'Extreme Greed'; }
    else if (btcChange > 2) { fearGreed = 70; fearGreedLabel = 'Greed'; }
    else if (btcChange > 0) { fearGreed = 60; fearGreedLabel = 'Greed'; }
    else if (btcChange > -2) { fearGreed = 40; fearGreedLabel = 'Fear'; }
    else if (btcChange > -5) { fearGreed = 25; fearGreedLabel = 'Extreme Fear'; }
    else { fearGreed = 15; fearGreedLabel = 'Extreme Fear'; }
    
    document.getElementById('total-market-cap').textContent = formatLargeNumber(totalMarketCap * 1000);
    document.getElementById('total-volume').textContent = formatLargeNumber(totalVolume);
    document.getElementById('btc-dominance').textContent = btcDominance + '%';
    document.getElementById('fear-greed').textContent = fearGreed;
    document.getElementById('fear-greed-label').textContent = fearGreedLabel;
    
    // Set change colors
    const marketChangeEl = document.getElementById('total-market-change');
    marketChangeEl.textContent = formatPercent(btcChange);
    marketChangeEl.className = 'card-change ' + getCardChangeClass(btcChange);
    
    const volumeChangeEl = document.getElementById('total-volume-change');
    volumeChangeEl.textContent = '24h Volume';
    volumeChangeEl.className = 'card-change';
    
    const dominanceChangeEl = document.getElementById('btc-dominance-change');
    dominanceChangeEl.textContent = 'BTC Dominance';
    dominanceChangeEl.className = 'card-change';
    
    const fgLabelEl = document.getElementById('fear-greed-label');
    fgLabelEl.className = 'card-change ' + (fearGreed >= 50 ? 'positive' : 'negative');
}

function renderPriceTable(tickers, searchQuery = '') {
    const tbody = document.getElementById('price-table-body');
    
    // Filter USDT pairs and sort by volume
    let usdtTickers = tickers.filter(t => t.symbol.endsWith('USDT'));
    
    // Apply search filter
    if (searchQuery) {
        const query = searchQuery.toUpperCase();
        usdtTickers = usdtTickers.filter(t => 
            t.symbol.includes(query) || 
            t.symbol.replace('USDT', '').includes(query)
        );
    }
    
    // Sort by quote volume (descending)
    usdtTickers.sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume));
    
    // Take top coins
    const topCoins = usdtTickers.slice(0, TOP_COINS_COUNT);
    
    if (topCoins.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">
                    No coins found matching "${searchQuery}"
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = topCoins.map((ticker, index) => {
        const symbol = ticker.symbol.replace('USDT', '');
        const price = parseFloat(ticker.lastPrice);
        const change = parseFloat(ticker.priceChangePercent);
        const marketCap = parseFloat(ticker.quoteVolume) * 100; // Approximation
        const volume = parseFloat(ticker.quoteVolume);
        const isPositive = change >= 0;
        
        // Check if price changed
        const prevPrice = previousPrices[ticker.symbol];
        let flashClass = '';
        if (prevPrice && price !== prevPrice) {
            flashClass = price > prevPrice ? 'flash-green' : 'flash-red';
        }
        
        // Generate sparkline data (simulated from recent data)
        const sparkData = generateSparklineData(price, change);
        const sparkline = generateSparkline(sparkData, isPositive);
        
        // Coin logo
        const logoUrl = getCoinLogoUrl(symbol);
        
        return `
            <tr class="${flashClass} ${selectedCoin === ticker.symbol ? 'selected' : ''}" 
                data-symbol="${ticker.symbol}"
                onclick="selectCoin('${ticker.symbol}')">
                <td>${index + 1}</td>
                <td>
                    <div class="coin-cell">
                        <img class="coin-icon" 
                             src="https://api.binance.com/bapi/asset/v2/public/asset-service/product/get-product-by-symbol?symbol=${symbol}" 
                             alt="${symbol}"
                             onerror="this.src='https://via.placeholder.com/32/1a2235/3b82f6?text=${symbol.substring(0,3)}'"
                             style="width:32px;height:32px;border-radius:50%;object-fit:cover;" />
                        <div class="coin-info">
                            <span class="coin-name">${symbol}</span>
                            <span class="coin-symbol">USDT</span>
                        </div>
                    </div>
                </td>
                <td class="price-value">${formatCurrency(price)}</td>
                <td class="${getChangeClass(change)}">${formatPercent(change)}</td>
                <td>${formatLargeNumber(marketCap)}</td>
                <td>${formatLargeNumber(volume)}</td>
                <td>${sparkline}</td>
            </tr>
        `;
    }).join('');
    
    // Update previous prices
    previousPrices = {};
    topCoins.forEach(t => {
        previousPrices[t.symbol] = parseFloat(t.lastPrice);
    });
}

function generateSparklineData(currentPrice, changePercent) {
    // Generate a realistic-looking sparkline based on current price and change
    const data = [];
    const points = 20;
    const startPrice = currentPrice / (1 + changePercent / 100);
    
    for (let i = 0; i < points; i++) {
        const progress = i / (points - 1);
        const basePrice = startPrice + (currentPrice - startPrice) * progress;
        const noise = (Math.random() - 0.5) * currentPrice * 0.01;
        data.push(basePrice + noise);
    }
    
    return data;
}

function renderTopGainers(tickers) {
    const container = document.getElementById('top-gainers');
    
    let usdtTickers = tickers.filter(t => t.symbol.endsWith('USDT'));
    usdtTickers.sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent));
    
    const topGainers = usdtTickers.slice(0, 5);
    
    container.innerHTML = topGainers.map(ticker => {
        const symbol = ticker.symbol.replace('USDT', '');
        const change = parseFloat(ticker.priceChangePercent);
        
        return `
            <div class="gainer-item" onclick="selectCoin('${ticker.symbol}')">
                <div class="gainer-coin">
                    <img class="gainer-icon" 
                         src="https://api.binance.com/bapi/asset/v2/public/asset-service/product/get-product-by-symbol?symbol=${symbol}"
                         alt="${symbol}"
                         onerror="this.src='https://via.placeholder.com/24/1a2235/10b981?text=${symbol.substring(0,2)}'"
                         style="width:24px;height:24px;border-radius:50%;object-fit:cover;" />
                    <span class="gainer-name">${symbol}</span>
                </div>
                <span class="gainer-change">${formatPercent(change)}</span>
            </div>
        `;
    }).join('');
}

function renderTopLosers(tickers) {
    const container = document.getElementById('top-losers');
    
    let usdtTickers = tickers.filter(t => t.symbol.endsWith('USDT'));
    usdtTickers.sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent));
    
    const topLosers = usdtTickers.slice(0, 5);
    
    container.innerHTML = topLosers.map(ticker => {
        const symbol = ticker.symbol.replace('USDT', '');
        const change = parseFloat(ticker.priceChangePercent);
        
        return `
            <div class="loser-item" onclick="selectCoin('${ticker.symbol}')">
                <div class="loser-coin">
                    <img class="loser-icon" 
                         src="https://api.binance.com/bapi/asset/v2/public/asset-service/product/get-product-by-symbol?symbol=${symbol}"
                         alt="${symbol}"
                         onerror="this.src='https://via.placeholder.com/24/1a2235/ef4444?text=${symbol.substring(0,2)}'"
                         style="width:24px;height:24px;border-radius:50%;object-fit:cover;" />
                    <span class="loser-name">${symbol}</span>
                </div>
                <span class="loser-change">${formatPercent(change)}</span>
            </div>
        `;
    }).join('');
}

async function renderCoinDetail(symbol) {
    const container = document.getElementById('coin-detail');
    const tickerData = await fetchTickerData();
    
    if (!tickerData) {
        container.innerHTML = '<p class="placeholder-text">Failed to load data</p>';
        return;
    }
    
    const ticker = tickerData.find(t => t.symbol === symbol);
    if (!ticker) {
        container.innerHTML = '<p class="placeholder-text">Coin not found</p>';
        return;
    }
    
    const coinSymbol = symbol.replace('USDT', '');
    const price = parseFloat(ticker.lastPrice);
    const change = parseFloat(ticker.priceChangePercent);
    const high = parseFloat(ticker.highPrice);
    const low = parseFloat(ticker.lowPrice);
    const volume = parseFloat(ticker.quoteVolume);
    const isPositive = change >= 0;
    
    // Fetch klines for chart
    const klines = await fetchKlines(symbol, '1h', 24);
    let chartHtml = '';
    if (klines && klines.length > 0) {
        const prices = klines.map(k => parseFloat(k[4])); // Close prices
        chartHtml = generateSparkline(prices, isPositive).replace('class="sparkline"', 'class="sparkline" style="width:100%;height:60px;"');
    }
    
    container.innerHTML = `
        <div class="detail-header">
            <img class="detail-icon" 
                 src="https://api.binance.com/bapi/asset/v2/public/asset-service/product/get-product-by-symbol?symbol=${coinSymbol}"
                 alt="${coinSymbol}"
                 onerror="this.src='https://via.placeholder.com/40/1a2235/3b82f6?text=${coinSymbol.substring(0,3)}'"
                 style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
            <div>
                <div class="detail-name">${coinSymbol}</div>
                <div class="detail-symbol">${symbol}</div>
            </div>
        </div>
        <div class="detail-price">${formatCurrency(price)}</div>
        <div class="detail-change ${getChangeClass(change)}">${formatPercent(change)} (24h)</div>
        ${chartHtml}
        <div class="detail-stats">
            <div class="detail-stat">
                <div class="detail-stat-label">24h High</div>
                <div class="detail-stat-value">${formatCurrency(high)}</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-label">24h Low</div>
                <div class="detail-stat-value">${formatCurrency(low)}</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-label">24h Volume</div>
                <div class="detail-stat-value">${formatLargeNumber(volume)}</div>
            </div>
            <div class="detail-stat">
                <div class="detail-stat-label">Price Change</div>
                <div class="detail-stat-value ${getChangeClass(change)}">${formatCurrency(parseFloat(ticker.priceChange))}</div>
            </div>
        </div>
    `;
}

// ===== Event Handlers =====

function selectCoin(symbol) {
    selectedCoin = symbol;
    renderCoinDetail(symbol);
    
    // Update selected row styling
    document.querySelectorAll('.price-table tbody tr').forEach(row => {
        row.classList.remove('selected');
        if (row.dataset.symbol === symbol) {
            row.classList.add('selected');
        }
    });
}

function updateLastUpdate() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('last-update').textContent = timeString;
}

// ===== Main Update Function =====

async function updateDashboard() {
    try {
        const tickers = await fetchTickerData();
        
        if (!tickers) {
            document.getElementById('status-text').textContent = 'Error';
            document.querySelector('.status-dot').style.background = 'var(--red)';
            return;
        }
        
        // Update status
        document.getElementById('status-text').textContent = 'Live';
        document.querySelector('.status-dot').style.background = 'var(--green)';
        
        // Render all sections
        renderMarketOverview(tickers);
        
        const searchQuery = document.getElementById('search-input').value;
        renderPriceTable(tickers, searchQuery);
        renderTopGainers(tickers);
        renderTopLosers(tickers);
        
        // Update last update time
        updateLastUpdate();
        
    } catch (error) {
        console.error('Dashboard update error:', error);
        document.getElementById('status-text').textContent = 'Error';
        document.querySelector('.status-dot').style.background = 'var(--red)';
    }
}

// ===== Search Handler =====

document.getElementById('search-input').addEventListener('input', (e) => {
    const tickers = Object.keys(previousPrices).length > 0 ? null : null;
    // We need to re-fetch or cache - for simplicity, we'll just filter on next update
    // For immediate feedback, let's store the last tickers
    if (window._lastTickers) {
        renderPriceTable(window._lastTickers, e.target.value);
    }
});

// ===== Initialize =====

async function init() {
    console.log('Initializing Crypto Live Dashboard...');
    
    // Initial load
    await updateDashboard();
    
    // Store tickers for search filtering
    const tickers = await fetchTickerData();
    if (tickers) {
        window._lastTickers = tickers;
    }
    
    // Set up auto-refresh
    refreshTimer = setInterval(async () => {
        await updateDashboard();
        const newTickers = await fetchTickerData();
        if (newTickers) {
            window._lastTickers = newTickers;
        }
    }, REFRESH_INTERVAL);
    
    // Select BTC by default
    setTimeout(() => {
        selectCoin('BTCUSDT');
    }, 2000);
    
    console.log('Dashboard initialized. Auto-refreshing every', REFRESH_INTERVAL / 1000, 'seconds.');
}

// Start the dashboard
init();
