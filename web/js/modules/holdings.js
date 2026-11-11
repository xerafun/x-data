// 顶级机构与知名投资人 13F 持仓风向标模块 (对标 QDII 收益排名与移动端极简弹窗模式)
// 依赖: utils.js, api.js, styles.css

class HoldingsController {
    constructor() {
        this.overviewData = null;
        this.rawManagers = [];
        this.benchmarks = {
            'SPX': { name: '标普500 (SPX)', return_1y: 19.23 },
            'NDX': { name: '纳斯达克100 (NDX)', return_1y: 24.69 }
        };
        this.managerCache = new Map();
        this._retryCount = 0;
        this._retryTimer = null;
        window.holdingsController = this;
    }

    async loadData() {
        console.log('📊 加载 13F 顶级舵手收益排行与持仓数据...');
        const container = document.getElementById('holdings-container');
        if (!container) return false;

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
            this.rawManagers = data.managers || (Array.isArray(data) ? data : []);

            if (data.benchmarks) {
                this.benchmarks = data.benchmarks;
            }

            // 一次性将全部投资人的完整持仓直接写入前端内存缓存，保障点击查看持仓 0ms 瞬间弹窗
            this.rawManagers.forEach(m => {
                this.managerCache.set(m.id, {
                    manager: m,
                    holdings: m.holdings || []
                });
            });

            this.renderTable();
            return true;
        } catch (error) {
            console.error('加载机构持仓失败:', error);
            utils.renderError('holdings-container', '顶级机构持仓数据加载失败');
            return false;
        }
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
            return `<span class="badge-action badge-action-buy"><i data-lucide="trending-up" width="10"></i> ${text}</span>`;
        } else if (action === 'sell') {
            return `<span class="badge-action badge-action-sell"><i data-lucide="trending-down" width="10"></i> ${text}</span>`;
        } else if (action === 'new') {
            return `<span class="badge-action badge-action-new"><i data-lucide="sparkles" width="10"></i> ${text}</span>`;
        }
        return `<span class="badge-action badge-action-hold"><i data-lucide="minus" width="10"></i> ${text}</span>`;
    }

    renderTable() {
        const container = document.getElementById('holdings-container');
        if (!container || !this.overviewData) return;

        const managers = this.rawManagers;
        if (!managers.length) {
            utils.renderError('holdings-container', '暂无舵手数据');
            return;
        }

        const spxReturn = this.benchmarks.SPX?.return_1y || 19.23;
        const ndxReturn = this.benchmarks.NDX?.return_1y || 24.69;

        // 1. 基准参考通知栏 (精简极简版，去除冗余分类标签)
        const benchmarkNotice = `
            <div class="holdings-benchmark-bar">
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <strong>标普500 (SPX)：<span class="text-up">+${utils.formatPercentage(spxReturn)}</span></strong>
                    <span style="color: var(--border-light);">·</span>
                    <strong>纳指100 (NDX)：<span class="text-up">+${utils.formatPercentage(ndxReturn)}</span></strong>
                    <span style="font-size: 10px; color: var(--text-tertiary); background: var(--bg-card); border: 1px solid var(--border-light); padding: 1px 5px; border-radius: 3px;">近1年基准</span>
                </div>
                <div class="holdings-benchmark-sub">
                    基于各实体最新 SEC 13F-HR 法定持仓加权核算 · 点击任一舵手查看持仓明细
                </div>
            </div>
        `;

        // 2. 桌面端宽屏排行榜表格行渲染
        const desktopRowsHtml = managers.map((item, index) => {
            const rank = index + 1;
            const rankBadgeClass = rank === 1 ? 'rank-top1' : rank === 2 ? 'rank-top2' : rank === 3 ? 'rank-top3' : 'rank-other';

            const r1y = item.return_1y;
            const r1yStr = r1y != null ? `${r1y > 0 ? '+' : ''}${utils.formatPercentage(r1y)}` : '--';
            const r1yClass = r1y > 0 ? 'text-up' : (r1y < 0 ? 'text-down' : '');

            const alpha = item.alpha_1y;
            const alphaStr = alpha != null ? (alpha > 0 ? `超额 +${alpha.toFixed(1)}%` : `跑输 ${Math.abs(alpha).toFixed(1)}%`) : '';
            const alphaClass = alpha > 0 ? 'text-up' : 'text-secondary';

            const topHolding = item.top_holding;
            let topHoldingHtml = '--';
            if (topHolding) {
                topHoldingHtml = `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-weight: 700; font-family: var(--font-mono); color: var(--text-primary);">${topHolding.symbol}</span>
                        <span style="font-size: 11px; color: var(--text-secondary);">${topHolding.name}</span>
                        <span style="font-size: 11px; font-weight: 600; font-family: var(--font-mono); color: var(--text-primary); background: var(--bg-subtle); padding: 1px 5px; border-radius: 3px;">${topHolding.weight}%</span>
                    </div>
                `;
            }

            return `
                <tr class="qdii-clickable" data-manager-id="${item.id}" title="点击查看 ${item.name} 完整持仓明细">
                    <td class="col-rank" style="width: 48px; text-align: center;"><span class="rank-badge ${rankBadgeClass}">${rank}</span></td>
                    <td class="col-name">
                        <div style="display: flex; flex-direction: column; align-items: flex-start;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <i data-lucide="${item.avatar_icon || 'user'}" width="14" style="color: var(--text-secondary);"></i>
                                <span style="font-weight: 700; font-size: 14px; color: var(--text-primary);">${item.name}</span>
                                <span style="font-size: 10px; background: var(--bg-subtle); border: 1px solid var(--border-light); padding: 1px 5px; border-radius: 3px; color: var(--text-secondary);">${item.style_tags ? item.style_tags[0] : item.style}</span>
                            </div>
                            <span style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${item.institution}</span>
                        </div>
                    </td>
                    <td class="col-return" style="width: 140px;">
                        <div style="display: flex; flex-direction: column;">
                            <span class="font-mono ${r1yClass}" style="font-size: 15px; font-weight: 800;">${r1yStr}</span>
                            ${alphaStr ? `<span style="font-size: 10px; color: var(--text-secondary); margin-top: 1px;" class="${alphaClass}">${alphaStr}</span>` : ''}
                        </div>
                    </td>
                    <td style="min-width: 170px;">${topHoldingHtml}</td>
                    <td style="text-align: right; width: 110px; font-family: var(--font-mono); font-weight: 700; font-size: 13px;">
                        ${this.formatMoney(item.total_value)}
                    </td>
                    <td style="text-align: center; width: 120px; font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary);">
                        <span style="color: var(--text-primary); font-weight: 600;">${item.holding_count} 只</span> / CR10 <span style="font-weight: 700; color: ${item.cr10 >= 80 ? 'var(--primary)' : 'var(--text-secondary)'};">${item.cr10}%</span>
                    </td>
                    <td style="text-align: center; width: 95px; font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary);">
                        ${item.filing_date || '--'}
                    </td>
                    <td style="text-align: center; width: 95px;">
                        <button class="holdings-view-btn" data-manager-id="${item.id}">
                            查看持仓 <i data-lucide="chevron-right" width="12"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // 3. 移动端现代金融卡片流渲染 (紧凑精简版)
        const mobileCardsHtml = managers.map((item, index) => {
            const rank = index + 1;
            const rankBadgeClass = rank === 1 ? 'rank-top1' : rank === 2 ? 'rank-top2' : rank === 3 ? 'rank-top3' : 'rank-other';

            const r1y = item.return_1y;
            const r1yStr = r1y != null ? `${r1y > 0 ? '+' : ''}${utils.formatPercentage(r1y)}` : '--';
            const r1yClass = r1y > 0 ? 'text-up' : (r1y < 0 ? 'text-down' : '');

            const topHolding = item.top_holding;
            const topStr = topHolding ? `${topHolding.symbol} (${topHolding.weight}%)` : '--';
            const shortInst = (item.institution || '').split('(')[0].trim();

            return `
                <div class="holdings-mcard-item qdii-clickable" data-manager-id="${item.id}">
                    <div class="holdings-mcard-header">
                        <div class="holdings-mcard-left">
                            <span class="rank-badge ${rankBadgeClass}">${rank}</span>
                            <div style="min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span class="holdings-mcard-title">${item.name}</span>
                                    <span style="font-size: 10px; background: var(--bg-subtle); border: 1px solid var(--border-light); padding: 1px 5px; border-radius: 3px; color: var(--text-secondary);">${item.style_tags ? item.style_tags[0] : item.style}</span>
                                </div>
                                <div class="holdings-mcard-inst">${shortInst}</div>
                            </div>
                        </div>
                        <span style="font-size: 11px; color: var(--primary); font-weight: 600; display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0;">
                            持仓明细 <i data-lucide="chevron-right" width="12"></i>
                        </span>
                    </div>

                    <div class="holdings-mcard-grid">
                        <div class="holdings-mcard-cell">
                            <div class="holdings-mcard-val ${r1yClass}">${r1yStr}</div>
                            <div class="holdings-mcard-lbl">近1年收益</div>
                        </div>
                        <div class="holdings-mcard-cell">
                            <div class="holdings-mcard-val">${this.formatMoney(item.total_value)}</div>
                            <div class="holdings-mcard-lbl">13F披露规模</div>
                        </div>
                        <div class="holdings-mcard-cell">
                            <div class="holdings-mcard-val" style="font-size: 11px;">${topStr}</div>
                            <div class="holdings-mcard-lbl">第一大重仓</div>
                        </div>
                        <div class="holdings-mcard-cell">
                            <div class="holdings-mcard-val">${item.holding_count}只 / ${item.cr10}%</div>
                            <div class="holdings-mcard-lbl">持股 / CR10</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // 4. 底部顶流机构重仓共识榜单
        const consensus = this.overviewData.consensus || [];
        let consensusHtml = '';
        if (consensus && consensus.length > 0) {
            consensusHtml = `
                <div class="card consensus-card">
                    <div class="card-header" style="margin-bottom: 10px;">
                        <div class="card-title">
                            <i data-lucide="compass" width="15"></i>
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
        }

        container.innerHTML = `
            ${benchmarkNotice}

            <!-- 桌面端宽屏大表格 -->
            <div class="card holdings-desktop-only" style="padding: 0; overflow: hidden; margin-bottom: 14px;">
                <div class="table-wrapper">
                    <table class="qdii-table holdings-rank-table">
                        <thead>
                            <tr>
                                <th class="col-rank" style="width: 48px; text-align: center;">排名</th>
                                <th class="col-name" style="text-align: left;">投资舵手 / 机构</th>
                                <th class="col-return" style="width: 140px; text-align: left;">近1年收益表现</th>
                                <th style="text-align: left; min-width: 170px;">第一重仓标的 (占比)</th>
                                <th style="text-align: right; width: 110px;">披露规模</th>
                                <th style="text-align: center; width: 120px;">标的数 / 集中度</th>
                                <th style="text-align: center; width: 95px;">报告期</th>
                                <th style="text-align: center; width: 95px;">持仓操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${desktopRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 移动端金融卡片流 -->
            <div class="holdings-mobile-cards-wrapper holdings-mobile-only" style="margin-bottom: 14px;">
                ${mobileCardsHtml}
            </div>

            ${consensusHtml}
        `;

        // 绑定点击打开持仓详情弹窗事件
        container.querySelectorAll('.qdii-clickable, .holdings-view-btn').forEach(el => {
            el.onclick = (e) => {
                e.stopPropagation();
                const mId = el.dataset.managerId;
                if (mId) {
                    this.openHoldingsModal(mId);
                }
            };
        });

        if (window.lucide) {
            lucide.createIcons();
        }
    }

    openHoldingsModal(managerId) {
        let overlay = document.getElementById('holdings-modal');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'holdings-modal';
            overlay.className = 'qdii-modal-overlay';
            document.body.appendChild(overlay);

            overlay.onclick = (e) => {
                if (e.target === overlay) this.closeHoldingsModal();
            };

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && overlay.classList.contains('active')) {
                    this.closeHoldingsModal();
                }
            });
        }

        const entry = this.managerCache.get(managerId);
        if (!entry) return;

        const { manager, holdings = [] } = entry;
        const shortInst = (manager.institution || '').split('(')[0].trim();

        overlay.innerHTML = `
            <div class="qdii-modal-card holdings-modal-card">
                <div class="qdii-modal-header" style="padding: 12px 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                        <span style="font-size: 15px; font-weight: 700; color: var(--text-primary); white-space: nowrap;">${manager.name}</span>
                        <span style="font-size: 11px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${shortInst}</span>
                    </div>
                    <button class="qdii-modal-close" aria-label="关闭">&times;</button>
                </div>

                <div class="holdings-modal-meta">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                        <span>规模 <b>${this.formatMoney(manager.total_value)}</b></span>
                        <span style="color: var(--border-light);">·</span>
                        <span>CR10 <b>${manager.cr10}%</b></span>
                        <span style="color: var(--border-light);">·</span>
                        <span>持股 <b>${manager.holding_count}只</b></span>
                        <span style="color: var(--border-light);">·</span>
                        <span><b>${manager.filing_date}</b></span>
                    </div>
                </div>

                <div class="holdings-modal-scroll">
                    <table class="holdings-modal-table">
                        <thead>
                            <tr style="background: var(--bg-body); font-size: 11px; color: var(--text-secondary);">
                                <th style="width: 24px; text-align: center; padding: 6px 2px;">#</th>
                                <th style="text-align: left; padding: 6px 6px;">标的资产</th>
                                <th style="text-align: right; width: 100px; padding: 6px 6px;">市值 / 占比</th>
                                <th style="text-align: center; width: 62px; padding: 6px 4px;">调仓</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${holdings.map((h, idx) => `
                                <tr>
                                    <td style="text-align: center; font-weight: 700; color: ${idx < 3 ? 'var(--primary)' : 'var(--text-secondary)'}; font-family: var(--font-mono); font-size: 11px; padding: 7px 2px;">
                                        ${h.rank || idx + 1}
                                    </td>
                                    <td style="padding: 7px 6px;">
                                        <div style="display: flex; flex-direction: column;">
                                            <span style="font-weight: 700; font-size: 13px; font-family: var(--font-mono); color: var(--text-primary); line-height: 1.2;">${h.symbol}</span>
                                            <span style="font-size: 11px; color: var(--text-secondary); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${h.name}</span>
                                        </div>
                                    </td>
                                    <td style="text-align: right; padding: 7px 6px;">
                                        <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                            <span style="font-family: var(--font-mono); font-weight: 700; font-size: 12px; color: var(--text-primary);">${this.formatMoney(h.value)}</span>
                                            <span style="font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-top: 1px;">${h.weight}%</span>
                                        </div>
                                    </td>
                                    <td style="text-align: center; padding: 7px 4px;">
                                        ${this.renderActionBadge(h.action, h.action_label)}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const closeBtn = overlay.querySelector('.qdii-modal-close');
        if (closeBtn) {
            closeBtn.onclick = () => this.closeHoldingsModal();
        }

        overlay.classList.add('active');
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    closeHoldingsModal() {
        const overlay = document.getElementById('holdings-modal');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
}
