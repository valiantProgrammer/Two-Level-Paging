<p align="center">
  <img src="assets/banner.svg" alt="Two-Level Paging + TLB Simulator Banner" width="100%">
</p>

<p align="center">
  <a href="https://github.com/valiantProgrammer/Two-Level-Paging/stargazers"><img src="https://img.shields.io/github/stars/valiantProgrammer/Two-Level-Paging?color=8b5cf6&style=for-the-badge&logo=github" alt="Stars"></a>
  <a href="https://github.com/valiantProgrammer/Two-Level-Paging/network/members"><img src="https://img.shields.io/github/forks/valiantProgrammer/Two-Level-Paging?color=06b6d4&style=for-the-badge&logo=github" alt="Forks"></a>
  <a href="https://github.com/valiantProgrammer/Two-Level-Paging/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981?style=for-the-badge" alt="License"></a>
  <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Python-f59e0b?style=for-the-badge" alt="Platform">
  <img src="https://img.shields.io/badge/Architecture-32--Bit%20Two--Level%20Paging-6366f1?style=for-the-badge" alt="Architecture">
</p>

---

## 📌 Table of Contents
- [📖 Overview](#-overview)
- [✨ Key Features](#-key-features)
- [🏛️ System Architecture](#-system-architecture)
  - [32-Bit Address Breakdown](#32-bit-virtual-address-breakdown)
  - [Hardware Translation Pipeline](#hardware-translation-pipeline)
  - [Decision Logic Flowchart](#decision-logic-flowchart)
- [⏱️ Memory Access Timing & EAT Formulas](#-memory-access-timing--eat-formulas)
- [🖥️ Interactive Web Simulator UI](#-interactive-web-simulator-ui)
  - [1. Simulation View](#1-simulation-view)
  - [2. Visual Diagram Tab](#2-visual-diagram-tab)
  - [3. Page Tables & Physical Memory Grid](#3-page-tables--physical-memory-grid)
  - [4. TLB Detailed Cache Inspector](#4-tlb-detailed-cache-inspector)
  - [5. Analytics & Results Report](#5-analytics--results-report)
- [⏮️ Call History & Stepper Controls](#️-call-history--stepper-controls)
- [🐍 Python CLI Simulator](#-python-cli-simulator)
- [🚀 Quick Start & Installation](#-quick-start--installation)
- [📂 Project Structure](#-project-structure)
- [📚 Educational Context & References](#-educational-context--references)
- [📄 License & Authors](#-license--authors)

---

## 📖 Overview

The **Two-Level Paging + TLB Simulator** is an interactive, full-stack educational simulation platform that visualizes how an Operating System and Memory Management Unit (MMU) translate virtual memory addresses to physical memory addresses in a modern 32-bit hierarchical architecture.

It replicates the exact address translation pipeline found in classic x86 architectures (such as IA-32), featuring:
1. **Translation Lookaside Buffer (TLB)** with **Least Recently Used (LRU)** cache eviction.
2. **Two-Level Hierarchical Page Table Walk** (Page Directory $\to$ Page Table).
3. **Demand Paging** with **First-In, First-Out (FIFO)** physical frame allocation and page eviction.
4. **Effective Access Time (EAT)** calculations factoring in nanosecond-scale memory latencies and millisecond-scale page fault service penalties.
5. **Complete Call History Navigation** enabling users to step backwards and forwards through memory access history with synchronized visual state reconstruction.

Both a **zero-dependency interactive web application** (HTML5, Vanilla CSS, and modern JavaScript) and a **standalone Python reference CLI implementation** (`paging_tlb_simulator.py`) are included.

---

## ✨ Key Features

- ⚡ **Zero External Dependencies**: Pure native Web standards (HTML5 Canvas/SVG, Vanilla CSS, ES6+) and Python standard library (`OrderedDict`, `deque`, `dataclasses`).
- 🧭 **32-Bit Hierarchical Address Translation**: Configured with a `10-10-12` split:
  - **10 bits**: Page Directory Index ($2^{10} = 1024$ entries)
  - **10 bits**: Page Table Index ($2^{10} = 1024$ entries)
  - **12 bits**: Page Offset ($2^{12} = 4096$ bytes = 4 KiB page size)
- 🗃️ **TLB Cache with LRU Eviction**: Maintains insertion order and moves accessed pages to Most Recently Used (MRU) position; evicts the Least Recently Used (LRU) victim upon cache overflow.
- 🔄 **Demand Paging with FIFO Frame Replacement**: Manages physical memory frames (default: 8 frames). If all frames are occupied during a page fault, the oldest resident page is evicted and its page table entry is invalidated.
- 🎮 **Call History Stepper & Inspection**: Step backward (`◀ Prev`) and forward (`Next ▶`) through every memory access call or jump to `⏮ First` / `⏭ Latest`. Clicking any row in the Access Log table immediately restores the entire simulation state to that historical call.
- 📊 **Real-Time Visual Architecture Flowchart**: Dynamic hardware diagram illustrating the CPU, TLB lookup, Page Directory (PDE), Page Table (PTE), Frame Table, and Physical Memory stack with active highlighting for the current or inspected call.
- 📈 **Live Analytics & Donut Charts**: Tracks total accesses, TLB hits, TLB misses, page faults, hit rates, and Effective Access Time (EAT) with animated SVG donut charts.
- ⚙️ **Custom Configuration Playground**: Dynamically customize page size (1 KiB to 64 KiB), address bit splits, TLB capacity, physical frame count, and lookup access times.
- 📑 **Data Export**: Export complete access logs to CSV or copy clean text-based performance summaries to the clipboard.

---

## 🏛️ System Architecture

### 32-Bit Virtual Address Breakdown

```
+---------------------------+------------------------+-----------------------+
|  Directory Index (p1)     |  Table Index (p2)      |   Page Offset (d)     |
|  Bits 31 .. 22 (10 bits)  |  Bits 21 .. 12 (10 bits)|   Bits 11 .. 0 (12 bits)|
+---------------------------+------------------------+-----------------------+
         |                             |                          |
         v                             v                          |
   Page Directory                 Page Table                      |
  (Selects PT Base)            (Selects Frame #)                  |
         |                             |                          |
         +-----------------------------+                          |
                        |                                         |
                        v                                         v
              Physical Frame Number (PFN)       +        Page Offset (d)
                                                |
                                                v
                                   32-Bit Physical Address (PA)
```

### Hardware Translation Pipeline

The diagram below illustrates the exact hardware path traversed for every memory address issued by the CPU core:

<p align="center">
  <img src="assets/two-level-paging-architecture.svg" alt="Two-Level Paging Architecture Diagram" width="100%">
</p>

### Decision Logic Flowchart

The following flowchart describes the hardware and operating system decision steps during each translation:

<p align="center">
  <img src="assets/translation-flowchart.svg" alt="Address Translation Decision Flowchart" width="100%">
</p>

---

## ⏱️ Memory Access Timing & EAT Formulas

### Timing Parameters (Default)

| Parameter | Symbol | Default Value | Description |
| :--- | :---: | :---: | :--- |
| **TLB Lookup Time** | $T_{\text{TLB}}$ | **10 ns** | Time required to query the associative TLB cache |
| **Physical Memory Latency** | $T_{\text{mem}}$ | **100 ns** | Latency for reading one word or PTE from main RAM |
| **Page Fault Service Penalty** | $T_{\text{fault}}$ | **8,000,000 ns** (8 ms) | Disk I/O, interrupt context switch, and frame allocation |

---

### Access Path Latencies

1. **TLB Hit**:
   $$\text{Access Time} = T_{\text{TLB}} + T_{\text{mem}} = 10\,\text{ns} + 100\,\text{ns} = \mathbf{110\,\text{ns}}$$
   *(TLB produces PFN immediately; memory access fetches data).*

2. **TLB Miss, Page Table Hit (Page Resident in RAM)**:
   $$\text{Access Time} = T_{\text{TLB}} + 2 \cdot T_{\text{mem}} + T_{\text{mem}} = 10\,\text{ns} + 200\,\text{ns} + 100\,\text{ns} = \mathbf{310\,\text{ns}}$$
   *(TLB lookup + Page Directory read + Page Table read + Target Data read).*

3. **Page Fault (Page on Secondary Disk)**:
   $$\text{Access Time} = T_{\text{TLB}} + 2 \cdot T_{\text{mem}} + T_{\text{fault}} + T_{\text{mem}} = 10\,\text{ns} + 200\,\text{ns} + 8,000,000\,\text{ns} + 100\,\text{ns} = \mathbf{8,000,310\,\text{ns}}$$
   *(TLB lookup + 2 PT walks + OS interrupt service routine + frame allocation/disk fetch + Data read).*

---

### Effective Access Time (EAT)

Given:
- $h$ = TLB Hit Ratio ($0 \le h \le 1$)
- $m$ = Page Hit Ratio when TLB misses ($0 \le m \le 1$)
- $f = 1 - m$ = Page Fault Ratio

$$\text{EAT} = h \cdot (T_{\text{TLB}} + T_{\text{mem}}) + (1 - h) \cdot \Big[ m \cdot (T_{\text{TLB}} + 2 \cdot T_{\text{mem}} + T_{\text{mem}}) + (1 - m) \cdot (T_{\text{TLB}} + 2 \cdot T_{\text{mem}} + T_{\text{fault}} + T_{\text{mem}}) \Big]$$

---

## 🖥️ Interactive Web Simulator UI

The web application contains 5 dedicated tabs designed for classroom exploration and systems debugging:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ◫ Two-Level Paging + TLB Simulator                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Simulation] [Visual Diagram] [Page Tables] [TLB Cache] [Analytics/Results] │
│ Call History: [⏮ First] [◀ Prev] 4 / 4 LATEST [Next ▶] [⏭ Latest]           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Simulation View
- **Address Input**: Enter hexadecimal (`0x00012345`) or decimal (`74565`) addresses. Supports typing `demo` to trigger an automated batch sequence.
- **Queue Pipeline**: Queue multiple addresses and step through them sequentially (`Step Queue`) or run them all at once (`Run All`).
- **Translation Result Banner**: Visualizes whether the address was a **TLB Hit**, **TLB Miss**, or **Page Fault**, detailing the directory index, table index, offset, VPN, frame number, physical address, and nanosecond timing.
- **Access Log Table**: Displays a running table of all translations with badges. **Clicking any row** jumps the UI to that specific historical state.

### 2. Visual Diagram Tab
- Recreates the hardware layout featuring:
  - **Virtual Address Card**: Decomposition into Directory (10 bits), Table (10 bits), and Offset (12 bits).
  - **7-Step Pipeline Timeline**: Step 1 (CPU memory request) through Step 7 (Physical RAM access).
  - **Hardware Flow Track**: Visual blocks for CPU $\to$ TLB (LRU) $\to$ Page Directory (Level 1) $\to$ Page Table (Level 2) $\to$ Frame Table $\to$ Physical Memory Stack.
  - **Dedicated In-Tab Stepper**: Step through previous and next calls directly from the diagram header.

### 3. Page Tables & Physical Memory Grid
- **Directory Tree**: Visualizes each resident Page Directory Entry (PDE) and its allocated secondary Page Table entries (PTEs).
- **Physical Memory Frames Grid**: Displays all 8 physical frames, highlighting occupied frames, free frames, and the **FIFO replacement order** tag (*Oldest / FIFO Next*).

### 4. TLB Detailed Cache Inspector
- Inspects all 4 TLB slots with slot indexes, virtual page numbers, physical frame numbers, valid bits, and **MRU (Top)** / **LRU (Victim)** tags.

### 5. Analytics & Results Report
- Summarizes EAT, hit rate, and fault rate alongside a clean terminal-style summary report ready to copy to clipboard or export to CSV.

---

## ⏮️ Call History & Stepper Controls

Navigate through previous and current calls using either the UI buttons or keyboard shortcuts:

| Control | Location | Description |
| :--- | :---: | :--- |
| **`⏮ First`** | Top Toolbar | Jumps to Call #1 (oldest translation). |
| **`◀ Prev`** | Top Toolbar & Visual Banner | Steps back to the previous translation call. |
| **`Next ▶`** | Top Toolbar & Visual Banner | Steps forward to the next translation call. |
| **`⏭ Latest`** | Top Toolbar & Visual Banner | Jumps directly to the most recent translation. |
| **Click Table Row** | Access Log Table | Directly inspects any clicked access call. |
| **`[` or `ArrowLeft`** | Keyboard Shortcut | Step back to previous call. |
| **`]` or `ArrowRight`** | Keyboard Shortcut | Step forward to next call. |
| **`Home`** | Keyboard Shortcut | Jump to first call. |
| **`End`** | Keyboard Shortcut | Jump to latest call. |

---

## 🐍 Python CLI Simulator

A Python reference implementation is provided in [`paging_tlb_simulator.py`](paging_tlb_simulator.py).

### Running the Python CLI

```bash
python paging_tlb_simulator.py
```

### CLI Interactive Commands

- Enter an address: `0x12345` or `74565`
- Run built-in demo: `demo`
- Print statistics report: `stats`
- Reset simulator: `reset`
- Quit simulator: `q`

### Sample CLI Output

```text
==============================================================
SIMULATION SUMMARY
==============================================================
Virtual address accesses : 4
TLB hits                 : 2
TLB misses               : 2
TLB hit rate             : 50.00%
TLB miss rate            : 50.00%
Page faults              : 2
Page-fault rate          : 50.00%
Page-table walks         : 2
Resident pages           : 3
Average access time (EAT) : 4,000,110 ns (4.000110 ms)

Timing assumptions:
  TLB lookup              : 10 ns
  Memory access           : 100 ns
  Page-fault service      : 8,000,000 ns
==============================================================
```

---

## 🚀 Quick Start & Installation

### Option 1: Run the Web Simulator Locally

No build tools or package managers required. Simply open `index.html` in any browser or launch a local HTTP server:

```bash
# Clone the repository
git clone https://github.com/valiantProgrammer/Two-Level-Paging.git
cd Two-Level-Paging

# Launch local server using Python (recommended)
python -m http.server 8080
```

Open your browser and navigate to:
```
http://localhost:8080/index.html
```

---

### Option 2: Push Local Repository to GitHub

If you are setting up the repository from scratch:

```bash
# Initialize git if not already done
git init

# Add remote origin
git remote add origin https://github.com/valiantProgrammer/Two-Level-Paging.git
git branch -M main

# Stage and commit files
git add .
git commit -m "feat: complete Two-Level Paging + TLB simulator with visual flowchart, call history, and SVGs"

# Push to GitHub
git push -u origin main
```

---

## 📂 Project Structure

```
Two-Level-Paging/
├── assets/
│   ├── banner.svg                         # Project hero header banner
│   ├── two-level-paging-architecture.svg  # Complete 32-bit hardware pipeline diagram
│   └── translation-flowchart.svg          # Decision logic and page fault flowchart
├── index.html                             # Web application markup & 5-tab workspace
├── styles.css                             # Cyber-dark design system & responsive layout
├── simulator.js                           # Core simulation engine, snapshots & UI controllers
├── paging_tlb_simulator.py                # Standalone Python CLI simulator reference
└── README.md                              # Project documentation & reference manual
```

---

## 📚 Educational Context & References

This simulator implements concepts covered in computer architecture and operating systems curricula:

- **Silberschatz, Galvin, Gagne**: *Operating System Concepts* (10th Edition) — Chapter 9: Main Memory & Chapter 10: Virtual Memory.
- **Arpaci-Dusseau & Arpaci-Dusseau**: *Operating Systems: Three Easy Pieces (OSTEP)* — Paging: Introduction, Translation-Lookaside Buffers, and Multi-Level Page Tables.
- **Intel 64 and IA-32 Architectures Software Developer’s Manual**: Volume 3A: System Programming Guide — Chapter 4: Paging (32-Bit Paging Mode).

---

## 📄 License & Authors

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.

Developed with ❤️ by **[valiantProgrammer](https://github.com/valiantProgrammer)** for Operating Systems and Computer Systems education. Contributions and feedback are welcome!
