import { App, ItemView, Plugin, WorkspaceLeaf, TFile } from 'obsidian';
import ForceGraph3D from '3d-force-graph';
import { Network, DataSet } from 'vis-network/standalone';
import { VocabGraphSettingTab } from './settings';

const VIEW_TYPE_3D_GRAPH = 'vocab-3d-graph-view';

interface BranchPalette {
    bg: string;
    border: string;
    light: string;
}

const branchPalettes: BranchPalette[] = [
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

function getBranchColors(name: string, isLeafVocab = false): BranchPalette {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % branchPalettes.length;
    const palette = branchPalettes[index];
    if (isLeafVocab) {
        return { bg: '#17202A', border: palette.bg, light: palette.light };
    }
    return { bg: palette.bg, border: palette.border, light: palette.light };
}

export default class Vocab3DGraphPlugin extends Plugin {
    async onload(): Promise<void> {
        this.registerView(
            VIEW_TYPE_3D_GRAPH,
            (leaf) => new Vocab3DGraphView(leaf, this.app)
        );

        this.addCommand({
            id: 'open-3d-vocab-graph',
            name: 'Open Vocabulary Graph (3D/2D)',
            callback: () => {
                void this.activateView();
            }
        });

        this.addRibbonIcon('network', 'Open Vocabulary Graph', () => {
            void this.activateView();
        });
        this.addSettingTab(new VocabGraphSettingTab(this.app, this));
    }

    async activateView(): Promise<void> {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_3D_GRAPH)[0];
        if (!leaf) {
            leaf = workspace.getLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_3D_GRAPH, active: true });
        }
        workspace.setActiveLeaf(leaf, { focus: true });
    }
}

class Vocab3DGraphView extends ItemView {
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

    async openFileAtLine(path: string, line: number): Promise<void> {
        const targetFile = this.app.vault.getAbstractFileByPath(path);
        if (!(targetFile instanceof TFile)) return;

        const { workspace } = this.app;
        const markdownLeaves = workspace.getLeavesOfType("markdown");
        let existingLeaf: WorkspaceLeaf | undefined;
        markdownLeaves.forEach((leaf) => {
            const viewState = leaf.getViewState();
            if (viewState.state && (viewState.state as Record<string, unknown>).file === targetFile.path) {
                existingLeaf = leaf;
            }
        });

        if (existingLeaf) {
            workspace.revealLeaf(existingLeaf);
            await existingLeaf.openFile(targetFile, { eState: { line } });
        } else {
            const activeLeaf = workspace.getLeaf(false);
            await activeLeaf.openFile(targetFile, { eState: { line } });
        }
    }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass("vocab-graph-view-wrapper");
        container.setCssStyles({
            position: "relative",
            width: "100%",
            height: "100%",
            backgroundColor: "transparent",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
        });

        // 1. Top Bar Wrapper
        const topBar = container.createDiv();
        topBar.setCssStyles({
            borderBottom: "1px solid var(--background-modifier-border)",
            backgroundColor: "var(--background-secondary)",
            zIndex: "100",
            display: "flex",
            flexDirection: "column"
        });

        const headerRow = topBar.createDiv();
        headerRow.setCssStyles({
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 12px",
            fontSize: "11px",
            fontWeight: "600",
            color: "var(--text-muted)"
        });

        const titleSpan = headerRow.createSpan();
        titleSpan.setText("🗺️ GRAPH CONTROLS");

        const collapseBtn = headerRow.createEl('button');
        collapseBtn.setText("▲");
        collapseBtn.setCssStyles({
            padding: "2px 8px",
            fontSize: "12px",
            lineHeight: "1",
            borderRadius: "4px",
            backgroundColor: "var(--interactive-normal)",
            color: "var(--text-normal)",
            border: "1px solid var(--background-modifier-border)",
            cursor: "pointer"
        });

        const controlsBody = topBar.createDiv();
        controlsBody.setCssStyles({
            padding: "8px 12px 10px 12px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "8px 12px"
        });

        let isCollapsed = false;
        collapseBtn.onclick = () => {
            isCollapsed = !isCollapsed;
            controlsBody.setCssStyles({ display: isCollapsed ? "none" : "flex" });
            collapseBtn.setText(isCollapsed ? "▼" : "▲");
            window.dispatchEvent(new Event('resize'));
        };

        // Folder Group
        const folderGroup = controlsBody.createDiv();
        folderGroup.setCssStyles({
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flex: "1 1 140px"
        });

        const folderLabel = folderGroup.createEl('label');
        folderLabel.setText("Folder:");
        folderLabel.setCssStyles({
            fontWeight: "600",
            fontSize: "11px",
            color: "var(--text-muted)"
        });

        const folderSelect = folderGroup.createEl('select');
        folderSelect.setCssStyles({
            flex: "1",
            padding: "3px 6px",
            borderRadius: "6px",
            backgroundColor: "var(--interactive-normal)",
            color: "var(--text-normal)",
            border: "1px solid var(--background-modifier-border)",
            fontSize: "11px",
            cursor: "pointer"
        });

        // Topic Group
        const topicGroup = controlsBody.createDiv();
        topicGroup.setCssStyles({
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flex: "1 1 140px"
        });

        const topicLabel = topicGroup.createEl('label');
        topicLabel.setText("Topic:");
        topicLabel.setCssStyles({
            fontWeight: "600",
            fontSize: "11px",
            color: "var(--text-muted)"
        });

        const topicSelect = topicGroup.createEl('select');
        topicSelect.setCssStyles({
            flex: "1",
            padding: "3px 6px",
            borderRadius: "6px",
            backgroundColor: "var(--interactive-normal)",
            color: "var(--text-normal)",
            border: "1px solid var(--background-modifier-border)",
            fontSize: "11px",
            cursor: "pointer"
        });

        // Mode Toggle Button (3D / 2D)
        const modeBtn = controlsBody.createEl('button');
        modeBtn.setText("Mode: 3D 🌐");
        modeBtn.setCssStyles({
            padding: "4px 10px",
            borderRadius: "6px",
            backgroundColor: "var(--interactive-normal)",
            color: "var(--text-normal)",
            border: "1px solid var(--background-modifier-border)",
            fontSize: "11px",
            fontWeight: "600",
            cursor: "pointer"
        });

        // Refresh Button
        const refreshBtn = controlsBody.createEl('button');
        refreshBtn.setText("↻ Refresh");
        refreshBtn.setCssStyles({
            padding: "4px 10px",
            borderRadius: "6px",
            backgroundColor: "var(--interactive-accent)",
            color: "var(--text-on-accent)",
            border: "none",
            fontSize: "11px",
            fontWeight: "600",
            cursor: "pointer"
        });

        // 2. Graph Canvas Container
        const graphWrapper = container.createDiv();
        graphWrapper.setCssStyles({
            position: "relative",
            flex: "1",
            width: "100%",
            overflow: "hidden"
        });

        const graphElem = graphWrapper.createDiv();
        graphElem.setCssStyles({
            width: "100%",
            height: "100%"
        });

        const overlay = graphWrapper.createDiv();
        overlay.setCssStyles({
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: "99"
        });

        let currentMode: '3d' | '2d' = '3d';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let currentGraphInstance: any = null;
        let visNetworkInstance: Network | null = null;

        const sanitize = (text: string): string => {
            if (!text) return "";
            const cleaned = text.replace(/[\]\[]/g, "").replace(/\[\[|\]\]/g, "").trim();
            if (cleaned.includes("\\s") || cleaned.includes("(^") || (cleaned.includes("\\") && cleaned.length === 1) || cleaned.length === 0) {
                return "";
            }
            return cleaned;
        };

        const extractNBadge = (lineText: string): string | null => {
            const matches = [...lineText.matchAll(/\[(n|N)::\s*([^\]]+)\]/g)];
            if (matches.length > 0) {
                return sanitize(matches[0][2]);
            }
            return null;
        };

        const createBadgeNodeSvg = (label: string, badgeVal: string, bgColor: string, borderColor: string): string => {
            const approxWidth = Math.max(120, label.length * 8 + 40);
            const height = 48;
            const badgeText = badgeVal.toUpperCase();
            const badgeWidth = Math.max(45, badgeText.length * 7 + 16);

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
        const folderSet = new Set<string>();
        allFiles.forEach(f => {
            const lastSlash = f.path.lastIndexOf('/');
            if (lastSlash !== -1) {
                folderSet.add(f.path.substring(0, lastSlash));
            } else {
                folderSet.add("/");
            }
        });

        const folders = Array.from(folderSet).sort();
        folderSelect.innerHTML = "";
        folders.forEach(folder => {
            const opt = folderSelect.createEl('option');
            opt.value = folder;
            opt.textContent = folder;
        });

        const currentFolder = folders.includes("German") ? "German" : folders[0];
        folderSelect.value = currentFolder;

        const updateTopicsForFolder = async (folderPath: string): Promise<void> => {
            allFiles = this.app.vault.getMarkdownFiles();
            const targetFiles = folderPath === "/" 
                ? allFiles.filter(f => !f.path.includes('/'))
                : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

            const topicsSet = new Set<string>();

            for (const file of targetFiles) {
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');
                for (const line of lines) {
                    const segments = line.split('\\');
                    for (const seg of segments) {
                        const topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        if (topicMatch) {
                            const cleanTopic = sanitize(topicMatch[1]);
                            if (cleanTopic) topicsSet.add(cleanTopic);
                        }
                    }
                }
            }

            const availableTopics = Array.from(topicsSet).sort();
            topicSelect.innerHTML = "";
            if (availableTopics.length === 0) {
                const opt = topicSelect.createEl('option');
                opt.value = "";
                opt.textContent = "No [topic::] tags found";
                
                graphElem.empty();
                const warningDiv = graphElem.createDiv();
                warningDiv.setCssStyles({ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' });
                warningDiv.setText(`⚠️ No [topic::] tags found in folder ${folderPath}.`);
                return;
            }

            availableTopics.forEach(t => {
                const opt = topicSelect.createEl('option');
                opt.value = t;
                opt.textContent = t;
            });

            topicSelect.value = availableTopics[0];
            await renderCurrentModeGraph(folderPath, availableTopics[0]);
        };

        const renderCurrentModeGraph = async (folderPath: string, topicName: string): Promise<void> => {
            if (currentGraphInstance) {
                currentGraphInstance = null;
            }
            if (visNetworkInstance) {
                visNetworkInstance.destroy();
                visNetworkInstance = null;
            }
            graphElem.empty();
            overlay.empty();

            allFiles = this.app.vault.getMarkdownFiles();
            const targetFiles = folderPath === "/" 
                ? allFiles.filter(f => !f.path.includes('/'))
                : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

            const nodesMap = new Map<string, Record<string, unknown>>();
            const linksArray: Record<string, unknown>[] = [];
            const addedNodes = new Set<string>();
            const nodeToLocationMap = new Map<string, { path: string; line: number }>();

            const addNode = (
                id: string,
                label: string,
                type: string,
                levelFromTopic = 0,
                colorKey: string | null = null,
                location: { path: string; line: number } | null = null,
                badgeVal: string | null = null
            ) => {
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
                    const colors = getBranchColors(colorKey ?? '', false);
                    bg = colors.bg;
                    border = colors.border;
                } else {
                    const colors = getBranchColors(colorKey ?? '', true);
                    bg = colors.bg;
                    border = colors.border;
                }

                if (currentMode === '2d' && type === 'vocab' && badgeVal) {
                    const svgString = createBadgeNodeSvg(label, badgeVal, bg, border);
                    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
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

            const centralTopicId = "T_" + topicName.replace(/[^a-zA-Z0-9]/g, "_");
            addNode(centralTopicId, topicName, 'topic', 0, null, { path: '', line: 0 }, null);

            const linksSet = new Map<string, Record<string, unknown>>();

            for (const file of targetFiles) {
                const content = await this.app.vault.read(file);
                const lines = content.split('\n');

                for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                    const line = lines[lineIndex];
                    const vocabMatch = line.match(/\[vocab::\s*([^\]]+)\]/);
                    const sharedVocab = vocabMatch ? sanitize(vocabMatch[1]) : "";
                    const nBadgeVal = extractNBadge(line);
                    const segments = line.split('\\');

                    for (const seg of segments) {
                        const segVocabMatch = seg.match(/\[vocab::\s*([^\]]+)\]/);
                        const cleanVocab = segVocabMatch ? sanitize(segVocabMatch[1]) : sharedVocab;
                        const subMatches = [...seg.matchAll(/\[sub::\s*([^\]]+)\]/g)];
                        const cleanSubs = subMatches.map(m => sanitize(m[1])).filter(Boolean);
                        const topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        const cleanTopic = topicMatch ? sanitize(topicMatch[1]) : topicName;

                        if (cleanTopic === topicName) {
                            const pathNodes: string[] = [];
                            const locationData = { path: file.path, line: lineIndex };
                            const immediateParentSub = cleanSubs.length > 0 ? cleanSubs[cleanSubs.length - 1] : cleanVocab;
                            const colorKey = immediateParentSub || cleanTopic;

                            if (cleanVocab) {
                                const vocabId = "V_" + cleanVocab.replace(/[^a-zA-Z0-9]/g, "_");
                                addNode(vocabId, cleanVocab, 'vocab', 0, colorKey, locationData, nBadgeVal);
                                pathNodes.push(vocabId);
                            }

                            for (let j = 0; j < cleanSubs.length; j++) {
                                const subText = cleanSubs[j];
                                const subId = "S_" + subText.replace(/[^a-zA-Z0-9]/g, "_");
                                const levelFromTopic = cleanSubs.length - j; 
                                addNode(subId, subText, 'sub', levelFromTopic, subText, locationData, null);
                                pathNodes.push(subId);
                            }

                            pathNodes.push(centralTopicId);

                            for (let i = 0; i < pathNodes.length - 1; i++) {
                                const sourceId = pathNodes[i];
                                const targetId = pathNodes[i + 1];
                                const linkKey = sourceId + "->" + targetId;
                                
                                let edgeColor = '#93C5FD';
                                if (colorKey && colorKey !== topicName) {
                                    const branchInfo = getBranchColors(colorKey, false);
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

            linksArray.push(...Array.from(linksSet.values()));

            if (nodesMap.size <= 1) {
                const warningDiv = graphElem.createDiv();
                warningDiv.setCssStyles({ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' });
                warningDiv.setText(`⚠️ No vocabulary entries found for topic ${topicName}.`);
                return;
            }

            if (currentMode === '3d') {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
                const Graph = ForceGraph3D()(graphElem)
                    .backgroundColor('rgba(0,0,0,0)')
                    .graphData({
                        nodes: Array.from(nodesMap.values()),
                        links: linksArray
                    })
                    .nodeId('id')
                    .nodeVal('val')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .nodeColor((node: any) => (node.colors as BranchPalette).bg)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .linkColor((link: any) => link.color as string)
                    .linkWidth(2.5)
                    .linkOpacity(0.5)
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .onNodeClick((node: any) => {
                        if (node.type === 'vocab') {
                            const loc = nodeToLocationMap.get(node.id as string);
                            if (loc) {
                                void this.openFileAtLine(loc.path, loc.line);
                            }
                        }
                    });

                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                Graph.d3Force('link').distance(160);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                Graph.d3Force('charge').strength(-350);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                Graph.width(graphWrapper.clientWidth);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                Graph.height(graphWrapper.clientHeight);

                window.setTimeout(() => {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                    Graph.zoomToFit(500, 60);
                }, 200);

                const nodeElements = new Map<string, HTMLElement>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let draggedNode: any = null;
                let dragPlaneZ = 0;
                let touchStartX = 0;
                let touchStartY = 0;
                let hasMoved = false;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const handleNodeClick = (node: any) => {
                    if (node.type === 'vocab') {
                        const loc = nodeToLocationMap.get(node.id as string);
                        if (loc) {
                            void this.openFileAtLine(loc.path, loc.line);
                        }
                    }
                };

                nodesMap.forEach(node => {
                    const lbl = overlay.createDiv();
                    const colors = node.colors as BranchPalette;
                    lbl.setCssStyles({
                        position: "absolute",
                        transform: "translate(-50%, -50%)",
                        backgroundColor: colors.bg,
                        borderColor: colors.border,
                        borderWidth: "1.5px",
                        borderStyle: "solid",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        whiteSpace: "nowrap",
                        pointerEvents: "auto",
                        cursor: node.type === 'vocab' ? "pointer" : "grab",
                        transition: "opacity 0.05s linear, filter 0.05s linear"
                    });

                    const textSpan = lbl.createSpan();
                    textSpan.setText(node.name as string);
                    textSpan.setCssStyles({ color: "#FFFFFF" });

                    if (node.badge) {
                        const badgeEl = lbl.createSpan();
                        badgeEl.setText((node.badge as string).toUpperCase());
                        badgeEl.setCssStyles({
                            position: "absolute",
                            top: "-10px",
                            right: "-8px",
                            backgroundColor: "#EF4444",
                            color: "#FFFFFF",
                            fontSize: "9px",
                            fontWeight: "700",
                            padding: "2px 6px",
                            borderRadius: "11px",
                            border: "1px solid rgba(255,255,255,0.4)",
                            boxShadow: "0 2px 4px rgba(0,0,0,0.3)"
                        });
                    }

                    if (node.type === 'topic') {
                        lbl.setCssStyles({ fontSize: "16px", fontWeight: "700", padding: "8px 14px", borderRadius: "10px" });
                    } else if (node.type === 'sub') {
                        const levelSize = node.level === 1 ? 14 : 11;
                        lbl.setCssStyles({ fontSize: levelSize + "px", fontWeight: "600", padding: "5px 10px", borderRadius: "8px" });
                    } else {
                        lbl.setCssStyles({ fontSize: "11px", fontWeight: "500", padding: "5px 8px", borderRadius: "6px" });
                    }
                    
                    lbl.onmousedown = (e: MouseEvent) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        draggedNode = node;
                        dragPlaneZ = (node.z as number) || 0;
                        hasMoved = false;
                        lbl.setCssStyles({ cursor: "grabbing" });
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
                        dragPlaneZ = (node.z as number) || 0;
                        hasMoved = false;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
                            const scale = (Math.abs((draggedNode.z as number) || 0) + 300) * 0.35;
                            draggedNode.fx = (touchX - rect.left - rect.width / 2) * (scale / rect.width);
                            draggedNode.fy = (-(touchY - rect.top - rect.height / 2)) * (scale / rect.height);
                            draggedNode.fz = dragPlaneZ;
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
                            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                            Graph.controls().enabled = true;
                        }
                    };

                    lbl.onclick = (e: MouseEvent) => {
                        e.stopPropagation();
                        handleNodeClick(node);
                    };

                    nodeElements.set(node.id as string, lbl);
                });

                const mouseMoveHandler = (e: MouseEvent) => {
                    if (!draggedNode) return;
                    hasMoved = true;
                    const rect = graphElem.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                    const cam = Graph.camera();
                    if (cam) {
                        const scale = (Math.abs((draggedNode.z as number) || 0) + 300) * 0.35;
                        draggedNode.fx = (mouseX - rect.width / 2) * (scale / rect.width);
                        draggedNode.fy = (-(mouseY - rect.height / 2)) * (scale / rect.height);
                        draggedNode.fz = dragPlaneZ;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
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
                        nodesMap.forEach((n, nId) => {
                            const el = nodeElements.get(nId);
                            if (el) el.setCssStyles({ cursor: n.type === 'vocab' ? "pointer" : "grab" });
                        });
                        draggedNode = null;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                        Graph.controls().enabled = true;
                    }
                };

                window.addEventListener('mousemove', mouseMoveHandler);
                window.addEventListener('mouseup', mouseUpHandler);

                class ProjVector3 {
                    x: number; y: number; z: number;
                    constructor(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    applyMatrix4(m: any) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        const te = m.elements;
                        const x = this.x, y = this.y, z = this.z;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        const w = 1 / (te[3] * x + te[7] * y + te[11] * z + te[15]);
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        this.x = (te[0] * x + te[4] * y + te[8] * z + te[12]) * w;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        this.y = (te[1] * x + te[5] * y + te[9] * z + te[13]) * w;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                        this.z = (te[2] * x + te[6] * y + te[10] * z + te[14]) * w;
                        return this;
                    }
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    project(camera: any) {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
                    }
                }

                const updateLabels = () => {
                    if (!container.isConnected) return;
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                    const camera = Graph.camera();
                    if (camera) {
                        const width = graphWrapper.clientWidth;
                        const height = graphWrapper.clientHeight;
                        const centerNode = nodesMap.get(centralTopicId);
                        const rootX = centerNode && typeof centerNode.x === 'number' ? centerNode.x : 0;
                        const rootY = centerNode && typeof centerNode.y === 'number' ? centerNode.y : 0;
                        const rootZ = centerNode && typeof centerNode.z === 'number' ? centerNode.z : 0;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                        const camPos = camera.position;
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                        const rootDistToCam = Math.sqrt(Math.pow(rootX - camPos.x, 2) + Math.pow(rootY - camPos.y, 2) + Math.pow(rootZ - camPos.z, 2));

                        nodesMap.forEach((node, id) => {
                            const el = nodeElements.get(id);
                            if (!el) return;
                            if (typeof node.x !== 'number' || typeof node.y !== 'number' || typeof node.z !== 'number') return;
                            
                            const targetX = node.fx !== undefined ? (node.fx as number) : node.x;
                            const targetY = node.fy !== undefined ? (node.fy as number) : node.y;
                            const targetZ = node.fz !== undefined ? (node.fz as number) : node.z;

                            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
                            const nodeDistToCam = Math.sqrt(Math.pow(targetX - camPos.x, 2) + Math.pow(targetY - camPos.y, 2) + Math.pow(targetZ - camPos.z, 2));
                            const pos = new ProjVector3(targetX, targetY, targetZ);
                            pos.project(camera);

                            if (pos.z > 1) {
                                el.setCssStyles({ display: 'none' });
                                return;
                            }
                            el.setCssStyles({ display: 'block' });
                            const x = (pos.x * 0.5 + 0.5) * width;
                            const y = (-(pos.y * 0.5) + 0.5) * height;
                            
                            el.setCssStyles({
                                left: `${x}px`,
                                top: `${y}px`,
                                zIndex: Math.round(10000 - nodeDistToCam).toString()
                            });

                            const depthDifference = nodeDistToCam - rootDistToCam;
                            if (depthDifference > 30) {
                                const softBlur = Math.min(2.0, (depthDifference - 30) / 80);
                                el.setCssStyles({
                                    filter: `blur(${softBlur.toFixed(1)}px)`,
                                    opacity: "0.8"
                                });
                            } else {
                                el.setCssStyles({
                                    filter: 'none',
                                    opacity: "1.0"
                                });
                            }
                        });
                    }
                    this.animationFrameId = window.requestAnimationFrame(updateLabels);
                };
                updateLabels();
                currentGraphInstance = Graph;

            } else {
                // --- RENDER 2D GRAPH ---
                graphElem.setCssStyles({
                    width: "100%",
                    height: `${graphWrapper.clientHeight || 500}px`,
                    position: "relative"
                });

                window.requestAnimationFrame(() => {
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

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        visNetworkInstance.on("click", (params: any) => {
                            if (params.nodes.length > 0) {
                                const clickedNodeId = params.nodes[0] as string;
                                const loc = nodeToLocationMap.get(clickedNodeId);
                                if (loc) {
                                    void this.openFileAtLine(loc.path, loc.line);
                                }
                            }
                        });
                    } catch (err: unknown) {
                        console.error("2D Network Error:", err);
                    }
                });
            }
        };

        folderSelect.addEventListener('change', (e: Event) => {
            void (async () => {
                const selectedFolder = (e.target as HTMLSelectElement).value;
                await updateTopicsForFolder(selectedFolder);
            })();
        });

        topicSelect.addEventListener('change', (e: Event) => {
            void (async () => {
                const selectedTopic = (e.target as HTMLSelectElement).value;
                if (selectedTopic) {
                    await renderCurrentModeGraph(folderSelect.value, selectedTopic);
                }
            })();
        });

        modeBtn.onclick = () => {
            void (async () => {
                currentMode = currentMode === '3d' ? '2d' : '3d';
                modeBtn.setText(currentMode === '3d' ? "Mode: 3D 🌐" : "Mode: 2D 🗺️");
                if (topicSelect.value) {
                    await renderCurrentModeGraph(folderSelect.value, topicSelect.value);
                }
            })();
        };

        refreshBtn.onclick = () => {
            void (async () => {
                refreshBtn.setText("↻ Refreshing...");
                await updateTopicsForFolder(folderSelect.value);
                if (topicSelect.value) {
                    await renderCurrentModeGraph(folderSelect.value, topicSelect.value);
                }
                window.setTimeout(() => {
                    refreshBtn.setText("↻ Refresh");
                }, 400);
            })();
        };

        void updateTopicsForFolder(currentFolder);

        this.resizeHandler = () => {
            if (currentGraphInstance) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                currentGraphInstance.width(graphWrapper.clientWidth);
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                currentGraphInstance.height(graphWrapper.clientHeight);
            }
            if (visNetworkInstance) {
                graphElem.setCssStyles({ height: `${graphWrapper.clientHeight || 500}px` });
                visNetworkInstance.redraw();
            }
        };
        window.addEventListener('resize', this.resizeHandler);
    }

    onClose(): void {
        if (this.animationFrameId) {
            window.cancelAnimationFrame(this.animationFrameId);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
    }
}