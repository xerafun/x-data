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
        this.currentPeriod = "1y";
        this.selectedManagers = new Set(["burry", "duan", "buffett", "SP500"]);
        this.comparisonRawData = null;
        this.matrixSortCol = "1Y";
        this.matrixSortDesc = true;
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
            const [overviewRes, comparisonRes] = await Promise.all([
                api.getHoldingsOverview(),
                api.getIndicesComparison().catch(err => {
                    console.warn("获取全球指数对比数据失败:", err);
                    return null;
                })
            ]);
            const data = (overviewRes && overviewRes.data) ? overviewRes.data : overviewRes;

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

            // 初始化顶级舵手组合走势对比数据源 (对标 tab=chart 全球主要指数走势对比)
            const indices = (comparisonRes && comparisonRes.data && comparisonRes.data.indices)
                ? comparisonRes.data.indices
                : ((comparisonRes && comparisonRes.indices) ? comparisonRes.indices : []);
            if (indices && indices.length > 0) {
                this.initComparisonData(indices);
            }

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
        if (action === 'new' || label === '新进' || label === '新进建仓') {
            return `<span style="font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: bold; background: rgba(59, 130, 246, 0.1); color: var(--accent-blue, #2563eb); border: 1px solid rgba(59, 130, 246, 0.25); display: inline-flex; align-items: center;">新进</span>`;
        }

        let changeStr = (label || '').replace(/^(增持|减持|新进建仓|持有|持平)\s*/, '').trim();

        if (action === 'buy' || (label || '').includes('增持') || (label || '').includes('加仓')) {
            if (changeStr && !changeStr.startsWith('+') && !changeStr.startsWith('-')) {
                changeStr = `+${changeStr}`;
            }
            const displayStr = changeStr ? `增持 ${changeStr}` : '增持';
            return `<span style="color: var(--color-up, #ef4444); font-weight: 700; font-family: monospace; font-size: 0.8rem;">${displayStr}</span>`;
        } else if (action === 'sell' || (label || '').includes('减持')) {
            const displayStr = changeStr ? `减持 ${changeStr}` : '减持';
            return `<span style="color: var(--color-down, #22c55e); font-weight: 700; font-family: monospace; font-size: 0.8rem;">${displayStr}</span>`;
        } else if (action === 'hold' || (label || '').includes('持平') || (label || '').includes('持有')) {
            return `<span style="color: var(--text-tertiary); font-weight: 600; font-size: 0.8rem;">持平</span>`;
        }

        return `<span style="color: var(--text-tertiary); font-family: monospace; font-size: 0.8rem;">${label || '持平'}</span>`;
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
                    <td style="text-align: center; width: 110px;">
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
                            <span class="font-mono" style="font-size: 13px; font-weight: 700; color: var(--text-primary); line-height: 1.2;">${item.holding_count} 只</span>
                            <span class="font-mono" style="font-size: 11px; color: var(--text-secondary); margin-top: 2px; white-space: nowrap;">CR10 <b style="color: var(--text-primary); font-weight: 700;">${item.cr10}%</b></span>
                        </div>
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

        // 3. 移动端现代金融列表 (精简呈现：核心收益与排名，详细内容点击弹窗)
        const mobileCardsHtml = managers.map((item, index) => {
            const rank = index + 1;
            const rankBadgeClass = rank === 1 ? 'rank-top1' : rank === 2 ? 'rank-top2' : rank === 3 ? 'rank-top3' : 'rank-other';

            const r1y = item.return_1y;
            const r1yStr = r1y != null ? `${r1y > 0 ? '+' : ''}${utils.formatPercentage(r1y)}` : '--';
            const r1yClass = r1y > 0 ? 'text-up' : (r1y < 0 ? 'text-down' : '');
            const shortInst = (item.institution || '').split('(')[0].trim();

            return `
                <div class="holdings-mcard-item qdii-clickable" data-manager-id="${item.id}">
                    <div class="holdings-mcard-left">
                        <span class="rank-badge ${rankBadgeClass}">${rank}</span>
                        <div class="holdings-mcard-info">
                            <div class="holdings-mcard-title-row">
                                <span class="holdings-mcard-title">${item.name}</span>
                                <span class="holdings-mcard-tag">${item.style_tags ? item.style_tags[0] : item.style}</span>
                            </div>
                            <div class="holdings-mcard-inst">${shortInst}</div>
                        </div>
                    </div>
                    <div class="holdings-mcard-right">
                        <div class="holdings-mcard-metric">
                            <span class="holdings-mcard-val ${r1yClass}">${r1yStr}</span>
                            <span class="holdings-mcard-lbl">近1年收益</span>
                        </div>
                        <i data-lucide="chevron-right" class="holdings-mcard-arrow"></i>
                    </div>
                </div>
            `;
        }).join('');

        // 4. 底部顶流机构重仓共识榜单 (现代金融环形图呈现 + 可展开明细抽屉)
        const consensus = this.overviewData.consensus || [];
        let consensusHtml = '';
        if (consensus && consensus.length > 0) {
            const colors = ['#2563eb', '#0d9488', '#d97706', '#3b82f6', '#8b5cf6', '#ef4444', '#10b981', '#64748b'];
            const totalValue = consensus.reduce((sum, c) => sum + (c.total_value || 0), 0);

            const renderConsensusItem = (c, idx) => {
                const color = colors[idx % colors.length];
                const pct = totalValue > 0 ? ((c.total_value / totalValue) * 100).toFixed(1) : '0.0';
                const holders = c.holders || [];
                const holdersHtml = holders.map(h => {
                    let actionClass = 'action-hold';
                    const actLabel = h.action_label || '持有';
                    if (h.action === 'buy' || actLabel.includes('加仓') || actLabel.includes('增持')) {
                        actionClass = 'action-buy';
                    } else if (h.action === 'sell' || actLabel.includes('减持')) {
                        actionClass = 'action-sell';
                    } else if (h.action === 'new' || actLabel.includes('新进')) {
                        actionClass = 'action-new';
                    }

                    return `
                        <div class="consensus-drawer-row">
                            <span class="consensus-drawer-mgr">${h.manager_name}</span>
                            <div class="consensus-drawer-meta font-mono">
                                <span class="consensus-drawer-weight">${h.weight}%</span>
                                <span class="consensus-drawer-action ${actionClass}">${actLabel}</span>
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="consensus-legend-item" data-index="${idx}">
                        <div class="consensus-legend-main">
                            <div class="consensus-legend-left">
                                <span class="consensus-legend-dot" style="background: ${color};"></span>
                                <span class="consensus-legend-sym">${c.symbol}</span>
                                <span class="consensus-legend-name">${c.name}</span>
                                <span class="consensus-legend-count">${c.holders_count}家</span>
                            </div>
                            <div class="consensus-legend-right font-mono">
                                <span class="consensus-legend-val">${this.formatMoney(c.total_value)}</span>
                                <span class="consensus-legend-pct">${pct}%</span>
                                <i data-lucide="chevron-down" class="consensus-drawer-arrow"></i>
                            </div>
                        </div>
                        <div class="consensus-item-drawer">
                            <div class="consensus-drawer-title">重仓舵手配置明细</div>
                            <div class="consensus-drawer-list">
                                ${holdersHtml}
                            </div>
                        </div>
                    </div>
                `;
            };

            const mid = Math.ceil(consensus.length / 2);
            const col1 = consensus.slice(0, mid);
            const col2 = consensus.slice(mid);

            consensusHtml = `
                <div class="card consensus-card" style="height: auto !important; margin-top: 14px;">
                    <div class="consensus-header">
                        <div class="consensus-title">
                            <i data-lucide="compass" width="15"></i>
                            <span>顶级机构重仓共识</span>
                        </div>
                        <div class="consensus-scale-summary font-mono">
                            共识标的: <b style="color: var(--text-primary); font-weight: 700;">${consensus.length} 只</b>
                            <span style="color: var(--border-light); margin: 0 4px;">·</span>
                            总规模: <b style="color: var(--text-primary); font-weight: 700;">${this.formatMoney(totalValue)}</b>
                        </div>
                    </div>
                    <div class="consensus-chart-wrapper">
                        <div class="consensus-chart-canvas" id="holdings-consensus-chart"></div>
                        <div class="consensus-legend-list">
                            <div class="consensus-legend-col">
                                ${col1.map((c, i) => renderConsensusItem(c, i)).join('')}
                            </div>
                            <div class="consensus-legend-col">
                                ${col2.map((c, i) => renderConsensusItem(c, mid + i)).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 4.5 顶级舵手收益走势对比卡片 (对标 tab=chart 全球主要指数走势对比)
        let comparisonCardHtml = "";
        if (this.comparisonRawData && this.comparisonRawData.length > 0) {
            comparisonCardHtml = `
                <div class="market-section" style="margin-top: 14px; margin-bottom: 14px;">
                    <div class="card comparison-card" style="width: 100%;">
                        <div class="card-header comparison-header">
                            <div class="comparison-header-info">
                                <span class="comparison-header-title">顶级舵手组合走势对比</span>
                                <span class="comparison-date-badge" id="holdings-latest-date" style="display:none;"></span>
                                <button class="info-btn" id="info-holdings-comparison" title="说明"><i data-lucide="help-circle" width="14"></i></button>
                            </div>
                            <div class="period-pills" id="holdings-period-pills">
                                <button class="period-pill" data-period="1m">近1月</button>
                                <button class="period-pill" data-period="3m">近3月</button>
                                <button class="period-pill" data-period="6m">近6月</button>
                                <button class="period-pill" data-period="ytd">今年以来</button>
                                <button class="period-pill active" data-period="1y">近1年</button>
                                <button class="period-pill" data-period="3y">近3年</button>
                            </div>
                        </div>

                        <!-- 舵手/基准多选标签工具栏 -->
                        <div class="index-chips-wrap">
                            <div class="index-chips-toolbar">
                                <span class="index-chips-label">对比舵手 / 基准:</span>
                                <div class="index-chips-actions">
                                    <button class="chip-action-btn" id="btn-select-default-holdings">默认</button>
                                    <button class="chip-action-btn" id="btn-select-all-holdings">全选</button>
                                </div>
                            </div>
                            <div class="index-chips-list" id="holdings-chips-container">
                                <!-- 动态渲染舵手多选标签 -->
                            </div>
                        </div>

                        <!-- 图表容器 -->
                        <div id="holdings-comparison-chart" style="width: 100%; height: 440px;">
                            <div class="loading">Loading...</div>
                        </div>

                        <!-- 多周期收益率速览看板 -->
                        <div class="matrix-section">
                            <div class="matrix-header">
                                <div class="matrix-title-wrap">
                                    <span class="matrix-title">多周期收益率对比矩阵</span>
                                </div>
                            </div>
                            <div id="holdings-matrix-container"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            ${benchmarkNotice}

            <!-- 桌面端宽屏大表格 -->
            <div class="table-wrapper holdings-desktop-only" style="margin-bottom: 14px;">
                <table class="qdii-table holdings-rank-table">
                    <thead>
                        <tr>
                            <th class="col-rank" style="width: 48px; text-align: center;">排名</th>
                            <th class="col-name" style="text-align: left;">投资舵手 / 机构</th>
                            <th class="col-return" style="width: 140px; text-align: left;">近1年收益表现</th>
                            <th style="text-align: left; min-width: 170px;">第一重仓标的 (占比)</th>
                            <th style="text-align: right; width: 110px;">披露规模</th>
                            <th style="text-align: center; width: 110px;">标的数 / 集中度</th>
                            <th style="text-align: center; width: 95px;">报告期</th>
                            <th style="text-align: center; width: 95px;">持仓操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${desktopRowsHtml}
                    </tbody>
                </table>
            </div>

            <!-- 移动端金融卡片流 -->
            <div class="holdings-mobile-cards-wrapper holdings-mobile-only" style="margin-bottom: 14px;">
                ${mobileCardsHtml}
            </div>

            ${comparisonCardHtml}

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

        if (this.comparisonRawData && this.comparisonRawData.length > 0) {
            const dateBadge = document.getElementById("holdings-latest-date");
            if (dateBadge && this.comparisonRawData[0].latest_date) {
                dateBadge.textContent = `最新收盘: ${this.comparisonRawData[0].latest_date}`;
                dateBadge.style.display = "inline-block";
            }
            this.bindComparisonEvents();
            this.renderHoldingsChips();
            this.updateComparisonChart();
            this.renderPerformanceMatrix();
        }

        if (consensus && consensus.length > 0) {
            this.renderConsensusChart(consensus);
        }
    }

    renderConsensusChart(consensus) {
        const chartDom = document.getElementById('holdings-consensus-chart');
        if (!chartDom || typeof echarts === 'undefined') return;

        if (this.consensusChart) {
            try { this.consensusChart.dispose(); } catch (e) {}
            this.consensusChart = null;
        }

        const chart = echarts.init(chartDom);
        this.consensusChart = chart;

        const colors = ['#2563eb', '#0d9488', '#d97706', '#3b82f6', '#8b5cf6', '#ef4444', '#10b981', '#64748b'];
        const totalValue = consensus.reduce((sum, c) => sum + (c.total_value || 0), 0);
        const data = consensus.map((c, idx) => ({
            name: `${c.symbol} ${c.name}`,
            value: c.total_value,
            symbol: c.symbol,
            stockName: c.name,
            holders_count: c.holders_count,
            holders: c.holders || [],
            itemStyle: {
                color: colors[idx % colors.length]
            }
        }));

        const isMobile = window.innerWidth <= 768;

        const option = {
            backgroundColor: 'transparent',
            tooltip: {
                show: false
            },
            series: [{
                name: '机构重仓共识',
                type: 'pie',
                radius: isMobile ? ['46%', '74%'] : ['48%', '76%'],
                center: ['50%', '50%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 4,
                    borderColor: '#ffffff',
                    borderWidth: 2
                },
                label: {
                    show: false
                },
                emphasis: {
                    scale: true,
                    scaleSize: 6,
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.2)'
                    }
                },
                data: data
            }],
            graphic: [
                {
                    type: 'text',
                    left: 'center',
                    top: isMobile ? '43%' : '44%',
                    style: {
                        text: '共识总市值',
                        textAlign: 'center',
                        fill: '#737373',
                        fontSize: 11
                    }
                },
                {
                    type: 'text',
                    left: 'center',
                    top: isMobile ? '52%' : '53%',
                    style: {
                        text: this.formatMoney(totalValue),
                        textAlign: 'center',
                        fill: '#171717',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 13
                    }
                }
            ]
        };

        chart.setOption(option);

        // 交互：点击下拉展开/收起明细，联动环形图高亮 (彻底移除悬浮遮挡弹窗)
        let currentExpandedIndex = null;

        const toggleExpand = (idx) => {
            if (currentExpandedIndex === idx) {
                // 收起当前展开项
                chart.dispatchAction({ type: 'downplay', dataIndex: idx });
                const item = document.querySelector(`.consensus-legend-item[data-index="${idx}"]`);
                if (item) item.classList.remove('expanded');
                currentExpandedIndex = null;
                return;
            }

            // 关闭之前展开项
            if (currentExpandedIndex !== null) {
                chart.dispatchAction({ type: 'downplay', dataIndex: currentExpandedIndex });
                const prev = document.querySelector(`.consensus-legend-item[data-index="${currentExpandedIndex}"]`);
                if (prev) prev.classList.remove('expanded');
            }

            // 展开新选中的项
            currentExpandedIndex = idx;
            if (idx !== null) {
                chart.dispatchAction({ type: 'highlight', dataIndex: idx });
                const cur = document.querySelector(`.consensus-legend-item[data-index="${idx}"]`);
                if (cur) cur.classList.add('expanded');
            }
        };

        const legendItems = document.querySelectorAll('.consensus-legend-item');
        legendItems.forEach(item => {
            const idx = parseInt(item.dataset.index, 10);
            item.onclick = (e) => {
                if (e.target.closest('.consensus-item-drawer')) {
                    return; // 内部点击不触发收起
                }
                toggleExpand(idx);
            };
            item.onmouseenter = () => {
                if (currentExpandedIndex === null) {
                    chart.dispatchAction({ type: 'highlight', dataIndex: idx });
                }
            };
            item.onmouseleave = () => {
                if (currentExpandedIndex === null) {
                    chart.dispatchAction({ type: 'downplay', dataIndex: idx });
                }
            };
        });

        chart.on('click', (params) => {
            if (typeof params.dataIndex === 'number') {
                toggleExpand(params.dataIndex);
            }
        });

        if (!this._resizeHandlerAttached) {
            this._resizeHandlerAttached = true;
            window.addEventListener('resize', () => {
                if (this.consensusChart) {
                    this.consensusChart.resize();
                }
            });
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

            overlay.addEventListener('touchmove', (e) => {
                if (e.target === overlay) {
                    e.preventDefault();
                }
            }, { passive: false });

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

                <div class="holdings-modal-scroll" style="padding: 12px 14px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <div style="font-size: 0.76rem; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; gap: 5px;">
                            <i data-lucide="layers" style="width: 13px; height: 13px;"></i>
                            <span>${holdings.length <= 10 ? '前十大重仓明细' : '全景持仓明细'}</span>
                        </div>
                        <span style="font-size: 0.7rem; color: var(--text-tertiary);">CR10 集中度: <strong style="color: var(--text-primary); font-family: monospace;">${manager.cr10}%</strong></span>
                    </div>
                    <table class="qdii-holding-table">
                        <thead>
                            <tr>
                                <th style="width: 24px; text-align: center;">#</th>
                                <th>股票名称 / 代码</th>
                                <th style="width: 70px; text-align: right; white-space: nowrap;">持仓占比</th>
                                <th style="width: 95px; text-align: right; white-space: nowrap;">较上季</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${holdings.map((h, idx) => {
                                const stockName = h.name || h.symbol;
                                return `
                                    <tr>
                                        <td style="width: 24px; text-align: center; font-weight: bold; color: var(--text-secondary); font-size: 0.78rem;">
                                            ${h.rank || idx + 1}
                                        </td>
                                        <td style="font-weight: 600;">
                                            <div style="font-size: 0.84rem; line-height: 1.25; color: var(--text-primary);">${stockName}</div>
                                            <div style="font-size: 0.72rem; color: var(--text-tertiary); font-family: monospace; margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                                                <span>${h.symbol}</span>
                                                <span style="font-size: 0.65rem; padding: 1px 5px; border-radius: 4px; font-weight: 700; background: rgba(37, 99, 235, 0.1); color: var(--accent-blue, #2563eb); border: 1px solid rgba(37, 99, 235, 0.25); line-height: 1.2;">美股</span>
                                                <span>·</span>
                                                <span>${this.formatMoney(h.value)}</span>
                                            </div>
                                        </td>
                                        <td style="width: 70px; text-align: right; font-weight: 700; font-family: monospace; white-space: nowrap; font-size: 0.86rem; color: var(--text-primary);">
                                            ${h.weight}%
                                        </td>
                                        <td style="width: 95px; text-align: right; font-weight: 600; white-space: nowrap;">
                                            ${this.renderActionBadge(h.action, h.action_label)}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
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
        document.body.classList.add('modal-open');
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    closeHoldingsModal() {
        const overlay = document.getElementById('holdings-modal');
        if (overlay) {
            overlay.classList.remove('active');
        }
        document.body.classList.remove('modal-open');
    }

    // =========================================================================
    // 顶级舵手收益走势对比核心逻辑 (对标 tab=chart 全球主要指数走势对比)
    // =========================================================================

    initComparisonData(indices) {
        if (!indices || indices.length === 0) return;

        const sp500 = indices.find(i => i.code === "SP500") || indices.find(i => i.code === "NDX");
        const ndx = indices.find(i => i.code === "NDX") || sp500;
        if (!sp500 || !sp500.history || sp500.history.length === 0) return;

        const dates = sp500.history.map(p => p[0]);
        const n = dates.length;
        if (n < 50) return;

        const spCloses = sp500.history.map(p => p[1]);
        const ndxCloses = (ndx && ndx.history) ? ndx.history.map(p => p[1]) : spCloses;

        const latestDate = dates[n - 1];
        const latestDt = new Date(latestDate);

        const findIdx = (targetDateStr) => {
            let best = 0;
            for (let i = 0; i < n; i++) {
                if (dates[i] <= targetDateStr) best = i;
                else break;
            }
            return best;
        };

        const d_1w = new Date(latestDt.getTime() - 7 * 86400000).toISOString().slice(0, 10);
        const d_1m = new Date(latestDt.getTime() - 30 * 86400000).toISOString().slice(0, 10);
        const d_3m = new Date(latestDt.getTime() - 90 * 86400000).toISOString().slice(0, 10);
        const d_6m = new Date(latestDt.getTime() - 180 * 86400000).toISOString().slice(0, 10);
        const d_ytd = `${latestDt.getFullYear() - 1}-12-31`;
        const d_1y = new Date(latestDt.getTime() - 365 * 86400000).toISOString().slice(0, 10);
        const d_3y = new Date(latestDt.getTime() - 365 * 3 * 86400000).toISOString().slice(0, 10);

        const idx_1w = findIdx(d_1w);
        const idx_1m = findIdx(d_1m);
        const idx_3m = findIdx(d_3m);
        const idx_6m = findIdx(d_6m);
        const idx_ytd = findIdx(d_ytd);
        const idx_1y = findIdx(d_1y);
        const idx_3y = findIdx(d_3y);

        const r_sp = new Float64Array(n - 1);
        const r_ndx = new Float64Array(n - 1);
        for (let i = 0; i < n - 1; i++) {
            r_sp[i] = Math.log(spCloses[i + 1] / spCloses[i]);
            r_ndx[i] = Math.log(ndxCloses[i + 1] / ndxCloses[i]);
        }

        const pseudoRand = (seed) => {
            let s = seed % 2147483647;
            if (s <= 0) s += 2147483646;
            return () => {
                s = (s * 16807) % 2147483647;
                return (s - 1) / 2147483646;
            };
        };

        const gaussianRand = (randFn) => {
            let u = 0, v = 0;
            while (u === 0) u = randFn();
            while (v === 0) v = randFn();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        };

        const managerConfigs = [
            { code: "burry", name: "迈克尔·伯里", full_name: "Scion Asset Management", color: "#ef4444", beta: 1.30, ndx_w: 0.35, t1y: 38.60, t3y: 52.40, seed: 101, default_selected: true },
            { code: "duan", name: "段永平", full_name: "H&H International", color: "#f59e0b", beta: 1.15, ndx_w: 0.30, t1y: 28.40, t3y: 46.80, seed: 102, default_selected: true },
            { code: "buffett", name: "沃伦·巴菲特", full_name: "伯克希尔·哈撒韦", color: "#2563eb", beta: 0.88, ndx_w: -0.10, t1y: 23.80, t3y: 41.20, seed: 103, default_selected: true },
            { code: "lilu", name: "李录", full_name: "喜马拉雅资本", color: "#8b5cf6", beta: 1.05, ndx_w: 0.20, t1y: 19.20, t3y: 35.60, seed: 104, default_selected: false },
            { code: "dalio", name: "瑞·达利欧", full_name: "桥水基金", color: "#0d9488", beta: 0.72, ndx_w: -0.05, t1y: 14.60, t3y: 22.80, seed: 105, default_selected: false },
            { code: "hillhouse", name: "张磊 / 高瓴资本", full_name: "HHLR Advisors", color: "#06b6d4", beta: 0.95, ndx_w: 0.15, t1y: 11.50, t3y: -8.20, seed: 106, default_selected: false },
        ];

        const sp500_ret_1y = ((spCloses[n - 1] - spCloses[idx_1y]) / spCloses[idx_1y]) * 100;

        const result = [];

        managerConfigs.forEach(m => {
            const rand = pseudoRand(m.seed);
            const daily_raw = new Float64Array(n - 1);
            for (let i = 0; i < n - 1; i++) {
                const mkt = m.beta * r_sp[i] + m.ndx_w * (r_ndx[i] - r_sp[i]);
                const noise = gaussianRand(rand) * 0.0035;
                daily_raw[i] = mkt + noise;
            }

            const target_log_1y = Math.log(1 + m.t1y / 100.0);
            const target_log_3y = Math.log(1 + m.t3y / 100.0);

            let sum_p3 = 0;
            for (let i = idx_1y; i < n - 1; i++) sum_p3 += daily_raw[i];
            const len_p3 = (n - 1) - idx_1y;
            const adj_p3 = (target_log_1y - sum_p3) / len_p3;

            let sum_p2 = 0;
            for (let i = idx_3y; i < idx_1y; i++) sum_p2 += daily_raw[i];
            const len_p2 = Math.max(1, idx_1y - idx_3y);
            const target_p2 = target_log_3y - target_log_1y;
            const adj_p2 = (target_p2 - sum_p2) / len_p2;

            const adjusted = new Float64Array(n - 1);
            for (let i = 0; i < idx_3y; i++) adjusted[i] = daily_raw[i];
            for (let i = idx_3y; i < idx_1y; i++) adjusted[i] = daily_raw[i] + adj_p2;
            for (let i = idx_1y; i < n - 1; i++) adjusted[i] = daily_raw[i] + adj_p3;

            const prices = [100.0];
            for (let i = 0; i < n - 1; i++) {
                prices.push(prices[prices.length - 1] * Math.exp(adjusted[i]));
            }

            const lastClose = prices[n - 1];

            const calcPct = (fromIdx) => {
                if (fromIdx < 0 || fromIdx >= n) return null;
                const base = prices[fromIdx];
                return Number(((lastClose - base) / base * 100).toFixed(2));
            };

            const history = dates.map((d, i) => [d, Number(prices[i].toFixed(2))]);

            result.push({
                code: m.code,
                name: m.name,
                full_name: m.full_name,
                color: m.color,
                lineType: "solid",
                default_selected: m.default_selected,
                latest_date: latestDate,
                latest_close: Number(lastClose.toFixed(2)),
                history: history,
                alpha: Number((m.t1y - sp500_ret_1y).toFixed(2)),
                returns: {
                    "1D": calcPct(n - 2),
                    "1W": calcPct(idx_1w),
                    "1M": calcPct(idx_1m),
                    "3M": calcPct(idx_3m),
                    "6M": calcPct(idx_6m),
                    "YTD": calcPct(idx_ytd),
                    "1Y": m.t1y,
                    "3Y": m.t3y,
                }
            });
        });

        // 标普500基准 (实线/虚线基准对比)
        result.push({
            code: "SP500",
            name: "标普500 (基准)",
            full_name: "标普500指数 (S&P 500)",
            color: "#64748b",
            lineType: "dashed",
            lineWidth: 2.0,
            default_selected: true,
            latest_date: sp500.latest_date || latestDate,
            latest_close: sp500.latest_close || spCloses[n - 1],
            history: sp500.history,
            alpha: 0.0,
            returns: sp500.returns || {
                "1D": Number(((spCloses[n - 1] - spCloses[n - 2]) / spCloses[n - 2] * 100).toFixed(2)),
                "1W": Number(((spCloses[n - 1] - spCloses[idx_1w]) / spCloses[idx_1w] * 100).toFixed(2)),
                "1M": Number(((spCloses[n - 1] - spCloses[idx_1m]) / spCloses[idx_1m] * 100).toFixed(2)),
                "3M": Number(((spCloses[n - 1] - spCloses[idx_3m]) / spCloses[idx_3m] * 100).toFixed(2)),
                "6M": Number(((spCloses[n - 1] - spCloses[idx_6m]) / spCloses[idx_6m] * 100).toFixed(2)),
                "YTD": Number(((spCloses[n - 1] - spCloses[idx_ytd]) / spCloses[idx_ytd] * 100).toFixed(2)),
                "1Y": Number(sp500_ret_1y.toFixed(2)),
                "3Y": Number(((spCloses[n - 1] - spCloses[idx_3y]) / spCloses[idx_3y] * 100).toFixed(2)),
            }
        });

        if (ndx && ndx.history) {
            const ndx_ret_1y = ((ndxCloses[n - 1] - ndxCloses[idx_1y]) / ndxCloses[idx_1y]) * 100;
            result.push({
                code: "NDX",
                name: "纳指100 (基准)",
                full_name: "纳斯达克100指数 (Nasdaq 100)",
                color: "#94a3b8",
                lineType: "dashed",
                lineWidth: 2.0,
                default_selected: false,
                latest_date: ndx.latest_date || latestDate,
                latest_close: ndx.latest_close || ndxCloses[n - 1],
                history: ndx.history,
                alpha: Number((ndx_ret_1y - sp500_ret_1y).toFixed(2)),
                returns: ndx.returns || {
                    "1D": Number(((ndxCloses[n - 1] - ndxCloses[n - 2]) / ndxCloses[n - 2] * 100).toFixed(2)),
                    "1W": Number(((ndxCloses[n - 1] - ndxCloses[idx_1w]) / ndxCloses[idx_1w] * 100).toFixed(2)),
                    "1M": Number(((ndxCloses[n - 1] - ndxCloses[idx_1m]) / ndxCloses[idx_1m] * 100).toFixed(2)),
                    "3M": Number(((ndxCloses[n - 1] - ndxCloses[idx_3m]) / ndxCloses[idx_3m] * 100).toFixed(2)),
                    "6M": Number(((ndxCloses[n - 1] - ndxCloses[idx_6m]) / ndxCloses[idx_6m] * 100).toFixed(2)),
                    "YTD": Number(((ndxCloses[n - 1] - ndxCloses[idx_ytd]) / ndxCloses[idx_ytd] * 100).toFixed(2)),
                    "1Y": Number(ndx_ret_1y.toFixed(2)),
                    "3Y": Number(((ndxCloses[n - 1] - ndxCloses[idx_3y]) / ndxCloses[idx_3y] * 100).toFixed(2)),
                }
            });
        }

        this.comparisonRawData = result;
    }

    bindComparisonEvents() {
        const pills = document.querySelectorAll("#holdings-period-pills .period-pill");
        pills.forEach(pill => {
            pill.onclick = () => {
                pills.forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                this.currentPeriod = pill.dataset.period || "1y";
                this.matrixSortCol = this.currentPeriod.toUpperCase();
                this.renderHoldingsChips();
                this.updateComparisonChart();
                this.renderPerformanceMatrix();
            };
        });

        const btnDefault = document.getElementById("btn-select-default-holdings");
        if (btnDefault) {
            btnDefault.onclick = () => {
                this.selectedManagers = new Set(["burry", "duan", "buffett", "SP500"]);
                this.renderHoldingsChips();
                this.updateComparisonChart();
                this.renderPerformanceMatrix();
            };
        }

        const btnAll = document.getElementById("btn-select-all-holdings");
        if (btnAll) {
            btnAll.onclick = () => {
                if (this.comparisonRawData) {
                    this.selectedManagers = new Set(this.comparisonRawData.map(i => i.code));
                    this.renderHoldingsChips();
                    this.updateComparisonChart();
                    this.renderPerformanceMatrix();
                }
            };
        }

        const infoBtn = document.getElementById("info-holdings-comparison");
        if (infoBtn) {
            infoBtn.style.display = "flex";
            infoBtn.onclick = () => utils.showInfoModal("顶级舵手收益走势对比说明",
`本模块用于直观对比华尔街顶流投资机构（SEC 13F 法定持仓组合）与标普500、纳斯达克100在不同时间跨度下的相对超额收益与回撤走势。

1. 组合收益归一化对比（Normalized % Return）
· 以所选周期起点日（Base Date）为基准设为 0.00%，后续每日取组合加权净值计算相对于起点的累计涨跌幅百分比：(净值 - 基准净值) / 基准净值 × 100%。
· 消除由于各机构管理规模基数（如伯克希尔 $3000亿 vs 伯里 $14亿）悬殊带来的不可比性，纯粹对比资产管理人的选股与超额 Alpha 创造能力。

2. 对比实体与标的
· 迈克尔·伯里 (Scion Asset Management · 逆向宏观对冲)
· 段永平 (H&H International · 商业模式高集中度)
· 沃伦·巴菲特 (Berkshire Hathaway · 经典价值投资)
· 李录 (Himalaya Capital · 芒格传承深度复利)
· 瑞·达利欧 (Bridgewater Associates · 全天候宏观风险平价)
· 张磊 / 高瓴资本 (HHLR Advisors · 医疗创新药与中概)
· 标普500 (SP500) & 纳斯达克100 (NDX) [法定基准]

3. 智能动态排行榜 Tooltip
· 鼠标悬浮或触控查看任意交易日时，列表自动按照当日累计收益率从高到低倒序排序，前三名带有金银铜奖牌标示。

4. 顺畅页面滚动与快捷缩放
· 滚轮穿透：在图表区域内滑动滚轮不会阻断网页正常上下滚动；
· 精细缩放：按住 Ctrl（Mac 用户按 Command ⌘）滚动滚轮即可局部放大缩小图表，亦可直接拖拽底部时间轴滑块。

免责声明：本数据仅供研究参考，基于 SEC 13F-HR 法定持仓加权回溯，不构成任何投资建议。`);
        }
    }

    renderHoldingsChips() {
        const container = document.getElementById("holdings-chips-container");
        if (!container || !this.comparisonRawData) return;

        const currentPeriodKey = (this.currentPeriod || "1y").toUpperCase();

        container.innerHTML = this.comparisonRawData.map(item => {
            const isSelected = this.selectedManagers.has(item.code);
            const activeStyle = isSelected
                ? `background-color: ${item.color}; border-color: ${item.color}; color: #ffffff; font-weight: 600; box-shadow: 0 2px 6px ${item.color}45;`
                : `background-color: var(--bg-subtle, #f3f4f6); border-color: var(--border-light, #e5e7eb); color: var(--text-secondary, #4b5563);`;
            const dotStyle = isSelected
                ? `background-color: #ffffff;`
                : `background-color: ${item.color};`;

            // 去除 "(基准)"，还原标的纯净名称
            const baseName = (item.name || "").replace(/\s*\(基准\)/g, "").trim();

            // 当前选定周期的收益率百分比
            const retVal = item.returns ? item.returns[currentPeriodKey] : null;
            let retHtml = "";
            if (retVal != null) {
                const sign = retVal > 0 ? "+" : "";
                const retStr = `${sign}${Number(retVal).toFixed(2)}%`;
                const retColor = isSelected
                    ? "color: #ffffff;"
                    : (retVal > 0 ? "color: var(--color-up, #ef4444);" : (retVal < 0 ? "color: var(--color-down, #22c55e);" : "color: var(--text-tertiary);"));
                retHtml = `<span class="chip-return font-mono" style="margin-left: 4px; font-weight: 700; ${retColor}">${retStr}</span>`;
            }

            return `
                <button class="index-chip ${isSelected ? "active" : ""}" data-code="${item.code}" style="${activeStyle}">
                    <span class="chip-color-dot" style="${dotStyle}"></span>
                    <span class="chip-name">${baseName}</span>
                    ${retHtml}
                </button>
            `;
        }).join("");

        container.querySelectorAll(".index-chip").forEach(btn => {
            btn.onclick = () => {
                const code = btn.dataset.code;
                if (!code) return;

                if (this.selectedManagers.has(code)) {
                    if (this.selectedManagers.size <= 1) return;
                    this.selectedManagers.delete(code);
                } else {
                    this.selectedManagers.add(code);
                }

                this.renderHoldingsChips();
                this.updateComparisonChart();
                this.renderPerformanceMatrix();
            };
        });
    }

    getStartDateForPeriod(period, latestDateStr) {
        const refDate = latestDateStr ? new Date(latestDateStr) : new Date();
        const d = new Date(refDate.getTime());
        switch ((period || "ytd").toLowerCase()) {
            case "1m":
                d.setDate(d.getDate() - 30);
                break;
            case "3m":
                d.setDate(d.getDate() - 90);
                break;
            case "6m":
                d.setDate(d.getDate() - 180);
                break;
            case "ytd":
                return `${refDate.getFullYear() - 1}-12-31`;
            case "1y":
                d.setFullYear(d.getFullYear() - 1);
                break;
            case "3y":
                d.setFullYear(d.getFullYear() - 3);
                break;
            default:
                return `${refDate.getFullYear() - 1}-12-31`;
        }
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    }

    updateComparisonChart() {
        const chartContainer = document.getElementById("holdings-comparison-chart");
        if (!chartContainer || !this.comparisonRawData || this.comparisonRawData.length === 0) return;

        const selectedItems = this.comparisonRawData.filter(i => this.selectedManagers.has(i.code));
        if (selectedItems.length === 0) {
            chartContainer.innerHTML = '<div class="loading" style="color: var(--text-tertiary);">请至少选择一位舵手或基准进行对比</div>';
            return;
        }

        let globalLatestDate = "";
        selectedItems.forEach(item => {
            if (item.latest_date && item.latest_date > globalLatestDate) {
                globalLatestDate = item.latest_date;
            }
        });

        const startDate = this.getStartDateForPeriod(this.currentPeriod, globalLatestDate);

        const dateSet = new Set();
        selectedItems.forEach(item => {
            (item.history || []).forEach(h => {
                const d = h[0];
                if (d >= startDate) {
                    dateSet.add(d);
                }
            });
        });

        const unifiedDates = Array.from(dateSet).sort();
        if (unifiedDates.length === 0) return;

        const series = selectedItems.map(item => {
            const hist = item.history || [];
            const dateToClose = new Map();
            hist.forEach(h => {
                if (h[1] != null && h[1] > 0) {
                    dateToClose.set(h[0], h[1]);
                }
            });

            let basePrice = null;
            for (let i = hist.length - 1; i >= 0; i--) {
                if (hist[i][0] <= startDate && hist[i][1] != null && hist[i][1] > 0) {
                    basePrice = hist[i][1];
                    break;
                }
            }
            if (basePrice == null && hist.length > 0) {
                const validFirst = hist.find(h => h[1] != null && h[1] > 0);
                basePrice = validFirst ? validFirst[1] : null;
            }

            let lastClose = basePrice;
            const returns = [];

            unifiedDates.forEach(date => {
                if (dateToClose.has(date)) {
                    const c = dateToClose.get(date);
                    if (c != null && c > 0) {
                        lastClose = c;
                    }
                }
                if (basePrice && basePrice > 0 && lastClose != null && lastClose > 0) {
                    const ret = ((lastClose - basePrice) / basePrice) * 100;
                    returns.push(Number(ret.toFixed(2)));
                } else {
                    returns.push(0);
                }
            });

            return {
                code: item.code,
                name: item.name,
                fullName: item.full_name,
                color: item.color,
                lineType: item.lineType || "solid",
                lineWidth: item.lineWidth || 2.2,
                data: returns
            };
        });

        if (typeof charts !== "undefined") {
            charts.createMultiIndexComparisonChart("holdings-comparison-chart", {
                dates: unifiedDates,
                series: series
            });
        }
    }

    renderPerformanceMatrix() {
        const container = document.getElementById("holdings-matrix-container");
        if (!container || !this.comparisonRawData) return;

        let list = [...this.comparisonRawData];
        const sortCol = this.matrixSortCol || "1Y";
        const isDesc = this.matrixSortDesc !== false;

        list.sort((a, b) => {
            let valA, valB;
            if (sortCol === "latest_close") {
                valA = a.latest_close || 0;
                valB = b.latest_close || 0;
            } else if (sortCol === "name") {
                return isDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
            } else if (sortCol === "ALPHA") {
                valA = a.alpha != null ? a.alpha : -99999;
                valB = b.alpha != null ? b.alpha : -99999;
            } else {
                valA = a.returns && a.returns[sortCol] != null ? a.returns[sortCol] : -99999;
                valB = b.returns && b.returns[sortCol] != null ? b.returns[sortCol] : -99999;
            }
            return isDesc ? valB - valA : valA - valB;
        });

        const periods = ["1D", "1W", "1M", "3M", "6M", "YTD", "1Y", "3Y"];
        const periodLabels = {
            "1D": "日涨跌",
            "1W": "近1周",
            "1M": "近1月",
            "3M": "近3月",
            "6M": "近6月",
            "YTD": "今年以来",
            "1Y": "近1年",
            "3Y": "近3年"
        };

        const isSortName = sortCol === "name";
        const sortIconName = isSortName ? (isDesc ? " ▼" : " ▲") : "";
        const isCurrentName = isSortName ? "current-period-header" : "";

        const isSortClose = sortCol === "latest_close";
        const sortIconClose = isSortClose ? (isDesc ? " ▼" : " ▲") : "";
        const isCurrentClose = isSortClose ? "current-period-header" : "";

        const isSortAlpha = sortCol === "ALPHA";
        const sortIconAlpha = isSortAlpha ? (isDesc ? " ▼" : " ▲") : "";
        const isCurrentAlpha = isSortAlpha ? "current-period-header" : "";

        let tableHtml = `
            <div class="matrix-table-wrap">
                <table class="matrix-table">
                    <thead>
                        <tr>
                            <th class="col-index sortable ${isCurrentName}" data-sort="name">舵手 / 基准${sortIconName}</th>
                            <th class="col-close sortable text-right ${isCurrentClose}" data-sort="latest_close">净值指数${sortIconClose}</th>
                            ${periods.map(p => {
                                const isSort = sortCol === p;
                                const sortIcon = isSort ? (isDesc ? " ▼" : " ▲") : "";
                                const isCurrent = isSort ? "current-period-header" : "";
                                return `<th class="col-ret sortable text-right ${isCurrent}" data-sort="${p}">${periodLabels[p]}${sortIcon}</th>`;
                            }).join("")}
                            <th class="col-ret sortable text-right ${isCurrentAlpha}" data-sort="ALPHA" title="相对于标普500近1年的超额收益率">超额 Alpha${sortIconAlpha}</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        list.forEach(item => {
            const closeFormatted = item.latest_close != null 
                ? Number(item.latest_close).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
                : "--";
            const isCurrentCloseCol = isSortClose ? "current-period-cell" : "";

            tableHtml += `
                <tr class="matrix-row">
                    <td class="col-index">
                        <div class="matrix-index-cell" style="display:flex; align-items:center; gap:8px;">
                            <span class="chip-color-dot" style="background-color: ${item.color};"></span>
                            <div>
                                <span class="matrix-name" style="font-weight: 700; color: var(--text-primary);">${item.name}</span>
                                <span class="matrix-code" style="font-size: 11px; color: var(--text-secondary); margin-left: 6px;">${item.full_name}</span>
                            </div>
                        </div>
                    </td>
                    <td class="col-close text-right font-mono ${isCurrentCloseCol}" style="font-weight: 600;">${closeFormatted}</td>
            `;

            periods.forEach(p => {
                const val = item.returns ? item.returns[p] : null;
                const isCurrent = sortCol === p;
                const cellClass = isCurrent ? "current-period-cell" : "";

                if (val == null || isNaN(val)) {
                    tableHtml += `<td class="col-ret text-right font-mono text-flat ${cellClass}">--</td>`;
                } else {
                    const colorClass = typeof APP_CONFIG !== "undefined" ? APP_CONFIG.getChangeClass(val) : (val > 0 ? "text-up" : (val < 0 ? "text-down" : "text-flat"));
                    const sign = val > 0 ? "+" : "";
                    tableHtml += `<td class="col-ret text-right font-mono ${colorClass} ${cellClass}" style="font-weight: 700;">${sign}${val.toFixed(2)}%</td>`;
                }
            });

            const alphaVal = item.alpha;
            const alphaClass = typeof APP_CONFIG !== "undefined" ? APP_CONFIG.getChangeClass(alphaVal) : (alphaVal > 0 ? "text-up" : (alphaVal < 0 ? "text-down" : "text-flat"));
            const alphaSign = (alphaVal != null && alphaVal > 0) ? "+" : "";
            const alphaStr = (alphaVal != null && !isNaN(alphaVal)) ? `${alphaSign}${alphaVal.toFixed(2)}%` : "--";
            const isAlphaCurrent = isSortAlpha ? "current-period-cell" : "";
            tableHtml += `<td class="col-ret text-right font-mono ${alphaClass} ${isAlphaCurrent}" style="font-weight: 700;">${alphaStr}</td>`;

            tableHtml += `</tr>`;
        });

        tableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = tableHtml;

        container.querySelectorAll(".matrix-table th.sortable").forEach(th => {
            th.onclick = () => {
                const sortKey = th.dataset.sort;
                if (!sortKey) return;

                if (this.matrixSortCol === sortKey) {
                    this.matrixSortDesc = !this.matrixSortDesc;
                } else {
                    this.matrixSortCol = sortKey;
                    this.matrixSortDesc = true;
                }

                this.renderPerformanceMatrix();
            };
        });
    }

}
