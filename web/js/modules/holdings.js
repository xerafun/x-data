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
        const cards = document.querySelectorAll('.holdings-manager-card');
        cards.forEach(card => {
            const mId = card.dataset.managerId;
            const isActive = (mId === this.currentManagerId);
            card.style.border = `2px solid ${isActive ? '#3b82f6' : 'var(--border-light)'}`;
            card.style.background = isActive ? 'rgba(59, 130, 246, 0.04)' : 'var(--bg-card)';
            
            const dot = card.querySelector('.manager-active-dot');
            if (dot) dot.style.display = isActive ? 'block' : 'none';

            const iconBox = card.querySelector('.manager-icon-box');
            if (iconBox) {
                iconBox.style.background = isActive ? '#3b82f6' : 'rgba(0,0,0,0.06)';
                iconBox.style.color = isActive ? '#fff' : 'var(--text-primary)';
            }
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

    formatChange(pct) {
        if (pct === null || pct === undefined || isNaN(pct)) return '--';
        const num = Number(pct);
        const sign = num > 0 ? '+' : '';
        const cls = num > 0 ? 'up' : (num < 0 ? 'down' : 'flat');
        return `<span class="val-${cls}">${sign}${num.toFixed(2)}%</span>`;
    }

    renderActionBadge(action, label) {
        const text = label || '持有';
        if (action === 'buy') {
            return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: rgba(34, 197, 94, 0.12); color: #16a34a; border: 1px solid rgba(34, 197, 94, 0.25);"><i data-lucide="trending-up" width="12"></i> ${text}</span>`;
        } else if (action === 'sell') {
            return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: rgba(239, 68, 68, 0.12); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.25);"><i data-lucide="trending-down" width="12"></i> ${text}</span>`;
        } else if (action === 'new') {
            return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 600; border-radius: 4px; background: rgba(147, 51, 234, 0.12); color: #9333ea; border: 1px solid rgba(147, 51, 234, 0.25);"><i data-lucide="sparkles" width="12"></i> ${text}</span>`;
        }
        return `<span style="display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; font-size: 11px; font-weight: 500; border-radius: 4px; background: rgba(0,0,0,0.05); color: var(--text-secondary);"><i data-lucide="minus" width="12"></i> ${text}</span>`;
    }

    render() {
        const container = document.getElementById('holdings-container');
        if (!container || !this.overviewData) return;

        const { managers = [], consensus = [], market_time } = this.overviewData;

        let html = '';

        // 1. 顶流共识榜单 (Whale Consensus) - 极简结构
        html += `
            <div class="card" style="margin-bottom: 20px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 6px; background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                                <i data-lucide="compass" width="16"></i>
                            </span>
                            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary);">顶级机构重仓共识 (Whale Consensus)</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 3px;">
                            追踪被 2 家及以上顶流舵手共同重仓持有的核心资产
                        </div>
                    </div>
                    <span style="font-size: 11px; color: var(--text-secondary);"><i data-lucide="shield-check" width="13" style="vertical-align: -2px; margin-right: 2px;"></i>基于最新 13F 法定申报</span>
                </div>

                <div class="consensus-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
                    ${consensus.map(c => `
                        <div style="background: var(--bg-subtle); border: 1px solid var(--border-light); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; transition: transform 0.15s, box-shadow 0.15s;">
                            <div>
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 6px;">
                                            <span style="font-size: 15px; font-weight: 700; color: var(--text-primary); font-family: var(--font-mono);">${c.symbol}</span>
                                            <span style="font-size: 13px; font-weight: 600; color: var(--text-primary);">${c.name}</span>
                                        </div>
                                        <span style="font-size: 10px; color: var(--text-secondary); background: rgba(0,0,0,0.04); padding: 1px 4px; border-radius: 3px; margin-top: 2px; display: inline-block;">${c.sector}</span>
                                    </div>
                                    <div style="text-align: right;">
                                        <span style="font-size: 11px; font-weight: 700; color: #3b82f6; background: rgba(59, 130, 246, 0.08); padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.2); display: inline-flex; align-items: center; gap: 3px;">
                                            <i data-lucide="users" width="11"></i> ${c.holders_count} 家重仓
                                        </span>
                                        <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); font-family: var(--font-mono); margin-top: 4px;">合计 ${this.formatMoney(c.total_value)}</div>
                                    </div>
                                </div>
                                <div style="margin-top: 8px; border-top: 1px dashed var(--border-light); padding-top: 8px;">
                                    <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                                        ${c.holders.map(h => `
                                            <span style="font-size: 10px; display: inline-flex; align-items: center; gap: 3px; background: var(--bg-card); border: 1px solid var(--border-light); padding: 2px 6px; border-radius: 4px; color: var(--text-primary);">
                                                <i data-lucide="${h.avatar_icon || 'user'}" width="10" style="color: #3b82f6;"></i>
                                                <b>${h.manager_name}</b> <span style="color: var(--text-secondary);">(${h.weight}%)</span>
                                            </span>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // 2. 投资人切换卡片网格 (Manager Selector)
        html += `
            <div style="margin-bottom: 16px;">
                <div style="font-size: 13px; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                    选择跟踪舵手 (Click to view full portfolio)
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
                    ${managers.map(m => {
                        const isActive = m.id === this.currentManagerId;
                        return `
                            <div class="holdings-manager-card" data-manager-id="${m.id}" onclick="window.holdingsController.selectManager('${m.id}')"
                                style="cursor: pointer; padding: 12px; border-radius: 8px; border: 2px solid ${isActive ? '#3b82f6' : 'var(--border-light)'}; background: ${isActive ? 'rgba(59, 130, 246, 0.04)' : 'var(--bg-card)'}; transition: border 0.15s, background 0.15s; position: relative;">
                                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span class="manager-icon-box" style="width: 28px; height: 28px; border-radius: 6px; background: ${isActive ? '#3b82f6' : 'rgba(0,0,0,0.06)'}; color: ${isActive ? '#fff' : 'var(--text-primary)'}; display: flex; align-items: center; justify-content: center; transition: all 0.15s;">
                                            <i data-lucide="${m.avatar_icon || 'user'}" width="16"></i>
                                        </span>
                                        <div>
                                            <div style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${m.name}</div>
                                            <div style="font-size: 10px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;">${m.institution.split('(')[0]}</div>
                                        </div>
                                    </div>
                                    <span class="manager-active-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; display: ${isActive ? 'block' : 'none'};"></span>
                                </div>
                                <div style="margin-top: 8px; display: flex; justify-content: space-between; font-size: 11px;">
                                    <span style="color: var(--text-secondary);">披露市值</span>
                                    <span style="font-weight: 700; color: var(--text-primary); font-family: var(--font-mono);">${this.formatMoney(m.total_value)}</span>
                                </div>
                                <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 2px;">
                                    <span style="color: var(--text-secondary);">CR10 集中度</span>
                                    <span style="font-weight: 600; color: ${m.cr10 >= 80 ? '#ef4444' : '#3b82f6'};">${m.cr10}%</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // 3. 选中投资人持仓明细的挂载容器
        html += `<div id="holdings-detail-container"></div>`;

        container.innerHTML = html;

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

        // 1. 舵手画像 Banner
        html += `
            <div class="card" style="margin-bottom: 20px; padding: 18px; border-left: 4px solid #3b82f6; animation: fadeIn 0.15s ease-out;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
                    <div style="flex: 1; min-width: 260px;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                            <h3 style="font-size: 18px; font-weight: 800; margin: 0; color: var(--text-primary);">${currentManager.name}</h3>
                            <span style="font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono);">${currentManager.en_name || ''}</span>
                            <span style="font-size: 11px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${currentManager.style}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; font-weight: 500;">
                            申报主体: <b>${currentManager.institution}</b> (SEC CIK: ${currentManager.cik})
                        </div>
                        <p style="font-size: 12px; color: var(--text-secondary); margin-top: 6px; line-height: 1.5;">
                            ${currentManager.description}
                        </p>
                        <div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">
                            ${(currentManager.style_tags || []).map(tag => `
                                <span style="font-size: 10px; background: var(--bg-subtle); border: 1px solid var(--border-light); color: var(--text-secondary); padding: 2px 6px; border-radius: 3px;">#${tag}</span>
                            `).join('')}
                        </div>
                    </div>

                    <!-- 4 维关键指标卡片 (纯正 13F 法定申报指标) -->
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; min-width: 240px;">
                        <div style="background: var(--bg-subtle); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-light);">
                            <div style="font-size: 10px; color: var(--text-secondary);">13F 申报总市值</div>
                            <div style="font-size: 15px; font-weight: 800; font-family: var(--font-mono); color: var(--text-primary); margin-top: 2px;">
                                ${this.formatMoney(currentManager.total_value)}
                            </div>
                        </div>
                        <div style="background: var(--bg-subtle); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-light);">
                            <div style="font-size: 10px; color: var(--text-secondary);">前十大持仓集中度</div>
                            <div style="font-size: 15px; font-weight: 800; font-family: var(--font-mono); color: ${currentManager.cr10 >= 80 ? '#ef4444' : '#16a34a'}; margin-top: 2px;">
                                ${currentManager.cr10}%
                            </div>
                        </div>
                        <div style="background: var(--bg-subtle); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-light);">
                            <div style="font-size: 10px; color: var(--text-secondary);">持仓标的总数</div>
                            <div style="font-size: 15px; font-weight: 800; font-family: var(--font-mono); color: var(--text-primary); margin-top: 2px;">
                                ${currentManager.holding_count} 只
                            </div>
                        </div>
                        <div style="background: var(--bg-subtle); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-light);">
                            <div style="font-size: 10px; color: var(--text-secondary);">法定报告基准日</div>
                            <div style="font-size: 13px; font-weight: 700; font-family: var(--font-mono); color: var(--text-primary); margin-top: 2px;">
                                ${currentManager.filing_date}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 2. 持仓明细全景表格 (极简 5 列：排名、标的、市值、权重、调仓)
        html += `
            <div class="card" style="padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <div style="font-size: 14px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="layers" width="16" style="color: #3b82f6;"></i>
                        <span>${currentManager.name} · 持仓全景明细 (${currentHoldings.length} 标的)</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary);">
                        注：基于最新季度 SEC 13F-HR 法定披露数据
                    </div>
                </div>

                <div class="table-wrapper">
                    <table class="qdii-table">
                        <thead>
                            <tr>
                                <th style="width: 44px; text-align: center;">#</th>
                                <th style="text-align: left;">标的资产</th>
                                <th style="text-align: right; width: 150px;">报告期持仓市值</th>
                                <th style="text-align: left; min-width: 180px;">组合权重占比</th>
                                <th style="text-align: center; width: 140px;">调仓变动</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${currentHoldings.map((h, idx) => `
                                <tr>
                                    <td style="text-align: center; font-weight: 700; color: ${idx < 3 ? '#ef4444' : 'var(--text-secondary)'}; font-family: var(--font-mono);">${h.rank || idx + 1}</td>
                                    <td>
                                        <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                            <div style="display: flex; align-items: center; gap: 6px;">
                                                <span style="font-weight: 700; font-size: 13px; font-family: var(--font-mono);">${h.symbol}</span>
                                                <span style="font-weight: 600; font-size: 12px; color: var(--text-primary);">${h.name}</span>
                                            </div>
                                            <span style="font-size: 10px; color: var(--text-secondary); margin-top: 1px;">${h.sector || '美股通用'} · ${Number(h.shares).toLocaleString()} 股</span>
                                        </div>
                                    </td>
                                    <td style="text-align: right; font-weight: 700; font-family: var(--font-mono);">${this.formatMoney(h.value)}</td>
                                    <td>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <div style="flex: 1; height: 6px; background: rgba(0,0,0,0.06); border-radius: 3px; overflow: hidden;">
                                                <div style="width: ${Math.min(100, Math.max(2, h.weight))}%; height: 100%; background: ${idx === 0 ? '#3b82f6' : (idx < 3 ? '#60a5fa' : '#94a3b8')}; border-radius: 3px;"></div>
                                            </div>
                                            <span style="width: 48px; text-align: right; font-weight: 700; font-size: 12px; font-family: var(--font-mono);">${h.weight}%</span>
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
