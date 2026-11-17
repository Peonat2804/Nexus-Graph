import { App, ItemView, Plugin, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
import ForceGraph3D from '3d-force-graph';
import { Network, DataSet } from 'vis-network/standalone';
import { VocabGraphSettingTab } from './settings';

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
    let index = Math.abs(hash) % (branchPalettes.length || 1);
    
    // Provide a safe default fallback palette if the array is empty or undefined
    let palette = branchPalettes[index] ?? { bg: '#2C3E50', border: '#1A252F', light: '#5D6D7E' };

    if (isLeafVocab) {
        return {
            bg: 'var(--background-primary)',
            border: palette.bg,
            light: palette.light 
        };
    }
    return { bg: palette.bg, border: palette.border, light: palette.light };
}

function getThemeColors() {
    const styles = getComputedStyle(document.body);
    const isDark = document.body.classList.contains('theme-dark');

    // Read the actual resolved RGB/Hex values from Obsidian's active theme
    const bgPrimary = styles.getPropertyValue('--background-primary').trim() || (isDark ? '#1e1e1e' : '#ffffff');
    const textNormal = styles.getPropertyValue('--text-normal').trim() || (isDark ? '#dcddde' : '#222222');

    return { bgPrimary, textNormal };
}

function getActiveCanvasFont(containerEl?: HTMLElement): string {
    const rawFont = getComputedStyle(containerEl || document.body).fontFamily || 'sans-serif';
    // Extract the first font in the stack and strip quotes so HTML5 <canvas> parses it reliably
    // e.g. '"Palatino Linotype", Georgia, serif' -> 'Palatino Linotype, Georgia, serif'
    return rawFont.replace(/["']/g, '').trim() || 'sans-serif';
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
        this.addSettingTab(new VocabGraphSettingTab(this.app, this));
    }

    async activateView() {
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
    app: App;
    animationFrameId: number | null = null;
    resizeHandler: (() => void) | null = null;

    private nodesMap = new Map<string, any>();
    private visNetworkInstance: Network | null = null;

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

    get isDarkTheme(): boolean {
        return document.body.classList.contains('theme-dark');
    }

    private getLiveThemeStyle() {
        // 1. Read the active theme's font directly from Obsidian's UI container
        const computedContainer = getComputedStyle(this.containerEl);
        const activeFont = computedContainer.fontFamily || 'sans-serif';

        // 2. Resolve Obsidian's theme CSS variables via a temporary probe inside this.containerEl
        const probe = document.createElement('div');
        probe.addClass('vocab-surface-probe');
        this.containerEl.appendChild(probe);

        const probeStyle = getComputedStyle(probe);
        const isDark = document.body.classList.contains('theme-dark');

        // Use the theme's actual background & text colors (with safe solid fallback if a theme uses transparency)
        const rawBg = probeStyle.backgroundColor;
        const isTransparent = !rawBg || rawBg === 'transparent' || rawBg === 'rgba(0, 0, 0, 0)';
        const bg = isTransparent ? (isDark ? '#1e1e1e' : '#ffffff') : rawBg;
        const text = probeStyle.color || (isDark ? '#dcddde' : '#222222');
        const accent = probeStyle.borderColor || '#7c3aed';

        probe.remove();

        // 3. Read --text-on-accent separately
        const accentProbe = document.createElement('div');
        accentProbe.addClass('vocab-accent-probe');
        this.containerEl.appendChild(accentProbe);
        const textOnAccent = getComputedStyle(accentProbe).color || '#ffffff';
        accentProbe.remove();

        return { activeFont, bg, text, accent, textOnAccent };
    }

    private createCustomNode(
        id: string,
        label: string,
        type: string,
        bg: string,
        border: string,
        textColor: string,
        badgeVal: string | null = null,
        location?: any
    ) {
        const isTopic = type === 'topic';
        const isSub = type === 'sub';
        const isBold = isTopic || isSub;

        const fontWeight = isBold ? '700' : '400';
        const fontSize = isTopic ? 18 : (isSub ? 14 : 11);
        const padX = isTopic ? 16 : (isSub ? 12 : 8);
        const padY = isTopic ? 10 : (isSub ? 7 : 8);
        const radius = isTopic ? 8 : 6;

        return {
            id,
            type,
            rawLabel: label,
            badgeVal,
            borderColor: border,
            shape: 'custom',
            cursor: location ? 'pointer' : 'default',
            ctxRenderer: ({ ctx, x, y, state: { selected, hover } }: any) => {
                const { activeFont, bg: themeBg, text: themeText, accent, textOnAccent } = this.getLiveThemeStyle();

                // Dynamic colors per node type
                const fillBg = isTopic ? accent : (type === 'vocab' ? themeBg : bg);
                const strokeBorder = isTopic ? accent : border;
                const fillText = isTopic ? textOnAccent : (type === 'vocab' ? themeText : textColor);

                const nodeFont = `${fontWeight} ${fontSize}px ${activeFont}`;
                ctx.font = nodeFont;

                const textWidth = ctx.measureText(label).width;
                const w = textWidth + padX * 2;
                const h = fontSize + padY * 2;

                return {
                    drawNode() {
                        ctx.save();

                        // Shadow
                        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                        ctx.shadowBlur = 5;
                        ctx.shadowOffsetX = 1;
                        ctx.shadowOffsetY = 2;

                        // Main rounded box
                        ctx.beginPath();
                        ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
                        ctx.fillStyle = fillBg;
                        ctx.fill();

                        // Border
                        ctx.shadowColor = 'transparent';
                        ctx.lineWidth = selected || hover ? 2.2 : 1.5;
                        ctx.strokeStyle = strokeBorder;
                        ctx.stroke();

                        // Main text
                        ctx.font = nodeFont;
                        ctx.fillStyle = fillText;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, x, y + 0.5);

                        // Optional top-right badge pill (only drawn if badgeVal exists)
                        if (type === 'vocab' && badgeVal) {
                            const badgeText = badgeVal.toUpperCase();
                            ctx.font = `700 8px ${activeFont}`;
                            const badgeW = ctx.measureText(badgeText).width + 10;
                            const badgeH = 14;
                            const badgeX = x + w / 2 - badgeW - 4;
                            const badgeY = y - h / 2 - badgeH / 2;

                            ctx.beginPath();
                            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 7);
                            ctx.fillStyle = '#EF4444';
                            ctx.fill();

                            ctx.fillStyle = '#FFFFFF';
                            ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);
                        }

                        ctx.restore();
                    },
                    nodeDimensions: { width: w, height: h }
                };
            }
        };
    }

    private getObsidianAccentColors() {
        const probe = this.containerEl.createDiv({ cls: 'vocab-theme-probe' });
        document.body.appendChild(probe);

        const computed = getComputedStyle(probe);
        const accentBg = computed.backgroundColor || '#7C3AED';
        const textOnAccent = computed.color || '#FFFFFF';
        probe.remove();

        return { accentBg, textOnAccent };
    }

    async openFileAtLine(path: string, line: number) {
        const targetFile = this.app.vault.getAbstractFileByPath(path);
        if (!(targetFile instanceof TFile)) return;

        const { workspace } = this.app;
        let activeLeaf = workspace.getLeaf(false);
        await activeLeaf.openFile(targetFile, { eState: { line } });
    }

    async onOpen() {
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

        let graphElem = graphWrapper.createDiv();
        graphElem.setCssStyles({
            width: "100%",
            height: "100%"
        });

        let overlay = graphWrapper.createDiv();
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
        let currentGraphInstance: any = null;

        const sanitize = (text: string) => {
            if (!text) return "";
            let cleaned = text.replace(/[\[\]]/g, "").replace(/\[\[|\]\]/g, "").trim();
            if (cleaned.includes("\\s") || cleaned.includes("(^") || (cleaned.includes("\\") && cleaned.length === 1) || cleaned.length === 0) {
                return "";
            }
            return cleaned;
        };

        const extractNBadge = (lineText: string): string | null => {
            if (!lineText) return null;
            let matches = [...lineText.matchAll(/\[(n|N)::\s*([^\]]+)\]/g)];
            if (matches.length > 0 && matches[0] && matches[0][2]) {
                return sanitize(matches[0][2]);
            }
            return null;
        };

        let currentFolder: string | undefined = undefined;

        const getLatestFileContent = async (file: TFile): Promise<string> => {
            const leaves = this.app.workspace.getLeavesOfType('markdown');
            for (const leaf of leaves) {
                const view = leaf.view as { file?: TFile; editor?: { getValue: () => string } };
                if (view?.file && (view.file === file || view.file.path === file.path) && view.editor) {
                    return view.editor.getValue();
                }
            }
            return await this.app.vault.read(file);
        };

        const updateFolders = async (preserveFolder?: string) => {
            const allFiles = this.app.vault.getMarkdownFiles();
            const folderSet = new Set<string>();

            for (const f of allFiles) {
                const cache = this.app.metadataCache.getFileCache(f);
                let hasTopic = Boolean(cache?.frontmatter?.topic);

                if (!hasTopic) {
                    const content = await getLatestFileContent(f);
                    hasTopic = /\[topic::\s*[^\]]+\]/i.test(content);
                }

                if (hasTopic) {
                    let lastSlash = f.path.lastIndexOf('/');
                    if (lastSlash === -1) {
                        folderSet.add("/");
                    } else {
                        // Add the file's folder AND every ancestor folder above it
                        // e.g. "German/Podcasts" -> adds "German/Podcasts", then "German"
                        while (lastSlash !== -1) {
                            folderSet.add(f.path.substring(0, lastSlash));
                            lastSlash = f.path.lastIndexOf('/', lastSlash - 1);
                        }
                    }
                }
            }

            const folders = Array.from(folderSet).sort();
            folderSelect.disabled = false;
            topicSelect.disabled = false;
            folderSelect.innerHTML = "";

            // Handle empty vault / no topics found anywhere
            if (folders.length === 0) {
                folderSelect.disabled = true;
                topicSelect.innerHTML = "";
                topicSelect.disabled = true;

                // Clear any existing graph and show the empty-state message
                this.nodesMap.clear();
                if (this.visNetworkInstance) {
                    this.visNetworkInstance.destroy();
                    this.visNetworkInstance = null;
                }
                graphElem.empty();
                const warningDiv = graphElem.createDiv();
                warningDiv.setCssStyles({ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' });
                warningDiv.setText(`⚠️ No topics found yet. Add a [topic::Your Topic] tag to any note to get started.`);
                overlay.empty();
                this.nodesMap.clear();
                return;
            }

            // Re-enable dropdowns if topics exist
            folderSelect.disabled = false;
            topicSelect.disabled = false;

            folders.forEach(folder => {
                const opt = document.createElement('option');
                opt.value = folder;
                opt.textContent = folder;
                folderSelect.appendChild(opt);
            });

            currentFolder = (preserveFolder && folders.includes(preserveFolder))
                ? preserveFolder
                : (folders.includes("German") ? "German" : folders[0]);

            folderSelect.value = currentFolder || '/';
        };
        
        await updateFolders();

        const updateTopicsForFolder = async (folderPath: string) => {
            graphElem.empty();
            overlay.empty();
            this.nodesMap.clear();

            let allFiles = this.app.vault.getMarkdownFiles();
            let targetFiles = folderPath === "/" 
                ? allFiles.filter(f => !f.path.includes('/'))
                : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

            let topicsSet = new Set<string>();

            for (let file of targetFiles) {
                let content = await getLatestFileContent(file);
                let lines = content.split('\n');
                for (let line of lines) {
                    let segments = line.split('\\');
                    for (let seg of segments) {
                        let topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        if (topicMatch && topicMatch[1]) {
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
                
                graphElem.empty();
                const warningDiv = graphElem.createDiv();
                warningDiv.setCssStyles({ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' });
                warningDiv.setText(`⚠️ No [topic::] tags found in folder ${folderPath}.`);
                return;
            }

            availableTopics.forEach(t => {
                let opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                topicSelect.appendChild(opt);
            });

            if (availableTopics && availableTopics.length > 0 && availableTopics[0]) {
                const firstTopic = availableTopics[0];
                topicSelect.value = firstTopic;
                await renderCurrentModeGraph(folderPath, firstTopic);
            }
        };

        const renderCurrentModeGraph = async (folderPath: string, topicName: string) => {
            if (currentGraphInstance) {
                currentGraphInstance = null;
            }
            if (this.visNetworkInstance) {
                this.visNetworkInstance.destroy();
                this.visNetworkInstance = null;
            }
            graphElem.empty();
            overlay.empty();
            this.nodesMap.clear();

            let allFiles = this.app.vault.getMarkdownFiles();
            let targetFiles = folderPath === "/" 
                ? allFiles.filter(f => !f.path.includes('/'))
                : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

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
                    bg = 'var(--interactive-accent)';
                    border = 'var(--interactive-accent-hover)';
                } else if (type === 'sub') {
                    let colors = getBranchColors(colorKey!, false);
                    bg = colors.bg;
                    border = colors.border;
                } else {
                    let colors = getBranchColors(colorKey!, true);
                    bg = colors.bg;
                    border = colors.border;
                }

                const { bgPrimary, textNormal } = getThemeColors();
                const { accentBg, textOnAccent } = this.getObsidianAccentColors();
                const resolvedBg = type === 'topic' ? accentBg : (type === 'vocab' ? bgPrimary : bg);
                const nodeBorder = type === 'topic' ? accentBg : border;
                const resolvedTextColor = type === 'topic' ? textOnAccent : (type === 'vocab' ? textNormal : '#FFFFFF');
                const activeFont = getActiveCanvasFont(this.containerEl);

                if (currentMode === '2d' && type === 'vocab' && badgeVal) {
                    this.nodesMap.set(id, {
                        id: id,
                        shape: 'custom',
                        // image: url,
                        size: 30,
                        cursor: location ? 'pointer' : 'default',
                        type: type,
                        badgeVal: badgeVal,
                        rawLabel: label,
                        borderColor: border,
                        font: { color: resolvedTextColor },
                        ctxRenderer: ({ ctx, x, y, state: { selected, hover } }: any) => {
                            const { activeFont, bg, text } = this.getLiveThemeStyle();

                            // 1. Match normal box node font size & weight
                            const nodeFont = `400 11px ${activeFont}`;
                            ctx.font = nodeFont;

                            // 2. Match normal box node tightness (vis-network margin: 8 -> ~9px padding each side, ~29px height)
                            const textWidth = ctx.measureText(label).width;
                            const w = textWidth + 18;
                            const h = 29;
                            const radius = 6;

                            return {
                                drawNode() {
                                    ctx.save();

                                    // Subtle shadow matching vis-network default
                                    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
                                    ctx.shadowBlur = 5;
                                    ctx.shadowOffsetX = 1;
                                    ctx.shadowOffsetY = 2;

                                    // Main rounded box
                                    ctx.beginPath();
                                    ctx.roundRect(x - w / 2, y - h / 2, w, h, radius);
                                    ctx.fillStyle = bg;
                                    ctx.fill();

                                    // Border (1.5px normal, 2px selected/hover)
                                    ctx.shadowColor = 'transparent';
                                    ctx.lineWidth = selected || hover ? 2 : 1.5;
                                    ctx.strokeStyle = border;
                                    ctx.stroke();

                                    // Label text (centered identically to normal box nodes)
                                    ctx.font = nodeFont;
                                    ctx.fillStyle = text;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(label, x, y + 0.5);

                                    // Compact, sleek top-right badge pill
                                    const badgeText = badgeVal.toUpperCase();
                                    ctx.font = `700 8px ${activeFont}`;
                                    const badgeW = ctx.measureText(badgeText).width + 10;
                                    const badgeH = 14;
                                    const badgeX = x + w / 2 - badgeW - 4;
                                    const badgeY = y - h / 2 - badgeH / 2;

                                    ctx.beginPath();
                                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 7);
                                    ctx.fillStyle = '#EF4444';
                                    ctx.fill();

                                    ctx.fillStyle = '#FFFFFF';
                                    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

                                    ctx.restore();
                                },
                                nodeDimensions: { width: w, height: h }
                            };
                        }
                    });
                } else if (currentMode === '2d') {
                    this.nodesMap.set(
                        id,
                        this.createCustomNode(id, label, type, resolvedBg, nodeBorder, resolvedTextColor, badgeVal, location)
                    );
                } else {
                    this.nodesMap.set(id, {
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
                    if (!line) continue; // Skip if the line is undefined
                    let vocabMatch = line.match(/\[vocab::\s*([^\]]+)\]/);
                    let sharedVocab = vocabMatch && vocabMatch[1] ? sanitize(vocabMatch[1]) : "";
                    let nBadgeVal = extractNBadge(line);
                    let segments = line.split('\\');

                    for (let seg of segments) {
                        let segVocabMatch = seg.match(/\[vocab::\s*([^\]]+)\]/);
                        let cleanVocab = (segVocabMatch && segVocabMatch[1]) ? sanitize(segVocabMatch[1]) : sharedVocab;
                        
                        let subMatches = [...seg.matchAll(/\[sub::\s*([^\]]+)\]/g)];
                        let cleanSubs = subMatches.map(m => (m && m[1]) ? sanitize(m[1]) : "").filter(Boolean);
                        
                        let topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        let cleanTopic = (topicMatch && topicMatch[1]) ? sanitize(topicMatch[1]) : topicName;

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
                                if (!subText) continue; // Skip if undefined
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

            if (this.nodesMap.size <= 1) {
                const warningDiv = graphElem.createDiv();
                warningDiv.setCssStyles({ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' });
                warningDiv.setText(`⚠️ No vocabulary entries found for topic ${topicName}.`);
                return;
            }

            if (currentMode === '3d') {
                const fgFactory = (ForceGraph3D as any).default || ForceGraph3D;
                const Graph = fgFactory()(graphElem)
                    .backgroundColor('rgba(0,0,0,0)')
                    .graphData({
                        nodes: Array.from(this.nodesMap.values()),
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

                this.nodesMap.forEach(node => {
                    let lbl = overlay.createDiv();
                    lbl.setCssStyles({
                        position: "absolute",
                        transform: "translate(-50%, -50%)",
                        backgroundColor: node.colors.bg,
                        borderColor: node.colors.border,
                        borderWidth: "1.5px",
                        borderStyle: "solid",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                        whiteSpace: "nowrap",
                        pointerEvents: "auto",
                        cursor: node.type === 'vocab' ? "pointer" : "grab",
                        transition: "opacity 0.05s linear, filter 0.05s linear"
                    });

                    let textSpan = lbl.createSpan();
                    textSpan.setText(node.name);
                    textSpan.setCssStyles({ color: node.type === 'vocab' ? 
                        "var(--text-normal)" : 
                        (node.type === 'topic' ? "var(--text-on-accent)" : "#FFFFFF") });

                    node.lblEl = lbl;
                    node.textSpanEl = textSpan;

                    if (node.badge) {
                        let badgeEl = lbl.createSpan();
                        badgeEl.setText(node.badge.toUpperCase());
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
                        lbl.setCssStyles({ fontSize: "20px", fontWeight: "700", padding: "8px 14px", borderRadius: "10px" });
                    } else if (node.type === 'sub') {
                        let levelSize = node.level === 1 ? 16 : 14;
                        lbl.setCssStyles({ fontSize: levelSize + "px", fontWeight: "600", padding: "5px 10px", borderRadius: "8px" });
                    } else {
                        lbl.setCssStyles({ fontSize: "11px", fontWeight: "500", padding: "5px 8px", borderRadius: "6px" });
                    }
                    
                    lbl.onmousedown = (e: MouseEvent) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        draggedNode = node;
                        dragPlaneZ = node.z || 0;
                        hasMoved = false;
                        lbl.setCssStyles({ cursor: "grabbing" });
                        Graph.controls().enabled = false;
                        node.fx = node.x;
                        node.fy = node.y;
                        node.fz = node.z;
                    };

                    lbl.ontouchstart = (e: TouchEvent) => {
                        if (e.touches.length !== 1) return;
                        touchStartX = e.touches[0]?.clientX || 0;
                        touchStartY = e.touches[0]?.clientY || 0;
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
                        const touchX = e.touches[0]?.clientX || 0;
                        const touchY = e.touches[0]?.clientY || 0;
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

                    lbl.onclick = (e: MouseEvent) => {
                        e.stopPropagation();
                        handleNodeClick(node);
                    };

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
                        this.nodesMap.forEach(n => {
                            let el = nodeElements.get(n.id);
                            if (el) el.setCssStyles({ cursor: n.type === 'vocab' ? "pointer" : "grab" });
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
                        let centerNode = this.nodesMap.get(centralTopicId);
                        let rootX = centerNode && typeof centerNode.x === 'number' ? centerNode.x : 0;
                        let rootY = centerNode && typeof centerNode.y === 'number' ? centerNode.y : 0;
                        let rootZ = centerNode && typeof centerNode.z === 'number' ? centerNode.z : 0;
                        let camPos = camera.position;
                        let rootDistToCam = Math.sqrt(Math.pow(rootX - camPos.x, 2) + Math.pow(rootY - camPos.y, 2) + Math.pow(rootZ - camPos.z, 2));

                        this.nodesMap.forEach((node, id) => {
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
                                el.setCssStyles({ display: 'none' });
                                return;
                            }
                            el.setCssStyles({ display: 'block' });
                            let x = (pos.x * 0.5 + 0.5) * width;
                            let y = (-(pos.y * 0.5) + 0.5) * height;
                            
                            el.setCssStyles({
                                left: `${x}px`,
                                top: `${y}px`,
                                zIndex: Math.round(10000 - nodeDistToCam).toString()
                            });

                            let depthDifference = nodeDistToCam - rootDistToCam;
                            if (depthDifference > 30) {
                                let softBlur = Math.min(2.0, (depthDifference - 30) / 80);
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
                    this.animationFrameId = requestAnimationFrame(updateLabels);
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

                requestAnimationFrame(() => {
                    try {
                        const data = {
                            nodes: new DataSet(Array.from(this.nodesMap.values())),
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

                        this.visNetworkInstance = new Network(graphElem, data, options);
                        this.visNetworkInstance.redraw();

                        this.visNetworkInstance.on("click", async (params: any) => {
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

        this.registerEvent(
            this.app.workspace.on('css-change', () => {
                if (currentMode === '2d' && this.visNetworkInstance) {
                    const updatedNodes: any[] = [];
                    const vocabColors = getThemeColors();
                    const activeFont = getActiveCanvasFont(this.containerEl);

                    this.nodesMap.forEach((node, id) => {
                        if (node.type === 'topic') {
                            const { accentBg, textOnAccent } = this.getObsidianAccentColors();
                            updatedNodes.push({
                                id,
                                color: {
                                    background: accentBg,
                                    border: accentBg,
                                    highlight: { background: accentBg, border: '#FFFFFF' }
                                },
                                font: {
                                    color: textOnAccent,
                                    face: activeFont,
                                    size: 20,
                                    multi: 'html',
                                    bold: {
                                        color: textOnAccent,
                                        face: activeFont,
                                        size: 20,
                                        mod: 'bold'
                                    }
                                }
                            });
                        }
                        if (node.type === 'vocab') {
                            if (node.badgeVal) {
                                updatedNodes.push({
                                    id,
                                    font: { color: vocabColors.textNormal }
                                });
                            } else {
                                updatedNodes.push({
                                    id,
                                    color: { background: vocabColors.bgPrimary, border: node.borderColor },
                                    font: { color: vocabColors.textNormal, face: activeFont }
                                });
                            }
                        }
                        updatedNodes.push({
                            id,
                            font: {
                                face: activeFont,
                                multi: 'html',
                                bold: {
                                    face: activeFont,
                                    mod: 'bold'
                                }
                            }
                        });
                    });

                    if (updatedNodes.length > 0) {
                        (this.visNetworkInstance as any).body.data.nodes.update(updatedNodes);
                        this.visNetworkInstance?.redraw();
                    }
                }
            })
        );

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
            modeBtn.setText(currentMode === '3d' ? "Mode: 3D 🌐" : "Mode: 2D 🗺️");
            if (topicSelect.value) {
                await renderCurrentModeGraph(folderSelect.value, topicSelect.value);
            }
        };

        refreshBtn.onclick = async () => {
            refreshBtn.setText("↻ Refreshing...");
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (activeView) {
                await activeView.save();
            } else {
                // Fallback if MarkdownView isn't imported: save all open markdown leaves
                for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
                    const view = leaf.view as { save?: () => Promise<void> };
                    if (typeof view.save === 'function') {
                        await view.save();
                    }
                }
            }

            const previousFolder = folderSelect.value;
            const previousTopic = topicSelect.value;
            await updateFolders(previousFolder);

            if (!folderSelect.disabled && folderSelect.value) {
                await updateTopicsForFolder(folderSelect.value);

                if (previousTopic && Array.from(topicSelect.options).some(opt => opt.value === previousTopic)) {
                    topicSelect.value = previousTopic;
                }

                if (topicSelect.value) {
                    await renderCurrentModeGraph(folderSelect.value, topicSelect.value);
                }
            }
            setTimeout(() => {
                refreshBtn.setText("↻ Refresh");
            }, 400);
        };

        if (currentFolder) {
            console.log("5. After updateFolders -> folderSelect.value:", folderSelect.value, "disabled:", folderSelect.disabled);
            await updateTopicsForFolder(currentFolder);
            console.log("6. After updateTopics -> topicSelect.value:", topicSelect.value, "options:", topicSelect.options.length);
        }

        this.resizeHandler = () => {
            if (currentGraphInstance) {
                currentGraphInstance.width(graphWrapper.clientWidth);
                currentGraphInstance.height(graphWrapper.clientHeight);
            }
            if (this.visNetworkInstance) {
                graphElem.setCssStyles({ height: `${graphWrapper.clientHeight || 500}px` });
                this.visNetworkInstance.redraw();
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