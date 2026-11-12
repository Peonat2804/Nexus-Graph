# NexusGraph
_(3D & 2D Vocabulary & Mind Map Plugin for Obsidian)_

**NexusGraph** is an immersive, interactive spatial graph plugin for Obsidian that transforms your markdown notes into dynamic, interconnected 3D and 2D node networks. Originally built for advanced language learning and vocabulary organization, it scales effortlessly into a general-purpose mind-mapping tool for any topic or project.

## 🌟 Key Features

- 🚀 **Dual-Mode Engine:** Instantly toggle between an immersive **3D Force-Directed Graph** (with depth-of-field blur and spatial z-index ordering) and a flat **2D Physics Network** (`vis-network`) with a single click.
- 📁 **Dynamic Folder & Topic Scoping:** Automatically scans your vault's folders and extracts explicit `[topic::]` tags to filter your views on the fly.
- 🎯 **Rich Markdown Tagging:** Organize hierarchical knowledge naturally using inline tags (`[topic::]`, `[sub::]`, `[vocab::]`, and floating badges `[n::]`).
- 🖱️ **Actionable & Interactive:**
	- Smooth node dragging for both parents and sub-nodes with zero simulation bounce-back.
	- **Click-to-Navigate:** Clicking any leaf vocabulary node opens the exact source file and jumps straight to the corresponding line.
- 🎨 **20 Vibrant Branch Palettes:** Automatically color-hashes your branches across 20 distinct visual palettes paired with dark, clean leaf nodes (`#17202A`).
- ↻ **Live Refresh:** Manually re-indexes your vault instantly whenever you add or modify entries.

## 📸 Demo Figures
![demo](./demo.gif)

## 📝 Markdown Tag Syntax
NexusGraph parses inline tags separated by backslashes (`\`) to build your knowledge hierarchy.
You can tag your vocabularies in many files or wherever you like, then your vocabulares are gathered under the same topic and built a mindmap.

### Example Note Structure:
- A vocabulary assigned to a topic
> `[vocab::kündigen]` - _to quit_ `[topic::[[Common Actions]]]`
- A vocabulary assigned to 2 topics, separated by a backslash (`\`)
> `[vocab::sich um (A) kümmern]` - _to take care of / to look after_ `[topic::[[Common Actions]]]` \ `[sub::Family]` `[topic::[[Relationships]]]`
- A vocabulary with a badge
> `[vocab::kriegen]` - `[n::informal]` _to get or receive ~ bekommen or ~ erhalten_ `[topic::[[Common Actions]]] `

### Supported Tag Types:
- `[topic:: Name]`: Defines the core central node of the graph.
- `[sub:: Name]`: Creates intermediate branch categories and sub-levels.
- `[vocab:: Name]`: Represents the leaf nodes (the items you are tracking/studying). Clicking these navigates directly to their source file.
- `[n:: Badge]`: Adds a vibrant floating badge pill (e.g., `noun`, `verb`, `phrase`) to your vocabulary nodes.

## 🎮 How to Use
1. Open the Command Palette (`Ctrl/Cmd + P`) and run `Open Vocabulary Graph`, or click the network icon in your left ribbon bar.
2. Select your target **Folder** from the top-left dropdown.
3. Select your desired **Topic** from the adjacent dropdown.
4. Use the `Mode: 3D 🌐 / 2D 🗺️` button to switch visualization styles.
5. Click `↻ Refresh` at any time to reload new notes or updates from your vault.

## 📦 Installation
### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub Release.
2. Create a folder named `nexus-graph` inside your vault's plugins directory: `<YourVault>/.obsidian/plugins/nexus-graph/`.
3. Drop the downloaded files into that folder.
4. Restart Obsidian, go to **Settings → Community Plugins**, and enable **NexusGraph**.

## 📄 License
Distributed under the **MIT License**. See `LICENSE` for more information.