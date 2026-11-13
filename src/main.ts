import { App, ItemView, Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import ForceGraph3D from '3d-force-graph';
import { Network, DataSet } from 'vis-network/standalone';

const VIEW_TYPE_3D_GRAPH = 'vocab-3d-graph-view';

const branchPalettes = [
    { bg: '#0D9488', border: '#14B8A6', light: '#2DD4BF' }, // 1. Teal
    { bg: '#7C3AED', border: '#8B5CF6', light: '#A78BFA' }, // 2. Purple
    { bg: '#D97706', border: '#F59E0B', light: '#FBBF24' }, // 3. Amber
    { bg: '#DB2777', border: '#EC4899', light: '#F472B6' }, // 4. Pink
    { bg: '#0284C7', border: '#38BDF8', light: '#38BDF8' }, // 5. Sky Blue
    { bg: '#65A30D', border: '#84CC16', light: '#A3E635' }, // 6. Lime
    { bg: '#9333EA', border: '#A855F7', light: '#C084FC' }, // 7. Violet
    { bg: '#DC2626', border: '#EF4444', light: '#F87171' }, // 8. Red
    { bg: '#059669', border: '#10B981', light: '#34D399' }, // 9. Emerald
    { bg: '#4F46E5', border: '#6366F1', light: '#818CF8' }, // 10. Indigo
    { bg: '#0891B2', border: '#06B6D4', light: '#22D3EE' }, // 11. Cyan
    { bg: '#E11D48', border: '#F43F5E', light: '#FB7185' }, // 12. Rose
    { bg: '#C026D3', border: '#D946EF', light: '#E879F9' }, // 13. Fuchsia
    { bg: '#CA8A04', border: '#EAB308', light: '#FACC15' }, // 14. Yellow
    { bg: '#EA580C', border: '#F97316', light: '#FB923C' }, // 15. Orange
    { bg: '#16A34A', border: '#22C55E', light: '#4ADE80' }, // 16. Green
    { bg: '#475569', border: '#64748B', light: '#94A3B8' }, // 17. Slate
    { bg: '#701A75', border: '#86198F', light: '#C084FC' }, // 18. Plum
    { bg: '#1E40AF', border: '#1D4ED8', light: '#60A5FA' }, // 19. Royal Blue
    { bg: '#9F1239', border: '#BE123C', light: '#FB7185' }  // 20. Crimson
];

function getBranchColors(name: string, isLeafVocab = false) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    let index = Math.abs(hash) % branchPalettes.length;
    let palette = branchPalettes[index];
    if (isLeafVocab) {
        return { bg: '#17202A', border: palette.bg, light: palette.light };
    }
    return { bg: palette.bg, border: palette.border, light: palette.light };
}

export default class Vocab3DGraphPlugin extends Plugin {
    async onload() {
        this.registerView(
            VIEW_TYPE_3D_GRAPH,
            (leaf) => new Vocab3DGraphView(leaf, this.app)
        );

        this.addCommand({
            id: 'open-3d-vocab-graph',
            name: 'Open Vocabulary Graph (3D/2D)',
            callback: () => this.activateView()
        });

        this.addRibbonIcon('network', 'Open Vocabulary Graph', () => this.activateView());
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_3D_GRAPH)[0];
        if (!leaf) {
            leaf = workspace.getLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_3D_GRAPH, active: true });
        }
        workspace.revealLeaf(leaf);
    }
}

class Vocab3DGraphView extends ItemView {
    app: App;
    animationFrameId: number | null = null;
    resizeHandler: (() => void) | null = null;

    constructor(leaf: WorkspaceLeaf, app: App) {
        super(leaf);
        this.app = app;
    }

    getViewType(): string {
        return VIEW_TYPE_3D_GRAPH;
    }

    getDisplayText(): string {
        return "Vocabulary Graph";
    }

    async openFileAtLine(path: string, line: number) {
        const targetFile = this.app.vault.getAbstractFileByPath(path);
        if (!(targetFile instanceof TFile)) return;

        const { workspace } = this.app;
        
        // Check if the file is already open in any markdown tab to avoid duplicates
        const markdownLeaves = workspace.getLeavesOfType("markdown");
        let existingLeaf = markdownLeaves.find(leaf => (leaf.view as any).file?.path === targetFile.path);

        if (existingLeaf) {
            workspace.revealLeaf(existingLeaf);
            await existingLeaf.openFile(targetFile, { eState: { line } });
        } else {
            let activeLeaf = workspace.getLeaf(false);
            await activeLeaf.openFile(targetFile, { eState: { line } });
        }
    }

    async onOpen() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("vocab-graph-view-wrapper");
        container.style.position = "relative";
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.backgroundColor = "transparent";
        container.style.overflow = "hidden";
        container.style.display = "flex";
        container.style.flexDirection = "column";

        // 1. Top Bar Wrapper
        const topBar = document.createElement('div');
        topBar.style.borderBottom = "1px solid var(--background-modifier-border)";
        topBar.style.backgroundColor = "var(--background-secondary)";
        topBar.style.zIndex = "100";
        topBar.style.display = "flex";
        topBar.style.flexDirection = "column";

        const headerRow = document.createElement('div');
        headerRow.style.display = "flex";
        headerRow.style.justifyContent = "space-between";
        headerRow.style.alignItems = "center";
        headerRow.style.padding = "6px 12px";
        headerRow.style.fontSize = "11px";
        headerRow.style.fontWeight = "600";
        headerRow.style.color = "var(--text-muted)";

        const titleSpan = document.createElement('span');
        titleSpan.textContent = "🗺️ GRAPH CONTROLS";
        headerRow.appendChild(titleSpan);

        const collapseBtn = document.createElement('button');
        collapseBtn.textContent = "▲";
        collapseBtn.style.padding = "2px 8px";
        collapseBtn.style.fontSize = "12px";
        collapseBtn.style.lineHeight = "1";
        collapseBtn.style.borderRadius = "4px";
        collapseBtn.style.backgroundColor = "var(--interactive-normal)";
        collapseBtn.style.color = "var(--text-normal)";
        collapseBtn.style.border = "1px solid var(--background-modifier-border)";
        collapseBtn.style.cursor = "pointer";
        headerRow.appendChild(collapseBtn);
        topBar.appendChild(headerRow);

        const controlsBody = document.createElement('div');
        controlsBody.style.padding = "8px 12px 10px 12px";
        controlsBody.style.display = "flex";
        controlsBody.style.flexWrap = "wrap";
        controlsBody.style.alignItems = "center";
        controlsBody.style.gap = "8px 12px";
        topBar.appendChild(controlsBody);

        let isCollapsed = false;
        collapseBtn.onclick = () => {
            isCollapsed = !isCollapsed;
            controlsBody.style.display = isCollapsed ? "none" : "flex";
            collapseBtn.textContent = isCollapsed ? "▼" : "▲";
            window.dispatchEvent(new Event('resize'));
        };

        // Folder Group
        const folderGroup = document.createElement('div');
        folderGroup.style.display = "flex";
        folderGroup.style.alignItems = "center";
        folderGroup.style.gap = "6px";
        folderGroup.style.flex = "1 1 140px";

        const folderLabel = document.createElement('label');
        folderLabel.textContent = "Folder:";
        folderLabel.style.fontWeight = "600";
        folderLabel.style.fontSize = "11px";
        folderLabel.style.color = "var(--text-muted)";
        folderGroup.appendChild(folderLabel);

        const folderSelect = document.createElement('select');
        folderSelect.style.flex = "1";
        folderSelect.style.padding = "3px 6px";
        folderSelect.style.borderRadius = "6px";
        folderSelect.style.backgroundColor = "var(--interactive-normal)";
        folderSelect.style.color = "var(--text-normal)";
        folderSelect.style.border = "1px solid var(--background-modifier-border)";
        folderSelect.style.fontSize = "11px";
        folderSelect.style.cursor = "pointer";
        folderGroup.appendChild(folderSelect);
        controlsBody.appendChild(folderGroup);

        // Topic Group
        const topicGroup = document.createElement('div');
        topicGroup.style.display = "flex";
        topicGroup.style.alignItems = "center";
        topicGroup.style.gap = "6px";
        topicGroup.style.flex = "1 1 140px";

        const topicLabel = document.createElement('label');
        topicLabel.textContent = "Topic:";
        topicLabel.style.fontWeight = "600";
        topicLabel.style.fontSize = "11px";
        topicLabel.style.color = "var(--text-muted)";
        topicGroup.appendChild(topicLabel);

        const topicSelect = document.createElement('select');
        topicSelect.style.flex = "1";
        topicSelect.style.padding = "3px 6px";
        topicSelect.style.borderRadius = "6px";
        topicSelect.style.backgroundColor = "var(--interactive-normal)";
        topicSelect.style.color = "var(--text-normal)";
        topicSelect.style.border = "1px solid var(--background-modifier-border)";
        topicSelect.style.fontSize = "11px";
        topicSelect.style.cursor = "pointer";
        topicGroup.appendChild(topicSelect);
        controlsBody.appendChild(topicGroup);

        // Mode Toggle Button (3D / 2D)
        const modeBtn = document.createElement('button');
        modeBtn.textContent = "Mode: 3D 🌐";
        modeBtn.style.padding = "4px 10px";
        modeBtn.style.borderRadius = "6px";
        modeBtn.style.backgroundColor = "var(--interactive-normal)";
        modeBtn.style.color = "var(--text-normal)";
        modeBtn.style.border = "1px solid var(--background-modifier-border)";
        modeBtn.style.fontSize = "11px";
        modeBtn.style.fontWeight = "600";
        modeBtn.style.cursor = "pointer";
        controlsBody.appendChild(modeBtn);

        // Refresh Button
        const refreshBtn = document.createElement('button');
        refreshBtn.textContent = "↻ Refresh";
        refreshBtn.style.padding = "4px 10px";
        refreshBtn.style.borderRadius = "6px";
        refreshBtn.style.backgroundColor = "var(--interactive-accent)";
        refreshBtn.style.color = "var(--text-on-accent)";
        refreshBtn.style.border = "none";
        refreshBtn.style.fontSize = "11px";
        refreshBtn.style.fontWeight = "600";
        refreshBtn.style.cursor = "pointer";
        controlsBody.appendChild(refreshBtn);

        container.appendChild(topBar);

        // 2. Graph Canvas Container
        const graphWrapper = document.createElement('div');
        graphWrapper.style.position = "relative";
        graphWrapper.style.flex = "1";
        graphWrapper.style.width = "100%";
        graphWrapper.style.overflow = "hidden";
        container.appendChild(graphWrapper);

        let graphElem = document.createElement('div');
        graphElem.style.width = "100%";
        graphElem.style.height = "100%";
        graphWrapper.appendChild(graphElem);

        let overlay = document.createElement('div');
        overlay.style.position = "absolute";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.pointerEvents = "none";
        overlay.style.zIndex = "99";
        graphWrapper.appendChild(overlay);

        let currentMode: '3d' | '2d' = '3d';
        let currentGraphInstance: any = null;
        let visNetworkInstance: any = null;

        const sanitize = (text: string) => {
            if (!text) return "";
            let cleaned = text.replace(/[\[\]]/g, "").replace(/\[\[|\]\]/g, "").trim();
            if (cleaned.includes("\\s") || cleaned.includes("(^") || (cleaned.includes("\\") && cleaned.length === 1) || cleaned.length === 0) {
                return "";
            }
            return cleaned;
        };

        const extractNBadge = (lineText: string) => {
            let matches = [...lineText.matchAll(/\[(n|N)::\s*([^\]]+)\]/g)];
            if (matches.length > 0) {
                return sanitize(matches[0][2]);
            }
            return null;
        };

        const createBadgeNodeSvg = (label: string, badgeVal: string, bgColor: string, borderColor: string) => {
            let approxWidth = Math.max(120, label.length * 8 + 40);
            let height = 48;
            let badgeText = badgeVal.toUpperCase();
            let badgeWidth = Math.max(45, badgeText.length * 7 + 16);

            return `<svg xmlns="http://www.w3.org/2000/svg" width="${approxWidth}" height="${height + 15}" viewBox="0 0 ${approxWidth} ${height + 15}">
                <defs>
                    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
                        <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.3"/>
                    </filter>
                </defs>
                <rect x="5" y="12" width="${approxWidth - 10}" height="${height}" rx="8" fill="${bgColor}" stroke="${borderColor}" stroke-width="1.5" filter="url(#shadow)"/>
                <text x="${approxWidth / 2}" y="${12 + height / 2 + 1}" fill="#FFFFFF" font-family="Inter, sans-serif" font-size="13" font-weight="500" text-anchor="middle" dominant-baseline="central">${label}</text>
                <g transform="translate(${approxWidth - badgeWidth - 8}, 2)">
                    <rect width="${badgeWidth}" height="22" rx="11" fill="#EF4444" filter="url(#shadow)"/>
                    <text x="${badgeWidth / 2}" y="11" fill="#FFFFFF" font-family="Inter, sans-serif" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="central">${badgeText}</text>
                </g>
            </svg>`;
        };

        let allFiles = this.app.vault.getMarkdownFiles();
        let folderSet = new Set<string>();
        allFiles.forEach(f => {
            let lastSlash = f.path.lastIndexOf('/');
            if (lastSlash !== -1) {
                folderSet.add(f.path.substring(0, lastSlash));
            } else {
                folderSet.add("/");
            }
        });

        let folders = Array.from(folderSet).sort();
        folderSelect.innerHTML = "";
        folders.forEach(folder => {
            let opt = document.createElement('option');
            opt.value = folder;
            opt.textContent = folder;
            folderSelect.appendChild(opt);
        });

        let currentFolder = folders.includes("German") ? "German" : folders[0];
        folderSelect.value = currentFolder;

        const updateTopicsForFolder = async (folderPath: string) => {
            allFiles = this.app.vault.getMarkdownFiles();
            let targetFiles = folderPath === "/" 
                ? allFiles.filter(f => !f.path.includes('/'))
                : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

            let topicsSet = new Set<string>();

            for (let file of targetFiles) {
                let content = await this.app.vault.read(file);
                let lines = content.split('\n');
                for (let line of lines) {
                    let segments = line.split('\\');
                    for (let seg of segments) {
                        let topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        if (topicMatch) {
                            let cleanTopic = sanitize(topicMatch[1]);
                            if (cleanTopic) topicsSet.add(cleanTopic);
                        }
                    }
                }
            }

            let availableTopics = Array.from(topicsSet).sort();
            topicSelect.innerHTML = "";
            if (availableTopics.length === 0) {
                let opt = document.createElement('option');
                opt.value = "";
                opt.textContent = "No [topic::] tags found";
                topicSelect.appendChild(opt);
                graphElem.innerHTML = `<div style='padding:40px; color:var(--text-muted); text-align:center;'>⚠️ No <code>[topic::]</code> tags found in folder <b>${folderPath}</b>.</div>`;
                return;
            }

            availableTopics.forEach(t => {
                let opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                topicSelect.appendChild(opt);
            });

            topicSelect.value = availableTopics[0];
            await renderCurrentModeGraph(folderPath, availableTopics[0]);
        };

        const renderCurrentModeGraph = async (folderPath: string, topicName: string) => {
            if (currentGraphInstance) {
                currentGraphInstance = null;
            }
            if (visNetworkInstance) {
                visNetworkInstance.destroy();
                visNetworkInstance = null;
            }
            graphElem.innerHTML = "";
            overlay.innerHTML = "";

            allFiles = this.app.vault.getMarkdownFiles();
            let targetFiles = folderPath === "/" 
                ? allFiles.filter(f => !f.path.includes('/'))
                : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

            let nodesMap = new Map<string, any>();
            let linksArray: any[] = [];
            let addedNodes = new Set<string>();
            let nodeToLocationMap = new Map<string, { path: string; line: number }>();

            const addNode = (id: string, label: string, type: string, levelFromTopic = 0, colorKey: string | null = null, location: any = null, badgeVal: string | null = null) => {
                if (location && !nodeToLocationMap.has(id)) {
                    nodeToLocationMap.set(id, location);
                }
                if (addedNodes.has(id)) return;
                addedNodes.add(id);

                let bg = '#4A90E2';
                let border = '#2A4B7C';

                if (type === 'topic') {
                    bg = '#2563EB';
                    border = '#60A5FA';
                } else if (type === 'sub') {
                    let colors = getBranchColors(colorKey!, false);
                    bg = colors.bg;
                    border = colors.border;
                } else {
                    let colors = getBranchColors(colorKey!, true);
                    bg = colors.bg;
                    border = colors.border;
                }

                if (currentMode === '2d' && type === 'vocab' && badgeVal) {
                    let svgString = createBadgeNodeSvg(label, badgeVal, bg, border);
                    let url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
                    nodesMap.set(id, {
                        id: id,
                        shape: 'image',
                        image: url,
                        size: 30,
                        cursor: location ? 'pointer' : 'default',
                        font: { color: '#FFFFFF' }
                    });
                } else if (currentMode === '2d') {
                    nodesMap.set(id, {
                        id: id,
                        label: label,
                        color: { background: bg, border: border, highlight: { background: border, border: '#FFFFFF' } },
                        font: { color: '#FFFFFF', face: 'Inter, sans-serif', size: type === 'topic' ? 18 : 12, bold: type !== 'vocab' },
                        shape: 'box',
                        margin: type === 'topic' ? 14 : 8,
                        borderRadius: 8,
                        shadow: true,
                        cursor: location ? 'pointer' : 'default'
                    });
                } else {
                    nodesMap.set(id, {
                        id: id,
                        name: label,
                        badge: badgeVal,
                        colors: { bg, border },
                        type: type,
                        level: levelFromTopic,
                        val: 0.001
                    });
                }
            };

            let centralTopicId = "T_" + topicName.replace(/[^a-zA-Z0-9]/g, "_");
            addNode(centralTopicId, topicName, 'topic', 0, null, { path: '', line: 0 }, null);

            let linksSet = new Map<string, any>();

            for (let file of targetFiles) {
                let content = await this.app.vault.read(file);
                let lines = content.split('\n');

                for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                    let line = lines[lineIndex];
                    let vocabMatch = line.match(/\[vocab::\s*([^\]]+)\]/);
                    let sharedVocab = vocabMatch ? sanitize(vocabMatch[1]) : "";
                    let nBadgeVal = extractNBadge(line);
                    let segments = line.split('\\');

                    for (let seg of segments) {
                        let segVocabMatch = seg.match(/\[vocab::\s*([^\]]+)\]/);
                        let cleanVocab = segVocabMatch ? sanitize(segVocabMatch[1]) : sharedVocab;
                        let subMatches = [...seg.matchAll(/\[sub::\s*([^\]]+)\]/g)];
                        let cleanSubs = subMatches.map(m => sanitize(m[1])).filter(Boolean);
                        let topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        let cleanTopic = topicMatch ? sanitize(topicMatch[1]) : topicName;

                        if (cleanTopic === topicName) {
                            let pathNodes = [];
                            let locationData = { path: file.path, line: lineIndex };
                            let immediateParentSub = cleanSubs.length > 0 ? cleanSubs[cleanSubs.length - 1] : cleanVocab;
                            let colorKey = immediateParentSub || cleanTopic;

                            if (cleanVocab) {
                                let vocabId = "V_" + cleanVocab.replace(/[^a-zA-Z0-9]/g, "_");
                                addNode(vocabId, cleanVocab, 'vocab', 0, colorKey, locationData, nBadgeVal);
                                pathNodes.push(vocabId);
                            }

                            for (let j = 0; j < cleanSubs.length; j++) {
                                let subText = cleanSubs[j];
                                let subId = "S_" + subText.replace(/[^a-zA-Z0-9]/g, "_");
                                let levelFromTopic = cleanSubs.length - j; 
                                addNode(subId, subText, 'sub', levelFromTopic, subText, locationData, null);
                                pathNodes.push(subId);
                            }

                            pathNodes.push(centralTopicId);

                            for (let i = 0; i < pathNodes.length - 1; i++) {
                                let sourceId = pathNodes[i];
                                let targetId = pathNodes[i + 1];
                                let linkKey = sourceId + "->" + targetId;
                                
                                let edgeColor = '#93C5FD';
                                if (colorKey && colorKey !== topicName) {
                                    let branchInfo = getBranchColors(colorKey, false);
                                    edgeColor = branchInfo.light || '#93C5FD';
                                }

                                if (currentMode === '2d') {
                                    linksSet.set(linkKey, { from: sourceId, to: targetId, color: { color: edgeColor, opacity: 0.6 }, width: 2 });
                                } else {
                                    linksSet.set(linkKey, { source: sourceId, target: targetId, color: edgeColor });
                                }
                            }
                        }
                    }
                }
            }

            linksArray = Array.from(linksSet.values());

            if (nodesMap.size <= 1) {
                graphElem.innerHTML = `<div style='padding:40px; color:var(--text-muted); text-align:center;'>⚠️ No vocabulary entries found for topic <b>${topicName}</b>.</div>`;
                return;
            }

            if (currentMode === '3d') {
                const Graph = ForceGraph3D()(graphElem)
                    .backgroundColor('rgba(0,0,0,0)')
                    .graphData({
                        nodes: Array.from(nodesMap.values()),
                        links: linksArray
                    })
                    .nodeId('id')
                    .nodeVal('val')
                    .nodeColor((node: any) => node.colors.bg)
                    .linkColor((link: any) => link.color)
                    .linkWidth(2.5)
                    .linkOpacity(0.5)
                    .onNodeClick((node: any) => {
                        if (node.type === 'vocab') {
                            let loc = nodeToLocationMap.get(node.id);
                            if (loc) {
                                this.openFileAtLine(loc.path, loc.line);
                            }
                        }
                    });

                Graph.d3Force('link').distance(160);
                Graph.d3Force('charge').strength(-350);
                Graph.width(graphWrapper.clientWidth);
                Graph.height(graphWrapper.clientHeight);

                setTimeout(() => {
                    Graph.zoomToFit(500, 60);
                }, 200);

                let nodeElements = new Map<string, HTMLElement>();
                let draggedNode: any = null;
                let dragPlaneZ = 0;
                let touchStartX = 0;
                let touchStartY = 0;
                let hasMoved = false;

                const handleNodeClick = (node: any) => {
                    if (node.type === 'vocab') {
                        let loc = nodeToLocationMap.get(node.id);
                        if (loc) {
                            this.openFileAtLine(loc.path, loc.line);
                        }
                    }
                };

                nodesMap.forEach(node => {
                    let lbl = document.createElement('div');
                    lbl.style.position = "absolute";
                    lbl.style.transform = "translate(-50%, -50%)";
                    lbl.style.backgroundColor = node.colors.bg;
                    lbl.style.borderColor = node.colors.border;
                    lbl.style.borderWidth = "1.5px";
                    lbl.style.borderStyle = "solid";
                    lbl.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                    lbl.style.whiteSpace = "nowrap";
                    lbl.style.pointerEvents = "auto";
                    lbl.style.cursor = node.type === 'vocab' ? "pointer" : "grab";
                    lbl.style.transition = "opacity 0.05s linear, filter 0.05s linear";

                    let textSpan = document.createElement('span');
                    textSpan.textContent = node.name;
                    textSpan.style.color = "#FFFFFF";
                    lbl.appendChild(textSpan);

                    if (node.badge) {
                        let badgeEl = document.createElement('span');
                        badgeEl.textContent = node.badge.toUpperCase();
                        badgeEl.style.position = "absolute";
                        badgeEl.style.top = "-10px";
                        badgeEl.style.right = "-8px";
                        badgeEl.style.backgroundColor = "#EF4444";
                        badgeEl.style.color = "#FFFFFF";
                        badgeEl.style.fontSize = "9px";
                        badgeEl.style.fontWeight = "700";
                        badgeEl.style.padding = "2px 6px";
                        badgeEl.style.borderRadius = "11px";
                        badgeEl.style.border = "1px solid rgba(255,255,255,0.4)";
                        badgeEl.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
                        lbl.appendChild(badgeEl);
                    }

                    if (node.type === 'topic') {
                        lbl.style.fontSize = "16px";
                        lbl.style.fontWeight = "700";
                        lbl.style.padding = "8px 14px";
                        lbl.style.borderRadius = "10px";
                    } else if (node.type === 'sub') {
                        let levelSize = node.level === 1 ? 14 : 11;
                        lbl.style.fontSize = levelSize + "px";
                        lbl.style.fontWeight = "600";
                        lbl.style.padding = "5px 10px";
                        lbl.style.borderRadius = "8px";
                    } else {
                        lbl.style.fontSize = "11px";
                        lbl.style.fontWeight = "500";
                        lbl.style.padding = "5px 8px";
                        lbl.style.borderRadius = "6px";
                    }
                    
                    lbl.onmousedown = (e: MouseEvent) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        draggedNode = node;
                        dragPlaneZ = node.z || 0;
                        hasMoved = false;
                        lbl.style.cursor = "grabbing";
                        Graph.controls().enabled = false;
                        node.fx = node.x;
                        node.fy = node.y;
                        node.fz = node.z;
                    };

                    lbl.ontouchstart = (e: TouchEvent) => {
                        if (e.touches.length !== 1) return;
                        touchStartX = e.touches[0].clientX;
                        touchStartY = e.touches[0].clientY;
                        draggedNode = node;
                        dragPlaneZ = node.z || 0;
                        hasMoved = false;
                        Graph.controls().enabled = false;
                        node.fx = node.x;
                        node.fy = node.y;
                        node.fz = node.z;
                    };

                    lbl.ontouchmove = (e: TouchEvent) => {
                        if (!draggedNode || e.touches.length !== 1) return;
                        const touchX = e.touches[0].clientX;
                        const touchY = e.touches[0].clientY;
                        const moveDist = Math.hypot(touchX - touchStartX, touchY - touchStartY);
                        
                        if (moveDist > 6) {
                            hasMoved = true;
                            const rect = graphElem.getBoundingClientRect();
                            const scale = (Math.abs(draggedNode.z || 0) + 300) * 0.35;
                            draggedNode.fx = (touchX - rect.left - rect.width / 2) * (scale / rect.width);
                            draggedNode.fy = (-(touchY - rect.top - rect.height / 2)) * (scale / rect.height);
                            draggedNode.fz = dragPlaneZ;
                            Graph.d3ReheatSimulation();
                        }
                    };

                    lbl.ontouchend = (e: TouchEvent) => {
                        if (draggedNode) {
                            if (!hasMoved) {
                                e.stopPropagation();
                                handleNodeClick(node);
                            }
                            draggedNode.fx = undefined;
                            draggedNode.fy = undefined;
                            draggedNode.fz = undefined;
                            draggedNode = null;
                            Graph.controls().enabled = true;
                        }
                    };

                    // Desktop click backup
                    lbl.onclick = (e: MouseEvent) => {
                        e.stopPropagation();
                        handleNodeClick(node);
                    };

                    overlay.appendChild(lbl);
                    nodeElements.set(node.id, lbl);
                });

                const mouseMoveHandler = (e: MouseEvent) => {
                    if (!draggedNode) return;
                    hasMoved = true;
                    const rect = graphElem.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const cam = Graph.camera();
                    if (cam) {
                        const scale = (Math.abs(draggedNode.z || 0) + 300) * 0.35;
                        draggedNode.fx = (mouseX - rect.width / 2) * (scale / rect.width);
                        draggedNode.fy = (-(mouseY - rect.height / 2)) * (scale / rect.height);
                        draggedNode.fz = dragPlaneZ;
                        Graph.d3ReheatSimulation();
                    }
                };

                const mouseUpHandler = () => {
                    if (draggedNode) {
                        if (!hasMoved) {
                            handleNodeClick(draggedNode);
                        }
                        draggedNode.fx = undefined;
                        draggedNode.fy = undefined;
                        draggedNode.fz = undefined;
                        nodesMap.forEach(n => {
                            let el = nodeElements.get(n.id);
                            if (el) el.style.cursor = n.type === 'vocab' ? "pointer" : "grab";
                        });
                        draggedNode = null;
                        Graph.controls().enabled = true;
                    }
                };

                window.addEventListener('mousemove', mouseMoveHandler);
                window.addEventListener('mouseup', mouseUpHandler);

                class ProjVector3 {
                    x: number; y: number; z: number;
                    constructor(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }
                    applyMatrix4(m: any) {
                        const te = m.elements;
                        const x = this.x, y = this.y, z = this.z;
                        const w = 1 / (te[3] * x + te[7] * y + te[11] * z + te[15]);
                        this.x = (te[0] * x + te[4] * y + te[8] * z + te[12]) * w;
                        this.y = (te[1] * x + te[5] * y + te[9] * z + te[13]) * w;
                        this.z = (te[2] * x + te[6] * y + te[10] * z + te[14]) * w;
                        return this;
                    }
                    project(camera: any) {
                        return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
                    }
                }

                const updateLabels = () => {
                    if (!container.isConnected) return;
                    const camera = Graph.camera();
                    if (camera) {
                        const width = graphWrapper.clientWidth;
                        const height = graphWrapper.clientHeight;
                        let centerNode = nodesMap.get(centralTopicId);
                        let rootX = centerNode && typeof centerNode.x === 'number' ? centerNode.x : 0;
                        let rootY = centerNode && typeof centerNode.y === 'number' ? centerNode.y : 0;
                        let rootZ = centerNode && typeof centerNode.z === 'number' ? centerNode.z : 0;
                        let camPos = camera.position;
                        let rootDistToCam = Math.sqrt(Math.pow(rootX - camPos.x, 2) + Math.pow(rootY - camPos.y, 2) + Math.pow(rootZ - camPos.z, 2));

                        nodesMap.forEach((node, id) => {
                            let el = nodeElements.get(id);
                            if (!el) return;
                            if (typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') return;
                            
                            let targetX = node.fx !== undefined ? node.fx : node.x;
                            let targetY = node.fy !== undefined ? node.fy : node.y;
                            let targetZ = node.fz !== undefined ? node.fz : node.z;

                            let nodeDistToCam = Math.sqrt(Math.pow(targetX - camPos.x, 2) + Math.pow(targetY - camPos.y, 2) + Math.pow(targetZ - camPos.z, 2));
                            let pos = new ProjVector3(targetX, targetY, targetZ);
                            pos.project(camera);

                            if (pos.z > 1) {
                                el.style.display = 'none';
                                return;
                            }
                            el.style.display = 'block';
                            let x = (pos.x * 0.5 + 0.5) * width;
                            let y = (-(pos.y * 0.5) + 0.5) * height;
                            el.style.left = `${x}px`;
                            el.style.top = `${y}px`;
                            el.style.zIndex = Math.round(10000 - nodeDistToCam).toString();

                            let depthDifference = nodeDistToCam - rootDistToCam;
                            if (depthDifference > 30) {
                                let softBlur = Math.min(2.0, (depthDifference - 30) / 80);
                                el.style.filter = `blur(${softBlur.toFixed(1)}px)`;
                                el.style.opacity = "0.8";
                            } else {
                                el.style.filter = 'none';
                                el.style.opacity = "1.0";
                            }
                        });
                    }
                    this.animationFrameId = requestAnimationFrame(updateLabels);
                };
                updateLabels();
                currentGraphInstance = Graph;

            } else {
                // --- RENDER 2D GRAPH ---
                graphElem.style.width = "100%";
                graphElem.style.height = `${graphWrapper.clientHeight || 500}px`;
                graphElem.style.position = "relative";

                requestAnimationFrame(() => {
                    try {
                        const data = {
                            nodes: new DataSet(Array.from(nodesMap.values())),
                            edges: new DataSet(linksArray)
                        };
                        const options = {
                            autoResize: true,
                            width: '100%',
                            height: '100%',
                            physics: {
                                barnesHut: {
                                    gravitationalConstant: -3500,
                                    centralGravity: 0.4,
                                    springLength: 120
                                }
                            },
                            interaction: { hover: true, dragNodes: true }
                        };

                        visNetworkInstance = new Network(graphElem, data, options);
                        visNetworkInstance.redraw();

                        visNetworkInstance.on("click", async (params: any) => {
                            if (params.nodes.length > 0) {
                                const clickedNodeId = params.nodes[0];
                                const loc = nodeToLocationMap.get(clickedNodeId);
                                if (loc) {
                                    this.openFileAtLine(loc.path, loc.line);
                                }
                            }
                        });
                    } catch (err: any) {
                        console.error("2D Network Error:", err);
                    }
                });
            }
        };

        folderSelect.addEventListener('change', async (e) => {
            let selectedFolder = (e.target as HTMLSelectElement).value;
            await updateTopicsForFolder(selectedFolder);
        });

        topicSelect.addEventListener('change', (e) => {
            let selectedTopic = (e.target as HTMLSelectElement).value;
            if (selectedTopic) {
                renderCurrentModeGraph(folderSelect.value, selectedTopic);
            }
        });

        modeBtn.onclick = async () => {
            currentMode = currentMode === '3d' ? '2d' : '3d';
            modeBtn.textContent = currentMode === '3d' ? "Mode: 3D 🌐" : "Mode: 2D 🗺️";
            if (topicSelect.value) {
                await renderCurrentModeGraph(folderSelect.value, topicSelect.value);
            }
        };

        refreshBtn.onclick = async () => {
            refreshBtn.textContent = "↻ Refreshing...";
            await updateTopicsForFolder(folderSelect.value);
            if (topicSelect.value) {
                await renderCurrentModeGraph(folderSelect.value, topicSelect.value);
            }
            setTimeout(() => {
                refreshBtn.textContent = "↻ Refresh";
            }, 400);
        };

        await updateTopicsForFolder(currentFolder);

        this.resizeHandler = () => {
            if (currentGraphInstance) {
                currentGraphInstance.width(graphWrapper.clientWidth);
                currentGraphInstance.height(graphWrapper.clientHeight);
            }
            if (visNetworkInstance) {
                graphElem.style.height = `${graphWrapper.clientHeight || 500}px`;
                visNetworkInstance.redraw();
            }
        };
        window.addEventListener('resize', this.resizeHandler);
    }

    async onClose() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
    }
}