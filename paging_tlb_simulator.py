"""
Two-Level Paging + TLB Simulator
Operating Systems mini-project

Assumptions:
- 32-bit virtual addresses
- 4 KiB pages
- 10-bit page-directory index, 10-bit page-table index, 12-bit offset
- Demand paging with FIFO physical-frame replacement
- TLB replacement uses LRU
- Illustrative timing values are configurable below

Run:
    python paging_tlb_simulator.py

Enter addresses as decimal integers or hexadecimal values such as 0x12345.
Type 'demo' to run the built-in example, or 'q' to quit.
"""

from collections import OrderedDict, deque
from dataclasses import dataclass
from typing import Optional

# ---------- Configuration ----------
ADDRESS_BITS = 32
OFFSET_BITS = 12
PAGE_TABLE_BITS = 10
PAGE_DIRECTORY_BITS = ADDRESS_BITS - OFFSET_BITS - PAGE_TABLE_BITS  # 10
PAGE_SIZE = 1 << OFFSET_BITS

TLB_CAPACITY = 4
PHYSICAL_FRAME_COUNT = 8

# Illustrative access times; adjust these for your assignment.
TLB_LOOKUP_TIME = 10          # ns
MEMORY_ACCESS_TIME = 100      # ns
PAGE_FAULT_SERVICE_TIME = 8_000_000  # ns (8 ms)


@dataclass
class TranslationResult:
    virtual_address: int
    directory_index: int
    table_index: int
    offset: int
    virtual_page_number: int
    physical_frame_number: Optional[int]
    physical_address: Optional[int]
    tlb_hit: bool
    page_fault: bool
    evicted_vpn: Optional[int]
    access_time_ns: int


class PagingTLBSimulator:
    def __init__(
        self,
        frame_count=PHYSICAL_FRAME_COUNT,
        tlb_capacity=TLB_CAPACITY,
        tlb_time=TLB_LOOKUP_TIME,
        memory_time=MEMORY_ACCESS_TIME,
        page_fault_time=PAGE_FAULT_SERVICE_TIME,
    ):
        if frame_count < 1:
            raise ValueError("Physical frame count must be at least 1.")
        if tlb_capacity < 1:
            raise ValueError("TLB capacity must be at least 1.")

        self.frame_count = frame_count
        self.tlb_capacity = tlb_capacity
        self.tlb_time = tlb_time
        self.memory_time = memory_time
        self.page_fault_time = page_fault_time

        # Two-level page table: directory index -> {table index: frame number}
        self.page_directory = {}

        # TLB maps virtual page number -> physical frame number.
        # OrderedDict provides LRU: most recently used item is moved to the end.
        self.tlb = OrderedDict()

        # FIFO queue of resident virtual page numbers.
        self.fifo_pages = deque()
        self.free_frames = deque(range(frame_count))
        self.vpn_to_frame = {}

        self.accesses = 0
        self.tlb_hits = 0
        self.tlb_misses = 0
        self.page_faults = 0
        self.page_walks = 0
        self.total_access_time_ns = 0

    @staticmethod
    def parse_address(value: str) -> int:
        value = value.strip()
        address = int(value, 0)  # Supports decimal and 0x-prefixed hexadecimal.
        if not 0 <= address < (1 << ADDRESS_BITS):
            raise ValueError("Address must be between 0 and 0xFFFFFFFF.")
        return address

    @staticmethod
    def split_address(virtual_address: int):
        # Bitwise operations extract each address field.
        offset_mask = (1 << OFFSET_BITS) - 1
        table_mask = (1 << PAGE_TABLE_BITS) - 1

        offset = virtual_address & offset_mask
        table_index = (virtual_address >> OFFSET_BITS) & table_mask
        directory_index = (
            virtual_address >> (OFFSET_BITS + PAGE_TABLE_BITS)
        ) & ((1 << PAGE_DIRECTORY_BITS) - 1)
        virtual_page_number = virtual_address >> OFFSET_BITS

        return directory_index, table_index, offset, virtual_page_number

    def _page_table_lookup(self, directory_index, table_index):
        table = self.page_directory.get(directory_index)
        if table is None:
            return None
        return table.get(table_index)

    def _set_page_table_entry(self, directory_index, table_index, frame):
        self.page_directory.setdefault(directory_index, {})[table_index] = frame

    def _remove_page_table_entry(self, vpn):
        directory_index = vpn >> PAGE_TABLE_BITS
        table_index = vpn & ((1 << PAGE_TABLE_BITS) - 1)
        table = self.page_directory.get(directory_index)
        if table is not None:
            table.pop(table_index, None)
            if not table:
                self.page_directory.pop(directory_index, None)

    def _invalidate_tlb_vpn(self, vpn):
        self.tlb.pop(vpn, None)

    def _allocate_frame(self, vpn):
        evicted_vpn = None

        if self.free_frames:
            frame = self.free_frames.popleft()
        else:
            # FIFO replacement: evict the page that entered memory first.
            evicted_vpn = self.fifo_pages.popleft()
            frame = self.vpn_to_frame.pop(evicted_vpn)
            self._remove_page_table_entry(evicted_vpn)
            self._invalidate_tlb_vpn(evicted_vpn)

        self.vpn_to_frame[vpn] = frame
        self.fifo_pages.append(vpn)
        return frame, evicted_vpn

    def translate(self, virtual_address: int) -> TranslationResult:
        if not 0 <= virtual_address < (1 << ADDRESS_BITS):
            raise ValueError("Virtual address must be a 32-bit unsigned address.")

        self.accesses += 1
        directory_index, table_index, offset, vpn = self.split_address(virtual_address)

        # A TLB lookup is performed for every address.
        tlb_hit = vpn in self.tlb
        page_fault = False
        evicted_vpn = None

        if tlb_hit:
            self.tlb_hits += 1
            frame = self.tlb.pop(vpn)
            self.tlb[vpn] = frame  # Mark as most recently used.
            access_time = self.tlb_time + self.memory_time
        else:
            self.tlb_misses += 1
            self.page_walks += 1

            frame = self._page_table_lookup(directory_index, table_index)

            if frame is None:
                # Not present in memory: demand-page fault.
                page_fault = True
                self.page_faults += 1
                frame, evicted_vpn = self._allocate_frame(vpn)
                self._set_page_table_entry(directory_index, table_index, frame)

            # A two-level page-table walk costs two memory accesses.
            # One more memory access reads/writes the actual target data.
            access_time = self.tlb_time + 3 * self.memory_time

            if page_fault:
                access_time += self.page_fault_time

            # Insert into TLB and evict its least recently used entry if needed.
            self.tlb[vpn] = frame
            if len(self.tlb) > self.tlb_capacity:
                self.tlb.popitem(last=False)

        physical_address = (frame << OFFSET_BITS) | offset
        self.total_access_time_ns += access_time

        return TranslationResult(
            virtual_address=virtual_address,
            directory_index=directory_index,
            table_index=table_index,
            offset=offset,
            virtual_page_number=vpn,
            physical_frame_number=frame,
            physical_address=physical_address,
            tlb_hit=tlb_hit,
            page_fault=page_fault,
            evicted_vpn=evicted_vpn,
            access_time_ns=access_time,
        )

    def report(self):
        if self.accesses == 0:
            print("\nNo address accesses have been simulated yet.")
            return

        hit_rate = (self.tlb_hits / self.accesses) * 100
        miss_rate = (self.tlb_misses / self.accesses) * 100
        fault_rate = (self.page_faults / self.accesses) * 100
        eat = self.total_access_time_ns / self.accesses

        print("\n" + "=" * 62)
        print("SIMULATION SUMMARY")
        print("=" * 62)
        print(f"Virtual address accesses : {self.accesses}")
        print(f"TLB hits                 : {self.tlb_hits}")
        print(f"TLB misses               : {self.tlb_misses}")
        print(f"TLB hit rate             : {hit_rate:.2f}%")
        print(f"TLB miss rate             : {miss_rate:.2f}%")
        print(f"Page faults              : {self.page_faults}")
        print(f"Page-fault rate           : {fault_rate:.2f}%")
        print(f"Page-table walks          : {self.page_walks}")
        print(f"Resident pages            : {len(self.vpn_to_frame)}")
        print(f"Average access time (EAT) : {eat:,.2f} ns ({eat / 1_000_000:.6f} ms)")
        print("\nTiming assumptions:")
        print(f"  TLB lookup              : {self.tlb_time:,} ns")
        print(f"  Memory access           : {self.memory_time:,} ns")
        print(f"  Page-fault service      : {self.page_fault_time:,} ns")
        print("=" * 62)


def show_result(result: TranslationResult):
    print(f"\nVirtual address : 0x{result.virtual_address:08X} ({result.virtual_address})")
    print(
        "Address fields : "
        f"directory index={result.directory_index}, "
        f"table index={result.table_index}, offset={result.offset}"
    )
    print(f"Virtual page # : {result.virtual_page_number}")
    print(f"TLB             : {'HIT' if result.tlb_hit else 'MISS'}")
    print(f"Page fault      : {'YES' if result.page_fault else 'NO'}")

    if result.evicted_vpn is not None:
        print(f"FIFO eviction   : virtual page {result.evicted_vpn}")

    print(f"Physical frame : {result.physical_frame_number}")
    print(f"Physical address: 0x{result.physical_address:08X} ({result.physical_address})")
    print(f"Access time     : {result.access_time_ns:,} ns")


def run_demo():
    print("\nRunning built-in demonstration...")
    simulator = PagingTLBSimulator()
    demo_addresses = [
        0x00001234,
        0x00001238,  # Same virtual page: expected TLB hit.
        0x00005234,
        0x00401234,
        0x00801234,
        0x00C01234,
        0x01001234,
        0x01401234,
        0x01801234,
        0x00001234,  # May miss/fault after FIFO eviction.
        0x00001238,
    ]
    for address in demo_addresses:
        result = simulator.translate(address)
        show_result(result)
    simulator.report()


def main():
    print("=" * 62)
    print("TWO-LEVEL PAGE TABLE AND TLB SIMULATOR")
    print("=" * 62)
    print(f"Virtual address size : {ADDRESS_BITS} bits")
    print(f"Page size            : {PAGE_SIZE:,} bytes")
    print(
        "Address format       : "
        f"{PAGE_DIRECTORY_BITS} directory bits | "
        f"{PAGE_TABLE_BITS} table bits | "
        f"{OFFSET_BITS} offset bits"
    )
    print(f"Physical frames      : {PHYSICAL_FRAME_COUNT}")
    print(f"TLB capacity         : {TLB_CAPACITY}")
    print("\nCommands: enter an address, 'demo' for sample run, 'report', or 'q'.")

    simulator = PagingTLBSimulator()

    while True:
        try:
            raw = input("\nVirtual address> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if raw.lower() in {"q", "quit", "exit"}:
            simulator.report()
            break
        if raw.lower() == "demo":
            run_demo()
            continue
        if raw.lower() == "report":
            simulator.report()
            continue
        if not raw:
            continue

        try:
            address = simulator.parse_address(raw)
            result = simulator.translate(address)
            show_result(result)
        except ValueError as error:
            print(f"Invalid input: {error}")
            print("Enter a decimal address (e.g. 4660) or hex (e.g. 0x1234).")


if __name__ == "__main__":
    main()
