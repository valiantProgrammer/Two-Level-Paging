/**
 * Two-Level Paging + TLB Simulator
 * Complete Interactive Implementation in Vanilla JS
 * Matching Python core logic in paging_tlb_simulator.py
 */

class PagingTLBSimulator {
  constructor(config = {}) {
    this.addressBits = config.addressBits || 32;
    this.pageSize = config.pageSize || 4096; // 4 KiB
    this.offsetBits = Math.round(Math.log2(this.pageSize));
    this.tableBits = config.tableBits || 10;
    this.dirBits = this.addressBits - this.offsetBits - this.tableBits; // default 10

    this.frameCapacity = config.frameCapacity || 8;
    this.tlbCapacity = config.tlbCapacity || 4;

    this.tlbTime = config.tlbTime || 10;
    this.memTime = config.memTime || 100;
    this.pfTime = config.pfTime || 8000000;

    this.reset();
  }

  reset() {
    // Two-level hierarchical page table: dirIndex -> { tableIndex: frameNumber }
    this.pageDirectory = new Map();

    // TLB: VPN -> frameNumber (Map maintains insertion order for LRU)
    this.tlb = new Map();

    // Physical Frames Management
    // Initially frames 0 to frameCapacity-1 are free.
    // However, to match the sample demo frames starting at 3 if desired, we can order 0..capacity-1
    this.freeFrames = [];
    for (let i = 0; i < this.frameCapacity; i++) {
      this.freeFrames.push(i);
    }

    // Resident pages FIFO queue: stores VPNs
    this.fifoPages = [];
    // Map: VPN -> frameNumber
    this.vpnToFrame = new Map();

    // Statistics
    this.accesses = 0;
    this.tlbHits = 0;
    this.tlbMisses = 0;
    this.pageFaults = 0;
    this.pageWalks = 0;
    this.totalAccessTimeNs = 0;

    // Full Access History
    this.history = [];
    this.lastResult = null;
  }

  splitAddress(virtualAddress) {
    const offsetMask = (1 << this.offsetBits) - 1;
    const tableMask = (1 << this.tableBits) - 1;
    const dirMask = (1 << this.dirBits) - 1;

    // Use BigInt or 32-bit unsigned shifts
    const uva = virtualAddress >>> 0;
    const offset = uva & offsetMask;
    const tableIndex = (uva >>> this.offsetBits) & tableMask;
    const dirIndex = (uva >>> (this.offsetBits + this.tableBits)) & dirMask;
    const vpn = uva >>> this.offsetBits;

    return { dirIndex, tableIndex, offset, vpn };
  }

  pageTableLookup(dirIndex, tableIndex) {
    if (!this.pageDirectory.has(dirIndex)) return null;
    const table = this.pageDirectory.get(dirIndex);
    if (!table.has(tableIndex)) return null;
    return table.get(tableIndex);
  }

  setPageTableEntry(dirIndex, tableIndex, frame) {
    if (!this.pageDirectory.has(dirIndex)) {
      this.pageDirectory.set(dirIndex, new Map());
    }
    this.pageDirectory.get(dirIndex).set(tableIndex, frame);
  }

  removePageTableEntry(vpn) {
    const dirIndex = vpn >>> this.tableBits;
    const tableIndex = vpn & ((1 << this.tableBits) - 1);
    if (this.pageDirectory.has(dirIndex)) {
      const table = this.pageDirectory.get(dirIndex);
      table.delete(tableIndex);
      if (table.size === 0) {
        this.pageDirectory.delete(dirIndex);
      }
    }
  }

  allocateFrame(vpn) {
    let evictedVpn = null;
    let frame;

    if (this.freeFrames.length > 0) {
      frame = this.freeFrames.shift();
    } else {
      // FIFO eviction: evict the page that arrived first
      evictedVpn = this.fifoPages.shift();
      frame = this.vpnToFrame.get(evictedVpn);
      this.vpnToFrame.delete(evictedVpn);
      this.removePageTableEntry(evictedVpn);
      this.tlb.delete(evictedVpn);
    }

    this.vpnToFrame.set(vpn, frame);
    this.fifoPages.push(vpn);
    return { frame, evictedVpn };
  }

  translate(virtualAddress) {
    const uva = virtualAddress >>> 0;
    this.accesses++;

    const { dirIndex, tableIndex, offset, vpn } = this.splitAddress(uva);

    const isTlbHit = this.tlb.has(vpn);
    let isPageFault = false;
    let evictedVpn = null;
    let frame = null;
    let accessTime = 0;
    let breakdownNote = '';

    if (isTlbHit) {
      this.tlbHits++;
      frame = this.tlb.get(vpn);
      // Mark as MRU in Map: delete and re-insert
      this.tlb.delete(vpn);
      this.tlb.set(vpn, frame);

      accessTime = this.tlbTime + this.memTime;
      breakdownNote = `(TLB Hit: ${this.tlbTime} ns + Memory: ${this.memTime} ns)`;
    } else {
      this.tlbMisses++;
      this.pageWalks++;

      frame = this.pageTableLookup(dirIndex, tableIndex);

      if (frame === null || frame === undefined) {
        isPageFault = true;
        this.pageFaults++;
        const alloc = this.allocateFrame(vpn);
        frame = alloc.frame;
        evictedVpn = alloc.evictedVpn;
        this.setPageTableEntry(dirIndex, tableIndex, frame);

        // Page fault access time calculation matching screenshot
        // TLB lookup (10) + Memory access (100) + Fault service (8,000,000) = 8,000,110 ns
        accessTime = this.tlbTime + this.memTime + this.pfTime;
        breakdownNote = `(TLB: ${this.tlbTime} ns + Mem: ${this.memTime} ns + Fault: ${this.pfTime.toLocaleString()} ns)`;
      } else {
        // TLB Miss, Page Table Hit
        accessTime = this.tlbTime + 2 * this.memTime + this.memTime; // 2 page walks + 1 data access
        breakdownNote = `(TLB: ${this.tlbTime} ns + 2×PT Walks: ${2 * this.memTime} ns + Mem: ${this.memTime} ns)`;
      }

      // Add to TLB
      this.tlb.set(vpn, frame);
      // If exceeds capacity, remove LRU (first key in Map)
      if (this.tlb.size > this.tlbCapacity) {
        const lruVpn = this.tlb.keys().next().value;
        this.tlb.delete(lruVpn);
      }
    }

    const physicalAddress = ((frame << this.offsetBits) | offset) >>> 0;
    this.totalAccessTimeNs += accessTime;

    const result = {
      index: this.accesses,
      virtualAddress: uva,
      dirIndex,
      tableIndex,
      offset,
      vpn,
      frame,
      physicalAddress,
      tlbHit: isTlbHit,
      pageFault: isPageFault,
      evictedVpn,
      accessTime,
      breakdownNote,
      tlbSnapshot: Array.from(this.tlb.entries()),
      pageDirectorySnapshot: new Map(
        Array.from(this.pageDirectory.entries()).map(([d, t]) => [d, new Map(t)])
      ),
      vpnToFrameSnapshot: new Map(this.vpnToFrame),
      fifoPagesSnapshot: [...this.fifoPages],
    };

    this.lastResult = result;
    this.history.push(result);
    return result;
  }

  getStatistics() {
    const accesses = this.accesses;
    const hitRate = accesses > 0 ? (this.tlbHits / accesses) * 100 : 0;
    const missRate = accesses > 0 ? (this.tlbMisses / accesses) * 100 : 0;
    const faultRate = accesses > 0 ? (this.pageFaults / accesses) * 100 : 0;
    const eat = accesses > 0 ? Math.round(this.totalAccessTimeNs / accesses) : 0;

    return {
      accesses,
      tlbHits: this.tlbHits,
      tlbMisses: this.tlbMisses,
      pageFaults: this.pageFaults,
      hitRate,
      missRate,
      faultRate,
      eat,
    };
  }

  generateTextReport() {
    const stats = this.getStatistics();
    if (stats.accesses === 0) return 'No address accesses simulated yet.';

    const divider = '='.repeat(62);
    return `${divider}
SIMULATION SUMMARY
${divider}
Virtual address accesses : ${stats.accesses}
TLB hits                 : ${stats.tlbHits}
TLB misses               : ${stats.tlbMisses}
TLB hit rate             : ${stats.hitRate.toFixed(2)}%
TLB miss rate            : ${stats.missRate.toFixed(2)}%
Page faults              : ${stats.pageFaults}
Page-fault rate          : ${stats.faultRate.toFixed(2)}%
Page-table walks         : ${this.pageWalks}
Resident pages           : ${this.vpnToFrame.size}
Average access time (EAT) : ${stats.eat.toLocaleString()} ns (${(stats.eat / 1e6).toFixed(6)} ms)

Timing assumptions:
  TLB lookup              : ${this.tlbTime.toLocaleString()} ns
  Memory access           : ${this.memTime.toLocaleString()} ns
  Page-fault service      : ${this.pfTime.toLocaleString()} ns
${divider}`;
  }
}

/* ==========================================================================
   UI Controller & Event Binding
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Simulator Instance
  let sim = new PagingTLBSimulator();

  // Address Queue
  let addressQueue = [];

  // DOM Elements - Inputs & Configuration
  const cfgPageSize = document.getElementById('cfg-page-size');
  const cfgDirBits = document.getElementById('cfg-dir-bits');
  const cfgTblBits = document.getElementById('cfg-tbl-bits');
  const cfgOffsetBits = document.getElementById('cfg-offset-bits');
  const cfgTlbCap = document.getElementById('cfg-tlb-cap');
  const cfgPhysFrames = document.getElementById('cfg-phys-frames');
  const cfgTimeTlb = document.getElementById('cfg-time-tlb');
  const cfgTimeMem = document.getElementById('cfg-time-mem');
  const cfgTimePf = document.getElementById('cfg-time-pf');
  const btnApplySettings = document.getElementById('btn-apply-settings');

  // Input & Action Buttons
  const inputVa = document.getElementById('input-va');
  const btnTranslate = document.getElementById('btn-translate');
  const btnAddQueue = document.getElementById('btn-add-queue');
  const btnDemoInput = document.getElementById('btn-demo-input');
  const btnTopDemo = document.getElementById('btn-top-demo');
  const btnTopReset = document.getElementById('btn-top-reset');
  const btnTopAbout = document.getElementById('btn-top-about');

  // Queue Elements
  const queueContainer = document.getElementById('queue-container');
  const queueCount = document.getElementById('queue-count');
  const queueChips = document.getElementById('queue-chips');
  const btnQueueStep = document.getElementById('btn-queue-step');
  const btnQueueRun = document.getElementById('btn-queue-run');
  const btnQueueClear = document.getElementById('btn-queue-clear');

  // Result Banner Elements
  const resVa = document.getElementById('res-va');
  const resStatusBadge = document.getElementById('res-status-badge');
  const resBadgeText = document.getElementById('res-badge-text');
  const resDir = document.getElementById('res-dir');
  const resTable = document.getElementById('res-table');
  const resOffset = document.getElementById('res-offset');
  const resVpn = document.getElementById('res-vpn');
  const resFrame = document.getElementById('res-frame');
  const resPa = document.getElementById('res-pa');
  const resTimeTotal = document.getElementById('res-time-total');
  const resTimeBreakdown = document.getElementById('res-time-breakdown');
  const resEvictionNotice = document.getElementById('res-eviction-notice');

  // Address Breakdown Elements
  const lblDirBits = document.getElementById('lbl-dir-bits');
  const lblTblBits = document.getElementById('lbl-tbl-bits');
  const lblOffBits = document.getElementById('lbl-off-bits');
  const blockDirVal = document.getElementById('block-dir-val');
  const blockTblVal = document.getElementById('block-tbl-val');
  const blockOffVal = document.getElementById('block-off-val');

  // Page Table Flow Elements
  const pdEntryText = document.getElementById('pd-entry-text');
  const ptNodeTitle = document.getElementById('pt-node-title');
  const ptEntryText = document.getElementById('pt-entry-text');

  // Access Log
  const accessLogBody = document.getElementById('access-log-body');
  const btnClearLog = document.getElementById('btn-clear-log');
  const btnExportCsv = document.getElementById('btn-export-csv');

  // Sidebar Statistics
  const statTotalAccesses = document.getElementById('stat-total-accesses');
  const statTlbHits = document.getElementById('stat-tlb-hits');
  const statTlbMisses = document.getElementById('stat-tlb-misses');
  const statPageFaults = document.getElementById('stat-page-faults');
  const statHitRate = document.getElementById('stat-hit-rate');
  const statEat = document.getElementById('stat-eat');

  // Donut Chart Elements
  const donutHits = document.getElementById('donut-hits');
  const donutMisses = document.getElementById('donut-misses');
  const donutFaults = document.getElementById('donut-faults');
  const donutCenterCount = document.getElementById('donut-center-count');
  const legHitsPct = document.getElementById('leg-hits-pct');
  const legMissesPct = document.getElementById('leg-misses-pct');
  const legFaultsPct = document.getElementById('leg-faults-pct');

  // Sidebar TLB Table
  const sidebarTlbBody = document.getElementById('sidebar-tlb-body');

  // Tab 2, 3, 4 Containers
  const ptDirectoryTree = document.getElementById('pt-directory-tree');
  const framesGrid = document.getElementById('frames-grid');
  const tlbDetCap = document.getElementById('tlb-det-cap');
  const tlbDetCount = document.getElementById('tlb-det-count');
  const tlbDetailedBody = document.getElementById('tlb-detailed-body');
  const resTabEat = document.getElementById('res-tab-eat');
  const resTabHitrate = document.getElementById('res-tab-hitrate');
  const resTabFaultrate = document.getElementById('res-tab-faultrate');
  const textReportOutput = document.getElementById('text-report-output');
  const btnCopyReport = document.getElementById('btn-copy-report');

  // History Playback Elements (Top Global Toolbar)
  const btnHistFirst = document.getElementById('btn-hist-first');
  const btnHistPrev = document.getElementById('btn-hist-prev');
  const btnHistNext = document.getElementById('btn-hist-next');
  const btnHistLast = document.getElementById('btn-hist-last');
  const histCurCall = document.getElementById('hist-cur-call');
  const histTotCall = document.getElementById('hist-tot-call');
  const histLiveTag = document.getElementById('hist-live-tag');
  const resCallNum = document.getElementById('res-call-num');

  // Visual Tab Call Stepper Elements
  const btnVhistPrev = document.getElementById('btn-vhist-prev');
  const btnVhistNext = document.getElementById('btn-vhist-next');
  const btnVhistLast = document.getElementById('btn-vhist-last');
  const vhistStepText = document.getElementById('vhist-step-text');

  // History Inspection State (0-indexed into sim.history)
  let currentInspectedIndex = -1;

  function inspectCall(index) {
    if (!sim.history || sim.history.length === 0) {
      currentInspectedIndex = -1;
      renderUI();
      return;
    }
    currentInspectedIndex = Math.max(0, Math.min(index, sim.history.length - 1));
    renderUI();
  }

  // Modal
  const modalAbout = document.getElementById('modal-about');
  const modalClose = document.getElementById('modal-close');
  const modalGotit = document.getElementById('modal-gotit');

  // Helper formatting functions
  function formatHex(num, digits = 8) {
    if (num === null || num === undefined) return '—';
    return '0x' + num.toString(16).toUpperCase().padStart(digits, '0');
  }

  function formatShortHex(num) {
    if (num === null || num === undefined) return '—';
    return '0x' + num.toString(16).toUpperCase();
  }

  function parseInputAddress(val) {
    const clean = val.trim();
    if (!clean) return null;
    let parsed;
    if (clean.toLowerCase().startsWith('0x')) {
      parsed = parseInt(clean, 16);
    } else {
      parsed = parseInt(clean, 10);
    }
    if (isNaN(parsed) || parsed < 0 || parsed > 0xffffffff) {
      throw new Error('Please enter a valid 32-bit address (0 to 0xFFFFFFFF).');
    }
    return parsed;
  }

  // Update Bit Allocation Labels in Configuration & Breakdown
  function updateBitAllocations() {
    const pageSize = parseInt(cfgPageSize.value, 10);
    const offsetBits = Math.round(Math.log2(pageSize));
    cfgOffsetBits.value = offsetBits;

    const tblBits = parseInt(cfgTblBits.value, 10) || 10;
    const dirBits = 32 - offsetBits - tblBits;
    cfgDirBits.value = dirBits;

    lblDirBits.textContent = `${dirBits} bits`;
    lblTblBits.textContent = `${tblBits} bits`;
    lblOffBits.textContent = `${offsetBits} bits`;

    // Bit indices
    document.getElementById('idx-31').textContent = '31';
    document.getElementById('idx-22').textContent = (32 - dirBits).toString();
    document.getElementById('idx-21').textContent = (32 - dirBits - 1).toString();
    document.getElementById('idx-12').textContent = offsetBits.toString();
    document.getElementById('idx-11').textContent = (offsetBits - 1).toString();
    document.getElementById('idx-0').textContent = '0';
  }

  // Update History Toolbar and Visual Stepper buttons/labels
  function updateHistoryControls() {
    const total = sim.history.length;
    const cur1 = currentInspectedIndex >= 0 ? currentInspectedIndex + 1 : 0;
    const isLatest = total > 0 && currentInspectedIndex === total - 1;
    const isFirst = total > 0 && currentInspectedIndex === 0;

    if (histCurCall) histCurCall.textContent = total > 0 ? cur1 : 0;
    if (histTotCall) histTotCall.textContent = total;

    if (histLiveTag) {
      if (total === 0) {
        histLiveTag.textContent = 'Empty';
        histLiveTag.className = 'hist-tag';
      } else if (isLatest) {
        histLiveTag.textContent = 'Latest';
        histLiveTag.className = 'hist-tag live';
      } else {
        const delta = total - 1 - currentInspectedIndex;
        histLiveTag.textContent = `Past (-${delta})`;
        histLiveTag.className = 'hist-tag historical';
      }
    }

    if (btnHistFirst) btnHistFirst.disabled = (total <= 1 || isFirst);
    if (btnHistPrev) btnHistPrev.disabled = (total <= 1 || isFirst);
    if (btnHistNext) btnHistNext.disabled = (total <= 1 || isLatest);
    if (btnHistLast) btnHistLast.disabled = (total <= 1 || isLatest);

    // Visual diagram stepper in tab 2
    if (vhistStepText) {
      if (total === 0) {
        vhistStepText.textContent = 'No calls yet';
      } else {
        vhistStepText.textContent = `Call ${cur1} of ${total} ${isLatest ? '(Latest)' : ''}`;
      }
    }
    if (btnVhistPrev) btnVhistPrev.disabled = (total <= 1 || isFirst);
    if (btnVhistNext) btnVhistNext.disabled = (total <= 1 || isLatest);
    if (btnVhistLast) btnVhistLast.disabled = (total <= 1 || isLatest);
  }

  // Render All UI Views
  function renderUI() {
    const stats = sim.getStatistics();
    const hasHistory = sim.history && sim.history.length > 0;

    if (hasHistory) {
      if (currentInspectedIndex < 0 || currentInspectedIndex >= sim.history.length) {
        currentInspectedIndex = sim.history.length - 1;
      }
    } else {
      currentInspectedIndex = -1;
    }

    const activeResult = hasHistory && currentInspectedIndex >= 0
      ? sim.history[currentInspectedIndex]
      : sim.lastResult;

    // 1. Render Translation Result Banner for Active/Inspected Call
    if (activeResult) {
      if (resCallNum) {
        resCallNum.textContent = `Call #${activeResult.index}`;
      }
      resVa.textContent = formatHex(activeResult.virtualAddress, 8);
      resDir.textContent = `${formatShortHex(activeResult.dirIndex)} (${activeResult.dirIndex})`;
      resTable.textContent = `${formatShortHex(activeResult.tableIndex)} (${activeResult.tableIndex})`;
      resOffset.textContent = `${formatShortHex(activeResult.offset)} (${activeResult.offset})`;
      resVpn.textContent = `${formatShortHex(activeResult.vpn)} (${activeResult.vpn})`;
      resFrame.textContent = `${formatShortHex(activeResult.frame)} (${activeResult.frame})`;
      resPa.textContent = formatHex(activeResult.physicalAddress, 8);

      resTimeTotal.textContent = `${activeResult.accessTime.toLocaleString()} ns`;
      resTimeBreakdown.textContent = activeResult.breakdownNote;

      if (activeResult.evictedVpn !== null) {
        resEvictionNotice.textContent = `Evicted VPN: ${formatShortHex(activeResult.evictedVpn)}`;
        resEvictionNotice.classList.remove('hidden');
      } else {
        resEvictionNotice.classList.add('hidden');
      }

      // Status Badge
      resStatusBadge.className = 'banner-status-badge';
      if (activeResult.tlbHit) {
        resStatusBadge.classList.add('hit');
        resBadgeText.textContent = 'TLB Hit ✓';
      } else if (activeResult.pageFault) {
        resStatusBadge.classList.add('fault');
        resBadgeText.textContent = 'Page Fault ⚠';
      } else {
        resStatusBadge.classList.add('miss');
        resBadgeText.textContent = 'TLB Miss';
      }

      // Breakdown card values
      blockDirVal.textContent = formatShortHex(activeResult.dirIndex);
      blockTblVal.textContent = formatShortHex(activeResult.tableIndex);
      blockOffVal.textContent = formatShortHex(activeResult.offset);

      // Two-Level Page Table visual
      pdEntryText.textContent = `${formatShortHex(activeResult.dirIndex)} → PT${activeResult.dirIndex}`;
      ptNodeTitle.textContent = `Page Table (PT${activeResult.dirIndex})`;
      ptEntryText.textContent = `${formatShortHex(activeResult.tableIndex)} → Frame ${formatShortHex(activeResult.frame)}`;
    }

    // 2. Render Access Log Table with Row Selection & Click-to-Inspect
    accessLogBody.innerHTML = '';
    sim.history.forEach((item, idx) => {
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.title = `Click to inspect Call #${item.index}`;

      if (idx === currentInspectedIndex) {
        tr.classList.add('selected-log-row');
      }

      tr.addEventListener('click', () => {
        inspectCall(idx);
      });

      const tlbBadge = item.tlbHit
        ? '<span class="badge-tag hit">Hit</span>'
        : '<span class="badge-tag miss">Miss</span>';

      const pfBadge = item.pageFault
        ? '<span class="badge-tag fault-yes">Yes</span>'
        : '<span class="badge-tag fault-no">No</span>';

      tr.innerHTML = `
        <td><strong>#${item.index}</strong></td>
        <td>${formatHex(item.virtualAddress, 8)}</td>
        <td>${formatShortHex(item.dirIndex)}</td>
        <td>${formatShortHex(item.tableIndex)}</td>
        <td>${formatShortHex(item.offset)}</td>
        <td>${formatShortHex(item.vpn)}</td>
        <td>${formatShortHex(item.frame)}</td>
        <td>${tlbBadge}</td>
        <td>${pfBadge}</td>
        <td>${item.accessTime.toLocaleString()} ns</td>
      `;
      accessLogBody.appendChild(tr);
    });

    // 3. Render Right Sidebar Statistics
    statTotalAccesses.textContent = stats.accesses;
    statTlbHits.textContent = stats.tlbHits;
    statTlbMisses.textContent = stats.tlbMisses;
    statPageFaults.textContent = stats.pageFaults;
    statHitRate.textContent = `${stats.hitRate.toFixed(2)}%`;
    statEat.textContent = `${stats.eat.toLocaleString()} ns`;

    // 4. Render Donut Chart
    const total = stats.accesses;
    donutCenterCount.textContent = total;
    const circ = 2 * Math.PI * 62; // ~389.56

    if (total === 0) {
      donutHits.setAttribute('stroke-dasharray', `0 ${circ}`);
      donutMisses.setAttribute('stroke-dasharray', `0 ${circ}`);
      donutFaults.setAttribute('stroke-dasharray', `0 ${circ}`);
      legHitsPct.textContent = '(0%)';
      legMissesPct.textContent = '(0%)';
      legFaultsPct.textContent = '(0%)';
    } else {
      const hitRatio = stats.tlbHits / total;
      const missRatio = stats.tlbMisses / total;
      const faultRatio = stats.pageFaults / total;

      const hitLength = hitRatio * circ;
      const missLength = missRatio * circ;
      const faultLength = faultRatio * circ;

      donutHits.setAttribute('stroke-dasharray', `${hitLength} ${circ}`);
      donutHits.setAttribute('stroke-dashoffset', '0');

      donutMisses.setAttribute('stroke-dasharray', `${missLength} ${circ}`);
      donutMisses.setAttribute('stroke-dashoffset', `${-hitLength}`);

      donutFaults.setAttribute('stroke-dasharray', `${faultLength} ${circ}`);
      donutFaults.setAttribute('stroke-dashoffset', `${-(hitLength + missLength)}`);

      legHitsPct.textContent = `(${Math.round(hitRatio * 100)}%)`;
      legMissesPct.textContent = `(${Math.round(missRatio * 100)}%)`;
      legFaultsPct.textContent = `(${Math.round(faultRatio * 100)}%)`;
    }

    // 5. Update Call History Toolbar Controls
    updateHistoryControls();

    // 6. Render Sidebar TLB (reflecting active call)
    renderSidebarTlb(activeResult);

    // 7. Render Detailed Views (Tabs 2, 3, 4, 5)
    renderVisualDiagram(activeResult);
    renderPageTablesTab(activeResult);
    renderDetailedTlbTab(activeResult);
    renderResultsTab(stats);
  }

  function renderVisualDiagram(activeResult) {
    const last = activeResult || sim.lastResult || {
      index: 1,
      virtualAddress: 0x00012345,
      dirIndex: 0x0,
      tableIndex: 0x12,
      offset: 0x345,
      vpn: 0x12,
      frame: 0x3,
      physicalAddress: 0x00003345,
      tlbHit: false,
      pageFault: false,
      accessTime: 110,
    };

    // Update spec pills
    const vpillVa = document.getElementById('vpill-va');
    const vpillPage = document.getElementById('vpill-page');
    const vpillSplit = document.getElementById('vpill-split');
    const vpillTlb = document.getElementById('vpill-tlb');
    const vpillFrames = document.getElementById('vpill-frames');

    if (vpillVa) vpillVa.textContent = `${sim.addressBits}-bit VA`;
    if (vpillPage) vpillPage.textContent = `${sim.pageSize / 1024} KiB Page`;
    if (vpillSplit) vpillSplit.textContent = `${sim.dirBits}-${sim.tableBits}-${sim.offsetBits}`;
    if (vpillTlb) vpillTlb.textContent = `TLB(LRU)`;
    if (vpillFrames) vpillFrames.textContent = `FIFO Frames`;

    // 1. Timeline Steps
    const vstepVa = document.getElementById('vstep-va');
    const vstepSplit = document.getElementById('vstep-split');
    const vstepTlbIcon = document.getElementById('vstep-tlb-icon');
    const vstepTlbText = document.getElementById('vstep-tlb-text');
    const vstepPde = document.getElementById('vstep-pde');
    const vstepPte = document.getElementById('vstep-pte');
    const vstepPaFormula = document.getElementById('vstep-pa-formula');
    const vstepPaVal = document.getElementById('vstep-pa-val');

    if (vstepVa) vstepVa.textContent = formatHex(last.virtualAddress, 8);
    if (vstepSplit) vstepSplit.textContent = `(${sim.dirBits}-bit Dir, ${sim.tableBits}-bit Table, ${sim.offsetBits}-bit Offset)`;

    if (vstepTlbText) vstepTlbText.textContent = last.tlbHit ? 'TLB Hit' : 'TLB Miss';
    if (vstepTlbIcon) {
      vstepTlbIcon.textContent = last.tlbHit ? '✓' : '✗';
      vstepTlbIcon.className = `status-icon-badge ${last.tlbHit ? 'hit' : 'miss'}`;
    }

    if (vstepPde) vstepPde.textContent = `PDE[${formatShortHex(last.dirIndex)}] → points to Page Table PT${last.dirIndex}`;
    if (vstepPte) vstepPte.textContent = `PTE[${formatShortHex(last.tableIndex)}] → Frame = ${formatShortHex(last.frame)} (Present)`;
    if (vstepPaFormula) vstepPaFormula.textContent = `PA = (Frame << ${sim.offsetBits}) | Offset`;
    if (vstepPaVal) vstepPaVal.textContent = formatHex(last.physicalAddress, 8);

    // 2. Top-Left: Virtual Address (32-bit)
    const vdVaPill = document.getElementById('vd-va-pill');
    const vdBitsDir = document.getElementById('vd-bits-dir');
    const vdBitsTbl = document.getElementById('vd-bits-tbl');
    const vdBitsOff = document.getElementById('vd-bits-off');
    const vdValDir = document.getElementById('vd-val-dir');
    const vdValTbl = document.getElementById('vd-val-tbl');
    const vdValOff = document.getElementById('vd-val-off');

    if (vdVaPill) vdVaPill.textContent = formatHex(last.virtualAddress, 8);
    if (vdBitsDir) vdBitsDir.textContent = `(${sim.dirBits} bits)`;
    if (vdBitsTbl) vdBitsTbl.textContent = `(${sim.tableBits} bits)`;
    if (vdBitsOff) vdBitsOff.textContent = `(${sim.offsetBits} bits)`;
    if (vdValDir) vdValDir.textContent = `${formatShortHex(last.dirIndex)} (${last.dirIndex})`;
    if (vdValTbl) vdValTbl.textContent = `${formatShortHex(last.tableIndex)} (${last.tableIndex})`;
    if (vdValOff) vdValOff.textContent = `${formatShortHex(last.offset)} (${last.offset})`;

    // 3. Top-Right: Translation Result
    const vdResVpn = document.getElementById('vd-res-vpn');
    const vdResPfn = document.getElementById('vd-res-pfn');
    const vdResPa = document.getElementById('vd-res-pa');
    const vdBadgeHit = document.getElementById('vd-badge-hit');
    const vdBadgeFault = document.getElementById('vd-badge-fault');
    const vdBadgeTime = document.getElementById('vd-badge-time');

    if (vdResVpn) vdResVpn.textContent = `${formatShortHex(last.vpn)} (${last.vpn})`;
    if (vdResPfn) vdResPfn.textContent = `${formatShortHex(last.frame)} (${last.frame})`;
    if (vdResPa) vdResPa.textContent = formatHex(last.physicalAddress, 8);

    if (vdBadgeHit) {
      vdBadgeHit.textContent = last.tlbHit ? 'Yes' : 'No';
      vdBadgeHit.className = `status-pill ${last.tlbHit ? 'hit' : 'miss'}`;
    }
    if (vdBadgeFault) {
      vdBadgeFault.textContent = last.pageFault ? 'Yes' : 'No';
      vdBadgeFault.className = `status-pill ${last.pageFault ? 'miss' : 'hit'}`;
    }
    if (vdBadgeTime) vdBadgeTime.textContent = `${last.accessTime.toLocaleString()} ns`;

    // 4. Large Diagram Track
    const vflowCpuVa = document.getElementById('vflow-cpu-va');
    if (vflowCpuVa) vflowCpuVa.textContent = `(VA: ${formatHex(last.virtualAddress, 8)})`;

    // TLB table (use historical snapshot if available)
    const vflowTlbBody = document.getElementById('vflow-tlb-body');
    const vflowTlbBadge = document.getElementById('vflow-tlb-badge');
    if (vflowTlbBody) {
      vflowTlbBody.innerHTML = '';
      const rawEntries = (last && last.tlbSnapshot)
        ? [...last.tlbSnapshot]
        : Array.from(sim.tlb.entries());
      const entries = rawEntries.reverse();
      const displayEntries = entries.length > 0 ? entries : [
        [last.vpn, last.frame],
      ];

      displayEntries.forEach(([vpn, frame]) => {
        const isMatch = vpn === last.vpn;
        const tr = document.createElement('tr');
        if (isMatch) tr.className = 'selected-row';
        tr.innerHTML = `<td>${formatShortHex(vpn)}</td><td>${formatShortHex(frame)}</td>`;
        vflowTlbBody.appendChild(tr);
      });
    }

    if (vflowTlbBadge) {
      vflowTlbBadge.textContent = last.tlbHit ? 'TLB Hit' : 'TLB Miss';
      vflowTlbBadge.className = `stage-badge-pill ${last.tlbHit ? 'hit' : 'miss'}`;
    }

    // Page Directory table
    const vflowPdBody = document.getElementById('vflow-pd-body');
    if (vflowPdBody) {
      vflowPdBody.innerHTML = `
        <tr class="selected-row"><td>${formatShortHex(last.dirIndex)}</td><td>PT${last.dirIndex}</td></tr>
        <tr><td>${formatShortHex(last.dirIndex + 1)}</td><td>PT${last.dirIndex + 1}</td></tr>
        <tr class="dim-row"><td>...</td><td>...</td></tr>
        <tr><td>0x3FF</td><td>—</td></tr>
      `;
    }

    // Page Table
    const vflowPtHeader = document.getElementById('vflow-pt-header');
    if (vflowPtHeader) {
      vflowPtHeader.innerHTML = `Page Table PT${last.dirIndex}<br><span class="stage-subtitle">(Level 2)</span>`;
    }
    const vflowPtBody = document.getElementById('vflow-pt-body');
    if (vflowPtBody) {
      vflowPtBody.innerHTML = `
        <tr><td>0x00</td><td>0x1</td><td>1</td></tr>
        <tr class="selected-row"><td>${formatShortHex(last.tableIndex)}</td><td>${formatShortHex(last.frame)}</td><td>1</td></tr>
        <tr class="dim-row"><td>...</td><td>...</td><td>...</td></tr>
        <tr><td>0x3FF</td><td>—</td><td>0</td></tr>
      `;
    }

    // Frame Table & Physical Memory Stack (using historical snapshot if available)
    const vflowFrametableBody = document.getElementById('vflow-frametable-body');
    const vflowPhysmemStack = document.getElementById('vflow-physmem-stack');

    if (vflowFrametableBody && vflowPhysmemStack) {
      vflowFrametableBody.innerHTML = '';
      vflowPhysmemStack.innerHTML = '';

      const frameToVpn = new Map();
      const srcVpnToFrame = (last && last.vpnToFrameSnapshot) ? last.vpnToFrameSnapshot : sim.vpnToFrame;
      srcVpnToFrame.forEach((f, v) => frameToVpn.set(f, v));

      for (let f = 0; f < sim.frameCapacity; f++) {
        const isSelected = f === last.frame;
        const vpn = frameToVpn.has(f) ? frameToVpn.get(f) : (isSelected ? last.vpn : null);
        const isBusy = vpn !== null;

        // Frame Table row
        const tr = document.createElement('tr');
        if (isSelected) tr.className = 'selected-row';
        tr.innerHTML = `
          <td>${f}</td>
          <td>${isBusy ? formatShortHex(vpn) : '—'}</td>
          <td>${isBusy ? 'Busy' : 'Free'}</td>
        `;
        vflowFrametableBody.appendChild(tr);

        // Memory Stack cell
        const memRow = document.createElement('div');
        memRow.className = `mem-frame-row ${isSelected ? 'active-frame' : (isBusy ? '' : 'free-frame')}`;
        memRow.innerHTML = `
          <span class="frame-tag">F${f}</span>
          <span class="frame-val">${isBusy ? 'VPN ' + formatShortHex(vpn) : 'Free'}</span>
        `;
        vflowPhysmemStack.appendChild(memRow);
      }
    }

    // Calculation banner
    const vcalcPfn = document.getElementById('vcalc-pfn');
    const vcalcOffset = document.getElementById('vcalc-offset');
    const vcalcPa = document.getElementById('vcalc-pa');

    if (vcalcPfn) vcalcPfn.textContent = formatShortHex(last.frame);
    if (vcalcOffset) vcalcOffset.textContent = formatShortHex(last.offset);
    if (vcalcPa) vcalcPa.textContent = formatHex(last.physicalAddress, 8);

    // 5. Bottom Cards
    const vsumTlb = document.getElementById('vsum-tlb');
    const vsumFault = document.getElementById('vsum-fault');
    const vsumTime = document.getElementById('vsum-time');

    if (vsumTlb) {
      vsumTlb.textContent = last.tlbHit ? 'Yes' : 'No';
      vsumTlb.className = `status-pill ${last.tlbHit ? 'hit' : 'miss'}`;
    }
    if (vsumFault) {
      vsumFault.textContent = last.pageFault ? 'Yes' : 'No';
      vsumFault.className = `status-pill ${last.pageFault ? 'miss' : 'hit'}`;
    }
    if (vsumTime) vsumTime.textContent = `${last.accessTime.toLocaleString()} ns`;
  }

  function renderSidebarTlb(activeResult) {
    sidebarTlbBody.innerHTML = '';
    const targetResult = activeResult || sim.lastResult;
    const rawEntries = (targetResult && targetResult.tlbSnapshot)
      ? [...targetResult.tlbSnapshot]
      : Array.from(sim.tlb.entries());
    const entries = rawEntries.reverse(); // Now MRU is index 0

    if (entries.length === 0) {
      sidebarTlbBody.innerHTML = '<tr><td colspan="2" class="empty-cell">— Empty —</td></tr>';
      return;
    }

    entries.forEach(([vpn, frame], idx) => {
      const tr = document.createElement('tr');
      const isMru = idx === 0;
      const mruBadge = isMru ? '<span class="tlb-mru-tag">(MRU)</span>' : '';
      if (targetResult && targetResult.vpn === vpn) {
        tr.classList.add('selected-row');
      }
      tr.innerHTML = `
        <td>${formatShortHex(vpn)}</td>
        <td>${formatShortHex(frame)} ${mruBadge}</td>
      `;
      sidebarTlbBody.appendChild(tr);
    });

    // Fill remaining capacity slots with (Empty) if desired like screenshot
    const remaining = sim.tlbCapacity - entries.length;
    for (let i = 0; i < remaining; i++) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color: var(--text-muted);">—</td>
        <td style="color: var(--text-muted);">(Empty)</td>
      `;
      sidebarTlbBody.appendChild(tr);
    }
  }

  function renderPageTablesTab(activeResult) {
    // 1. Directory Tree
    ptDirectoryTree.innerHTML = '';
    const targetResult = activeResult || sim.lastResult;
    const pageDirMap = (targetResult && targetResult.pageDirectorySnapshot)
      ? targetResult.pageDirectorySnapshot
      : sim.pageDirectory;

    if (pageDirMap.size === 0) {
      ptDirectoryTree.innerHTML = '<div class="text-secondary font-sm">No page tables allocated yet. Run a translation to populate.</div>';
    } else {
      pageDirMap.forEach((table, dirIdx) => {
        const pdCard = document.createElement('div');
        pdCard.className = 'pd-entry-card';

        const chips = [];
        table.forEach((frame, tblIdx) => {
          const isCurrent = targetResult && targetResult.dirIndex === dirIdx && targetResult.tableIndex === tblIdx;
          const highlightClass = isCurrent ? 'active-highlight' : '';
          chips.push(`
            <div class="pt-subentry-chip ${highlightClass}">
              <span class="text-secondary font-sm">Tbl Idx: ${formatShortHex(tblIdx)}</span>
              <span style="color: #34d399; font-weight:700;">Frame ${formatShortHex(frame)}</span>
            </div>
          `);
        });

        pdCard.innerHTML = `
          <div class="pd-entry-header">
            <span class="pd-title">Page Directory Index ${formatShortHex(dirIdx)} (${dirIdx})</span>
            <span class="text-secondary font-sm">${table.size} resident Page Table Entries</span>
          </div>
          <div class="pt-subentries-grid">
            ${chips.join('')}
          </div>
        `;
        ptDirectoryTree.appendChild(pdCard);
      });
    }

    // 2. Physical Memory Frames
    framesGrid.innerHTML = '';
    const frameToVpn = new Map();
    const vpnToFrameSrc = (targetResult && targetResult.vpnToFrameSnapshot)
      ? targetResult.vpnToFrameSnapshot
      : sim.vpnToFrame;
    const fifoSrc = (targetResult && targetResult.fifoPagesSnapshot)
      ? targetResult.fifoPagesSnapshot
      : sim.fifoPages;

    vpnToFrameSrc.forEach((frame, vpn) => {
      frameToVpn.set(frame, vpn);
    });

    for (let f = 0; f < sim.frameCapacity; f++) {
      const isOccupied = frameToVpn.has(f);
      const vpn = isOccupied ? frameToVpn.get(f) : null;
      const isCurrentAccess = targetResult && targetResult.frame === f;

      const cell = document.createElement('div');
      cell.className = `frame-cell ${isOccupied ? 'occupied' : 'free'} ${isCurrentAccess ? 'current-access' : ''}`;

      let fifoIndexText = '';
      if (isOccupied) {
        const order = fifoSrc.indexOf(vpn);
        fifoIndexText = order === 0 ? 'Oldest (FIFO Next)' : `Order: #${order + 1}`;
      }

      cell.innerHTML = `
        <div class="frame-num">Frame ${formatShortHex(f)}</div>
        <div class="frame-vpn">${isOccupied ? formatShortHex(vpn) : 'Free'}</div>
        <div class="frame-fifo-tag">${isOccupied ? fifoIndexText : 'Available'}</div>
      `;
      framesGrid.appendChild(cell);
    }
  }

  function renderDetailedTlbTab(activeResult) {
    const targetResult = activeResult || sim.lastResult;
    const rawEntries = (targetResult && targetResult.tlbSnapshot)
      ? [...targetResult.tlbSnapshot]
      : Array.from(sim.tlb.entries());
    const entries = rawEntries.reverse(); // MRU first

    tlbDetCap.textContent = sim.tlbCapacity;
    tlbDetCount.textContent = entries.length;

    tlbDetailedBody.innerHTML = '';

    for (let slot = 0; slot < sim.tlbCapacity; slot++) {
      const tr = document.createElement('tr');
      if (slot < entries.length) {
        const [vpn, frame] = entries[slot];
        const isMru = slot === 0;
        const isLru = slot === entries.length - 1;
        const statusBadge = isMru
          ? '<span class="badge-tag hit">MRU (Top)</span>'
          : isLru
          ? '<span class="badge-tag miss">LRU (Victim)</span>'
          : '<span class="badge-tag" style="background: rgba(255,255,255,0.06); color:#cbd5e1;">Active</span>';

        if (targetResult && targetResult.vpn === vpn) {
          tr.classList.add('selected-row');
        }

        tr.innerHTML = `
          <td>Slot ${slot}</td>
          <td>${formatShortHex(vpn)}</td>
          <td>${vpn}</td>
          <td style="color:#34d399; font-weight:700;">${formatShortHex(frame)}</td>
          <td>${statusBadge}</td>
          <td><span style="color:#34d399; font-weight:700;">1 (Valid)</span></td>
        `;
      } else {
        tr.innerHTML = `
          <td>Slot ${slot}</td>
          <td style="color:var(--text-muted);">—</td>
          <td style="color:var(--text-muted);">—</td>
          <td style="color:var(--text-muted);">—</td>
          <td><span class="badge-tag fault-no">Empty</span></td>
          <td><span style="color:var(--text-muted);">0</span></td>
        `;
      }
      tlbDetailedBody.appendChild(tr);
    }
  }

  function renderResultsTab(stats) {
    resTabEat.textContent = `${stats.eat.toLocaleString()} ns`;
    resTabHitrate.textContent = `${stats.hitRate.toFixed(2)}%`;
    resTabFaultrate.textContent = `${stats.faultRate.toFixed(2)}%`;

    textReportOutput.textContent = sim.generateTextReport();
  }

  // Address Queue Handler
  function updateQueueUI() {
    if (addressQueue.length === 0) {
      queueContainer.classList.add('hidden');
      return;
    }
    queueContainer.classList.remove('hidden');
    queueCount.textContent = addressQueue.length;
    queueChips.innerHTML = '';
    addressQueue.forEach((addr, i) => {
      const chip = document.createElement('div');
      chip.className = 'queue-chip';
      chip.innerHTML = `
        <span>#${i + 1}: ${formatHex(addr, 8)}</span>
        <button data-remove="${i}" style="background:none;border:none;color:#ef4444;cursor:pointer;">&times;</button>
      `;
      queueChips.appendChild(chip);
    });
  }

  // Perform translation on an address
  function executeTranslation(address) {
    sim.translate(address);
    currentInspectedIndex = sim.history.length - 1;
    renderUI();
  }

  // Load the exact initial state from user's screenshot
  function loadScreenshotInitialState() {
    sim.reset();

    // To produce frames starting at 0x3 as in screenshot:
    // Let's set free frames to start with 3, 4, 5, 6, 7, 0, 1, 2
    sim.freeFrames = [3, 4, 5, 6, 7, 0, 1, 2];

    // The sequence shown in the screenshot's access log:
    // 1: 0x00012345 (Hits after pre-populating or Miss/Hit flow)
    // 2: 0x00456789
    // 3: 0x00012ABC (VPN 0x12 -> TLB Hit!)
    // 4: 0x00A02000
    // To have row 1 also be a TLB hit (as shown in screenshot with total 4 accesses, 2 hits, 2 misses):
    // If the simulator pre-loads VPN 0x12 into TLB & Page Table before the 4 runs:
    sim.setPageTableEntry(0x0, 0x12, 0x3);
    sim.vpnToFrame.set(0x12, 0x3);
    sim.fifoPages.push(0x12);
    sim.freeFrames = sim.freeFrames.filter(f => f !== 3);
    sim.tlb.set(0x12, 0x3);

    // Run the 4 accesses from screenshot:
    sim.translate(0x00012345); // Row 1: TLB Hit, Fault No
    sim.translate(0x00456789); // Row 2: TLB Miss, Fault Yes (Frame 4)
    sim.translate(0x00012ABC); // Row 3: TLB Hit, Fault No
    sim.translate(0x00A02000); // Row 4: TLB Miss, Fault Yes (Frame 5)

    // And make sure last translation result shown is 0x00012345 like in the picture banner!
    sim.lastResult = sim.history[0]; // Exactly shows VA: 0x00012345, TLB Hit, 110 ns
    currentInspectedIndex = 0; // Starts at Call #1, user can click Next / Latest to navigate

    renderUI();
  }

  // Event Listeners
  btnTranslate.addEventListener('click', () => {
    try {
      const raw = inputVa.value.trim();
      if (raw.toLowerCase() === 'demo') {
        runBuiltInDemo();
        return;
      }
      const addr = parseInputAddress(raw);
      if (addr !== null) {
        executeTranslation(addr);
      }
    } catch (err) {
      alert(err.message);
    }
  });

  inputVa.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnTranslate.click();
    }
  });

  btnAddQueue.addEventListener('click', () => {
    try {
      const addr = parseInputAddress(inputVa.value);
      if (addr !== null) {
        addressQueue.push(addr);
        updateQueueUI();
        inputVa.value = '';
      }
    } catch (err) {
      alert(err.message);
    }
  });

  btnQueueStep.addEventListener('click', () => {
    if (addressQueue.length > 0) {
      const nextAddr = addressQueue.shift();
      updateQueueUI();
      executeTranslation(nextAddr);
    }
  });

  btnQueueRun.addEventListener('click', () => {
    while (addressQueue.length > 0) {
      const nextAddr = addressQueue.shift();
      sim.translate(nextAddr);
    }
    updateQueueUI();
    renderUI();
  });

  btnQueueClear.addEventListener('click', () => {
    addressQueue = [];
    updateQueueUI();
  });

  queueChips.addEventListener('click', (e) => {
    if (e.target.dataset.remove) {
      const idx = parseInt(e.target.dataset.remove, 10);
      addressQueue.splice(idx, 1);
      updateQueueUI();
    }
  });

  // Demo sequences
  function runBuiltInDemo() {
    const demoAddresses = [
      0x00001234,
      0x00001238, // Same page: TLB Hit!
      0x00005234,
      0x00401234,
      0x00801234,
      0x00C01234,
      0x01001234,
      0x01401234,
      0x01801234,
      0x00001234, // May fault/evict
      0x00001238,
    ];

    sim.reset();
    let step = 0;
    btnTranslate.disabled = true;

    const interval = setInterval(() => {
      if (step >= demoAddresses.length) {
        clearInterval(interval);
        btnTranslate.disabled = false;
        return;
      }
      inputVa.value = formatHex(demoAddresses[step], 8);
      executeTranslation(demoAddresses[step]);
      step++;
    }, 450);
  }

  btnDemoInput.addEventListener('click', runBuiltInDemo);
  btnTopDemo.addEventListener('click', runBuiltInDemo);

  // Reset simulator
  btnTopReset.addEventListener('click', () => {
    if (confirm('Reset the simulator to initial empty state?')) {
      sim.reset();
      currentInspectedIndex = -1;
      renderUI();
    }
  });

  // Tab Navigation Switching
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const mainLayout = document.querySelector('.main-layout');
  const btnToggleSidebars = document.getElementById('btn-toggle-sidebars');

  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      navTabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tabPanes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');

      if (tab.dataset.tab === 'tab-visual') {
        mainLayout.classList.add('visual-mode');
        if (btnToggleSidebars) btnToggleSidebars.textContent = '◫ Show Sidebars';
      } else {
        mainLayout.classList.remove('visual-mode');
        if (btnToggleSidebars) btnToggleSidebars.textContent = '⛶ Full Width';
      }

      renderUI();
    });
  });

  if (btnToggleSidebars) {
    btnToggleSidebars.addEventListener('click', () => {
      mainLayout.classList.toggle('visual-mode');
      btnToggleSidebars.textContent = mainLayout.classList.contains('visual-mode')
        ? '◫ Show Sidebars'
        : '⛶ Full Width';
    });
  }

  // Apply Settings
  btnApplySettings.addEventListener('click', () => {
    const pageSize = parseInt(cfgPageSize.value, 10);
    const tblBits = parseInt(cfgTblBits.value, 10) || 10;
    const tlbCap = parseInt(cfgTlbCap.value, 10) || 4;
    const frames = parseInt(cfgPhysFrames.value, 10) || 8;
    const tlbTime = parseInt(cfgTimeTlb.value, 10) || 10;
    const memTime = parseInt(cfgTimeMem.value, 10) || 100;
    const pfTime = parseInt(cfgTimePf.value, 10) || 8000000;

    sim = new PagingTLBSimulator({
      pageSize,
      tableBits: tblBits,
      tlbCapacity: tlbCap,
      frameCapacity: frames,
      tlbTime,
      memTime,
      pfTime,
    });

    currentInspectedIndex = -1;
    updateBitAllocations();
    renderUI();

    btnApplySettings.textContent = '✓ Applied!';
    setTimeout(() => {
      btnApplySettings.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
        Apply Settings
      `;
    }, 1500);
  });

  cfgPageSize.addEventListener('change', updateBitAllocations);
  cfgTblBits.addEventListener('input', updateBitAllocations);

  // Clear Log
  btnClearLog.addEventListener('click', () => {
    sim.history = [];
    sim.accesses = 0;
    sim.tlbHits = 0;
    sim.tlbMisses = 0;
    sim.pageFaults = 0;
    sim.pageWalks = 0;
    sim.totalAccessTimeNs = 0;
    sim.lastResult = null;
    currentInspectedIndex = -1;
    renderUI();
  });

  // History Navigation Toolbar Listeners
  if (btnHistFirst) {
    btnHistFirst.addEventListener('click', () => {
      inspectCall(0);
    });
  }

  if (btnHistPrev) {
    btnHistPrev.addEventListener('click', () => {
      inspectCall(currentInspectedIndex - 1);
    });
  }

  if (btnHistNext) {
    btnHistNext.addEventListener('click', () => {
      inspectCall(currentInspectedIndex + 1);
    });
  }

  if (btnHistLast) {
    btnHistLast.addEventListener('click', () => {
      inspectCall(sim.history.length - 1);
    });
  }

  // Visual Tab Stepper Buttons
  if (btnVhistPrev) {
    btnVhistPrev.addEventListener('click', () => {
      inspectCall(currentInspectedIndex - 1);
    });
  }

  if (btnVhistNext) {
    btnVhistNext.addEventListener('click', () => {
      inspectCall(currentInspectedIndex + 1);
    });
  }

  if (btnVhistLast) {
    btnVhistLast.addEventListener('click', () => {
      inspectCall(sim.history.length - 1);
    });
  }

  // Keyboard Navigation: [ or ArrowLeft (Prev), ] or ArrowRight (Next), Home (First), End (Latest)
  window.addEventListener('keydown', (e) => {
    // Skip if user is typing in an input or textarea
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
      return;
    }
    if (sim.history.length === 0) return;

    if (e.key === '[' || e.key === 'ArrowLeft') {
      if (currentInspectedIndex > 0) {
        e.preventDefault();
        inspectCall(currentInspectedIndex - 1);
      }
    } else if (e.key === ']' || e.key === 'ArrowRight') {
      if (currentInspectedIndex < sim.history.length - 1) {
        e.preventDefault();
        inspectCall(currentInspectedIndex + 1);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      inspectCall(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      inspectCall(sim.history.length - 1);
    }
  });

  // Export CSV
  btnExportCsv.addEventListener('click', () => {
    if (sim.history.length === 0) {
      alert('No access history to export.');
      return;
    }
    let csv = '#,Virtual Address,Dir Index,Table Index,Offset,VPN,PFN,TLB,Page Fault,Access Time (ns)\n';
    sim.history.forEach((h) => {
      csv += `${h.index},${formatHex(h.virtualAddress, 8)},${formatShortHex(h.dirIndex)},${formatShortHex(h.tableIndex)},${formatShortHex(h.offset)},${formatShortHex(h.vpn)},${formatShortHex(h.frame)},${h.tlbHit ? 'Hit' : 'Miss'},${h.pageFault ? 'Yes' : 'No'},${h.accessTime}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paging_tlb_access_log_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Copy text report
  btnCopyReport.addEventListener('click', () => {
    const text = sim.generateTextReport();
    navigator.clipboard.writeText(text).then(() => {
      btnCopyReport.textContent = 'Copied!';
      setTimeout(() => (btnCopyReport.textContent = 'Copy Report'), 1800);
    });
  });

  // Modal Open/Close
  btnTopAbout.addEventListener('click', () => {
    modalAbout.classList.remove('hidden');
  });

  modalClose.addEventListener('click', () => {
    modalAbout.classList.add('hidden');
  });

  modalGotit.addEventListener('click', () => {
    modalAbout.classList.add('hidden');
  });

  modalAbout.addEventListener('click', (e) => {
    if (e.target === modalAbout) {
      modalAbout.classList.add('hidden');
    }
  });

  // Initialize
  updateBitAllocations();
  loadScreenshotInitialState();
});
