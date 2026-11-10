// 顶级机构与知名投资人 13F 持仓风向标模块 (高性能即时响应版)
// 依赖: utils.js, api.js, styles.css

class HoldingsController {
    constructor() {
        this.currentManagerId = this._resolveInitialManager();
        this.overviewData = null;
        this.managerCache = new Map();
        window.holdingsController = this;
    }

    _resolveInitialManager() {
        return 'buffett'; // 纯内存默认选中第1位（巴菲特），不读取也不持久化
    }

    async loadData() {
        console.log('📊 加载 13F 顶级机构持仓数据...');
        const container = document.getElementById('holdings-container');
        if (!container) return;

        if (!this.overviewData) {
            container.innerHTML = '<div class="loading"><i data-lucide="loader-2" class="spin"></i> 正在加载顶级机构持仓数据...</div>';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await api.getHoldingsOverview();
            const data = (res && res.data) ? res.data : res;
            this.overviewData = data;

            // 一次性将全部投资人的完整持仓直接灌入前端内存缓存，彻底杜绝后续切换卡顿
            if (data && data.managers) {
                data.managers.forEach(m => {
                    this.managerCache.set(m.id, {
                        manager: m,
                        holdings: m.holdings || []
                    });
                });
            }

            this.render();
        } catch (error) {
            console.error('加载机构持仓失败:', error);
            container.innerHTML = `
                <div class="card" style="padding: 24px; text-align: center; color: var(--text-secondary);">
                    <i data-lucide="alert-circle" width="32" style="margin-bottom: 8px; color: var(--color-down);"></i>
                    <p>持仓数据加载失败，请稍后点击右上角刷新重试。</p>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        }
    }

    selectManager(managerId) {
        if (this.currentManagerId === managerId) return;
        this.currentManagerId = managerId;

        // 纯内存切换：确保 URL 干净，不拼接 manager 参数，不持久化存储
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has('manager')) {
                url.searchParams.delete('manager');
                window.history.replaceState({}, '', url.toString());
            }
        } catch (e) {}

        // 瞬时局部更新：更新卡片激活高亮边框与选中点 (0ms)
        this.updateSelectorUI();

        // 瞬时局部重绘：仅更新下方画像与持仓明细表格，无多余网络请求与全页重排
        this.renderDetail();
    }

    updateSelectorUI() {
        const pills = document.querySelectorAll('.holdings-pill');
        pills.forEach(pill => {
            const mId = pill.dataset.managerId;
            const isActive = (mId === this.currentManagerId);
            pill.classList.toggle('active', isActive);
        });
    }

    formatMoney(val) {
        if (!val || isNaN(val)) return '--';
        if (val >= 1e11) {
            return `$${(val / 1e8).toFixed(1)} 亿`;
        } else if (val >= 1e8) {
            return `$${(val / 1e8).toFixed(1)} 亿`;
        } else if (val >= 1e4) {
            return `$${(val / 1e4).toFixed(1)} 万`;
        }
        return `$${Number(val).toLocaleString()}`;
    }

    renderActionBadge(action, label) {
        const text = label || '持有';
        if (action === 'buy') {
            return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: rgba(34, 197, 94, 0.12); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.25); white-space: nowrap;"><i data-lucide="trending-up" width="11"></i> ${text}</span>`;
        } else if (action === 'sell') {
            return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: rgba(239, 68, 68, 0.12); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.25); white-space: nowrap;"><i data-lucide="trending-down" width="11"></i> ${text}</span>`;
        } else if (action === 'new') {
            return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: rgba(147, 51, 234, 0.12); color: #9333ea; border: 1px solid rgba(147, 51, 234, 0.25); white-space: nowrap;"><i data-lucide="sparkles" width="11"></i> ${text}</span>`;
        }
        return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 500; border-radius: 4px; background: rgba(0,0,0,0.05); color: var(--text-secondary); white-space: nowrap;"><i data-lucide="minus" width="11"></i> ${text}</span>`;
    }

    render() {
        const container = document.getElementById('holdings-container');
        if (!container || !this.overviewData) return;

        const { managers = [], consensus = [] } = this.overviewData;

        let html = '';

        // 1. 舵手选择器 (极简单行 Pills Bar - 移动端自然横向滑动，零视觉臃肿)
        html += `
            <div class="holdings-pills-bar">
                ${managers.map(m => {
                    const isActive = m.id === this.currentManagerId;
                    const shortInst = (m.institution || '').split('(')[0].split('·')[0].trim();
                    return `
                        <button class="holdings-pill ${isActive ? 'active' : ''}" data-manager-id="${m.id}" onclick="window.holdingsController.selectManager('${m.id}')">
                            <i data-lucide="${m.avatar_icon || 'user'}" width="13"></i>
                            <span>${m.name}</span>
                            <span class="pill-sub">${shortInst}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        `;

        // 2. 选中舵手画像条 + 核心持仓明细的挂载容器 (预留未来走势对比图插槽)
        html += `<div id="holdings-detail-container"></div>`;

        // 3. 顶流机构重仓共识 (Whale Consensus - 极简紧凑速览)
        if (consensus && consensus.length > 0) {
            html += `
                <div class="card" style="margin-top: 16px; padding: 14px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <i data-lucide="compass" width="15" style="color: #3b82f6;"></i>
                            <span style="font-size: 13px; font-weight: 700; color: var(--text-primary);">顶流机构重仓共识 (Whale Consensus)</span>
                        </div>
                        <span style="font-size: 11px; color: var(--text-secondary);"><i data-lucide="shield-check" width="12" style="vertical-align: -1px; margin-right: 2px;"></i>被 2 家及以上舵手重仓</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px;">
                        ${consensus.map(c => `
                            <div style="background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
                                <div style="min-width: 0; flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span style="font-size: 13px; font-weight: 700; font-family: var(--font-mono); color: var(--text-primary);">${c.symbol}</span>
                                        <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${c.name}</span>
                                    </div>
                                    <div style="font-size: 10px; color: var(--text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                        ${c.holders.map(h => `${h.manager_name} (${h.weight}%)`).join(' · ')}
                                    </div>
                                </div>
                                <div style="text-align: right; font-family: var(--font-mono); white-space: nowrap; margin-left: 10px; flex-shrink: 0;">
                                    <span style="font-size: 10px; font-weight: 700; color: #3b82f6; background: rgba(59, 130, 246, 0.08); padding: 1px 5px; border-radius: 3px;">${c.holders_count}家共识</span>
                                    <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-top: 2px;">${this.formatMoney(c.total_value)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        // 渲染当前选中的舵手详情
        this.renderDetail();
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

        let html = '';

        // 1. 舵手精简画像条 (轻量 Meta Bar - 替代臃肿 Banner，仅留核心事实)
        html += `
            <div class="card holdings-meta-box" style="padding: 10px 14px; margin-bottom: 12px; border-left: 3px solid #3b82f6;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 800; color: var(--text-primary);">${currentManager.name}</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">${currentManager.institution}</span>
                        <span style="font-size: 10px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 1px 6px; border-radius: 4px; font-weight: 600;">${currentManager.style}</span>
                    </div>
                    <div class="holdings-meta-stats" style="display: flex; align-items: center; gap: 12px; font-size: 12px; font-family: var(--font-mono);">
                        <span>规模 <b style="color: var(--text-primary); font-size: 13px;">${this.formatMoney(currentManager.total_value)}</b></span>
                        <span style="color: var(--border-light);">|</span>
                        <span>CR10 <b style="color: ${currentManager.cr10 >= 80 ? '#ef4444' : '#16a34a'}; font-size: 13px;">${currentManager.cr10}%</b></span>
                        <span style="color: var(--border-light);">|</span>
                        <span>持股 <b style="color: var(--text-primary); font-size: 13px;">${currentManager.holding_count}只</b></span>
                        <span style="color: var(--border-light);">|</span>
                        <span style="color: var(--text-secondary); font-size: 11px;">报告期 ${currentManager.filing_date}</span>
                    </div>
                </div>
            </div>
        `;

        // 2. 核心持仓明细全景表格 (适配移动端，留住核心属性)
        html += `
            <div class="card" style="padding: 14px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="layers" width="15" style="color: #3b82f6;"></i>
                        <span>${currentManager.name} · 持仓全景明细 (${currentHoldings.length} 标的)</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary);">
                        注：基于最新季度 SEC 13F-HR 法定披露数据
                    </div>
                </div>

                <div class="table-wrapper">
                    <table class="qdii-table holdings-table">
                        <thead>
                            <tr>
                                <th style="width: 38px; text-align: center;">#</th>
                                <th style="text-align: left;">标的资产</th>
                                <th style="text-align: right; width: 130px;">持仓市值</th>
                                <th style="text-align: left; min-width: 130px;">组合权重</th>
                                <th style="text-align: center; width: 110px;">调仓变动</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${currentHoldings.map((h, idx) => `
                                <tr>
                                    <td style="text-align: center; font-weight: 700; color: ${idx < 3 ? '#ef4444' : 'var(--text-secondary)'}; font-family: var(--font-mono); font-size: 12px;">${h.rank || idx + 1}</td>
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
                                            <div class="holdings-weight-bar" style="flex: 1; height: 5px; background: rgba(0,0,0,0.06); border-radius: 3px; overflow: hidden;">
                                                <div style="width: ${Math.min(100, Math.max(2, h.weight))}%; height: 100%; background: ${idx === 0 ? '#3b82f6' : (idx < 3 ? '#60a5fa' : '#94a3b8')}; border-radius: 3px;"></div>
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
        `;

        detailContainer.innerHTML = html;
        if (window.lucide) {
            lucide.createIcons();
        }
    }
}
