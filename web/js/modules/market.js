// 全球市场模块 (整合亚洲市场与欧美市场)
// 依赖: utils.js, api.js, charts.js

class AsiaMarketController {
    constructor() {
    }

    async loadData() {
        console.log('📊 加载亚洲市场数据...');

        const promises = [
            this.loadCNFearGreed(),
            this.loadCNOverboughtOversold(),
            this.loadCNIndices(),
            this.loadCNBonds(),
            this.loadLPR()
        ];
        await Promise.allSettled(promises);
    }

    async loadCNIndices() {
        try {
            const data = await api.getCNIndices();
            this.renderCNIndices(data);
        } catch (error) {
            console.error('加载亚洲指数失败:', error);
            utils.renderError('asia-indices', '亚洲指数加载失败');
        }
    }

    renderCNIndices(data) {
        const container = document.getElementById('asia-indices');
        if (!container) return;

        if (data.error || !data.indices) {
            utils.renderError('asia-indices', data.error || '暂无数据');
            return;
        }

        const indices = data.indices || [];
        const formatIndexPoint = (value) => {
            if (value === null || value === undefined || isNaN(value)) return '--';
            return Number(value).toFixed(2);
        };

        let html = indices.map(item => {
            const changeVal = item.change_pct;
            const changeClass = changeVal > 0 ? 'text-up' : changeVal < 0 ? 'text-down' : '';
            const sign = changeVal > 0 ? '+' : '';
            const volHtml = (item.amount && item.amount > 0) 
                ? `<div class="index-vol">成交 ${utils.formatNumber(item.amount / 100000000)}亿</div>` 
                : `<div class="index-vol" style="visibility: hidden;">&nbsp;</div>`;

            return `
                <div class="index-item">
                    <div class="index-name">${item.name}</div>
                    <div class="index-price ${changeClass}">${formatIndexPoint(item.price)}</div>
                    <div class="index-change ${changeClass}">
                        ${sign}${formatIndexPoint(item.change_amount)} 
                        (${sign}${utils.formatPercentage(changeVal)})
                    </div>
                    ${volHtml}
                </div>
            `;
        }).join('');

        if (indices.length % 2 !== 0) {
            html += `<div class="index-item"></div>`;
        }

        container.innerHTML = html;
        container.classList.remove('loading');
    }

    async loadLPR() {
        try {
            const data = await api.getLPR();
            this.renderLPR(data);
        } catch (error) {
            console.error('加载 LPR 失败:', error);
            utils.renderError('macro-lpr', 'LPR 数据加载失败');
        }
    }

    renderLPR(data) {
        const container = document.getElementById('macro-lpr');
        if (!container) return;

        if (data.error || !data.current) {
            utils.renderError('macro-lpr', data.error || '暂无数据');
            return;
        }

        // Bind info button
        const infoBtn = document.getElementById('info-lpr');
        if (infoBtn) {
            infoBtn.onclick = () => utils.showInfoModal('LPR 利率', data.description || 'LPR 贷款市场报价利率，每月 20 日公布');
        }

        const { current } = data;
        const change1y = current.lpr_1y_change;
        const change5y = current.lpr_5y_change;

        const html = `
            <div class="heat-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="heat-cell">
                    <div class="item-sub">1年期 LPR</div>
                    <div class="fg-score" style="font-size: 28px;">${current.lpr_1y}%</div>
                    ${change1y !== 0 ? `<div class="item-sub ${change1y < 0 ? 'text-down' : 'text-up'}">${change1y > 0 ? '+' : ''}${change1y}bp</div>` : '<div class="item-sub">持平</div>'}
                </div>
                <div class="heat-cell">
                    <div class="item-sub">5年期 LPR</div>
                    <div class="fg-score" style="font-size: 28px;">${current.lpr_5y}%</div>
                    ${change5y !== 0 ? `<div class="item-sub ${change5y < 0 ? 'text-down' : 'text-up'}">${change5y > 0 ? '+' : ''}${change5y}bp</div>` : '<div class="item-sub">持平</div>'}
                </div>
            </div>
            <div style="text-align: center; font-size: 11px; color: var(--text-tertiary); margin-top: 8px;">
                最新报价日期: ${current.date}
            </div>
        `;
        container.innerHTML = html;
    }

    async loadCNFearGreed() {
        try {
            const data = await api.getCNFearGreed();
            this.renderCNFearGreed(data);
        } catch (error) {
            console.error('加载恐慌贪婪指数失败:', error);
            utils.renderError('asia-fear-greed', '恐慌贪婪指数加载失败');
        }
    }

    async loadCNOverboughtOversold() {
        try {
            const data = await api.getCNOverboughtOversold();
            utils.renderOverboughtOversold('asia-obo-signal', data);
        } catch (error) {
            console.error('加载超买超卖信号失败:', error);
        }
    }

    async loadCNBonds() {
        try {
            const data = await api.getCNTreasuryYields();
            this.renderCNBonds(data);
        } catch (error) {
            console.error('加载国债数据失败:', error);
            utils.renderError('asia-bonds', '国债数据加载失败');
        }
    }

    renderCNFearGreed(data) {
        const container = document.getElementById('asia-fear-greed');
        if (!container) return;

        if (data.error) {
            utils.renderError('asia-fear-greed', data.error);
            return;
        }

        // Bind Info Button
        const infoBtn = document.getElementById('info-asia-fear');
        if (infoBtn && data.explanation) {
            infoBtn.onclick = () => utils.showInfoModal('亚洲市场情绪指数 (上证指数)', utils.buildFearGreedModalBody(data));
            infoBtn.style.display = 'flex';
        }

        // Center content
        container.style.justifyContent = 'center';

        const factorsHtml = this.renderFearGreedFactors(data.indicators, false);

        container.innerHTML = `
            <div class="fg-gauge" id="asia-fear-greed-gauge"></div>
            <div class="fg-info" style="flex: 0 1 auto;">
                <div class="fg-level">${data.level}</div>
                <div class="fg-desc">${data.description || ''}</div>
                <div class="fg-sub-badge">
                    <span>多因子量化合成</span>
                    <span>·</span>
                    <span>A股行情与技术面</span>
                </div>
                ${factorsHtml}
            </div>
        `;

        if (window.charts) {
            setTimeout(() => {
                charts.createFearGreedGauge('asia-fear-greed-gauge', data);
            }, 100);
        }
    }

    renderFearGreedFactors(indicators, isUS = false) {
        if (!indicators || typeof indicators !== 'object') return '';
        const fallbackNames = {
            volatility: isUS ? 'VIX波动' : '年化波动',
            momentum: isUS ? '标普动量' : '价格动量',
            breadth: isUS ? '市场广度' : '价格区间',
            flow: '成交资金',
            rsi: 'RSI(14)',
            daily_change: '当日涨跌',
            price_position: '价格区间',
            vix: 'VIX波动',
            sp500_momentum: '标普动量',
            market_breadth: '市场广度'
        };
        let chipsHtml = '';
        for (const [key, val] of Object.entries(indicators)) {
            if (!val || typeof val !== 'object' || val.score == null) continue;
            const label = val.label || fallbackNames[key] || key;
            const score = Math.round(val.score);

            let chipClass = 'chip-neutral';
            if (score >= 58) chipClass = 'chip-up';
            else if (score <= 42) chipClass = 'chip-down';

            const weightStr = val.weight ? ` · 权重 ${Math.round(val.weight * 100)}%` : '';
            const valStr = val.value != null ? ` · 当前值: ${val.value}` : '';
            const noteStr = val.note ? `\n说明: ${val.note}` : '';
            const tooltip = `${label}\n因子分: ${score}分${weightStr}${valStr}${noteStr}`;

            chipsHtml += `
                <span class="fg-factor-chip ${chipClass}" title="${tooltip}">
                    ${label} ${score}
                </span>
            `;
        }
        return chipsHtml ? `<div class="fg-factors-grid">${chipsHtml}</div>` : '';
    }

    renderCNBonds(data) {
        const container = document.getElementById('asia-bonds');
        if (!container) return;

        if (!data || data.error) {
            utils.renderError('asia-bonds', data && data.error ? data.error : '暂无数据');
            return;
        }

        if (data.status === 'warming_up') {
            utils.renderWarmingUp('asia-bonds');
            return;
        }

        const yieldCurve = data.yield_curve || {};
        const keyRates = data.key_rates;

        let curveItems = [];
        if (Array.isArray(yieldCurve)) {
            curveItems = yieldCurve;
        } else {
            curveItems = Object.entries(yieldCurve).map(([period, rate]) => ({
                period: period.toUpperCase(),
                yield: rate,
                change_bp: data.yield_changes ? (data.yield_changes[period] || 0) : 0
            }));
        }

        if (keyRates) {
            const html = `
                <div class="bond-scroll">
                    ${curveItems.map(item => `
                        <div class="bond-item">
                            <span class="bond-name">${item.period}</span>
                            <span class="bond-rate">${utils.formatPercentage(item.yield)}</span>
                             <span class="bond-change ${utils.formatChange(item.change_bp).class}" style="font-size: 10px; display: block;">
                                ${item.change_bp > 0 ? '+' : ''}${item.change_bp}bp
                            </span>
                        </div>
                    `).join('')}
                </div>
                <div style="font-size: 12px; padding: 8px; color: var(--text-secondary); border-top: 1px solid var(--border-light); text-align: center;">
                    <div>10年期-2年期 = 期限利差: <span style="font-weight: 600;">${utils.formatNumber(keyRates.spread_10y_2y, 3)}%</span></div>
                    <div style="margin-top: 4px; color: ${keyRates.spread_10y_2y < 0 ? 'var(--accent-red)' : 'var(--text-primary)'}">
                        ${data.curve_analysis?.comment || ''}
                    </div>
                </div>
            `;
            container.innerHTML = html;
        } else {
            const html = curveItems.map(item => `
                <div class="bond-item">
                    <span class="bond-name">${item.period || item.name}</span>
                    <span class="bond-rate">${item.yield || item.value}%</span>
                </div>
            `).join('');
            container.innerHTML = html;
        }
    }
}

class WesternMarketController {
    constructor() {
    }

    async loadData() {
        console.log('📊 加载欧美市场数据...');
        const promises = [
            this.loadUSFearGreed(),
            this.loadUSOverboughtOversold(),
            this.loadUSLeaders(),
            this.loadUSBondYields()
        ];
        await Promise.allSettled(promises);
    }

    async loadUSOverboughtOversold() {
        try {
            const data = await api.getUSOverboughtOversold();
            utils.renderOverboughtOversold('western-obo-signal', data);
        } catch (error) {
            console.error('加载美股超买超卖信号失败:', error);
        }
    }

    async loadUSFearGreed() {
        try {
            const data = await api.getUSCustomFearGreed();
            this.renderUSFearGreed(data);

            if (window.lucide) lucide.createIcons();
        } catch (error) {
            console.error('加载美国市场恐慌指数失败:', error);
            utils.renderError('western-fear-greed', '美国市场恐慌指数加载失败');
        }
    }

    async loadUSMarketHeat() {
        try {
            const data = await api.getUSMarketHeat();
            this.renderUSMarketHeat(data);
        } catch (error) {
            console.error('加载美国市场热度失败:', error);
            utils.renderError('market-western-heat', '美国市场热度加载失败');
        }
    }

    async loadUSBondYields() {
        try {
            const data = await api.getUSBondYields();
            this.renderUSBondYields(data);
        } catch (error) {
            console.error('加载美债数据失败:', error);
            utils.renderError('western-treasury', '美债数据加载失败');
        }
    }

    async loadUSLeaders() {
        try {
            const data = await api.getUSMarketLeaders();
            if (data._warming_up) {
                console.info('欧美主要指数数据预热中...');
                utils.renderWarmingUp('western-indices');
                this._leadersRetryCount = (this._leadersRetryCount || 0) + 1;
                if (this._leadersRetryCount <= 12 && !this._leadersRetryTimer) {
                    this._leadersRetryTimer = setTimeout(() => {
                        this._leadersRetryTimer = null;
                        this.loadUSLeaders();
                    }, 5000);
                }
                return;
            }
            this._leadersRetryCount = 0;
            if (data.error || data._error) {
                console.error('加载欧美主要指数API返回错误:', data.error || data.message);
                utils.renderError('western-indices', data.error || data.message || '主要指数加载失败');
                return;
            }
            this.renderUSLeaders(data);
        } catch (error) {
            console.error('加载欧美主要指数失败:', error);
            utils.renderError('western-indices', '主要指数加载失败');
        }
    }

    getIndicatorName(key) {
        const names = {
            volatility: 'VIX波动',
            momentum: '标普动量',
            breadth: '市场广度',
            flow: '资金流',
            rsi: 'RSI',
            vix: 'VIX波动率',
            sp500_momentum: '标普动量',
            market_breadth: '市场广度',
            daily_change: '当日涨跌',
            price_position: '价格区间',
            safe_haven: '避险需求',
            junk_bond_demand: '垃圾债',
            market_volatility: '波动率',
            put_call_options: '期权',
            market_momentum: '动量',
            stock_price_strength: '股价强度',
            stock_price_breadth: '市场广度',
            safe_haven_demand: '避险'
        };
        return names[key] || key;
    }

    renderFearGreedFactors(indicators, isUS = true) {
        if (!indicators || typeof indicators !== 'object') return '';
        const fallbackNames = {
            volatility: 'VIX波动',
            momentum: '标普动量',
            breadth: '市场广度',
            flow: '资金流',
            rsi: 'RSI(14)',
            daily_change: '当日涨跌',
            price_position: '价格区间',
            vix: 'VIX波动',
            sp500_momentum: '标普动量',
            market_breadth: '市场广度'
        };
        let chipsHtml = '';
        for (const [key, val] of Object.entries(indicators)) {
            if (!val || typeof val !== 'object' || val.score == null) continue;
            const label = val.label || fallbackNames[key] || this.getIndicatorName(key);
            const score = Math.round(val.score);

            let chipClass = 'chip-neutral';
            if (score >= 58) chipClass = 'chip-high';
            else if (score <= 42) chipClass = 'chip-low';

            const weightStr = val.weight ? ` · 权重 ${Math.round(val.weight * 100)}%` : '';
            const valStr = val.value != null ? ` · 当前值: ${val.value}` : '';
            const noteStr = val.note ? `\n说明: ${val.note}` : '';
            const tooltip = `${label}\n因子分: ${score}分${weightStr}${valStr}${noteStr}`;

            chipsHtml += `
                <span class="fg-factor-chip ${chipClass}" title="${tooltip}">
                    ${label} ${score}
                </span>
            `;
        }
        return chipsHtml ? `<div class="fg-factors-grid">${chipsHtml}</div>` : '';
    }

    renderUSFearGreed(data) {
        const container = document.getElementById('western-fear-greed');
        if (!container) return;

        container.style.justifyContent = 'center';

        const renderFallback = (message) => {
            let displayMsg = message;
            if (message === 'warming_up' || message === 'warming up') {
                displayMsg = '<i data-lucide="clock" width="14" style="vertical-align: middle; margin-right: 4px;"></i> 数据预热中，请稍后刷新';
            }
            container.innerHTML = `
                <div style="text-align: center; padding: 20px;">
                    <div style="margin-bottom: 12px; color: var(--text-secondary); font-size: 14px;">${displayMsg}</div>
                    <a href="https://edition.cnn.com/markets/fear-and-greed" target="_blank" class="btn-primary" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 6px; background: var(--accent-blue); color: white; text-decoration: none; font-size: 13px;">
                        CNN 官网参考
                        <i data-lucide="external-link" width="14"></i>
                    </a>
                    <div style="margin-top: 8px; font-size: 11px; color: var(--text-tertiary);">当前页面为自定义估算指数</div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        };

        if (!data || data.error) {
            renderFallback(data ? data.error : '暂无数据');
            return;
        }

        const infoBtn = document.getElementById('info-western-fear');
        if (infoBtn && data.explanation) {
            infoBtn.onclick = () => utils.showInfoModal('欧美市场情绪指数 (标普500代理)', utils.buildFearGreedModalBody(data));
            infoBtn.style.display = 'flex';
        }

        const score = data.score;
        const level = data.level || '未知';
        const indicators = data.indicators;

        if (score == null) {
            renderFallback('恐慌指数数据不可用');
            return;
        }

        const factorsHtml = this.renderFearGreedFactors(indicators, true);

        let contentHtml = `
            <div class="fg-gauge" id="western-fear-greed-gauge"></div>
            <div class="fg-info" style="flex: 0 1 auto;">
                <div class="fg-level">${level}</div>
                <div class="fg-desc">${data.description || ''}</div>
                <div class="fg-sub-badge">
                    <span>美股多因子量化代理</span>
                    <span>·</span>
                    <a href="https://edition.cnn.com/markets/fear-and-greed" target="_blank" class="fg-sub-link" title="查看 CNN 官网 Fear & Greed 实时指数">
                        CNN官方参考
                        <i data-lucide="external-link" width="10"></i>
                    </a>
                </div>
                ${factorsHtml}
            </div>
        `;

        container.innerHTML = contentHtml;

        if (window.charts) {
            setTimeout(() => {
                charts.createFearGreedGauge('western-fear-greed-gauge', data);
            }, 100);
        }
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    renderUSMarketHeat(data) {
        const container = document.getElementById('market-western-heat');
        if (!container) return;

        if (data && data.error) {
            container.classList.remove('heat-grid');
            utils.renderError('market-western-heat', data.error);
            return;
        }

        if (!data || !Array.isArray(data) || data.length === 0) {
            container.classList.remove('heat-grid');
            utils.renderError('market-western-heat', '暂无数据');
            return;
        }

        container.classList.add('heat-grid');

        const html = data.map(item => {
            const change = item.change_pct;
            const changeClass = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.getChangeClass(change) : (change >= 0 ? 'text-up' : 'text-down');

            return `
                <div class="heat-cell">
                    <div class="item-sub">${item.name}</div>
                    <div class="heat-val ${changeClass}">${utils.formatPercentage(change)}</div>
                </div>
            `;
        }).join('');

        container.innerHTML = html;
        container.className = 'heat-grid';
    }

    renderUSBondYields(data) {
        const container = document.getElementById('western-treasury');
        if (!container) return;

        if (data && data.error) {
            utils.renderError('western-treasury', data.error);
            return;
        }

        if (!data) {
            utils.renderError('western-treasury', '暂无数据');
            return;
        }

        const infoBtn = document.getElementById('info-western-treasury');
        if (infoBtn) {
            infoBtn.onclick = () => utils.showInfoModal('美债收益率指标说明',
                `1. 10Y-2Y 利差 (衰退预警)
关注倒挂（负值）。当短期收益率高于长期时，是历史上预测衰退最准确的信号。

2. 2年期美债 (政策风向)
对美联储利率政策最敏感。大幅上涨通常意味着市场预期加息或短期降息预期落空。

3. 10年期美债 (资产定价之锚)
全球风险资产的定价基准。收益率过高(>4.5%)会显著抽走股市流动性，压低资产估值。

4. 30年期美债 (长期预期)
反映由于对长期通胀失控或国家债务规模担忧而要求的额外补偿（期限溢价）。`);
            infoBtn.style.display = 'flex';
        }

        let metrics = [];
        if (Array.isArray(data)) {
            metrics = data;
        } else if (data.metrics) {
            metrics = data.metrics;
        } else {
            utils.renderError('western-treasury', '数据格式错误');
            return;
        }

        if (metrics.length === 0) {
            utils.renderError('western-treasury', '暂无数据');
            return;
        }

        let html = `<div class="bond-scroll" style="flex-wrap: wrap;">`;

        metrics.forEach(item => {
            let changeHtml = '';
            if (item.change !== undefined) {
                const changeClass = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.getChangeClass(item.change) : (item.change > 0 ? 'text-up' : item.change < 0 ? 'text-down' : '');
                const sign = item.change > 0 ? '+' : '';
                changeHtml = `<span class="${changeClass}" style="font-size: 12px; margin-left: 6px;">${sign}${item.change}</span>`;
            }

            let analysisHtml = '';
            if (item.analysis) {
                let color = 'var(--text-secondary)';
                if (item.analysis.level === 'danger') color = 'var(--color-up, var(--accent-red))';
                if (item.analysis.level === 'warning') color = '#f59e0b';
                if (item.analysis.level === 'good') color = 'var(--color-down, var(--accent-green))';

                analysisHtml = `<div style="font-size: 11px; margin-top: 6px; color: ${color}; line-height: 1.3;">${item.analysis.text}</div>`;
            }

            let valClass = '';
            if (item.is_spread) {
                valClass = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.getChangeClass(item.value) : (item.value < 0 ? 'text-down' : 'text-up');
            }

            html += `
                <div class="bond-item" style="flex: 1 0 140px; text-align: left; padding: 12px; display: flex; flex-direction: column; justify-content: space-between;">
                    <div>
                        <div class="bond-name">${item.name}</div>
                        <div style="display: flex; align-items: baseline;">
                            <span class="bond-rate ${valClass}" style="font-size: 18px;">${item.value}${item.suffix || ''}</span>
                            ${changeHtml}
                        </div>
                    </div>
                    ${analysisHtml}
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;
        container.style.display = 'block';
    }

    renderUSLeaders(data) {
        const container = document.getElementById('western-indices');
        const container2 = document.getElementById('western-sp500');
        if (container2) {
            container2.style.display = 'none';
        }

        if (!container) return;

        const indices = data.indices || [];
        if (indices.length === 0) {
            container.classList.remove('heat-grid');
            container.classList.add('list-container');
            utils.renderError('western-indices', '暂无指数数据');
            return;
        }

        container.classList.remove('list-container');
        container.classList.add('heat-grid');
        container.style.gridTemplateColumns = 'repeat(2, 1fr)';

        let html = indices.map(item => {
            const changeVal = item.change_pct;
            const changeClass = typeof APP_CONFIG !== 'undefined' ? APP_CONFIG.getChangeClass(changeVal) : (changeVal > 0 ? 'text-up' : changeVal < 0 ? 'text-down' : '');
            const sign = changeVal > 0 ? '+' : '';

            const changeAmt = item.change_amount != null ? item.change_amount : (item.price * item.change_pct / 100);

            return `
                <div class="index-item">
                    <div class="index-name">${item.name}</div>
                    <div class="index-price ${changeClass}">${utils.formatNumber(item.price)}</div>
                    <div class="index-change ${changeClass}">
                        ${sign}${utils.formatNumber(changeAmt)} 
                        (${sign}${utils.formatPercentage(changeVal)})
                    </div>
                </div>
            `;
        }).join('');

        if (indices.length % 2 !== 0) {
            html += `<div class="index-item"></div>`;
        }

        container.innerHTML = html;
        container.classList.remove('loading');
    }
}

class MarketController {
    constructor() {
        this.asiaController = new AsiaMarketController();
        this.westernController = new WesternMarketController();
        this.macroAssetsData = null;
        this.currentMacroPeriod = '20d';
        this.macroPeriodEventsBound = false;
        this.macroChart = null;
    }

    async loadData() {
        console.log('📊 加载全球市场数据 (流动性 + 亚洲市场 + 欧美市场)...');
        await Promise.allSettled([
            this.loadLiquidity(),
            this.asiaController.loadData(),
            this.westernController.loadData()
        ]);
    }

    async loadLiquidity() {
        try {
            const data = await api.getGlobalLiquidity();
            this.renderLiquidity(data);
        } catch (error) {
            console.error('加载全球宏观流动性数据失败:', error);
        }
    }

    renderLiquidity(res) {
        const data = (res && res.data) ? res.data : res;
        if (!data || data.error) return;

        // 1. Regime Badge
        const badge = document.getElementById('liquidity-regime-badge');
        const badgeText = document.getElementById('liquidity-regime-text');
        if (badge && badgeText && data.regime) {
            badgeText.textContent = data.regime.name;
            badge.className = `liquidity-badge regime-${data.regime.level || 'info'}`;
        }

        // 2. 底座三项微型宏观指标
        if (data.dxy) {
            const dxyVal = document.getElementById('liq-dxy-val');
            const dxyStatus = document.getElementById('liq-dxy-status');
            if (dxyVal) {
                const sign = data.dxy.change_pct > 0 ? '+' : '';
                const trendClass = data.dxy.change_pct > 0 ? 'text-up' : data.dxy.change_pct < 0 ? 'text-down' : '';
                dxyVal.innerHTML = `${data.dxy.value} <span class="metric-trend ${trendClass}" style="font-size: 11px;">(${sign}${data.dxy.change_pct}%)</span>`;
            }
            if (dxyStatus) dxyStatus.textContent = `${data.dxy.status} · 现金相对强弱`;
        }

        if (data.tips_10y) {
            const tipsVal = document.getElementById('liq-tips-val');
            const tipsStatus = document.getElementById('liq-tips-status');
            if (tipsVal) tipsVal.textContent = `${data.tips_10y.value}%`;
            if (tipsStatus) tipsStatus.textContent = `${data.tips_10y.status} · 贴现率真锚 (${data.tips_10y.date || '最新'})`;
        }

        if (data.net_liquidity) {
            const netVal = document.getElementById('liq-net-val');
            const netStatus = document.getElementById('liq-net-status');
            if (netVal) netVal.textContent = `$${data.net_liquidity.value}T`;
            if (netStatus) netStatus.textContent = `${data.net_liquidity.status} · 美元活水 (${data.net_liquidity.date || '最新'})`;
        }

        // 3. 存储资产与流向数据并渲染
        if (data.assets && data.assets.length > 0) {
            this.macroAssetsData = data.assets;
        }

        if (!this.macroPeriodEventsBound) {
            this.bindMacroPeriodEvents();
            this.macroPeriodEventsBound = true;
        }

        this.updateMacroAssetsChart();
        this.renderCapitalFlowPipeline();
    }

    bindMacroPeriodEvents() {
        const pills = document.querySelectorAll('#macro-asset-period-pills .period-pill');
        pills.forEach(pill => {
            pill.onclick = () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentMacroPeriod = pill.dataset.period || '20d';
                this.updateMacroAssetsChart();
                this.renderCapitalFlowPipeline();
            };
        });
    }

    updateMacroAssetsChart() {
        const container = document.getElementById('macro-assets-chart');
        if (!container || !this.macroAssetsData || this.macroAssetsData.length === 0) return;

        const period = this.currentMacroPeriod || '20d';
        let barCount = 20;
        if (period === '5d') barCount = 5;
        else if (period === '60d') barCount = 60;

        // 收集所有资产在所选周期内的有效日期并集
        const dateSet = new Set();
        this.macroAssetsData.forEach(item => {
            const hist = item.history || [];
            const slice = hist.slice(-Math.min(hist.length, barCount + 5));
            slice.forEach(h => {
                if (h[0]) dateSet.add(h[0]);
            });
        });

        let unifiedDates = Array.from(dateSet).sort();
        if (unifiedDates.length > barCount) {
            unifiedDates = unifiedDates.slice(-barCount);
        }
        if (unifiedDates.length === 0) return;

        const startDate = unifiedDates[0];

        const series = [];
        const legendItems = [];

        this.macroAssetsData.forEach(item => {
            const hist = item.history || [];
            const dateMap = new Map();
            hist.forEach(h => {
                if (h[1] != null && h[1] > 0) dateMap.set(h[0], h[1]);
            });

            // 寻找基准价格
            let basePrice = dateMap.get(startDate);
            if (basePrice == null) {
                for (let i = hist.length - 1; i >= 0; i--) {
                    if (hist[i][0] <= startDate && hist[i][1] != null && hist[i][1] > 0) {
                        basePrice = hist[i][1];
                        break;
                    }
                }
            }
            if (basePrice == null && hist.length > 0) {
                basePrice = hist[0][1];
            }

            let lastClose = basePrice;
            const returns = [];

            unifiedDates.forEach(date => {
                if (dateMap.has(date)) {
                    lastClose = dateMap.get(date);
                }
                if (basePrice && basePrice > 0 && lastClose != null && lastClose > 0) {
                    const ret = ((lastClose - basePrice) / basePrice) * 100;
                    returns.push(Number(ret.toFixed(2)));
                } else {
                    returns.push(0);
                }
            });

            const finalReturn = returns.length > 0 ? returns[returns.length - 1] : 0;
            legendItems.push({
                name: item.name,
                code: item.code,
                color: item.color,
                ret: finalReturn
            });

            series.push({
                name: item.name,
                code: item.code,
                type: 'line',
                data: returns,
                smooth: 0.2,
                showSymbol: false,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: {
                    width: 2.2,
                    color: item.color
                },
                itemStyle: {
                    color: item.color
                },
                emphasis: {
                    focus: 'series',
                    lineStyle: { width: 3.5 }
                }
            });
        });

        // 渲染顶部图例 Chips
        const legendContainer = document.getElementById('macro-chart-legend');
        if (legendContainer) {
            legendContainer.innerHTML = legendItems.map(item => {
                const sign = item.ret > 0 ? '+' : '';
                const trendClass = item.ret > 0 ? 'text-up' : item.ret < 0 ? 'text-down' : '';
                return `
                    <div class="macro-asset-chip">
                        <span class="chip-dot" style="background-color: ${item.color};"></span>
                        <span>${item.name}</span>
                        <span class="chip-val ${trendClass}">${sign}${item.ret}%</span>
                    </div>
                `;
            }).join('');
        }

        // 0% 基准虚线
        if (series.length > 0) {
            series[0].markLine = {
                silent: true,
                symbol: 'none',
                label: {
                    show: true,
                    position: 'end',
                    formatter: ' 0.00%',
                    color: '#9ca3af',
                    fontSize: 10
                },
                lineStyle: {
                    color: '#9ca3af',
                    type: 'dashed',
                    width: 1.2
                },
                data: [{ yAxis: 0 }]
            };
        }

        if (typeof echarts === 'undefined') return;

        let chart = echarts.getInstanceByDom(container);
        if (!chart) {
            chart = echarts.init(container);
            window.addEventListener('resize', () => chart && chart.resize());
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        const option = {
            backgroundColor: 'transparent',
            animationDuration: 300,
            grid: {
                left: '3%',
                right: '4%',
                top: '12%',
                bottom: '8%',
                containLabel: true
            },
            tooltip: {
                trigger: 'axis',
                confine: true,
                axisPointer: {
                    type: 'cross',
                    lineStyle: {
                        color: isDark ? 'rgba(255,255,255,0.2)' : '#cbd5e1',
                        type: 'dashed'
                    }
                },
                backgroundColor: isDark ? 'rgba(24, 24, 27, 0.95)' : 'rgba(255, 255, 255, 0.98)',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
                borderWidth: 1,
                padding: [8, 12],
                textStyle: {
                    color: isDark ? '#f4f4f5' : '#1f2937',
                    fontSize: 12
                },
                formatter: function (params) {
                    if (!params || params.length === 0) return '';
                    const dateStr = params[0].axisValue;
                    const sorted = [...params].sort((a, b) => (b.value ?? -999) - (a.value ?? -999));
                    let html = `<div style="font-weight: 600; font-size: 12px; margin-bottom: 6px; border-bottom: 1px solid ${isDark ? '#333' : '#eee'}; padding-bottom: 3px;">${dateStr} 累计收益率</div>`;
                    html += '<div style="display: flex; flex-direction: column; gap: 4px; min-width: 170px;">';
                    sorted.forEach(p => {
                        const marker = p.marker;
                        const name = p.seriesName;
                        const val = p.value != null ? Number(p.value).toFixed(2) : '--';
                        const sign = p.value > 0 ? '+' : '';
                        const color = p.value > 0 ? '#ef4444' : p.value < 0 ? '#22c55e' : (isDark ? '#a1a1aa' : '#6b7280');
                        html += `
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11.5px;">
                                <span>${marker} ${name}</span>
                                <span style="font-family: monospace; font-weight: 700; color: ${color};">${sign}${val}%</span>
                            </div>
                        `;
                    });
                    html += '</div>';
                    return html;
                }
            },
            xAxis: {
                type: 'category',
                data: unifiedDates,
                axisLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.15)' : '#e5e7eb' } },
                axisLabel: {
                    color: isDark ? '#a1a1aa' : '#6b7280',
                    fontSize: 11,
                    formatter: value => value ? value.substring(5) : ''
                },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                splitLine: {
                    lineStyle: {
                        color: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9'
                    }
                },
                axisLabel: {
                    color: isDark ? '#a1a1aa' : '#6b7280',
                    fontSize: 11,
                    formatter: '{value}%'
                }
            },
            series: series
        };

        chart.setOption(option, true);
    }

    renderCapitalFlowPipeline() {
        const pipelineContainer = document.getElementById('capital-flow-pipeline');
        if (!pipelineContainer || !this.macroAssetsData || this.macroAssetsData.length === 0) return;

        const periodKey = this.currentMacroPeriod || '20d';

        const outflows = [];
        const inflows = [];

        this.macroAssetsData.forEach(item => {
            const ret = item.returns ? (item.returns[periodKey] ?? 0) : 0;
            const assetObj = {
                name: item.name,
                code: item.code,
                color: item.color,
                change: ret
            };
            if (ret < 0) {
                outflows.push(assetObj);
            } else {
                inflows.push(assetObj);
            }
        });

        outflows.sort((a, b) => a.change - b.change);
        inflows.sort((a, b) => b.change - a.change);

        const dxy = this.macroAssetsData.find(a => a.code === 'DXY');
        const spx = this.macroAssetsData.find(a => a.code === 'SP500');
        const dxyRet = dxy && dxy.returns ? dxy.returns[periodKey] : 0;
        const spxRet = spx && spx.returns ? spx.returns[periodKey] : 0;

        let bridgeTitle = '资金双向轮动';
        let bridgeDesc = '跨资产分化再平衡，资金处于再配置阶段';

        if (dxyRet > 0 && outflows.some(a => a.code === 'SP500') && outflows.some(a => a.code === 'GOLD')) {
            bridgeTitle = '流动性虹吸 · 资金撤向避风港';
            bridgeDesc = '股债金三杀去杠杆，高贴现率压制下高息现金成为唯一避风港';
        } else if (spxRet > 0) {
            bridgeTitle = '风险追逐 · 资金回流核心资产';
            bridgeDesc = '避险资产离场，流动性回流权益与成长标的 (Risk-On)';
        } else if (outflows.some(a => a.code === 'SP500') && inflows.some(a => a.code === 'GOLD' || a.code === 'TLT')) {
            bridgeTitle = '经典避险 · 防御资金买金买债';
            bridgeDesc = '股市风险释放，避险资金有序涌入黄金与长端国债 (Flight to Safety)';
        }

        let outflowsHtml = '';
        if (outflows.length > 0) {
            outflowsHtml = outflows.map(o => `
                <div class="flow-asset-pill">
                    <span class="pill-dot" style="background-color: ${o.color};"></span>
                    <span class="pill-name">${o.name}</span>
                    <span class="pill-ret text-down">${o.change}%</span>
                </div>
            `).join('');
        } else {
            outflowsHtml = '<span style="font-size: 11.5px; color: var(--text-secondary);">暂无明显承压抛售资产</span>';
        }

        let inflowsHtml = '';
        if (inflows.length > 0) {
            inflowsHtml = inflows.map(i => {
                const isDxy = i.code === 'DXY';
                const subTip = isDxy ? ' (高息现金吸金池)' : '';
                return `
                    <div class="flow-asset-pill" style="${isDxy ? 'border-color: rgba(139, 92, 246, 0.4);' : ''}">
                        <span class="pill-dot" style="background-color: ${i.color};"></span>
                        <span class="pill-name">${i.name}${subTip}</span>
                        <span class="pill-ret text-up">+${i.change}%</span>
                    </div>
                `;
            }).join('');
        } else {
            inflowsHtml = '<span style="font-size: 11.5px; color: var(--text-secondary);">全线收缩观望</span>';
        }

        pipelineContainer.innerHTML = `
            <div class="flow-side">
                <div class="flow-header">
                    <span class="flow-tag outflow">流出端 (承压抛售)</span>
                </div>
                <div class="flow-asset-list">
                    ${outflowsHtml}
                </div>
            </div>

            <div class="flow-dynamic-bridge">
                <div class="bridge-action">
                    <span class="action-badge">${bridgeTitle}</span>
                    <div class="bridge-arrows">
                        <span>●</span>
                        <span style="letter-spacing: 2px;">┈┈►</span>
                    </div>
                    <span class="bridge-desc">${bridgeDesc}</span>
                </div>
            </div>

            <div class="flow-side">
                <div class="flow-header">
                    <span class="flow-tag inflow">流入端 (吸金/避风港)</span>
                </div>
                <div class="flow-asset-list">
                    ${inflowsHtml}
                </div>
            </div>
        `;
    }
}

