import { App, ItemView, Plugin, WorkspaceLeaf, TFile, MarkdownView } from 'obsidian';
import ForceGraph3D from '3d-force-graph';
import { Network, DataSet } from 'vis-network/standalone';
import { VocabGraphSettingTab } from './settings';
import { setIcon } from 'obsidian';

const VIEW_TYPE_3D_GRAPH = 'vocab-3d-graph-view';

export interface VocabGraphSettings {
    pinnedFolder: string | null;
    pinnedTopic: string | null;
    pinnedMode: '3d' | '2d' | null;
}

const DEFAULT_SETTINGS: VocabGraphSettings = {
    pinnedFolder: null,
    pinnedTopic: null,
    pinnedMode: null,
};

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

const CIRCLE_COLOR_MAP: Array<[RegExp, string]> = [
    [/[🔴🟥]/u, "rgba(239, 68, 68, 0.55)"],     // Red
    [/[🟠🟧]/u, "rgba(249, 115, 22, 0.55)"],    // Orange
    [/[🟡🟨]/u, "rgba(234, 179, 8, 0.55)"],     // Yellow
    [/[🟢🟩]/u, "rgba(34, 197, 94, 0.55)"],     // Green
    [/[🔵🟦]/u, "rgba(59, 130, 246, 0.55)"],    // Blue
    [/[🟣🟪]/u, "rgba(168, 85, 247, 0.55)"],    // Purple
    [/[🟤🟫]/u, "rgba(146, 64, 14, 0.55)"],     // Brown
    [/[⚫⬛]/u, "rgba(107, 114, 128, 0.55)"],   // Black / Charcoal
    [/[⚪⬜]/u, "rgba(229, 231, 235, 0.55)"],   // White / Light
    [/[🩷]/u,   "rgba(244, 114, 182, 0.55)"],   // Pink
];

interface VocabLocation {
    path: string;
    line: number;
}

const parseCircleHighlight = (rawInner: string): { text: string; circleColor: string | null } => {
    let circleColor: string | null = null;

    for (const [pattern, color] of CIRCLE_COLOR_MAP) {
        if (pattern.test(rawInner)) {
            circleColor = color;
            break;
        }
    }

    const strippedText = rawInner
        .replace(/[🔴🟠🟡🟢🔵🟣🟤⚫⚪🩷🟥🟧🟨🟩🟦🟪🟫⬛⬜\uFE0E\uFE0F]/gu, "")
        .replace(/\s{2,}/g, " ")
        .trim();

    return { text: strippedText, circleColor };
};

function mixHash32(h: number): number {
    let x = h >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
}

function getBranchColors(name: string, isLeafVocab = false) {

    const normalized = name.normalize("NFC");
    let hash = 2166136261; // FNV-1a 32-bit offset basis

    for (const ch of normalized) {
        const codePoint = ch.codePointAt(0) ?? 0;
        hash ^= codePoint;
        hash = Math.imul(hash, 16777619);
    }

    const mixed = mixHash32(hash);
    const paletteList = Array.isArray(branchPalettes) && branchPalettes.length > 0
        ? branchPalettes
        : [];

    const fallbackPalette = { bg: "#2C3E50", border: "#1A252F", light: "#5D6D7E" };
    const palette = paletteList.length > 0
        ? (paletteList[mixed % paletteList.length] ?? fallbackPalette)
        : fallbackPalette;

    if (isLeafVocab) {
        return {
            bg: "var(--background-primary)",
            border: palette.bg,
            light: palette.light,
        };
    }

    return {
        bg: palette.bg,
        border: palette.border,
        light: palette.light,
    };
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
    settings: VocabGraphSettings = { ...DEFAULT_SETTINGS };

    async onload() {
        await this.loadSettings();

        this.registerView(
            VIEW_TYPE_3D_GRAPH,
            (leaf) => new Vocab3DGraphView(leaf, this)
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

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

interface HighlightItem {
    text: string;
    color: string | null;
}

interface VocabParseResult {
    cleanText: string;
    highlightedText: string | null;
    highlightColor: string | null; // primary/first highlight color found
    highlights: HighlightItem[]; // full list per highlighted span
    isHighlighted: boolean;
}

interface HighlightMeta {
    isHighlighted?: boolean;
    highlightedText?: string | null;
    highlightColor?: string | null;
    highlights?: Array<{ text: string; color: string | null }>;
}

const extractStyleColor = (styleAttr: string): string | null => {
    // Matches background or background-color up to ';' or end of string
    const bgMatch = styleAttr.match(/(?:^|;|\s)background(?:-color)?\s*:\s*([^;]+)/i);
    if (!bgMatch || !bgMatch[1]) return null;

    const rawColor = bgMatch[1].trim();
    // Avoid unsafe/empty values
    if (!rawColor || /url\(|expression\(/i.test(rawColor)) return null;
    return rawColor;
};

const getObsidianHighlightColor = (): string => {
    // Reads Obsidian's current theme highlight color (respects light/dark & themes)
    const probe = document.createElement("span");
    probe.addClass("vocab-theme-probe");
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).getPropertyValue("--text-highlight-bg").trim()
        || getComputedStyle(document.body).getPropertyValue("--text-highlight-bg").trim();
    probe.remove();

    return computed || "#FFB86C";
};

interface SearchableGraphNode {
    id: string;
    name: string;
    type: "sub" | "vocab";
    badge?: string | null;
    highlightedText?: string | null;
}

interface ThemeHighlightStyle {
    bgColor: string;
    textColor: string | null;
}

const getThemeHighlightStyle = (): ThemeHighlightStyle => {
    const probe = document.createElement("span");
    probe.addClass("vocab-theme-probe");

    // Also attach a real <mark> inside the probe so computed styles reflect theme rules
    const markEl = document.createElement("mark");
    markEl.textContent = "sample";
    probe.appendChild(markEl);

    document.body.appendChild(probe);

    const markStyle = getComputedStyle(markEl);
    const bodyStyle = getComputedStyle(document.body);

    const cssVarBg =
        getComputedStyle(probe).getPropertyValue("--text-highlight-bg").trim() ||
        bodyStyle.getPropertyValue("--text-highlight-bg").trim();

    const computedMarkBg = markStyle.backgroundColor;
    const hasExplicitMarkBg =
        computedMarkBg &&
        computedMarkBg !== "rgba(0, 0, 0, 0)" &&
        computedMarkBg !== "transparent";

    const cssVarFg =
        getComputedStyle(probe).getPropertyValue("--text-highlight-fg").trim() ||
        bodyStyle.getPropertyValue("--text-highlight-fg").trim();

    const computedMarkFg = markStyle.color;

    probe.remove();

    return {
        bgColor: hasExplicitMarkBg ? computedMarkBg : (cssVarBg || "rgba(255, 184, 235, 0.45)"),
        textColor: cssVarFg || computedMarkFg || null,
    };
};

export interface ThemeHighlightInterface {
    bgColor: string;
    textColor: string | null;
    borderRadius: number;
    paddingX: number;
    paddingY: number;
    borderBottomColor: string | null;
    borderBottomWidth: number;
}

const parsePx = (value: string | null | undefined, fallback = 0): number => {
    if (!value) return fallback;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
};

const isTransparentColor = (color: string | null | undefined): boolean => {
    if (!color) return true;
    const c = color.trim().toLowerCase();
    return c === "" || c === "transparent" || c === "rgba(0, 0, 0, 0)" || c === "rgba(0,0,0,0)";
};

const getThemeHighlightInterface = (containerEl?: HTMLElement): ThemeHighlightInterface => {
    const host = containerEl ?? document.body;
    const probe = document.createElement("span");
    probe.addClass("vocab-theme-probe");

    const markEl = document.createElement("mark");
    markEl.textContent = "sample";
    probe.appendChild(markEl);
    host.appendChild(probe);

    const markStyle = getComputedStyle(markEl);
    const probeStyle = getComputedStyle(probe);
    const bodyStyle = getComputedStyle(document.body);

    const varBg =
        probeStyle.getPropertyValue("--text-highlight-bg").trim() ||
        bodyStyle.getPropertyValue("--text-highlight-bg").trim();

    const varFg =
        probeStyle.getPropertyValue("--text-highlight-fg").trim() ||
        bodyStyle.getPropertyValue("--text-highlight-fg").trim();

    const markBg = markStyle.backgroundColor;
    const bgColor = !isTransparentColor(markBg)
        ? markBg
        : (varBg || "rgba(255, 184, 235, 0.45)");

    // const textColor = !isTransparentColor(varFg)
    //     ? varFg
    //     : (!isTransparentColor(markStyle.color) ? markStyle.color : null);
    const textColor = "var(--text-normal)";

    // Radius: prefer top-left radius, fall back to general border-radius
    const radiusPx =
        parsePx(markStyle.borderTopLeftRadius, NaN) ||
        parsePx(markStyle.borderRadius, 3);

    const padX = Math.max(0, Math.min(8, parsePx(markStyle.paddingLeft, 2)));
    const padY = Math.max(0, Math.min(6, parsePx(markStyle.paddingTop, 0)));

    const bottomWidth =
        markStyle.borderBottomStyle && markStyle.borderBottomStyle !== "none"
            ? parsePx(markStyle.borderBottomWidth, 0)
            : 0;

    const bottomColor =
        bottomWidth > 0 && !isTransparentColor(markStyle.borderBottomColor)
            ? markStyle.borderBottomColor
            : null;

    probe.remove();

    return {
        bgColor,
        textColor,
        borderRadius: Number.isFinite(radiusPx) ? radiusPx : 3,
        paddingX: padX,
        paddingY: padY,
        borderBottomColor: bottomColor,
        borderBottomWidth: bottomWidth,
    };
};

interface VisNetworkInternal {
    body?: {
        data?: {
            nodes?: {
                get?: (id: string) => { label?: string } | null | undefined;
            };
        };
    };
}

class Vocab3DGraphView extends ItemView {
    plugin: Vocab3DGraphPlugin;
    animationFrameId: number | null = null;
    resizeHandler: (() => void) | null = null;

    private nodesMap = new Map<string, any>();
    private visNetworkInstance: Network | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: Vocab3DGraphPlugin) {
        super(leaf);
        this.plugin = plugin;
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

    private hashString32(input: string): string {
        let hash = 5381;
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) + hash) + input.charCodeAt(i);
            hash = hash >>> 0;
        }
        return hash.toString(36);
    }

    private makeNodeId(prefix: "V" | "S" | "T", rawText: string): string {
        const clean = rawText.normalize("NFC").trim();
        const slug = clean
            .replace(/[^\p{L}\p{N}]+/gu, "_")
            .replace(/^_+|_+$/g, "");
        const suffix = this.hashString32(`${prefix}::${clean}`);
        return `${prefix}_${slug || "item"}_${suffix}`;
    }

    private makeVocabId(cleanVocab: string): string {
        return this.makeNodeId("V", cleanVocab);
    }

    private makeSubId(subText: string): string {
        return this.makeNodeId("S", subText);
    }

    private makeTopicId(topicName: string): string {
        return this.makeNodeId("T", topicName);
    }

    private extractNodeDisplayText(node: any, mode?: "2d" | "3d"): string {
        const rawLabel = typeof node?.rawLabel === "string" ? node.rawLabel.trim() : "";
        const nodeName = typeof node?.name === "string" ? node.name.trim() : "";

        // 1. Prefer the label matching the active mode when known
        if (mode === "2d") {
            if (rawLabel) return rawLabel;
            if (nodeName) return nodeName;
        } else if (mode === "3d") {
            if (nodeName) return nodeName;
            if (rawLabel) return rawLabel;
        } else {
            // Default: prefer rawLabel (2D), then nodeName (3D)
            if (rawLabel) return rawLabel;
            if (nodeName) return nodeName;
        }

        // 2. Optional 3D DOM fallback if neither string is set
        if (node?.lblEl instanceof HTMLElement) {
            if (node.textSpanEl instanceof HTMLElement && node.textSpanEl.textContent) {
                const spanText = node.textSpanEl.textContent.trim();
                if (spanText) return spanText;
            }
            const domText = (node.lblEl.textContent ?? "").trim();
            if (domText) return domText;
        }

        return "";
    }

    private getSearchableNodes(query: string, mode?: "2d" | "3d"): SearchableGraphNode[] {
        const q = query.trim().normalize("NFC").toLowerCase();
        if (!q) return [];

        const matches: SearchableGraphNode[] = [];

        this.nodesMap.forEach((node) => {
            if (node.type !== "sub" && node.type !== "vocab") return;

            const displayName = this.extractNodeDisplayText(node, mode).normalize("NFC");
            if (!displayName) return;

            const hlText = typeof node.highlightedText === "string"
                ? node.highlightedText.normalize("NFC")
                : "";

            const haystack = `${displayName} ${hlText}`.toLowerCase();
            if (haystack.includes(q)) {
                matches.push({
                    id: String(node.id),
                    name: displayName,
                    type: node.type,
                    badge: node.badge,
                    highlightedText: node.highlightedText,
                });
            }
        });

        matches.sort((a, b) => {
            const aLower = a.name.toLowerCase();
            const bLower = b.name.toLowerCase();
            const aStarts = aLower.startsWith(q) ? 0 : 1;
            const bStarts = bLower.startsWith(q) ? 0 : 1;
            if (aStarts !== bStarts) return aStarts - bStarts;
            return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
        });

        return matches.slice(0, 20);
    }

    private focusGraphNode(nodeId: string, currentMode: "2d" | "3d", graph3DInstance?: any): void {
        const node = this.nodesMap.get(nodeId);
        if (!node) return;

        if (currentMode === "2d" && this.visNetworkInstance) {
            this.visNetworkInstance.selectNodes([nodeId]);
            const net = this.visNetworkInstance as typeof this.visNetworkInstance & {
                focus?: (id: string, options?: { scale?: number; animation?: { duration: number; easingFunction: string } }) => void;
            };
            net.focus?.(nodeId, {
                scale: 1.25,
                animation: { duration: 450, easingFunction: "easeInOutQuad" },
            });
            return;
        }

        if (currentMode === "3d" && graph3DInstance) {
            const x = typeof node.x === "number" ? node.x : 0;
            const y = typeof node.y === "number" ? node.y : 0;
            const z = typeof node.z === "number" ? node.z : 0;

            // Preserve current OrbitControls target (the graph's center) rather than moving target to the node
            const controls = typeof graph3DInstance.controls === "function"
                ? graph3DInstance.controls()
                : null;
            const currentTarget = controls?.target
                ? {
                    x: controls.target.x ?? 0,
                    y: controls.target.y ?? 0,
                    z: controls.target.z ?? 0,
                }
                : { x: 0, y: 0, z: 0 };

            const currentCam = typeof graph3DInstance.cameraPosition === "function"
                ? graph3DInstance.cameraPosition()
                : { x: 0, y: 0, z: 300 };

            // Keep the camera's current radius from currentTarget so zoom/framing stays natural
            const camDx = (currentCam?.x ?? 0) - currentTarget.x;
            const camDy = (currentCam?.y ?? 0) - currentTarget.y;
            const camDz = (currentCam?.z ?? 300) - currentTarget.z;
            const radius = Math.max(40, Math.hypot(camDx, camDy, camDz));

            // Direction from currentTarget toward the searched node
            const dirX = x - currentTarget.x;
            const dirY = y - currentTarget.y;
            const dirZ = z - currentTarget.z;
            const dirLen = Math.hypot(dirX, dirY, dirZ);

            const nextCamPos =
                dirLen > 0.001
                    ? {
                        x: currentTarget.x + (dirX / dirLen) * radius,
                        y: currentTarget.y + (dirY / dirLen) * radius,
                        z: currentTarget.z + (dirZ / dirLen) * radius,
                    }
                    : {
                        x: currentTarget.x + camDx,
                        y: currentTarget.y + camDy,
                        z: currentTarget.z + camDz,
                    };

            // Pass currentTarget as the second arg so the graph's center never shifts onto the node
            graph3DInstance.cameraPosition(nextCamPos, currentTarget, 500);

            if (node.lblEl instanceof HTMLElement) {
                node.lblEl.classList.remove("vocab-search-pulse");
                void node.lblEl.offsetWidth;
                node.lblEl.classList.add("vocab-search-pulse");
                window.setTimeout(() => {
                    node.lblEl?.classList.remove("vocab-search-pulse");
                }, 1400);
            }
        }
    }

    private renderNodeSearchControl(
        parentEl: HTMLElement,
        getModeAndGraph: () => { mode: "2d" | "3d"; graph3D?: any }
    ): void {
        const wrapper = parentEl.createDiv({ cls: "vocab-search-wrapper" });

        const inputEl = wrapper.createEl("input", {
            cls: "vocab-search-input",
            type: "search",
            placeholder: "Search sub or vocab...",
        });

        const resultsEl = wrapper.createDiv({ cls: "vocab-search-results" });
        resultsEl.addClass("is-hidden");

        let currentMatches: SearchableGraphNode[] = [];
        let activeIndex = 0;

        const closeResults = () => {
            currentMatches = [];
            activeIndex = 0;
            resultsEl.addClass("is-hidden");
            resultsEl.empty();
        };

        const selectMatch = (item: SearchableGraphNode) => {
            const { mode, graph3D } = getModeAndGraph();
            this.focusGraphNode(item.id, mode, graph3D);
            closeResults();
        };

        const syncActiveItem = () => {
            const buttons = Array.from(
                resultsEl.querySelectorAll<HTMLButtonElement>(".vocab-search-result-item")
            );
            buttons.forEach((btn, idx) => {
                const isSelected = idx === activeIndex;
                btn.toggleClass("is-selected", isSelected);
                if (isSelected) {
                    btn.scrollIntoView({ block: "nearest" });
                }
            });
        };

        const updateResults = () => {
            const query = inputEl.value;
            resultsEl.empty();

            if (!query.trim()) {
                closeResults();
                return;
            }

            currentMatches = this.getSearchableNodes(query);
            activeIndex = 0;
            resultsEl.removeClass("is-hidden");

            if (currentMatches.length === 0) {
                resultsEl.createDiv({
                    cls: "vocab-search-empty",
                    text: "No matching sub or vocab nodes",
                });
                return;
            }

            currentMatches.forEach((item, idx) => {
                const rowBtn = resultsEl.createEl("button", {
                    cls: "vocab-search-result-item",
                    type: "button",
                });

                if (idx === activeIndex) {
                    rowBtn.addClass("is-selected");
                }

                rowBtn.createSpan({
                    cls: `vocab-search-badge vocab-search-badge--${item.type}`,
                    text: item.type === "sub" ? "SUB" : "VOCAB",
                });

                rowBtn.createSpan({
                    cls: "vocab-search-label",
                    text: item.name,
                });

                rowBtn.addEventListener("mousemove", () => {
                    if (activeIndex !== idx) {
                        activeIndex = idx;
                        syncActiveItem();
                    }
                });

                rowBtn.addEventListener("click", (ev) => {
                    ev.stopPropagation();
                    selectMatch(item);
                });
            });
        };

        inputEl.addEventListener("input", updateResults);
        inputEl.addEventListener("focus", updateResults);

        inputEl.addEventListener("keydown", (ev) => {
            if (ev.key === "Escape") {
                inputEl.value = "";
                closeResults();
                inputEl.blur();
                return;
            }

            if (ev.key === "ArrowDown") {
                if (currentMatches.length === 0) return;
                ev.preventDefault();
                activeIndex = (activeIndex + 1) % currentMatches.length;
                syncActiveItem();
                return;
            }

            if (ev.key === "ArrowUp") {
                if (currentMatches.length === 0) return;
                ev.preventDefault();
                activeIndex = (activeIndex - 1 + currentMatches.length) % currentMatches.length;
                syncActiveItem();
                return;
            }

            if (ev.key === "Enter") {
                if (currentMatches.length === 0) return;
                ev.preventDefault();
                const chosen = currentMatches[activeIndex] ?? currentMatches[0];
                if (chosen) {
                    selectMatch(chosen);
                }
            }
        });

        const onOutsideClick = (ev: MouseEvent) => {
            if (!wrapper.contains(ev.target as Node)) {
                closeResults();
            }
        };
        this.registerDomEvent(document, "click", onOutsideClick);
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
        location?: any,
        highlightMeta: HighlightMeta = {}
    ) {
        const isTopic = type === 'topic';
        const isSub = type === 'sub';
        const isBold = isTopic || isSub;

        const isHighlighted = Boolean(highlightMeta.isHighlighted);
        const highlightedText = highlightMeta.highlightedText ?? null;
        const highlightColor = highlightMeta.highlightColor ?? null;
        const highlights = highlightMeta.highlights ?? [];

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

                // Collect highlighted substrings & their colors for vocab nodes
                const highlightTargets: Array<{ text: string; color: string }> = [];
                if (type === 'vocab' && isHighlighted) {
                    const fallbackColor = highlightColor || getThemeHighlightStyle().bgColor;
                    if (highlights.length > 0) {
                        for (const item of highlights) {
                            if (item.text) {
                                highlightTargets.push({
                                    text: item.text,
                                    color: item.color || fallbackColor,
                                });
                            }
                        }
                    } else if (highlightedText) {
                        highlightTargets.push({
                            text: highlightedText,
                            color: fallbackColor,
                        });
                    }
                }

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

                        // PDF / note-style marker stroke behind highlighted word(s)
                        if (highlightTargets.length > 0) {
                            ctx.save();
                            ctx.font = nodeFont;
                            const labelStartX = x - textWidth / 2;
                            const markerHeight = Math.min(fontSize + 4, h - 8);
                            const markerY = y - markerHeight / 2 + 0.5;

                            for (const target of highlightTargets) {
                                const matchIdx = label.toLowerCase().indexOf(target.text.toLowerCase());
                                if (matchIdx === -1) continue;

                                const matchedSlice = label.slice(matchIdx, matchIdx + target.text.length);
                                const prefixWidth = ctx.measureText(label.slice(0, matchIdx)).width;
                                const matchWidth = ctx.measureText(matchedSlice).width;

                                const hasExplicitAlpha =
                                    /^rgba?\([^)]*,\s*[\d.]+\s*\)$/i.test(target.color) ||
                                    /^hsla?\([^)]*,\s*[\d.]+\s*\)$/i.test(target.color) ||
                                    /^#[0-9a-f]{8}$/i.test(target.color);

                                ctx.beginPath();
                                ctx.roundRect(labelStartX + prefixWidth - 2, markerY, matchWidth + 4, markerHeight, 3);
                                ctx.fillStyle = target.color;
                                ctx.globalAlpha = hasExplicitAlpha ? 0.85 : 0.42;
                                ctx.fill();
                            }

                            ctx.restore();
                        }

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

        let existingLeaf: WorkspaceLeaf | null = null;
        workspace.iterateAllLeaves((leaf) => {
            if (existingLeaf) return;
            if (leaf.view instanceof MarkdownView && leaf.view.file?.path === targetFile.path) {
                existingLeaf = leaf;
            }
        });

        const targetLeaf = existingLeaf ?? workspace.getLeaf("tab");
        if (!targetLeaf) return;

        const lineCount =
            targetLeaf.view instanceof MarkdownView && targetLeaf.view.editor
                ? targetLeaf.view.editor.lineCount()
                : undefined;
        const safeLine =
            lineCount !== undefined
                ? Math.max(0, Math.min(line, Math.max(0, lineCount - 1)))
                : Math.max(0, line);

        workspace.setActiveLeaf(targetLeaf, { focus: true });

        const alreadyShowingFile =
            existingLeaf !== null &&
            targetLeaf.view instanceof MarkdownView &&
            targetLeaf.view.file?.path === targetFile.path;

        if (!alreadyShowingFile) {
            await targetLeaf.openFile(targetFile, { eState: { line: safeLine } });
        }

        // Re-trigger Obsidian's jump-to-line state even when the file was already open
        targetLeaf.setEphemeralState({ line: safeLine });

        if (targetLeaf.view instanceof MarkdownView && targetLeaf.view.editor) {
            const editor = targetLeaf.view.editor;
            const clampedLine = Math.max(0, Math.min(safeLine, Math.max(0, editor.lineCount() - 1)));
            const lineText = editor.getLine(clampedLine) ?? "";

            editor.setSelection(
                { line: clampedLine, ch: 0 },
                { line: clampedLine, ch: 0 }
            );

            requestAnimationFrame(() => {
                editor.scrollIntoView(
                    { from: { line: clampedLine, ch: 0 }, to: { line: clampedLine, ch: 0 } },
                    true
                );
            });
        }
    }

    private sanitize = (text: string) => {
        if (!text) return "";
        let cleaned = text.replace(/[\[\]]/g, "").replace(/\[\[|\]\]/g, "").trim();
        if (cleaned.includes("\\s") || cleaned.includes("(^") || (cleaned.includes("\\") && cleaned.length === 1) || cleaned.length === 0) {
            return "";
        }
        return cleaned;
    };

    private getLatestFileContent = async (file: TFile): Promise<string> => {
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        for (const leaf of leaves) {
            const view = leaf.view as { file?: TFile; editor?: { getValue: () => string } };
            if (view?.file && (view.file === file || view.file.path === file.path) && view.editor) {
                return view.editor.getValue();
            }
        }
        return await this.app.vault.read(file);
    };

    private createPinButton = (
        parent: HTMLElement,
        getCurrentValue: () => string,
        getPinnedValue: () => string | null,
        setPinnedValue: (val: string | null) => Promise<void>
    ) => {
        const pinBtn = parent.createEl('button', {
            cls: 'vocab-pin-btn',
            attr: { 'aria-label': 'Pin as default' }
        });

        const syncPinVisual = () => {
            const current = getCurrentValue();
            const pinned = getPinnedValue();
            const isPinned = Boolean(pinned && current === pinned);

            pinBtn.toggleClass('is-pinned', isPinned);
            setIcon(pinBtn, isPinned ? 'pin' : 'pin-off');
            pinBtn.setAttr(
                'title',
                isPinned ? `Pinned (${pinned}) — click to unpin` : 'Pin current selection as default'
            );
        };

        pinBtn.onclick = async () => {
            const current = getCurrentValue();
            const pinned = getPinnedValue();

            if (pinned && current === pinned) {
                await setPinnedValue(null); // Unpin
            } else if (current) {
                await setPinnedValue(current); // Pin current value
            }
            syncPinVisual();
        };

        syncPinVisual();
        return { pinBtn, syncPinVisual };
    };

    private folderHasTopic = async (folderPath: string, topicToCheck: string): Promise<boolean> => {
        if (!folderPath || !topicToCheck) return false;

        const allFiles = this.app.vault.getMarkdownFiles();
        const targetFiles = folderPath === "/"
            ? allFiles.filter(f => !f.path.includes('/'))
            : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

        const normalizedTarget = this.sanitize(topicToCheck);

        for (const file of targetFiles) {
            const content = await this.getLatestFileContent(file);
            const lines = content.split('\n');
            for (const line of lines) {
                const segments = line.split('\\');
                for (const seg of segments) {
                    for (const topicMatch of seg.matchAll(/\[topic::\s*([^\]]+)\]/gi)) {
                        if (topicMatch[1]) {
                            const cleanTopic = this.sanitize(topicMatch[1]);
                            if (cleanTopic === topicToCheck || this.sanitize(cleanTopic) === normalizedTarget) {
                                return true;
                            }
                        }
                    }
                }
            }
        }

        return false;
    };

    private extractVocabWithMark = (rawValue: string): VocabParseResult => {
        const highlights: HighlightItem[] = [];
        const defaultHighlightColor = getObsidianHighlightColor();

        // 1. <mark ...>...</mark> (captures optional style="..." and inner text)
        for (const match of rawValue.matchAll(/<mark\b([^>]*)>([\s\S]*?)<\/mark>/gi)) {
            const attrString = match[1] ?? "";
            const innerText = this.sanitize((match[2] ?? "").replace(/<[^>]*>/g, "").trim());
            if (!innerText) continue;

            const styleMatch = attrString.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i);
            const parsedColor = styleMatch && styleMatch[2] ? extractStyleColor(styleMatch[2]) : null;

            highlights.push({
                text: innerText,
                color: parsedColor || defaultHighlightColor,
            });
        }

        // 2. ==...== Obsidian highlight syntax
        for (const match of rawValue.matchAll(/(?<![=])==([^=\n]+?)==(?![=])/g)) {
            const { text: withoutCircles, circleColor } = parseCircleHighlight(
                (match[1] ?? "").replace(/<[^>]*>/g, "").trim()
            );
            const innerText = this.sanitize(withoutCircles);
            if (!innerText) continue;

            highlights.push({
                text: innerText,
                color: circleColor || defaultHighlightColor,
            });
        }

        // 3. Clean text without highlight markers/HTML tags
        const withoutMarkers = rawValue
            .replace(/(?<![=])==([^=\n]+?)==(?![=])/g, "$1")
            .replace(/<mark\b[^>]*>([\s\S]*?)<\/mark>/gi, "$1")
            .replace(/<[^>]*>/g, "");

        const { text: cleanedLabel } = parseCircleHighlight(withoutMarkers);
        const cleanText = this.sanitize(cleanedLabel);
        const uniqueTexts = Array.from(new Set(highlights.map((h) => h.text)));

        return {
            cleanText,
            highlightedText: uniqueTexts.length > 0 ? uniqueTexts.join(", ") : null,
            highlightColor: highlights[0]?.color ?? null,
            highlights,
            isHighlighted: highlights.length > 0,
        };
    };

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
        titleSpan.setText("GRAPH CONTROLS");

        const rightGroup = headerRow.createDiv();
        rightGroup.setCssStyles({
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginLeft: "auto"
        });

        this.renderNodeSearchControl(
            rightGroup,
            () => ({ mode: currentMode, graph3D: currentGraphInstance })
        );

        const collapseBtn = rightGroup.createEl("button", {
            cls: "vocab-collapse-btn",
            text: "▲"
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

        const folderSelect = folderGroup.createEl('select', {
            cls: ['dropdown', 'vocab-control-select']
        });

        const folderPin = this.createPinButton(
            folderGroup,
            () => folderSelect.value,
            () => this.plugin.settings.pinnedFolder,
            async (val) => {
                this.plugin.settings.pinnedFolder = val;

                if (!val) {
                    // Unpinning the folder also clears any pinned topic tied to it
                    this.plugin.settings.pinnedTopic = null;
                } else if (this.plugin.settings.pinnedTopic) {
                    // Pinning a different folder clears pinnedTopic if it doesn't belong to this folder
                    const belongsHere = await this.folderHasTopic(val, this.plugin.settings.pinnedTopic);
                    if (!belongsHere) {
                        this.plugin.settings.pinnedTopic = null;
                    }
                }

                await this.plugin.saveSettings();
                topicPin.syncPinVisual();
            }
        );

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

        const topicSelect = topicGroup.createEl('select', {
            cls: ['dropdown', 'vocab-control-select']
        });

        const topicPin = this.createPinButton(
            topicGroup,
            () => topicSelect.value,
            () => this.plugin.settings.pinnedTopic,
            async (val) => {
                this.plugin.settings.pinnedTopic = val;

                // Pinning a topic automatically pins the currently selected folder as well
                if (val && folderSelect.value) {
                    this.plugin.settings.pinnedFolder = folderSelect.value;
                }

                await this.plugin.saveSettings();
                folderPin.syncPinVisual();
            }
        );

        // Mode Toggle Button (3D / 2D)
        let currentMode: '3d' | '2d' = this.plugin.settings.pinnedMode ?? '3d';
        let currentGraphInstance: any = null;

        // Group the Mode button and its Pin button together
        const modeGroup = controlsBody.createDiv({ cls: 'vocab-control-group' });

        const modeBtn = modeGroup.createEl('button', {
            cls: 'vocab-mode-btn',
            text: currentMode === '3d' ? 'Mode: 3D' : 'Mode: 2D'
        });

        const modePin = this.createPinButton(
            modeGroup,
            () => currentMode,
            () => this.plugin.settings.pinnedMode,
            async (val) => {
                this.plugin.settings.pinnedMode = val as '3d' | '2d' | null;
                await this.plugin.saveSettings();
            }
        );

        modePin.syncPinVisual();

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
        const graphWrapper = container.createDiv({ cls: 'vocab-graph-wrapper' });
        const graphElem = graphWrapper.createDiv({ cls: 'vocab-graph-canvas' });
        const overlay = graphWrapper.createDiv({ cls: 'vocab-graph-overlay' });

        const extractNBadge = (lineText: string): string | null => {
            if (!lineText) return null;
            let matches = [...lineText.matchAll(/\[(n|N)::\s*([^\]]+)\]/g)];
            if (matches.length > 0 && matches[0] && matches[0][2]) {
                return this.sanitize(matches[0][2]);
            }
            return null;
        };

        let currentFolder: string | undefined = this.plugin.settings.pinnedFolder ?? undefined;

        const updateFolders = async (preserveFolder?: string): Promise<string | null> => {
            const allFiles = this.app.vault.getMarkdownFiles();
            const folderSet = new Set<string>();

            for (const f of allFiles) {
                const cache = this.app.metadataCache.getFileCache(f);
                let hasTopic = Boolean(cache?.frontmatter?.topic);

                if (!hasTopic) {
                    const content = await this.getLatestFileContent(f);
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
                return null;
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

            const resolvedFolder = currentFolder || '/';
            folderSelect.value = resolvedFolder;
            return resolvedFolder;
        };
        
        const activeFolder = await updateFolders(currentFolder);
        folderPin.syncPinVisual();

        const showLocationPicker = (locs: VocabLocation[]): void => {
            document.querySelectorAll(".vocab-location-picker").forEach((el) => el.remove());

            const picker = document.body.createDiv({ cls: "vocab-location-picker" });
            picker.setCssStyles({
                position: "fixed",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: "8px",
                zIndex: "9999",
            });

            const cleanup = () => {
                picker.remove();
                document.removeEventListener("click", onDocClick);
                document.removeEventListener("keydown", onKeyDown);
            };

            locs.forEach((loc, idx) => {
                const fileName = loc.path.split("/").pop() ?? loc.path;
                const itemBtn = picker.createEl("button", {
                    cls: "vocab-location-picker-item",
                    type: "button",
                    text: `${idx + 1}. ${fileName} : ${loc.line + 1}`,
                });
                itemBtn.setCssStyles({
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                });
                itemBtn.addEventListener("click", (ev) => {
                    ev.stopPropagation();
                    cleanup();
                    void this.openFileAtLine(loc.path, loc.line);
                });
            });

            const onDocClick = (ev: MouseEvent) => {
                if (!picker.contains(ev.target as Node)) {
                    cleanup();
                }
            };

            const onKeyDown = (ev: KeyboardEvent) => {
                if (ev.key === "Escape") {
                    cleanup();
                }
            };

            window.setTimeout(() => {
                document.addEventListener("click", onDocClick);
                document.addEventListener("keydown", onKeyDown);
            }, 0);
        }

        const updateTopicsForFolder = async (folderPath: string, overrideTopic?: string) => {
            graphElem.empty();
            overlay.empty();
            this.nodesMap.clear();

            let allFiles = this.app.vault.getMarkdownFiles();
            let targetFiles = folderPath === "/" 
                ? allFiles.filter(f => !f.path.includes('/'))
                : allFiles.filter(f => f.path.startsWith(folderPath + "/"));

            let topicsSet = new Set<string>();

            for (let file of targetFiles) {
                let content = await this.getLatestFileContent(file);
                let lines = content.split('\n');
                for (let line of lines) {
                    let segments = line.split('\\');
                    for (let seg of segments) {
                        let topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        if (topicMatch && topicMatch[1]) {
                            let cleanTopic = this.sanitize(topicMatch[1]);
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

            // Priority: 1) explicit override (e.g., Refresh preserving current topic), 2) pinnedTopic, 3) first topic
            const candidateTopic = overrideTopic ?? this.plugin.settings.pinnedTopic;
            const normalizedCandidate = candidateTopic ? this.sanitize(candidateTopic) : null;
            const matchedTopic = normalizedCandidate
                ? availableTopics.find(t => t === candidateTopic || this.sanitize(t) === normalizedCandidate)
                : undefined;

            const selectedTopic = matchedTopic || availableTopics[0];
            if (selectedTopic) {
                topicSelect.value = selectedTopic;
                await renderCurrentModeGraph(folderPath, selectedTopic);
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
            let nodeLocationsMap = new Map<string, VocabLocation[]>();

            const addNode = (
                id: string,
                label: string, 
                type: string, 
                levelFromTopic = 0, 
                colorKey: string | null = null, 
                location: VocabLocation | VocabLocation[] | null = null,
                badgeVal: string | null = null,
                highlightMeta: HighlightMeta = {}
            ) => {
                if (location) {
                    const incoming = Array.isArray(location) ? location : [location];
                    const currentList = nodeLocationsMap.get(id) ?? [];

                    for (const loc of incoming) {
                        if (!loc || typeof loc.path !== "string" || typeof loc.line !== "number") {
                            continue;
                        }
                        const alreadyExists = currentList.some(
                            (existing) => existing.path === loc.path && existing.line === loc.line
                        );
                        if (!alreadyExists) {
                            currentList.push({ path: loc.path, line: loc.line });
                        }
                    }

                    if (currentList.length > 0) {
                        nodeLocationsMap.set(id, currentList);
                    }
                }

                if (addedNodes.has(id)) return;
                addedNodes.add(id);

                const isHighlighted = Boolean(highlightMeta.isHighlighted);
                const highlightedText = highlightMeta.highlightedText ?? null;
                const highlightColor = highlightMeta.highlightColor ?? null;
                const highlights = highlightMeta.highlights ?? [];

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
                        isHighlighted,
                        highlightedText,
                        highlightColor,
                        highlights,
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

                            const highlightTargets: Array<{ text: string; color: string }> = [];
                                if (isHighlighted) {
                                    const fallbackColor = highlightColor || getThemeHighlightStyle().bgColor;
                                    if (highlights.length > 0) {
                                        for (const item of highlights) {
                                            if (item.text) {
                                                highlightTargets.push({
                                                    text: item.text,
                                                    color: item.color || fallbackColor,
                                                });
                                            }
                                        }
                                    } else if (highlightedText) {
                                        highlightTargets.push({
                                            text: highlightedText,
                                            color: fallbackColor,
                                        });
                                    }
                                }

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

                                    if (highlightTargets.length > 0) {
                                        ctx.save();
                                        ctx.font = nodeFont;
                                        const labelStartX = x - textWidth / 2;
                                        const markerHeight = 15;
                                        const markerY = y - markerHeight / 2 + 0.5;

                                        for (const target of highlightTargets) {
                                            const matchIdx = label.toLowerCase().indexOf(target.text.toLowerCase());
                                            if (matchIdx === -1) continue;

                                            const matchedSlice = label.slice(matchIdx, matchIdx + target.text.length);
                                            const prefixWidth = ctx.measureText(label.slice(0, matchIdx)).width;
                                            const matchWidth = ctx.measureText(matchedSlice).width;

                                            // If the theme/inline color already has alpha (rgba/hsla or 8-digit hex), keep a lighter multiplier
                                            const hasExplicitAlpha =
                                                /^rgba?\([^)]*,\s*[\d.]+\s*\)$/i.test(target.color) ||
                                                /^hsla?\([^)]*,\s*[\d.]+\s*\)$/i.test(target.color) ||
                                                /^#[0-9a-f]{8}$/i.test(target.color);

                                            ctx.beginPath();
                                            ctx.roundRect(labelStartX + prefixWidth - 2, markerY, matchWidth + 4, markerHeight, 3);
                                            ctx.fillStyle = target.color;
                                            ctx.globalAlpha = hasExplicitAlpha ? 0.85 : 0.42;
                                            ctx.fill();
                                        }

                                        ctx.restore();
                                    }

                                    // Label text (centered identically to normal box nodes)
                                    ctx.font = nodeFont;
                                    ctx.fillStyle = text;
                                    ctx.textAlign = 'center';
                                    ctx.textBaseline = 'middle';
                                    ctx.fillText(label, x, y + 0.5);

                                    // Compact, sleek top-right badge pill
                                    const badgeText = badgeVal;
                                    ctx.font = `700 8px ${activeFont}`;
                                    const badgeW = ctx.measureText(badgeText).width + 10;
                                    const badgeH = 14;
                                    const badgeX = x + w / 2 - badgeW;
                                    const badgeY = y - h / 2 - badgeH / 2 - 5;

                                    ctx.beginPath();
                                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 7);
                                    ctx.fillStyle = accentBg;
                                    ctx.fill();

                                    ctx.fillStyle = textOnAccent;
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
                        this.createCustomNode(
                            id, label, type, resolvedBg, nodeBorder, 
                            resolvedTextColor, badgeVal, location,
                            { isHighlighted, highlightedText, highlightColor, highlights })
                    );
                } else {
                    this.nodesMap.set(id, {
                        id: id,
                        name: label,
                        badge: badgeVal,
                        colors: { bg, border },
                        type: type,
                        level: levelFromTopic,
                        val: 0.001,
                        isHighlighted,
                        highlightedText,
                        highlightColor,
                        highlights
                    });
                }
            };
            console.log(`Rendering graph for topic: ${topicName}`);

            let centralTopicId = this.makeTopicId(topicName);
            addNode(centralTopicId, topicName, 'topic', 0, null, { path: '', line: 0 }, null);

            let linksSet = new Map<string, any>();

            for (let file of targetFiles) {
                let content = await this.app.vault.read(file);
                let lines = content.split('\n');

                for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                    let line = lines[lineIndex];
                    if (!line) continue; // Skip if the line is undefined
                    let vocabMatch = line.match(/\[vocab::\s*([^\]]+)\]/);
                    let parsedSharedVocab = vocabMatch && vocabMatch[1] 
                        ? this.extractVocabWithMark(vocabMatch[1])
                        : {
                            cleanText: "",
                            highlightedText: null,
                            highlightColor: null,
                            highlights: [],
                            isHighlighted: false,
                          };
                    let nBadgeVal = extractNBadge(line);
                    let segments = line.split('\\');

                    for (let seg of segments) {
                        let segVocabMatch = seg.match(/\[vocab::\s*([^\]]+)\]/);
                        let parsedSegVocab = (segVocabMatch && segVocabMatch[1]) 
                            ? this.extractVocabWithMark(segVocabMatch[1]) 
                            : parsedSharedVocab;

                        let cleanVocab = parsedSegVocab.cleanText;
                        let vocabHighlight = parsedSegVocab.highlightedText;
                        let vocabHighlightColor = parsedSegVocab.highlightColor;
                        let vocabHighlights = parsedSegVocab.highlights;
                        let isVocabHighlighted = parsedSegVocab.isHighlighted;
                        
                        let subMatches = [...seg.matchAll(/\[sub::\s*([^\]]+)\]/g)];
                        let cleanSubs = subMatches.map(m => (m && m[1]) 
                            ? this.sanitize(m[1]) : "").filter(Boolean);
                        
                        let topicMatch = seg.match(/\[topic::\s*([^\]]+)\]/);
                        let cleanTopic = (topicMatch && topicMatch[1]) ? this.sanitize(topicMatch[1]) : topicName;

                        if (cleanTopic === topicName) {
                            let pathNodes = [];
                            let pathColorKeys = [];
                            let locationData = { path: file.path, line: lineIndex };
                            let immediateParentSub = cleanSubs.length > 0 ? cleanSubs[cleanSubs.length - 1] : cleanVocab;
                            let vocabColorKey = immediateParentSub || cleanTopic;

                            if (cleanVocab) {
                                const vocabId = this.makeVocabId(cleanVocab);
                                let vocabParent = cleanSubs.length > 0 ? cleanSubs[0] : cleanTopic;
                                addNode(
                                    vocabId, 
                                    cleanVocab, 
                                    'vocab', 
                                    0, 
                                    vocabColorKey, 
                                    locationData, 
                                    nBadgeVal,
                                    {
                                        isHighlighted: isVocabHighlighted,
                                        highlightedText: vocabHighlight,
                                        highlightColor: vocabHighlightColor,
                                        highlights: vocabHighlights,
                                    });
                                pathNodes.push(vocabId);
                                pathColorKeys.push(vocabParent);
                            }

                            for (let j = 0; j < cleanSubs.length; j++) {
                                let subText = cleanSubs[j];
                                if (!subText) continue; // Skip if undefined
                                let subId = this.makeSubId(subText);
                                let levelFromTopic = cleanSubs.length - j; 
                                addNode(subId, subText, 'sub', levelFromTopic, subText, locationData, null);
                                pathNodes.push(subId);
                                pathColorKeys.push(subText);
                            }

                            pathNodes.push(centralTopicId);

                            for (let i = 0; i < pathNodes.length - 1; i++) {
                                let sourceId = pathNodes[i];
                                let targetId = pathNodes[i + 1];
                                let linkKey = sourceId + "->" + targetId;
                                
                                let edgeColorKey = pathColorKeys[i];
                                let edgeColor = '#93C5FD';
                                if (edgeColorKey && edgeColorKey !== topicName) {
                                    let branchInfo = getBranchColors(edgeColorKey, false);
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

            const renderHighlightedLabel = (
                container: HTMLElement,
                fullText: string,
                node: any,
                themeHighlight: ThemeHighlightInterface,
                normalTextColor: string
            ) => {
                container.empty();
                container.setCssStyles({ color: normalTextColor });

                const targets: Array<{ text: string; color: string }> = [];
                if (node.type === 'vocab' && node.isHighlighted) {
                    const fallbackColor = node.highlightColor || themeHighlight.bgColor;
                    if (Array.isArray(node.highlights) && node.highlights.length > 0) {
                        for (const item of node.highlights) {
                            if (item?.text) {
                                targets.push({
                                    text: item.text,
                                    color: item.color || fallbackColor,
                                });
                            }
                        }
                    } else if (node.highlightedText) {
                        targets.push({
                            text: node.highlightedText,
                            color: fallbackColor,
                        });
                    }
                }

                if (targets.length === 0) {
                    container.setText(fullText);
                    return;
                }

                const lowerFull = fullText.toLowerCase();
                const intervals: Array<{ start: number; end: number; color: string }> = [];

                for (const target of targets) {
                    const lowerTarget = target.text.toLowerCase();
                    if (!lowerTarget) continue;

                    let searchFrom = 0;
                    while (searchFrom < lowerFull.length) {
                        const idx = lowerFull.indexOf(lowerTarget, searchFrom);
                        if (idx === -1) break;
                        const end = idx + lowerTarget.length;

                        const overlaps = intervals.some(
                            (existing) => idx < existing.end && end > existing.start
                        );
                        if (!overlaps) {
                            intervals.push({ start: idx, end, color: target.color });
                        }
                        searchFrom = end;
                    }
                }

                if (intervals.length === 0) {
                    container.setText(fullText);
                    return;
                }

                intervals.sort((a, b) => a.start - b.start);

                let cursor = 0;
                for (const iv of intervals) {
                    if (iv.start > cursor) {
                        const normalSegment = container.createSpan({ cls: "vocab-3d-normal-text" });
                        normalSegment.setText(fullText.slice(cursor, iv.start));
                        normalSegment.setCssStyles({ color: normalTextColor });
                    }

                    const markSpan = container.createSpan({ cls: "vocab-3d-pdf-highlight" });
                    markSpan.setText(fullText.slice(iv.start, iv.end));

                    const hasExplicitAlpha =
                        /^rgba?\([^)]*,\s*[\d.]+\s*\)$/i.test(iv.color) ||
                        /^hsla?\([^)]*,\s*[\d.]+\s*\)$/i.test(iv.color) ||
                        /^#[0-9a-f]{8}$/i.test(iv.color);

                    // Highlighted text can use its own distinct text color (e.g. theme highlight fg or dark ink over pastel marker)
                    const highlightedTextColor = themeHighlight.textColor || "#111827";

                    markSpan.setCssStyles({
                        color: highlightedTextColor,
                        fontWeight: "600",
                        backgroundColor: iv.color,
                        opacity: hasExplicitAlpha ? "0.92" : "0.55",
                        borderRadius: `${Math.min(themeHighlight.borderRadius, 5)}px`,
                        paddingLeft: `${Math.max(2, themeHighlight.paddingX)}px`,
                        paddingRight: `${Math.max(2, themeHighlight.paddingX)}px`,
                        paddingTop: `${Math.max(1, themeHighlight.paddingY)}px`,
                        paddingBottom: `${Math.max(1, themeHighlight.paddingY)}px`,
                        ...(themeHighlight.borderBottomWidth > 0 && themeHighlight.borderBottomColor
                            ? {
                                borderBottom: `${Math.min(themeHighlight.borderBottomWidth, 2)}px solid ${themeHighlight.borderBottomColor}`,
                            }
                            : {}),
                    });

                    cursor = iv.end;
                }

                if (cursor < fullText.length) {
                    const trailingSegment = container.createSpan({ cls: "vocab-3d-normal-text" });
                    trailingSegment.setText(fullText.slice(cursor));
                    trailingSegment.setCssStyles({ color: normalTextColor });
                }
            };

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
                    .onNodeClick((node: any, event?: MouseEvent) => {
                        if (node.type === "vocab") {
                            const locs = nodeLocationsMap.get(node.id);
                            if (!locs || locs.length === 0) return;

                            if (locs.length === 1) {
                                const first = locs[0];
                                if (first) void this.openFileAtLine(first.path, first.line);
                                return;
                            }

                            showLocationPicker(locs);
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

                const handleNodeClick = (node: any, event?: MouseEvent) => {
                    if (node.type === "vocab") {
                        const locs = nodeLocationsMap.get(node.id);
                        if (!locs || locs.length === 0) return;

                        if (locs.length === 1) {
                            const first = locs[0];
                            if (first) void this.openFileAtLine(first.path, first.line);
                            return;
                        }

                        showLocationPicker(locs);
                    }
                };

                const themeHighlight = getThemeHighlightInterface(this.containerEl);

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

                    const normalTextColor = node.type === 'vocab'
                        ? "var(--text-normal)"
                        : (node.type === 'topic' ? "var(--text-on-accent)" : "#FFFFFF");

                    let textSpan = lbl.createSpan();
                    renderHighlightedLabel(textSpan, node.name, node, themeHighlight, normalTextColor);

                    node.lblEl = lbl;
                    node.textSpanEl = textSpan;

                    const { accentBg, textOnAccent } = this.getObsidianAccentColors();
                    if (node.badge) {
                        let badgeEl = lbl.createSpan();
                        badgeEl.setText(node.badge);
                        badgeEl.setCssStyles({
                            position: "absolute",
                            top: "-16px",
                            right: "0px",
                            backgroundColor: accentBg,
                            color: textOnAccent,
                            fontSize: "8px",
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
                            if (!Array.isArray(params.nodes) || params.nodes.length === 0) return;

                            const clickedNodeId = params.nodes[0];
                            const node = this.nodesMap.get(clickedNodeId);
                            if (!node || node.type !== "vocab") return;

                            const locs = nodeLocationsMap.get(clickedNodeId);
                            if (!locs || locs.length === 0) return;

                            if (locs.length === 1) {
                                const first = locs[0];
                                if (first) await this.openFileAtLine(first.path, first.line);
                                return;
                            }

                            // vis-network click params provide DOM coordinates in params.event.center or srcEvent
                            showLocationPicker(locs);
                        });
                    } catch (err: any) {
                        console.error("2D Network Error:", err);
                    }
                });
            }
        };

        if (activeFolder) {
            console.log(`1. Active folder determined: ${activeFolder}`);
            await updateTopicsForFolder(activeFolder);

            const pinnedTopic = this.plugin.settings.pinnedTopic;
            console.log(`Pinned topic from settings: ${pinnedTopic}`);
            if (pinnedTopic && Array.from(topicSelect.options).some(opt => opt.value === pinnedTopic)) {
                console.log(`Setting topicSelect.value to pinnedTopic: ${pinnedTopic}`);
                topicSelect.value = pinnedTopic;
            }
            topicPin.syncPinVisual();

            if (topicSelect.value) {
                console.log(`1. Rendering graph for selected topic: ${topicSelect.value}`);
                await renderCurrentModeGraph(activeFolder, topicSelect.value);
            }
        }

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
            folderPin.syncPinVisual();
            let selectedFolder = (e.target as HTMLSelectElement).value;
            console.log(`2. Folder changed to: ${selectedFolder}`);
            await updateTopicsForFolder(selectedFolder);
            topicPin.syncPinVisual();
        });

        topicSelect.addEventListener('change', (e) => {
            topicPin.syncPinVisual();
            let selectedTopic = (e.target as HTMLSelectElement).value;
            if (selectedTopic) {
                console.log(`2. Rendering graph for selected topic: ${selectedTopic}`);
                renderCurrentModeGraph(folderSelect.value, selectedTopic);
            }
        });

        modeBtn.onclick = async () => {
            currentMode = currentMode === '3d' ? '2d' : '3d';
            modeBtn.setText(currentMode === '3d' ? "Mode: 3D" : "Mode: 2D");
            modePin.syncPinVisual();
            if (topicSelect.value) {
                console.log(`3. Rendering graph for selected topic: ${topicSelect.value} in mode: ${currentMode}`);
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
                console.log(`3. Refreshing topics for folder: ${folderSelect.value}`);
                await updateTopicsForFolder(folderSelect.value);

                if (previousTopic && Array.from(topicSelect.options).some(opt => opt.value === previousTopic)) {
                    topicSelect.value = previousTopic;
                }

                if (topicSelect.value) {
                    console.log(`4. Rendering graph for selected topic: ${topicSelect.value} in mode: ${currentMode}`);
                    await renderCurrentModeGraph(folderSelect.value, topicSelect.value);
                }
            }
            setTimeout(() => {
                refreshBtn.setText("↻ Refresh");
            }, 400);
        };

        // if (currentFolder) {
        //     console.log(`5. Initializing topics for current folder: ${currentFolder}`);
        //     await updateTopicsForFolder(currentFolder);
        // }

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