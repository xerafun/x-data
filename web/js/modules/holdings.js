// 顶级机构与知名投资人 13F 持仓风向标模块 (对标项目全站规范与 Token)
// 依赖: utils.js, api.js, styles.css

class HoldingsController {
    constructor() {
        this.currentManagerId = 'buffett'; // 纯内存默认选中第1位（巴菲特），不拼接 URL 参数，不持久化
        this.overviewData = null;
        this.managerCache = new Map();
        this._retryCount = 0;
        this._retryTimer = null;
        window.holdingsController = this;
    }

    async loadData() {
        console.log('📊 加载 13F 顶级机构持仓数据...');
        const container = document.getElementById('holdings-container');
        if (!container) return;

        if (!this.overviewData) {
            container.innerHTML = '<div class="loading"><i data-lucide="loader-2" class="spin"></i> 数据加载中...</div>';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await api.getHoldingsOverview();
            const data = (res && res.data) ? res.data : res;

            if (data && data.status === 'warming_up') {
                utils.renderWarmingUp('holdings-container');
                this._retryCount = (this._retryCount || 0) + 1;
                if (this._retryCount <= 10 && !this._retryTimer) {
                    this._retryTimer = setTimeout(() => {
                        this._retryTimer = null;
                        this.loadData();
                    }, 3000);
                }
                return false;
            }
            this._retryCount = 0;

            if (!data || (!data.managers && !Array.isArray(data))) {
                utils.renderError('holdings-container', (data && (data.message || data.error)) || '暂无顶级机构持仓数据');
                return false;
            }

            this.overviewData = data;

            // 一次性将全部投资人的完整持仓直接写入前端内存缓存，保障后续 0ms 瞬间切换
            if (data.managers) {
                data.managers.forEach(m => {
                    this.managerCache.set(m.id, {
                        manager: m,
                        holdings: m.holdings || []
                    });
                });
            }

            this.render();
            this.bindFilterButtons();
            return true;
        } catch (error) {
            console.error('加载机构持仓失败:', error);
            utils.renderError('holdings-container', '顶级机构持仓数据加载失败');
            return false;
        }
    }

    bindFilterButtons() {
        const buttons = document.querySelectorAll('.holdings-filter-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.manager === this.currentManagerId);
            btn.onclick = () => {
                const managerId = btn.dataset.manager;
                if (!managerId || this.currentManagerId === managerId) return;
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectManager(managerId);
            };
        });
    }

    selectManager(managerId) {
        if (this.currentManagerId === managerId) return;
        this.currentManagerId = managerId;

        // 保持 URL 干净，不拼接 manager 参数，不持久化存储
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has('manager')) {
                url.searchParams.delete('manager');
                window.history.replaceState({}, '', url.toString());
            }
        } catch (e) {}

        // 同步页头按钮激活状态
        const buttons = document.querySelectorAll('.holdings-filter-btn');
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.manager === this.currentManagerId);
        });

        // 0ms 瞬间局部更新画像及持仓明细，避免全页重排
        this.renderDetail();
    }

    formatMoney(val) {
        if (val === null || val === undefined || isNaN(val)) return '--';
        const num = parseFloat(val);
        if (num >= 1e8) {
            return `$${(num / 1e8).toFixed(1)} 亿`;
        } else if (num >= 1e4) {
            return `$${(num / 1e4).toFixed(1)} 万`;
        }
        return `$${Number(num).toLocaleString()}`;
    }

    renderActionBadge(action, label) {
        const text = label || '持有';
        if (action === 'buy') {
            return `<span class="badge-action badge-action-buy"><i data-lucide="trending-up" width="11"></i> ${text}</span>`;
        } else if (action === 'sell') {
            return `<span class="badge-action badge-action-sell"><i data-lucide="trending-down" width="11"></i> ${text}</span>`;
        } else if (action === 'new') {
            return `<span class="badge-action badge-action-new"><i data-lucide="sparkles" width="11"></i> ${text}</span>`;
        }
        return `<span class="badge-action badge-action-hold"><i data-lucide="minus" width="11"></i> ${text}</span>`;
    }

    render() {
        const container = document.getElementById('holdings-container');
        if (!container || !this.overviewData) return;

        container.innerHTML = `
            <div id="holdings-detail-container"></div>
            <div id="holdings-consensus-container"></div>
        `;

        this.renderDetail();
        this.renderConsensus();
    }

    renderDetail() {
        const detailContainer = document.getElementById('holdings-detail-container');
        if (!detailContainer) return;

        const currentEntry = this.managerCache.get(this.currentManagerId);
        if (!currentEntry) {
            detailContainer.innerHTML = '<div class="loading"><i data-lucide="loader-2" class="spin"></i> 加载中...</div>';
            if (window.lucide) lucide.createIcons();
            return;
        }

        const { manager: currentManager, holdings: currentHoldings = [] } = currentEntry;

        const html = `
            <div class="card">
                <div class="holdings-card-header">
                    <div class="holdings-title-group">
                        <div class="card-title" style="margin: 0;">
                            <i data-lucide="layers" width="16"></i>
                            <span class="holdings-manager-name">${currentManager.name}</span>
                            <span class="holdings-inst-name">${currentManager.institution}</span>
                        </div>
                        <span class="holdings-tag">${currentManager.style}</span>
                    </div>
                    <div class="holdings-stats">
                        <span>规模 <b>${this.formatMoney(currentManager.total_value)}</b></span>
                        <span class="sep">|</span>
                        <span>CR10 <b>${currentManager.cr10}%</b></span>
                        <span class="sep">|</span>
                        <span>持股 <b>${currentManager.holding_count}只</b></span>
                        <span class="sep">|</span>
                        <span>报告期 <b>${currentManager.filing_date}</b></span>
                    </div>
                </div>

                <div class="card-body" style="padding: 0;">
                    <div class="table-wrapper">
                        <table class="qdii-table holdings-table">
                            <thead>
                                <tr>
                                    <th style="width: 38px; text-align: center;">#</th>
                                    <th style="text-align: left;">标的资产</th>
                                    <th style="text-align: right; width: 120px;">持仓市值</th>
                                    <th style="text-align: left; min-width: 120px;">组合权重</th>
                                    <th style="text-align: center; width: 95px;">调仓变动</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${currentHoldings.map((h, idx) => `
                                    <tr>
                                        <td style="text-align: center; font-weight: 700; color: ${idx < 3 ? 'var(--primary)' : 'var(--text-secondary)'}; font-family: var(--font-mono); font-size: 12px;">${h.rank || idx + 1}</td>
                                        <td>
                                            <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                                <div style="display: flex; align-items: center; gap: 6px;">
                                                    <span style="font-weight: 700; font-size: 13px; font-family: var(--font-mono);">${h.symbol}</span>
                                                    <span style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${h.name}</span>
                                                </div>
                                                <span style="font-size: 10px; color: var(--text-secondary); margin-top: 1px;">${h.sector || '美股通用'} · ${Number(h.shares).toLocaleString()} 股</span>
                                            </div>
                                        </td>
                                        <td style="text-align: right; font-weight: 700; font-family: var(--font-mono); font-size: 13px;">${this.formatMoney(h.value)}</td>
                                        <td>
                                            <div style="display: flex; align-items: center; gap: 6px;">
                                                <div class="holdings-weight-track">
                                                    <div class="holdings-weight-fill" style="width: ${Math.min(100, Math.max(2, h.weight))}%;"></div>
                                                </div>
                                                <span style="font-weight: 700; font-size: 12px; font-family: var(--font-mono);">${h.weight}%</span>
                                            </div>
                                        </td>
                                        <td style="text-align: center;">
                                            ${this.renderActionBadge(h.action, h.action_label)}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        detailContainer.innerHTML = html;
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    renderConsensus() {
        const consensusContainer = document.getElementById('holdings-consensus-container');
        if (!consensusContainer || !this.overviewData) return;

        const { consensus = [] } = this.overviewData;
        if (!consensus || consensus.length === 0) {
            consensusContainer.innerHTML = '';
            return;
        }

        const html = `
            <div class="card consensus-card">
                <div class="card-header" style="margin-bottom: 12px;">
                    <div class="card-title">
                        <i data-lucide="compass" width="16"></i>
                        <span>顶级机构重仓共识 (Whale Consensus)</span>
                    </div>
                    <span style="font-size: 11px; color: var(--text-secondary);">
                        <i data-lucide="shield-check" width="12" style="vertical-align: -1px; margin-right: 2px;"></i>被 2 家及以上舵手重仓
                    </span>
                </div>
                <div class="card-body" style="padding: 0;">
                    <div class="consensus-grid">
                        ${consensus.map(c => `
                            <div class="consensus-item">
                                <div class="consensus-item-left">
                                    <div style="display: flex; align-items: center;">
                                        <span class="consensus-sym">${c.symbol}</span>
                                        <span class="consensus-name">${c.name}</span>
                                    </div>
                                    <div class="consensus-holders">
                                        ${c.holders.map(h => `${h.manager_name} (${h.weight}%)`).join(' · ')}
                                    </div>
                                </div>
                                <div class="consensus-item-right">
                                    <span class="consensus-count">${c.holders_count}家共识</span>
                                    <div class="consensus-value">${this.formatMoney(c.total_value)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        consensusContainer.innerHTML = html;
        if (window.lucide) {
            lucide.createIcons();
        }
    }
}
